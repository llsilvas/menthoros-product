# Spec delta: athlete-workout-analysis

> Capability nova: a análise por IA de um `TreinoRealizado` com RPE ganha um bloco escrito para o
> atleta e um endpoint escopado por dono que o expõe; o plano sinaliza quais treinos já têm
> análise. Formato: requirements com cenários BDD verificáveis.

## Requirement: O prompt da análise recebe os dados que o texto do atleta cita

`WorkoutAnalysisListener.buildPromptData` DEVE enviar ao LLM, além do que já envia (tipo,
distância e RPE esperado do planejado; distância, RPE e FC média do realizado): `duracaoMin`
planejada e realizada, pace médio realizado quando derivável, e as etapas — planejadas
(`tipoEtapa`, `duracaoMin`, zona/alvo) e realizadas (`EtapaRealizada`, quando existirem) — **só
campos numéricos e enums**, nunca texto livre (`feedbackAtleta`, `observacao`, `descricaoEtapa`),
pela regra de injeção já documentada no listener. A skill DEVE instruir que o bloco do atleta só
cite números e fatos presentes nesses dados.

#### Scenario: Realizado com etapas
- **Given** um realizado com `etapasRealizadas` vinculado a um planejado com etapas
- **When** o prompt é montado
- **Then** o JSON contém `planned.duration_min`, `planned.steps[]`, `actual.duration_min`,
  `actual.steps[]` e `actual.avg_pace_min_km`; nenhum campo de texto livre

#### Scenario: Realizado sem etapas nem planejado
- **Then** o JSON contém só os campos disponíveis; a skill instrui a não inferir blocos ou
  desaquecimento que não estão nos dados

## Requirement: A análise gera um bloco para o atleta, em PT-BR, numa segunda chamada separada

Ao concluir a análise de um `TreinoRealizado` com `percepcaoEsforco`, o `WorkoutAnalysisListener`
DEVE, numa **segunda chamada separada** (rota `simple`, gpt-4o-mini), persistir em
`AnaliseWorkout` os campos `atletaReconhecimento`, `atletaComoFoi`, `atletaEsforco` e
`atletaProximoTreino`, vindos de um structured output com os quatro campos em português do
Brasil, cada um com no máximo 240 caracteres. O bloco NÃO passa pelo
`WorkoutAnalysisTranslator`. A chamada 1 (Sonnet) e os campos existentes do coach não mudam.

#### Scenario: Resposta completa
- **Given** um realizado com RPE 7 vinculado a um planejado com RPE esperado 6
- **When** a chamada 2 devolve o JSON com os quatro campos preenchidos e válidos
- **Then** a análise fica `COMPLETED` com os quatro campos do atleta e os campos do coach
  traduzidos como antes

#### Scenario: Bloco ausente ou malformado
- **When** a chamada 2 devolve o JSON sem o bloco (ou com campos vazios)
- **Then** a análise fica `COMPLETED` com os campos do coach preenchidos e os do atleta `null`

#### Scenario: Falha total
- **When** a chamada ao LLM falha
- **Then** a análise fica `FAILED` com os quatro campos do atleta `null`

#### Scenario: Tradução do coach falha
- **When** o `WorkoutAnalysisTranslator` lança exceção
- **Then** os campos do coach ficam em inglês (`translationFailed = true`) e o bloco do atleta
  permanece em PT-BR, intacto

## Requirement: O bloco do atleta é validado em runtime antes de persistir

Um `AthleteMessageValidator` DEVE rodar sobre o bloco **antes** de `applyResult` e nulificar os
quatro campos (persistindo `atletaBloqueadoMotivo`) quando qualquer texto: casar com
`/TSB|CTL|ATL|score|cancel|pule|pular|troque|overtraining|les[ãa]o|SNC/i`; exceder 240
caracteres; não parecer PT-BR (heurística: ausência de stopwords PT ou presença de 3+ stopwords
EN); ou — se a decisão 0.3 ligar o classificador — for marcado como "manda mudar o plano" pela
checagem binária via Haiku. A skill DEVE conter as regras (linguagem de atleta, sem jargão,
sem diagnóstico, nunca alterar o plano, remeter ao coach quando `primary_cause != NORMAL`,
citar só dados do prompt). Nulificar o bloco NÃO altera o status da análise do coach.

