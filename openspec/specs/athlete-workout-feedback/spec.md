# Spec delta: athlete-workout-feedback

> Capability nova: "Como foi?" — o atleta registra RPE, sensações e comentário sobre um
> `TreinoRealizado` de qualquer origem, uma vez, e o coach vê no perfil do atleta.
> Formato: requirements com cenários BDD verificáveis.

## Requirement: Feedback é do `TreinoRealizado`, completude é o carimbo

`POST /api/v1/atletas/me/realizados/{id}/feedback` com corpo `{ "percepcaoEsforco": 1..10,
"sensacoes"?: ["PERNAS_PESADAS" | "RITMO_TRANQUILO" | "CALOR" | "DOR" | "DORMI_MAL"],
"comentario"?: string ≤ 500 }` DEVE gravar `percepcaoEsforco` (o RPE existente, lido por
`TssCalculatorService.calcularTssRpe` e pelo `ultimoRpe` do readiness), `sensacoes`
(`ElementCollection`), `feedbackAtleta` (o comentário, campo existente) e carimbar
`feedbackRegistradoEm`. Feedback completo ⇔ `feedbackRegistradoEm != null`.

#### Scenario: Envio feliz
- **Given** um `TreinoRealizado` do atleta autenticado, de hoje, `fonteDados = INTERVALS_ICU`
- **When** `POST .../feedback { "percepcaoEsforco": 5, "sensacoes": ["PERNAS_PESADAS"] }`
- **Then** `200`; `GET /me/treinos` devolve o realizado com `percepcaoEsforco = 5`,
  `sensacoes = ["PERNAS_PESADAS"]`, `feedbackRegistradoEm` preenchido
- **And** `GET /me/readiness` reflete `ultimoRpe = 5`

#### Scenario: Segundo envio substitui
- **Given** feedback já carimbado com RPE 5 e `["PERNAS_PESADAS"]`
- **When** `POST .../feedback { "percepcaoEsforco": 7, "sensacoes": [] , "comentario": "calor" }`
- **Then** RPE 7, `sensacoes` vazio, `feedbackAtleta = "calor"`, novo `feedbackRegistradoEm`

#### Scenario: Sem RPE
- **When** `POST .../feedback { "sensacoes": ["CALOR"] }`
- **Then** `400`

#### Scenario: Sensação fora da lista ou RPE fora de 1–10
- **When** `POST .../feedback { "percepcaoEsforco": 11 }` ou `{ "percepcaoEsforco": 5,
  "sensacoes": ["FELIZ"] }`
- **Then** `400`

#### Scenario: Registro manual antigo com RPE e sem carimbo é incompleto
- **Given** um `TreinoRealizado` manual com `percepcaoEsforco = 6` gravado antes desta change
- **When** `GET /me/home`
- **Then** `realizadoHoje.percepcaoEsforco = 6` e `feedbackRegistradoEm` ausente — o hero mostra
  "Como foi?" pré-preenchido, não o resumo

#### Scenario: Realizado de outro atleta ou outro tenant
- **When** `POST /me/realizados/{id-alheio}/feedback` com corpo válido
- **Then** `404`

## Requirement: TSS por RPE ao receber o RPE depois

Gravar `percepcaoEsforco` via feedback num realizado sem RPE DEVE ter o mesmo efeito sobre o TSS
que o RPE teria no registro manual — ou a change registra explicitamente que não recalcula.

#### Scenario: Sync sem FC nem pace recebe RPE
- **Given** um realizado por sync com `metodoCalculoTss` nulo (sem FC, sem pace) e sem RPE
- **When** o feedback grava RPE 6
- **Then** `tssCalculado` passa a existir por `calcularTssRpe` e a carga do dia é recalculada
  (`IngestaoTreinoRealizadoService`/`TsbService`), **ou** o teste documenta que o TSS não muda e a
  proposta registra o porquê

## Requirement: O coach vê o feedback no perfil do atleta

`GET /api/v1/coach/atletas/{id}/perfil` (`AtletaPerfilCoachOutputDto`) DEVE trazer
`realizadosRecentes[]` — realizados dos últimos 7 dias (`hoje` do atleta) com `{ id, dataTreino,
tipoTreino, fonteDados, duracaoMin, distanciaKm?, percepcaoEsforco?, sensacoes, feedbackAtleta?,
feedbackRegistradoEm? }`, mais recente primeiro.

#### Scenario: Feedback aparece no mesmo dia
- **Given** o atleta enviou feedback hoje (RPE 5, `PERNAS_PESADAS`)
- **When** o coach do mesmo tenant abre o perfil
- **Then** `realizadosRecentes[0]` traz o feedback carimbado

#### Scenario: Sem realizados na janela
- **Then** `realizadosRecentes = []`

#### Scenario: Coach de outro tenant
- **Then** `404` — comportamento existente do endpoint

## Dados

Migration aditiva (`V82__add_feedback_pos_treino_to_tb_treino_realizado.sql`):
`tb_treino_realizado.feedback_registrado_em TIMESTAMP NULL` e tabela
`tb_treino_realizado_sensacao (treino_realizado_id UUID FK, sensacao VARCHAR(30))` com PK
composta. `sensacoes` é `Set` (não `List`) na entidade — achado do `clean test`:
`MultipleBagFetchException` ao fazer join fetch com `etapasRealizadas` (duas bags na mesma
query); `EAGER` sozinho também não bastou por causa do `@EntityGraph` existente em
`findByTenantIdAndFonteDadosAndExternalId`, que é `type=FETCH` e reverte a LAZY tudo fora do
`attributePaths` — `sensacoes` precisou entrar na lista. Sem backfill. Rollback: reverter o
código; colunas/tabela ficam inertes.

## Requirement: Métricas de sucesso

O backend DEVE incrementar `atleta_treino_feedback_total` a cada feedback registrado e
`atleta_treino_pulo_total` a cada pulo — as métricas de sucesso da change (`SPRINTS.md`:
"Treinos com feedback / treinos realizados" e o volume de pulos avisados).

#### Scenario: Contador de feedback
- **When** `POST /me/realizados/{id}/feedback` com sucesso
- **Then** `atleta_treino_feedback_total` incrementa em 1

#### Scenario: Contador de pulo
- **When** `POST /me/treinos/hoje/pular` com sucesso
- **Then** `atleta_treino_pulo_total` incrementa em 1

## Ver também

O mesmo recurso `/api/v1/atletas/me/realizados/{id}` ganhou o endpoint irmão
`GET .../analise` — análise pós-treino em linguagem de atleta, spec
`athlete-workout-analysis` (change `analise-ia-treino-atleta`).
