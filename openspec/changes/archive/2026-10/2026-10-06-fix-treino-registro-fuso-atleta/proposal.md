**Tamanho:** S · **Trilha:** Fast

# fix-treino-registro-fuso-atleta

## Por que

Investigando o relato do atleta "treino feito também mostra o treino de ontem, não o de hoje" na
Home (card `TodayCompletedCard`), a causa raiz está no backend, não no front.

A Home já resolve "hoje" corretamente pelo fuso do atleta (`AtletaHojeResolver.hojeDe(atleta)`,
`AtletaProgressServiceImpl:220`). Mas o `dataTreino` gravado em `TreinoRealizado` não é consistente
entre as três origens:

| Origem | Como `dataTreino` é resolvido | Consciente do fuso do atleta? |
|---|---|---|
| Registro manual (`TreinoServiceImpl.lancarTreino`, `.addTreino`) | `LocalDate.now(clock)` quando o app não envia a data | **Não** — usa o relógio/fuso do servidor (UTC) |
| Strava (`StravaActivityServiceImpl.mergeActivityIntoTreino`) | `Instant.parse(startDateLocal).atZone(ZoneId.systemDefault())` | **Não, por coincidência** — só funciona porque a JVM roda em UTC hoje |
| Intervals.icu (`IntervalsIcuActivityMapper.parseDataTreino`) | `LocalDateTime.parse(startDateLocal)` literal, sem zona | **Sim** (por não precisar de zona — a string já é hora de parede local) |

Para um atleta em fuso atrás de UTC (Brasil, UTC-3), existe uma janela diária de ~3h (fim de
tarde/noite local) em que o relógio UTC já virou o dia seguinte enquanto o dia do atleta ainda não
virou. Um treino registrado manualmente nessa janela (sem o app mandar `dataTreino` explícito) é
gravado com a data de amanhã (UTC) — some do card "hoje" no momento do registro, e reaparece como
"treino de ontem" no dia seguinte, quando o relógio do atleta finalmente alcança essa data gravada.
É exatamente o sintoma relatado.

O comentário do próprio `AtletaHojeResolver` já documenta esse risco ("Às 23:50 em Manaus o servidor
em UTC já virou o dia — usar `LocalDate.now(clock)` mostraria o treino de amanhã e esconderia o
registro de hoje"), mas o componente nunca foi usado nos pontos de registro que precisam dele.

## O que muda

- `TreinoServiceImpl.addTreino` e `TreinoServiceImpl.lancarTreino`: o fallback de `dataTreino`
  (quando o input não traz a data) passa de `LocalDate.now(clock)` para
  `hojeResolver.hojeDe(atleta)`.
- `StravaActivityServiceImpl.mergeActivityIntoTreino`: o fallback de `treinoDate == null` passa de
  `LocalDate.now()` para `hojeResolver.hojeDe(atleta)`.
- `StravaActivityServiceImpl.parseActivityDate`: reescrito para tratar `startDateLocal` como hora de
  parede literal (mesmo padrão de `IntervalsIcuActivityMapper.parseDataTreino` — `LocalDateTime.parse`
  → `OffsetDateTime.parse` → `Instant.parse` em UTC, nessa ordem), eliminando o round-trip por
  `ZoneId.systemDefault()` que hoje só "funciona" por coincidência de zona da JVM.
- Novo field `AtletaHojeResolver hojeResolver` injetado nos dois services (constructor injection).

## Fora de escopo

- `IntervalsIcuActivityMapper` não muda — já está correto (serve de referência para o fix do Strava).
- Treinos já gravados com `dataTreino` errada não são corrigidos retroativamente (sem como distinguir
  com certeza quais foram afetados sem reprocessar contra o fuso do atleta na época do registro) —
  correção de dados históricos, se necessária, é decisão separada do founder.
- Mudança de contrato de API: nenhuma — `dataTreino` continua opcional no input, mesmo tipo de saída.
- Sem migration — não há mudança de schema.

## Critérios de aceite

1. Given um atleta com `timezone` salvo em fuso atrás de UTC (ex.: `America/Sao_Paulo`), When ele
   registra um treino manualmente sem informar `dataTreino`, em qualquer horário do dia dele, Then o
   `dataTreino` gravado é o dia corrente **no fuso do atleta**, nunca no fuso do servidor.
2. Given uma atividade Strava com `start_date_local` em qualquer horário, When ela é convertida para
   `TreinoRealizado`, Then `dataTreino` é extraído da string literal (hora de parede), sem depender
   da zona padrão da JVM.
3. Given `startDateLocal` nulo/inválido (Strava), When o fallback dispara, Then usa
   `hojeResolver.hojeDe(atleta)`, não `LocalDate.now()` cru.
4. Given os três fluxos (manual, Strava, Intervals.icu) registrando no mesmo instante para o mesmo
   atleta, When comparados, Then todos gravam o mesmo `dataTreino`.
5. `./mvnw clean verify` passa sem regressão.

## Métrica de sucesso

Um treino registrado por qualquer via, em qualquer horário do fuso do atleta, aparece no card
"Treino feito" do dia certo na Home — sem depender de qual fuso o servidor está rodando.

## Open Questions & Assumptions

- **Assumido:** `Atleta.getTimezone()` já é confiável o suficiente para esse uso (mesmo padrão já
  usado pela Home) — não há necessidade de validação extra nesta change.
- **Aberto:** se dados históricos precisarem de correção retroativa, isso é um script/decisão à
  parte, fora do escopo desta change.
