# Design: fit-file-upload-ingestion

## Contexto

O Menthoros hoje importa treinos apenas via registro manual (Sprint 9d) — dados agregados sem FC,
sem pace real, sem splits. O pipeline do Strava está construído mas bloqueado por termos legais.
O upload de .fit é a alternativa que funciona com **qualquer dispositivo** que exporte FIT
(Garmin, Suunto, Coros, Polar, Wahoo) e não tem restrições de uso dos dados.

**Pré-requisitos técnicos:** O SDK oficial da Garmin (`com.garmin:fit`) é open-source, licença
Apache 2.0, no Maven Central. Faz parsing completo do formato binário FIT — não precisamos
implementar nada do zero.

## Arquitetura

```
┌──────────────────────────┐
│  Atleta abre upload page │
└─────────┬────────────────┘
          │ drag-and-drop .fit
┌─────────▼────────────────┐
│  POST /treinos/importar-fit │
│  (MultipartFile)         │
└─────────┬────────────────┘
          │
┌─────────▼────────────────┐
│  FitParseService         │
│  ┌────────────────────┐  │
│  │ DecodeFitStream    │  │  ← Garmin SDK decode(.fit)
│  │ ParseSession      │  │  ← SessionMesg: dist, dur, FC, TSS
│  │ ParseLaps         │  │  ← LapMesg[]: splits/km
│  │ BuildExternalId   │  │  ← serial + startTime (dedup)
│  └────────┬───────────┘  │
└──────────┬────────────────┘
           │ FitSessionData (record/POJO)
┌──────────▼────────────────┐
│  mapToTreinoRealizado     │  ← mesmo padrão do StravaActivityServiceImpl
│  + saveIdempotent()       │  ← reuso da dedup lógica
└──────────┬────────────────┘
           │
┌──────────▼────────────────┐
│  TreinoRealizadoOutputDto │  ← retorno pro front
└───────────────────────────┘
```

## Contrato da API

### POST /api/v1/treinos/importar-fit

**Request:** `multipart/form-data`, campo `file` com o .fit.

**Response 201:**
```json
{
  "id": "uuid",
  "dataTreino": "2026-07-03",
  "tipoTreino": "RUNNING",
  "distanciaKm": 12.5,
  "duracaoMin": 65,
  "fcMedia": 152,
  "fcMaxima": 178,
  "tssCalculado": 89,
  "paceMedio": "5:12",
  "laps": [
    { "ordem": 1, "distanciaKm": 1.0, "pace": "5:02", "fcMedia": 148 },
    { "ordem": 2, "distanciaKm": 1.0, "pace": "5:08", "fcMedia": 151 }
  ]
}
```

**Response 422:**
```json
{ "error": "Arquivo inválido ou corrompido", "detail": "Nenhuma mensagem Session encontrada no arquivo FIT." }
```

## D0 — Decisões

### D0.1 — Fonte de dados: `MANUAL` vs novo enum `FIT_FILE`

Usar `FonteDados.MANUAL` por enquanto — evita migration desnecessária (o enum é usado em CHECK
constraints). A distinção "vem de .fit" vs "digitado manualmente" pode ser feita pelo `externalId`
(presente = .fit, nulo = manual). Se no futuro precisar segregar, adiciona-se `FIT_FILE` ao enum
com migration.

### D0.2 — Dedup via externalId

`externalId` = `"{serialNumber}-{session.startTime.seconds}"` — único por dispositivo + treino.
Mesmo que o atleta baixe o .fit duas vezes, o hash do arquivo pode diferir (metadados de download),
mas o `serialNumber` + `startTime` são estáveis. A constraint UNIQUE `(externalId, atleta_id)` já
existe (usada pelo Strava) — reuso total.

### D0.3 — TSS no .fit

O Garmin SDK expõe `SessionMesg.getTrainingStressScore()` — se presente no arquivo, usar direto.
Se ausente (dispositivos mais antigos ou não-Garmin), calcular via `TssCalculator` (já existe no
projeto). O TSS calculado internamente pode divergir do TSS do Garmin — isso é esperado e aceitável.

### D0.4 — Apenas .fit, não .gpx/.tcx nesta change

GPX e TCX são formatos menos ricos (sem FC por lap, sem zonas) e exigem parsing adicional.
Esta change foca no .fit (formato mais rico e universal). GPX/TCX podem ser adicionados depois
como extensão do `FitParseService` se houver demanda.

## Matriz de reconciliação (.fit → entity)

| Campo .fit | Campo TreinoRealizado | Tratamento |
|---|---|---|
| Session.Timestamp | `dataTreino` | Mapear (LocalDate) |
| Session.StartTime + TotalElapsedTime | `duracaoMin` | Calcular (Duration → minutos) |
| Session.TotalDistance | `distanciaKm` | Mapear (m → km) |
| Session.AvgHeartRate | `fcMedia` | Mapear |
| Session.MaxHeartRate | `fcMaxima` | Mapear |
| Session.TrainingStressScore | `tssCalculado` | Mapear se presente, calcular fallback (D0.3) |
| Session.Sport | `tipoTreino` | Mapear (running = CORRIDA, cycling = CICLISMO, default = OUTRO) |
| LapMesg[] | `etapasRealizadas[]` | Mapear 1:1 (D0.2) |

## Riscos e mitigações

- **R1 — SDK Garmin não encontra session em .fit de dispositivo não-Garmin.** *Mitigação:* testar
  com arquivos de Suunto, Coros, Polar antes do deploy; se falhar, expandir parser para aceitar
  também `ActivityMesg` como fallback.
- **R2 — Upload de .fit grande (≥ 50 MB de atividade longa com GPS 1s).** *Mitigação:* configurar
  `spring.servlet.multipart.max-file-size=100MB` no application.yml; o SDK FIT é streaming-based
  (não carrega tudo em memória), então mesmo arquivos grandes são seguros.
- **R3 — Atleta envia .fit com dados sensíveis (localização exata da casa).** *Mitigação:* nenhuma
  — o .fit é do próprio atleta e fica no tenant dele; não há exposição. Política de dados já
  cobre isso na privacidade LGPD já implementada.
- **R4 — Usuário envia .fit de ciclismo/natação (esporte não-corrida).** *Mitigação:* importar
  normalmente com `tipoTreino` mapeado corretamente — o dado entra no histórico, mas não afeta
  corrida. O coach vê no perfil do atleta.
- **R5 — Concorrência com integration contínua futura.** *Mitigação:* a integração contínua
  (Garmin Connect automático, Sprint 22) é um ORQUESTRADOR novo que chama o mesmo parser — esta
  change não conflita com ela. O upload manual e o automático coexistem pelo mesmo `saveIdempotent`.

## Fora de escopo

Upload automático via Garmin Connect (watch folder, OAuth); Health Connect nativo (onda mobile);
parsing de .gpx/.tcx; análise pós-import (decoupling, drift — Sprint 23).
