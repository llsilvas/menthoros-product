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

> **Achados do DoR gate (spec-reviewer) + verificação direta contra o código real e o Maven
> Central** — corrigem várias suposições da primeira submissão desta spec.

### D0.1 — Fonte de dados: `MANUAL` vs novo enum `FIT_FILE`

Usar `FonteDados.MANUAL` por enquanto — evita migration desnecessária (o enum é usado em CHECK
constraints). A distinção "vem de .fit" vs "digitado manualmente" pode ser feita pelo `externalId`
(presente = .fit, nulo = manual). Se no futuro precisar segregar, adiciona-se `FIT_FILE` ao enum
com migration.

### D0.2 — Dedup via externalId (corrigido — a constraint real é diferente da suposta)

**Achado do DoR gate:** a constraint real (`V29__Fix_treino_realizado_deduplication_by_tenant.sql`)
é `UNIQUE(tenant_id, fonte_dados, external_id)` (índice parcial, só quando ambos NOT NULL) —
**não** `(externalId, atleta_id)` como a versão anterior desta spec assumia. Isso importa porque a
constraint é por **tenant**, não por **atleta**: se dois atletas do mesmo tenant (ex.: dois alunos
do mesmo treinador) subirem `.fit` cujo `externalId` colida (ex.: dispositivos sem `serialNumber`
real — comum em esteiras/trainers indoor, que reportam `0` ou ausente), o segundo INSERT falharia
por violação de constraint — e o retry de `saveIdempotent` (`findByExternalIdAndAtletaId`) não
encontraria o registro do OUTRO atleta, caindo no branch `CRITICAL: Deduplication failed` e
relançando a exceção (500).

**Mitigação:** compor o `externalId` incluindo o `atletaId` desde já:
`externalId = "{atletaId}-{serialNumber}-{session.startTime.seconds}"`. Isso torna o `externalId`
inerentemente único por atleta mesmo sob uma constraint escopada só por tenant — elimina o risco de
colisão cross-atleta sem precisar migrar a constraint. `fonteDados = MANUAL` (D0.1) garante que não
colide com registros do Strava (`fonteDados = STRAVA`) no mesmo tenant.

`saveIdempotent`/`mapToTreinoRealizado` em `StravaActivityServiceImpl.java` (linhas 90/146)
confirmados como reusáveis tal como o design original propôs — sem gap aí.

### D0.3 — TSS no .fit

O Garmin SDK expõe `SessionMesg.getTrainingStressScore()` — se presente no arquivo, usar direto.
Se ausente (dispositivos mais antigos ou não-Garmin), calcular via **`TssCalculatorService`**
(nome de classe corrigido — já existe em `services/helper/TssCalculatorService.java`). O TSS
calculado internamente pode divergir do TSS do Garmin — isso é esperado e aceitável.

### D0.4 — Apenas .fit, não .gpx/.tcx nesta change

GPX e TCX são formatos menos ricos (sem FC por lap, sem zonas) e exigem parsing adicional.
Esta change foca no .fit (formato mais rico e universal). GPX/TCX podem ser adicionados depois
como extensão do `FitParseService` se houver demanda.

### D0.5 — Coordenada Maven correta (achado do DoR gate)

