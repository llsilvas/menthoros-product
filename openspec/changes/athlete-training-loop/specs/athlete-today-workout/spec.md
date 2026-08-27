# Spec delta: athlete-today-workout

> Capability nova: o treino de hoje do atleta como contrato próprio — "hoje" no fuso do atleta,
> etapas com alvo de FC/pace resolvidos pelo backend, e o pulo do dia. Estende `me/home`.
> Formato: requirements com cenários BDD verificáveis.

## Requirement: "Hoje" é do atleta e vem do backend

Os endpoints `GET /api/v1/atletas/me/home`, `GET /api/v1/atletas/me/treinos/hoje` e
`POST /api/v1/atletas/me/treinos/hoje/pular` DEVEM resolver `hoje` como
`LocalDate.now(clock.withZone(ZoneId.of(atleta.timezone)))` — fallback `America/Sao_Paulo` quando
o fuso do atleta é nulo ou inválido — e devolvê-lo no contrato (`hoje: "2026-08-27"`).

#### Scenario: Atleta em fuso diferente do servidor perto da meia-noite
- **Given** um atleta com `timezone = "America/Manaus"` (UTC−4) e o servidor em UTC
- **And** o relógio fixo em `2026-08-27T03:50:00Z` (23:50 do dia 26 em Manaus)
- **When** `GET /me/home`
- **Then** `hoje` é `2026-08-26`, e `proximoTreino` é o planejado de 26, não o de 27

#### Scenario: Fuso inválido cai no padrão sem quebrar
- **Given** um atleta com `timezone = "Marte/Olympus"`
- **When** `GET /me/home`
- **Then** `hoje` é calculado em `America/Sao_Paulo` e a resposta é `200`

## Requirement: `me/home` traz o realizado de hoje

`GET /me/home` DEVE devolver `realizadoHoje` quando existe `TreinoRealizado` do atleta com
`dataTreino == hoje`; omitido quando não existe. Campos: `id`, `fonteDados`, `tipoTreino`,
`duracaoMin`, `distanciaKm?`, `percepcaoEsforco?`, `feedbackRegistradoEm?`. Com mais de um
realizado no dia, o mais recente por `criadoEm`.

#### Scenario: Realizado por sync sem feedback
- **Given** um `TreinoRealizado` de hoje com `fonteDados = INTERVALS_ICU`, sem `percepcaoEsforco`
- **When** `GET /me/home`
- **Then** `realizadoHoje` vem com `fonteDados = "INTERVALS_ICU"` e sem `percepcaoEsforco` nem
  `feedbackRegistradoEm`

#### Scenario: Sem realizado hoje
- **Given** nenhum `TreinoRealizado` com `dataTreino == hoje`
- **When** `GET /me/home`
- **Then** o campo `realizadoHoje` é omitido do JSON

## Requirement: Treino de hoje com alvos resolvidos pela cadeia do push

`GET /api/v1/atletas/me/treinos/hoje` DEVE devolver o `TreinoPlanejado` do atleta com
`dataTreino == hoje` (`200`) ou `204` quando não há. Cada etapa traz `{ ordem, descricao,
duracaoSeg?, distanciaM?, zona?, alvoPrimario: 'FC' | 'PACE' | 'NENHUM', fcAlvoMin?, fcAlvoMax?,
paceAlvo?, textoSecundario?, blocoId?, blocoRepeticoes? }`, resolvidos por
`IntervalsIcuTargetParser.parseFc` → `IntervalsIcuFcAlvoResolver.resolver(bruto, atleta)` e
`IntervalsIcuTargetParser.parsePace` — a mesma cadeia de `IntervalsIcuWorkoutConverter.stepDeEtapa`.

#### Scenario: FC e pace na mesma etapa — FC vence, pace vira texto
- **Given** uma etapa com `fcAlvoEtapa = "Z2"` e `ritmoAlvo = "5:30-5:45"` e atleta com `fcLimiar`
- **When** `GET /me/treinos/hoje`
- **Then** `alvoPrimario = "FC"`, `fcAlvoMin`/`fcAlvoMax` iguais ao `HrTarget` que o converter
  produz para a mesma etapa, `paceAlvo` ausente e `textoSecundario = "5:30-5:45"`