#### Scenario: Fixtures felizes
- **Given** as três respostas de exemplo do `SKILL.md` com o bloco do atleta
- **Then** o validador aceita; nenhum texto casa com o regex; no cenário de fadiga acumulada,
  `next_workout_tip` menciona o coach

#### Scenario: Fixtures adversariais
- **Given** um bloco com "melhor não fazer o intervalado de sexta", um com "seu corpo está
  pedindo uma pausa", e um em inglês
- **Then** o primeiro é rejeitado pelo regex/classificador, o terceiro pela heurística de idioma,
  e o segundo é **registrado** como caso que só o classificador pega (decide 0.3); em todos os
  rejeitados, a análise fica `COMPLETED` com os campos do atleta `null` e
  `atletaBloqueadoMotivo` preenchido

#### Scenario: Regras presentes na skill
- **Then** o `SKILL.md` contém a seção "Athlete message" com o schema e as regras acima (teste
  de contrato; falha se alguém as remover)

## Requirement: Endpoint do atleta, escopado por dono, com `PENDING` antes da linha existir

`GET /api/v1/atletas/me/realizados/{id}/analise` DEVE devolver a análise **do atleta
autenticado** para o realizado `{id}`:

```json
{
  "status": "PENDING | COMPLETED",
  "analyzedAt": "2026-08-25T10:42:00Z",
  "reconhecimento": "…", "comoFoi": "…", "esforco": "…", "proximoTreino": "…",
  "executado": { "duracaoMin": 58, "distanciaKm": 11.2, "rpe": 7 },
  "planejado": { "duracaoMin": 61, "distanciaKm": 11.0, "rpeEsperado": 6 }
}
```

Um realizado é **elegível** quando tem `percepcaoEsforco`, `dataTreino` dentro de
`maxIdadeDias` e o kill switch está ligado — as mesmas condições em que o listener gera análise.
Realizado elegível **sem linha** de `AnaliseWorkout` (janela entre o commit do registro e o
`@Async`) ou com linha `PENDING` → `200 PENDING`. NUNCA expõe `technicalInterpretation`,
`primaryCause`, `executionScore`, `tags` ou `rationale`.

#### Scenario: Análise pronta
- **Given** realizado do atleta autenticado com análise `COMPLETED` e bloco do atleta
- **When** `GET /me/realizados/{id}/analise`
- **Then** `200` com `status: COMPLETED`, os quatro textos, `analyzedAt`, `executado` e
  `planejado`; o corpo não tem nenhum campo do coach

#### Scenario: Logo após o registro, antes do listener criar a linha
- **Given** realizado elegível registrado há 1 s, sem `AnaliseWorkout`
- **Then** `200` com `status: PENDING`, `executado` (e `planejado` se houver), sem textos

#### Scenario: Em andamento
- **Given** linha `PENDING`
- **Then** `200 PENDING`, igual ao anterior

#### Scenario: Não elegível, falha, bloqueado ou anterior à change
- **Given** realizado sem RPE, ou mais antigo que `maxIdadeDias`, ou análise `FAILED`, ou
  `COMPLETED` com `atletaComoFoi = null` (bloco nulificado ou análise anterior à change)
- **Then** `204`

#### Scenario: Realizado sem planejado
- **Given** análise `COMPLETED` de um realizado sem `treinoPlanejado`
- **Then** `200` sem o objeto `planejado`

#### Scenario: Realizado de outro atleta do mesmo tenant
- **Then** `404`

#### Scenario: Outro tenant
- **Then** `404`

#### Scenario: Kill switch desligado
- **Given** `app.workout-analysis.athlete-message.enabled=false`
- **Then** `204` para qualquer realizado, e o listener continua gravando o bloco

## Requirement: Métrica de visualização deduplicada

`AnaliseWorkout.atletaPrimeiraVisualizacaoEm` DEVE ser carimbado na **primeira** resposta
`200 COMPLETED` ao dono, e só então `atleta_analise_visualizada_total` incrementa. Respostas
`PENDING` e repetições (polling) NÃO contam.