A proposta original citava `com.garmin:fit-sdk` — **artifactId errado**. Confirmado via Maven
Central (busca web direta): o SDK oficial é `com.garmin:fit` (groupId `com.garmin`, artifactId
`fit`), licença Apache 2.0, versão estável mais recente **21.205.0** em julho/2026
(https://central.sonatype.com/artifact/com.garmin/fit). Usar essa coordenada exata na task 0.1.

### D0.6 — Mapeamento `Session.Sport` → `tipoTreino` é impossível como a spec original descrevia

**Achado (não capturado pelo DoR gate automatizado — verificação direta do código):**
`TreinoRealizado.tipoTreino` (campo herdado de `TreinoBase`) é do tipo `TipoTreino`, um enum de
**propósito de treino de corrida** dentro de um plano prescrito — `REGENERATIVO, INTERVALADO,
CONTINUO, LONGO, TIRO, FARTLEK, TEMPO_RUN, FACIL, SUBIDA, PROVA`. **Não existe** nenhum valor tipo
`CORRIDA`/`CICLISMO`/`OUTRO` como a matriz de reconciliação original assumia — o enum não discrimina
esporte, discrimina *estrutura de treino* dentro do contexto de corrida. Um `.fit` de ciclismo ou
natação não tem nenhum valor semanticamente correto para preencher esse campo.

**Decisão:** todo `.fit` importado recebe `tipoTreino = CONTINUO` (bucket mais neutro/genérico
existente) independentemente do esporte detectado — nunca fabricar `INTERVALADO`/`TIRO`/etc. sem
uma classificação real de estrutura. O esporte real detectado (`Session.Sport`) é anexado ao campo
`descricao` (`TreinoBase.descricao`, texto livre, já existe) como
`"Importado de .fit — esporte: Ciclismo"` (ou o esporte correspondente) — preserva a informação
sem fabricar uma classificação de propósito que o dado não sustenta. **CA5 revisado:** dados
parciais persistem (já era o critério); esporte não-corrida também persiste, com o aviso no
`descricao`, não como falha.

Isso também corrige o **R4** (riscos): a mitigação original ("importar normalmente com `tipoTreino`
mapeado corretamente") pressupunha um mapeamento que não existe — substituída pela decisão acima.

### D0.7 — Campos da entidade (nomes corrigidos)

A matriz de reconciliação original tinha 2 imprecisões de nome de campo/tipo, confirmadas contra
`TreinoRealizado.java`/`TreinoBase.java`:
- `fcMaxima` → o campo real é **`fcMax`** (coluna `fc_maxima_treino`).
- `paceMedio` (String, ex.: `"5:12"`) → o campo real é **`paceMedia`**, tipo `Duration` (min/km) —
  o parser deve construir um `Duration`, não uma string formatada; a formatação `"5:12"` é
  responsabilidade da camada de apresentação (frontend), igual ao padrão já usado para
  `duracaoMin` (também `Duration` na entity, serializado como string `HH:MM:SS`/`MM:SS` pelo
  backend — ver `parseDuracaoMin` no frontend, que já lida com ambos os formatos).

### D0.8 — Contrato de retorno 200 vs 201 (CA2)

`saveIdempotent` (reuso do padrão Strava) retorna a entidade em ambos os casos (nova ou já
existente) sem diferenciar por si só — quem decide o status HTTP é o chamador. `FitUploadController`
deve checar a existência via `treinoRealizadoRepository.findByExternalIdAndAtletaId(externalId,
atletaId)` **antes** de persistir: se já existir, retorna 200 com o registro existente (sem
chamar `save`); se não existir, persiste e retorna 201. `saveIdempotent` continua como rede de
segurança para a corrida entre o check e o insert (ver comentário original do método), mas não é
mais a única fonte da decisão 200/201.

## Rollback

Feature aditiva pura — nenhuma migration, nenhuma alteração em endpoint/tabela existente. Rollback
= reverter o deploy do novo endpoint/dependência; dados já importados via `.fit` permanecem no
histórico do atleta como treinos legítimos (não há necessidade de limpeza — são dados reais de
treino, indistinguíveis de um registro manual equivalente exceto pelo `externalId` preenchido).
Sem feature flag: o risco é baixo (endpoint novo e isolado, sem tocar fluxos existentes) e o
rollback via revert de deploy é suficientemente rápido para este tamanho de change.

## Métrica de sucesso (revisão)

A métrica original ("% de atletas que usam upload vs. manual após 30 dias, sem baseline") não é
um gate de aceite e não pode ser validada durante o desenvolvimento — mantida em `proposal.md`
como **hipótese a observar pós-launch**, não bloqueia implementação nem merge (mesmo padrão de
correção já aplicado nas changes anteriores desta sprint, ex. `add-athlete-retention-quick-wins`).

## Matriz de reconciliação (.fit → entity)

| Campo .fit | Campo TreinoRealizado | Tratamento |
|---|---|---|
| Session.Timestamp | `dataTreino` | Mapear (LocalDate) |
| Session.StartTime + TotalElapsedTime | `duracaoMin` | Calcular (`Duration`, não minutos brutos — ver D0.7) |
| Session.TotalDistance | `distanciaKm` | Mapear (m → km) |
| Session.AvgHeartRate | `fcMedia` | Mapear |
| Session.MaxHeartRate | `fcMax` | Mapear (nome de campo corrigido — D0.7) |
| Session.TrainingStressScore | `tssCalculado` | Mapear se presente, calcular fallback via `TssCalculatorService` (D0.3) |
| (atletaId + serialNumber + startTime) | `externalId` | Compor incluindo `atletaId` (D0.2) |
| Session.Sport | `tipoTreino` = `CONTINUO` sempre; esporte real anexado a `descricao` | Nunca fabricar propósito de treino (D0.6) |
| LapMesg[] | `etapasRealizadas[]` | Mapear 1:1 |

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
- **R4 — Usuário envia .fit de ciclismo/natação (esporte não-corrida).** *Mitigação revisada (D0.6):*
  `tipoTreino` não discrimina esporte (só existe para propósito de treino de corrida) — importar
  com `tipoTreino = CONTINUO` + esporte real anotado em `descricao`, nunca fabricar
  `CORRIDA`/`CICLISMO` inexistentes no enum. O dado entra no histórico sem afetar métricas de
  corrida do atleta.
- **R6 — Colisão de `externalId` entre atletas do mesmo tenant.** *Mitigação (D0.2):* a constraint
  real é `UNIQUE(tenant_id, fonte_dados, external_id)` — não inclui `atleta_id`. Compor o
  `externalId` já incluindo o `atletaId` elimina o risco sem precisar migrar a constraint.
- **R5 — Concorrência com integration contínua futura.** *Mitigação:* a integração contínua
  (Garmin Connect automático, Sprint 22) é um ORQUESTRADOR novo que chama o mesmo parser — esta
  change não conflita com ela. O upload manual e o automático coexistem pelo mesmo `saveIdempotent`.

## Fora de escopo

Upload automático via Garmin Connect (watch folder, OAuth); Health Connect nativo (onda mobile);
parsing de .gpx/.tcx; análise pós-import (decoupling, drift — Sprint 23).
