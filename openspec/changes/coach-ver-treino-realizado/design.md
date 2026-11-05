# Design — coach-ver-treino-realizado

## Contexto

- Backend: `GET /api/v1/treinos/realizados/{id}` (`TreinoRealizadoController.obterRealizado`),
  `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`, isolamento por tenant no service
  (`findByIdAndTenantId` → 404). Devolve `TreinoRealizadoOutputDto` com `runningDynamics`,
  `decoupling`, `serieEficiencia` (só no detalhe) e `etapasRealizadas`. Não expõe `elapsedTimeSeg`
  nem elevação por volta (a entidade tem as duas).
- Análise da IA: `GET /api/v1/analises/treino/{treinoRealizadoId}` (`AnaliseWorkoutController`,
  `TECNICO`/`ADMIN`, `@RequireTenant`): 200 para `COMPLETED`/`FAILED`, **204 para `PENDING` ou
  inexistente**. Gerada por `WorkoutAnalysisListener` (async, AFTER_COMMIT) só quando o treino tem
  RPE e não é antigo (`WorkoutAnalysisEligibility`).
- `.fit`: `FitParseServiceImpl` coleta `LapBruto` e a Session; `FitTreinoPersister` grava
  `TreinoRealizado`/`EtapaRealizada`. O binário não é guardado. Mensagens `record` não são lidas hoje.
- Tempo em zona: **nenhuma fonte grava**. Existe só `EtapaRealizada.zona` por volta (intervals.icu).
- Front: `TreinoService.obterRealizado` e `AnaliseService.getAnaliseTreino` existem no cliente
  curado. Protótipo de referência: `prototype/execucao-treino` (`d02e770`).

## D1 — Colunas novas da sessão, sem backfill

Migration (próximo número livre em `develop`; `V108` usada, `V109` reservada por
`garmin-activity-ingestion`) em `tb_treino_realizado`:

- `velocidade_max_kmh NUMERIC(5,2) NULL`
- `temperatura_min_c NUMERIC(4,1) NULL`
- `temperatura_max_c NUMERIC(4,1) NULL`
- `tempo_em_zonas JSONB NULL` (D6)

Velocidade em km/h, como `velocidadeMedia`; o front converte para min/km. Sem backfill: o `.fit`
original não é guardado.

## D2 — Parse do `.fit`

- Session: `getEnhancedMaxSpeed()` (fallback `getMaxSpeed()`), `getMinTemperature()`,
  `getMaxTemperature()`; m/s → km/h; temperatura pelo `celsiusDeByte` dos laps. Sentinela → `null`.
- Ritmo/velocidade média da sessão: distância / tempo em movimento da Session (hoje só os laps têm).
- Mensagens `record`: coletar só `(timestamp, heartRate)` numa lista primitiva durante o decode,
  para o D6. Não persistir a série.

## D3 — Contrato

`TreinoRealizadoOutputDto` ganha no nível raiz `velocidadeMaxKmh`, `temperaturaMinC`,
`temperaturaMaxC`, `elapsedTimeSeg` e `tempoEmZonas`. `EtapaRealizadaOutputDto` ganha
`elevacaoGanhoMetros` e `elevacaoPerdaMetros`. `NON_NULL` já vale. Mudança aditiva.

```json
"tempoEmZonas": {
  "fonte": "FIT_RECORDS",
  "zonas": [
    { "zona": "Z1", "bpmMin": 93,  "bpmMax": 111, "segundos": 4 },
    { "zona": "Z2", "bpmMin": 112, "bpmMax": 129, "segundos": 108 },
    { "zona": "Z3", "bpmMin": 130, "bpmMax": 148, "segundos": 2875 },
    { "zona": "Z4", "bpmMin": 149, "bpmMax": 166, "segundos": 1198 },
    { "zona": "Z5", "bpmMin": 167, "bpmMax": null, "segundos": 15 }
  ]
}
```

Front: tipo de leitura `TreinoRealizadoDetalhe` alinhado ao DTO à mão (regra do cliente curado),
separado do tipo de escrita.

## D4 — Front: estrutura

```
features/coach/
  hooks/useTreinoRealizadoDetalhe.ts          ← detalhe por id; loading/error/data/refetch
  hooks/useAnaliseTreinoRealizado.ts          ← análise por id; status pronta/pendente/semRpe/indisponivel
  adapters/treinoRealizadoDetalheAdapters.ts  ← DTO + planejado → view model
  types/TreinoRealizadoDetalhe.ts             ← view model
  components/ExecucaoTreinoDialog.tsx         ← CoachDialog + cabeçalho + composição
  components/ExecucaoAnaliseBanner.tsx
  components/ExecucaoComparativo.tsx          ← planejado × realizado × diferença
  components/ExecucaoZonas.tsx                ← faixa empilhada + legenda
  components/ExecucaoEtapas.tsx               ← tabela com cabeçalho fixo e rolagem
  components/ExecucaoDadosRelogio.tsx         ← acordeão
```

- **Os dois cards** recebem a ação sem buscar nada: `TreinoPlanejadoCard` por `actions`/`rodape`;
  `TreinoCard` (Planos, legado) ganha um prop `onVerRealizado`. O dialog é o mesmo componente nos
  dois lugares; mora em `features/coach` e o legado importa por caminho relativo (o alias
  `@/features` aponta para outro diretório — ver `CLAUDE.md` do front).
