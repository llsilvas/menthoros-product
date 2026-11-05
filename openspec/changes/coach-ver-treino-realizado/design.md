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

Migration **`V111`** (`V108` usada; `V109` de `coach-editar-treino-aprovado` e `V110` de
`garmin-activity-ingestion`, em branch), só `ADD COLUMN ... NULL`, sem `DROP` nem backfill, em
`tb_treino_realizado`:

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
  `FitSessionData`/`SessaoBruta` ganham `velocidadeMediaKmh`, `velocidadeMaxKmh`, `temperaturaMinC`,
  `temperaturaMaxC` e a lista de amostras.
- Mensagens `record`: coletar só `(timestamp, heartRate)` numa lista primitiva durante o decode,
  para o D6. Não persistir a série.

## D3 — Contrato

`TreinoRealizadoOutputDto` ganha no nível raiz `velocidadeMaxKmh`, `temperaturaMinC`,
`temperaturaMaxC`, `elapsedTimeSeg` e `tempoEmZonas`. `EtapaRealizadaOutputDto` ganha
`elevacaoGanhoMetros` e `elevacaoPerdaMetros`. `NON_NULL` já vale. Mudança aditiva.

`AtletaPerfilCoachOutputDto.TreinoPlanejadoResumoDto` ganha `treinoRealizadoId` (UUID, nulo quando
não há vínculo), montado a partir do vínculo planejado↔realizado que a tela Planos já usa. Sem ele o
`CurrentWeekPlan` não decide o botão. O tipo do front (`types/AtletaPerfilCoach.ts`) acompanha;
`types/PlanoReview.ts` (consumido pelo `PlanoDetalhePanel`) também ganha o campo — o DTO completo
do backend já o expõe.

O comparativo do shell usa o resumo como "planejado", então o resumo precisa preservar o que o
CA4 exige: ganha `ritmoAlvo`, e a distância ausente passa a sair nula em vez de `0.0`
(`CoachAthleteProfileServiceImpl`, montagem do resumo). Conferir os consumidores atuais do resumo
no front (`CurrentWeekPlan`, `coachInboxAdapters`) para o `null`.

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
  Exceção: o `TreinoCard` de Planos já busca a análise num `useEffect` (quando há RPE). O fetch
  inline do card é trocado pelo hook `useAnaliseTreinoRealizado`, e o card repassa ao dialog o
  **estado inteiro do hook** (`analise` prop: `{ status, data, refetch }`, com `status` em
  `loading | pronta | indisponivel | semRpe | erro`), não só o resultado. Um único dono da
  requisição: abrir antes da resposta mostra o carregando do mesmo estado; 204 e falha chegam
  distintos. Sem o prop (shell do coach), o dialog chama o hook ele mesmo.
- `ExecucaoTreinoDialog` (ver) não se confunde com o `TreinoRealizadoDialog` existente em
  `components/features/planos` (registrar execução), usado em `planosDialog.tsx`.
- Cabeçalho fixo da tabela: `position: sticky` no `th` dentro de um box com `maxHeight: 360px` e
  `overflow: auto` — sem virtualização (D8).

## D5 — Diferença planejado × realizado (adapter, puro)

| Linha | Planejado | Realizado | Critério de cor |
|---|---|---|---|
| Distância | `distanciaKm` | `distanciaKm` | ±10 % verde, fora âmbar |
| Duração | `duracaoMin` | tempo em movimento (fallback `duracaoMin`) | ±10 min verde, fora âmbar |
| Ritmo | `ritmoAlvo` (texto) | `paceMedia` | neutro (ritmo alvo é texto livre) |
| Zona | `zonaAlvo` | zona com mais tempo + "X% no alvo" | ≥ 60 % no alvo verde, fora âmbar |
| FC média | — | `fcMedia` | neutro |
| RPE | `percepcaoEsforcoEsperada` | `percepcaoEsforco` | ±1 verde, fora âmbar |

Cor nunca é o único sinal: a diferença sai em texto ("+1,04 km", "2% no alvo"). Sem um dos lados,
`--` e neutro. Tolerâncias são constantes nomeadas no adapter (A8).

**Alvo da zona.** `zonaAlvo` é texto livre (`Z2`, `z2-z3`). O adapter normaliza para um conjunto de
zonas FC: `Zn` → {n}; `Zn-Zm` → {n..m}; caixa ignorada. "% no alvo" = soma dos segundos das zonas
do conjunto / total. Fora de Z1–Z5 (ex.: Z6 de pace), ausente ou não reconhecido → conjunto vazio:
sem destaque na faixa e linha Zona neutra. Treino intervalado com alvo por etapa usa o `zonaAlvo` do
treino; alvo por etapa fica fora desta change (o 60 % pode penalizar intervalado — por isso a
tolerância passa pela 0.9).

## D6 — Tempo em zonas no import do `.fit`