#### Scenario: Drawer aberto com polling
- **Given** 12 chamadas `PENDING` seguidas de 3 chamadas `COMPLETED`
- **Then** o contador incrementa 1 vez e `atletaPrimeiraVisualizacaoEm` tem o instante da
  primeira `COMPLETED`

## Requirement: O plano sinaliza quais treinos têm análise — e só o dono o lê como atleta

`GET /api/v1/planos/{atletaId}` DEVE incluir em cada `TreinoPlanejadoOutputDto` o campo
`analiseAtletaDisponivel: boolean` — `true` quando existe `AnaliseWorkout COMPLETED` para o
`treinoRealizadoId` com `atletaComoFoi != null` e o switch está ligado. Uma consulta por plano.
Com `ROLE_ATLETA`, o endpoint DEVE responder `404` quando `{atletaId}` não é o atleta
autenticado (hoje só filtra tenant e status `APROVADO`).

#### Scenario: Um treino analisado
- **Given** plano aprovado com sete treinos, um realizado e analisado
- **Then** aquele traz `analiseAtletaDisponivel: true`; os outros seis, `false`

#### Scenario: Switch desligado
- **Then** todos `false`

#### Scenario: Atleta lê o plano de outro atleta do mesmo tenant
- **Given** atleta A autenticado, `GET /planos/{idDeB}`
- **Then** `404`; o coach do tenant continua recebendo `200`

## Requirement: O coach vê o que o atleta leu — num endpoint só de coach

`GET /api/v1/analises/treino/{id}` DEVE passar a exigir `ROLE_TECNICO` ou `ROLE_ADMIN` — o papel de coach no repo é `TECNICO` (hoje:
`isAuthenticated()` + tenant, sem dono). Só então `AnaliseWorkoutOutputDto` inclui os quatro
campos do atleta (opcionais), que o `TreinoCard` legado exibe em somente leitura abaixo do
"Coach Insight".

#### Scenario: Coach abre a análise
- **Then** `200` com os quatro campos e o card mostra "O que o atleta leu"

#### Scenario: Atleta chama o endpoint do coach
- **Given** atleta autenticado (dono ou não do realizado)
- **Then** `403`

#### Scenario: Análise antiga
- **Then** campos ausentes e o bloco não é renderizado

## Dados

Migration aditiva `V86__add_atleta_message_to_tb_analise_workout.sql`:
`tb_analise_workout.atleta_reconhecimento TEXT NULL`, `atleta_como_foi TEXT NULL`,
`atleta_esforco TEXT NULL`, `atleta_proximo_treino TEXT NULL`,
`atleta_bloqueado_motivo VARCHAR(40) NULL`, `atleta_primeira_visualizacao_em TIMESTAMP NULL`.
Sem backfill. Rollback: reverter o código; colunas ficam inertes.

## Frontend (comportamento observável)

#### Scenario: Drawer do treino concluído com análise
- **Given** `GET /me/realizados/{id}/analise` → `200 COMPLETED`
- **When** o atleta abre o dia concluído no Plano
- **Then** o drawer mostra o chip "Concluído · RPE 7/10 · Difícil", os três números
  (executado / plano) e, na ordem, reconhecimento, "Como foi", "O que o seu esforço diz", "Para
  o próximo treino", com o rodapé "Seu coach vê a mesma análise"

#### Scenario: Drawer com análise em andamento
- **Given** `200 PENDING`
- **Then** o card mostra os números e "Analisando o seu treino…"; o hook reconsulta a cada 15 s
  por até 3 min enquanto o drawer está aberto; passado o limite, o card permanece em
  "Analisando…" sem novas chamadas

#### Scenario: Drawer sem análise
- **Given** `204`
- **Then** nenhum card; o drawer é o atual (descrição, perfil, etapas)

#### Scenario: Agenda
- **Given** `analiseAtletaDisponivel: true` no treino de terça
- **Then** a linha de terça mostra "Análise pronta"; as demais não

#### Scenario: Registro manual
- **Given** o atleta registra um treino com RPE
- **Then** o `PostWorkoutFeedbackCard` mostra o card em `pending` (o endpoint devolve `200
  PENDING` mesmo antes de o listener criar a linha) com "pode fechar — a análise fica guardada no
  treino", sem a frase fixa por faixa de RPE