- Formatação num ponto só, no adapter: vírgula decimal, `--` para ausente, pace a partir de km/h,
  duração `MM:SS`/`HH:MM:SS`. Reusar helpers de `utils/` e de `planoSemanaUtils` se existirem.
- **Linha Total** das etapas vem da sessão (CA11): somar voltas diverge com pausa ou volta parcial.
- O detalhe e a análise são buscados em paralelo, só ao abrir (lazy); a análise não bloqueia.
- Cabeçalho fixo da tabela: `position: sticky` no `th` dentro de um box com `maxHeight: 360px` e
  `overflow: auto` — sem virtualização (D8).

## D5 — Diferença planejado × realizado (adapter, puro)

| Linha | Planejado | Realizado | Critério de cor |
|---|---|---|---|
| Distância | `distanciaKm` | `distanciaKm` | ±10 % verde, fora âmbar |
| Duração | `duracaoMin` | tempo em movimento (fallback `duracaoMin`) | ±10 min verde, fora âmbar |
| Ritmo | `ritmoAlvo` (texto) | `paceMedia` | neutro (ritmo alvo é texto livre) |
| Zona | `zonaAlvo` | zona com mais tempo + "X% no alvo" | ≥ 60 % na alvo verde, fora âmbar |
| FC média | — | `fcMedia` | neutro |
| RPE | `percepcaoEsforcoEsperada` | `percepcaoEsforco` | ±1 verde, fora âmbar |

Cor nunca é o único sinal: a diferença sai em texto ("+1,04 km", "2% no alvo"). Sem um dos lados,
`--` e neutro. Tolerâncias são constantes nomeadas no adapter (A8).

## D6 — Tempo em zonas no import do `.fit`

- Zonas: as zonas de FC do atleta vigentes no import (fonte única de `coach-athlete-zones` /
  `V108`). Sem zonas de FC → `tempo_em_zonas` nulo.
- Cálculo: para cada amostra `record` com FC, peso = segundos até a próxima amostra, com teto de
  5 s (pausa do relógio não vira tempo em zona); soma por zona. Função pura
  `TempoEmZonasCalculator.calcular(amostras, zonas)` com teste unitário.
- Guarda o resultado **e os limites usados** (A6) em `tempo_em_zonas JSONB`: o histórico não muda
  quando as zonas do atleta mudam.
- `fonte` no JSON (`FIT_RECORDS`) deixa espaço para outras origens sem migrar o formato.
- Supersessão: quando `add-workout-metrics-analyzer` entregar o `WorkoutMetricsCalculator`, ele
  passa a produzir o mesmo `tempoEmZonas`; este calculador vira fallback ou é removido. O contrato
  do DTO não muda.

## D7 — Telemetria da métrica

Evento de abertura do dialog com `treinoRealizadoId`, `atletaId`, `temTempoEmZonas` (métrica de
cobertura) e `estadoAnalise`, pelo mecanismo de telemetria que o front já usar. **Obrigatório nesta
change**: sem ele as métricas secundárias não existem. Se o front não tiver mecanismo, o menor
possível (log estruturado no backend por um endpoint já chamado, ou evento no mecanismo de
analytics existente) entra na task 4.5 — sem sistema novo de telemetria. Sinal futuro, sem
construir nada agora: correlacionar abertura do dialog com aprovação da semana seguinte.

## D8 — Volume de etapas

Treino estruturado pode ter dezenas de voltas. Tabela simples com rolagem interna e cabeçalho fixo
basta até centenas de linhas; virtualizar só se a medição mostrar lentidão.

## Riscos e mitigações

- **R1 — Melhor ritmo irreal por pico de GPS.** Mostrar como veio; teto físico em follow-up se os
  pilotos reportarem ruído.
- **R2 — Colisão de migration.** `V108` usada, `V109` reservada. Número definido no commit,
  conferindo `db/migration` em `develop`.
- **R3 — Tipo de leitura do front desalinhado.** Teste do adapter com payload real capturado do
  backend local.
- **R4 — Dialog vazio para treino manual** (sem voltas, sem zonas, sem dinâmica). CA10/CA11 cobrem
  os estados vazios; o cabeçalho mostra a fonte ("Manual").
- **R5 — "Em andamento" que nunca termina.** O 204 com RPE pode significar análise que nunca vai
  rodar (treino antigo, falha silenciosa). Mitigação: o texto é neutro e não bloqueia nada; se
  confundir os pilotos, a change que distingue `PENDING` na API resolve.
- **R6 — Memória no parse de `.fit` longo.** Ultra de 10 h a 1 Hz = 36 mil amostras de FC: duas
  colunas primitivas, desprezível. Medir na task 0.1.
- **R7 — Zonas sem dono único.** Se a fonte das zonas do atleta for ambígua (manual × LTHR), o
  cálculo usa a mesma regra que a tela de zonas do treinador usa; não criar regra nova.
- **R8 — Card legado.** Adicionar ação ao `TreinoCard` legado expande o shell `pages/`/Planos que o
  front está migrando. Aceito: foi onde o treinador aprovou o botão; o dialog fica em
  `features/coach` e o card só repassa o clique.

## Rollback

- Front: reverter o PR; os cards voltam a não ter ação.
- Backend: colunas nulas e aditivas — reverter o código deixa as colunas sem uso, sem perda de dado.
  Não há `DROP` no rollback.