- **Fonte das zonas:** `ZonaTreinoService.zonasFC(atleta)` — a mesma que o `ZoneResolver` usa, que
  respeita `AthleteZones.de` (faixa manual em `MANUAL`, derivada de limiar em `LIMIAR`). Regra
  única, sem regra nova (R7).
- **Zonas confiáveis (A9):** calcula só se o eixo de FC está em `MANUAL` com faixas, ou se
  `atleta.fcLimiar` (campo cru) está informado. Zonas derivadas de `getFcLimiarCalculada()` por
  fallback (85 % da FC máxima por idade ou 180) não contam → `tempo_em_zonas` nulo.
- **Atribuição de zona a um bpm:** limite inferior inclusivo; a primeira zona, em ordem Z1→Z5, cujo
  `[bpmMin, bpmMax]` contém o bpm vence (borda compartilhada fica na zona de baixo). bpm abaixo de
  Z1 → Z1; acima do topo → Z5; bpm numa lacuna entre faixas manuais → a zona imediatamente abaixo.
  Os limites gravados são os das faixas usadas, como vieram, para que a legenda bata com a soma.
- **Peso de cada amostra:** segundos até a próxima amostra, com teto de 5 s (pausa do relógio não
  vira tempo em zona). Última amostra → 1 s. Intervalo ≤ 0 (timestamp repetido ou invertido) →
  amostra ignorada. Amostra sem FC → ignorada, e o intervalo dela não é atribuído a ninguém.
  Função pura `TempoEmZonasCalculator.calcular(amostras, zonas)` com teste unitário de cada regra.
- **Cobertura mínima:** se a soma dos pesos for menor que 50 % de `duracaoMin` (FC ausente na maior
  parte do treino), `tempo_em_zonas` nulo — percentual sobre um pedaço do treino engana.
- Guarda o resultado **e os limites usados** (A6) em `tempo_em_zonas JSONB`: o histórico não muda
  quando as zonas do atleta mudam.
- `fonte` no JSON (`FIT_RECORDS`) deixa espaço para outras origens sem migrar o formato.
- Supersessão: quando `add-workout-metrics-analyzer` entregar o `WorkoutMetricsCalculator`, ele
  passa a produzir o mesmo `tempoEmZonas`; este calculador vira fallback ou é removido. O contrato
  do DTO não muda.

## D7 — Medição sem telemetria de front

O front não tem mecanismo de analytics (busca por `track|analytics|telemetry|posthog|gtag` sem
resultado), e log de GET no backend não distingue abertura de retry nem de outros consumidores.
Decisão (2026-11-05): **nenhum evento nesta change**.

- Cobertura: consulta SQL sobre `tb_treino_realizado` (fração com `tempo_em_zonas` não nulo nos
  tenants piloto, por fonte), rodada 4 semanas após o deploy.
- Uso: entrevista com os treinadores piloto.
- Telemetria de produto, se vier, é change própria e serve a outras telas também.

## D8 — Volume de etapas

Treino estruturado pode ter dezenas de voltas. Tabela simples com rolagem interna e cabeçalho fixo
basta até centenas de linhas; virtualizar só se a medição mostrar lentidão.

## Riscos e mitigações

- **R1 — Melhor ritmo irreal por pico de GPS.** Mostrar como veio; teto físico em follow-up se os
  pilotos reportarem ruído.
- **R2 — Colisão de migration.** `V108` usada, `V109`/`V110` em branches abertas. Esta change usa
  `V111`; reconferir `develop` e as branches no commit da migration.
- **R3 — Tipo de leitura do front desalinhado.** Teste do adapter com payload real capturado do
  backend local.
- **R4 — Dialog vazio para treino manual** (sem voltas, sem zonas, sem dinâmica). CA10/CA11 cobrem
  os estados vazios; o cabeçalho mostra a fonte ("Manual").
- **R5 — "Em andamento" que nunca termina.** O 204 com RPE pode significar análise que nunca vai
  rodar (treino antigo, falha silenciosa). Mitigação: o texto diz "indisponível no momento", sem
  prometer andamento; a change que distingue `PENDING` na API resolve de vez.
- **R6 — Memória no parse de `.fit` longo.** Ultra de 10 h a 1 Hz = 36 mil amostras de FC: duas
  colunas primitivas, desprezível. Medir na task 0.1.
- **R7 — Zonas sem dono único.** Resolvido: `ZonaTreinoService.zonasFC(atleta)` via
  `AthleteZones.de`, a mesma regra do `ZoneResolver` (D6).
- **R8 — Card legado.** Adicionar ação ao `TreinoCard` legado expande o shell `pages/`/Planos que o
  front está migrando. Aceito: foi onde o treinador aprovou o botão; o dialog fica em
  `features/coach` e o card só repassa o clique.

## Rollback

- Front: reverter o PR; os cards voltam a não ter ação.
- Backend: colunas nulas e aditivas — reverter o código deixa as colunas sem uso, sem perda de dado.
  Não há `DROP` no rollback.