#### Scenario: FC descartada por falta de limiar — pace assume
- **Given** uma etapa com `fcAlvoEtapa = "85-90%"` e `ritmoAlvo = "5:00"` e atleta **sem** `fcLimiar`
- **When** `GET /me/treinos/hoje`
- **Then** `alvoPrimario = "PACE"`, `paceAlvo` preenchido, sem `fcAlvoMin`/`fcAlvoMax`, e
  `textoSecundario = "85-90%"` (a FC prescrita que se perdeu, como no push)

#### Scenario: Etapa sem alvo confiável
- **Given** uma etapa só com `fcAlvoEtapa = "Z3"`, atleta sem `fcLimiar`, sem `ritmoAlvo`
- **When** `GET /me/treinos/hoje`
- **Then** `alvoPrimario = "NENHUM"`, `zona = "Z3"`, sem campos de FC/pace — o front mostra a
  zona e omite o bpm, sem inventar faixa

#### Scenario: Dia sem treino planejado
- **Given** nenhum `TreinoPlanejado` com `dataTreino == hoje`
- **When** `GET /me/treinos/hoje`
- **Then** `204 No Content`

## Requirement: Pular o treino de hoje

`POST /api/v1/atletas/me/treinos/hoje/pular` com corpo `{ "motivo": "SEM_TEMPO" | "CANSADO" |
"DOR" | "OUTRO" }` (motivo opcional) DEVE marcar o planejado de hoje como `PERDIDO` com
`motivoPulo` e `puladoEm`, sem criar `TreinoRealizado` e sem status novo no enum.

#### Scenario: Pulo com motivo
- **Given** um planejado de hoje `PENDENTE`
- **When** `POST /me/treinos/hoje/pular { "motivo": "DOR" }`
- **Then** `200` com o planejado `statusTreino = "PERDIDO"`, `motivoPulo = "DOR"`, `puladoEm`
  preenchido; nenhum `TreinoRealizado` criado

#### Scenario: Pulo sem motivo
- **When** `POST /me/treinos/hoje/pular` com corpo vazio ou `{}`
- **Then** `200`, `PERDIDO`, `motivoPulo` nulo, `puladoEm` preenchido

#### Scenario: Motivo fora da lista
- **When** `POST /me/treinos/hoje/pular { "motivo": "PREGUICA" }`
- **Then** `400`

#### Scenario: Sem treino hoje ou já realizado
- **Given** nenhum planejado hoje, ou o planejado de hoje já `REALIZADO`
- **When** `POST /me/treinos/hoje/pular`
- **Then** `422` (regra de negócio), nada muda

#### Scenario: Reversão ao registrar por um caminho que vincula
- **Given** o planejado de hoje `PERDIDO` com `motivoPulo = "CANSADO"`
- **When** um `TreinoRealizado` do mesmo dia e tipo é criado pelo registro manual
  (`TreinoServiceImpl.registrarTreinoManualAtleta`), pelo sync do intervals.icu
  (`ReconciliationDecisionExecutor`, `VINCULADO_AUTOMATICO`) ou pela reconciliação manual
  (`ManualReconciliationServiceImpl`)
- **Then** o planejado vai a `REALIZADO`, `motivoPulo` e `puladoEm` ficam nulos

#### Scenario: Upload `.fit` não reverte (decisão 0.4)
- **Given** o planejado de hoje `PERDIDO` com `motivoPulo`
- **When** um `.fit` do mesmo dia é importado
- **Then** o planejado continua `PERDIDO` com o motivo — o `.fit` não passa pela reconciliação
  nesta change (linha no Radar)

## Requirement: Isolamento por tenant e por atleta

Os três endpoints DEVEM resolver o atleta pelo JWT (`resolverAtletaIdAtual`) e nunca aceitar
`atletaId` como parâmetro.

#### Scenario: Planejado de outro tenant é invisível
- **Given** o único planejado de hoje pertence a um atleta de outro tenant
- **When** `GET /me/treinos/hoje` e `POST /me/treinos/hoje/pular`
- **Then** `204` e `422` respectivamente — o planejado alheio não é lido nem alterado

## Dados

Migration aditiva `tb_treino_planejado`: `motivo_pulo VARCHAR(20) NULL`, `pulado_em TIMESTAMP
NULL`. Sem backfill. Rollback: reverter o código; as colunas nulas ficam inertes.
