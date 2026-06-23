# Proposal: coach-add-workout-to-plan

**Tamanho:** S · **Trilha:** Full

## Status

Proposed

## Why

O fluxo de revisão de planos (`coach-plan-review-workflow`, sprint 9e) e a edição granular (`coach-edit-planned-workout`, sprint 9g) fecharam dois lados do ciclo: o coach pode aprovar/rejeitar o plano inteiro e editar treinos existentes. Falta o terceiro lado: **o coach não consegue adicionar novos treinos** quando julga que o plano gerado pela IA está incompleto.

Cenários reais onde a omissão dói:

- A IA gera 4 treinos para uma semana em que o atleta tem disponibilidade para 5 (ex.: janela extra na quinta).
- A IA não inclui a sessão de mobilidade/força que o coach prescreve sistematicamente para todos os atletas.
- O coach quer inserir uma ativação técnica que o modelo atual não contempla.

Sem esta feature, o coach rejeita o plano inteiro e reescreve a instrução para a IA — perdendo todo o trabalho certo, aguardando nova geração e assumindo que a instrução adicional será interpretada corretamente.

## What Changes

### Backend

- Novo endpoint `POST /api/v1/coach/planos/{planoId}/treinos` — cria um novo `TreinoPlanejado` dentro de um plano `AGUARDANDO_REVISAO`.
- **Campos obrigatórios:** `tipoTreino`, `dataTreino` (LocalDate; deve estar dentro do intervalo `[semanaInicio, semanaFim]` do plano).
- **Campos opcionais:** `descricao`, `distanciaKm`, `duracaoMin` (inteiro em minutos), `zonaAlvo`, `percepcaoEsforcoEsperada`, `tssPlanejado`, `observacoes`, `etapas: List<EtapaInputDto>`.
- **diaSemana:** derivado automaticamente de `dataTreino.getDayOfWeek()` no backend — o cliente não envia.
- **Recálculo de TSS:** quando `duracaoMin` é informado e `tssPlanejado` não, usa `round(duracaoMin × rpe² / 90)` com `rpe` padrão 5 quando `percepcaoEsforcoEsperada` é nulo. `TssCalculatorService` reutilizado sem modificação.
- **Etapas:** quando presentes, `ordem` é atribuída pelo backend pela posição no array (1, 2, 3…); `EtapaInputDto` reutilizado sem modificação.
- **Rastreabilidade:** nova coluna `adicionado_pelo_coach BOOLEAN NOT NULL DEFAULT FALSE` em `tb_treino_planejado` (migration V41). Setada `true` em qualquer criação via este endpoint.
- **Restrições:**
  - `reviewStatus ≠ AGUARDANDO_REVISAO` → 422.
  - `dataTreino` fora de `[semanaInicio, semanaFim]` → 422.
  - Plano de outro tenant → 404.
- Resposta: `201 Created` com `TreinoPlanejadoOutputDto` do treino criado.

### Frontend

- Botão "Adicionar treino" no painel de detalhe do plano na `CoachPlanReviewPage`, visível apenas quando `reviewStatus = AGUARDANDO_REVISAO`.
- `TreinoAddDialog` (MUI Dialog) com:
  - **Campos do treino:** tipo (Select com os tipos disponíveis), data (Select com as datas da semana do plano), distância, duração (número de minutos), zona alvo (TextField), RPE (Slider 1–10), TSS (TextField opcional), observações.
  - **Seção de etapas expansível:** lista dinâmica com botão "Adicionar etapa" que insere nova linha (tipo Select, descrição, duração, distância, FC alvo); cada linha tem botão remover. Sem reordenação (fora do escopo).
- Após salvar com sucesso: re-fetch do plano; novo card aparece na lista com chip "Adicionado pelo coach" (`data-testid="chip-adicionado-coach"`).
- Se o plano estiver `APROVADO` ou `REJEITADO`, o botão "Adicionar treino" não é exibido.

## Capabilities

### New Capabilities
- `coach-add-workout-to-plan`: o coach inclui treinos não previstos pela IA durante a revisão do plano semanal.

### Modified Capabilities
- `coach-plan-review-workflow`: além de editar treinos existentes, o coach agora pode adicionar novos.

## Impact

**Banco de dados:**
- Coluna `adicionado_pelo_coach BOOLEAN NOT NULL DEFAULT FALSE` em `tb_treino_planejado`. Migration V41. Sem nova tabela.

**APIs novas:**
- `POST /api/v1/coach/planos/{planoId}/treinos`

**APIs modificadas:**
- `TreinoPlanejadoOutputDto`: campo `adicionadoPeloCoach` adicionado.

**Dependências:**
- Requer `coach-plan-review-workflow` ✅ e `coach-edit-planned-workout` ✅.
- `EtapaInputDto` reutilizado (introduzido em `coach-edit-planned-workout`).
- `TssCalculatorService` reutilizado (introduzido em `coach-edit-planned-workout`).
- Alimenta `rag-coach-methodology-personalization` (Sprint 17): treinos com `adicionadoPeloCoach = true` são sinal de necessidade não coberta pelo modelo.

**Multi-tenancy:**
- `POST` valida que o plano pertence ao `tenantId` atual antes de qualquer operação (404 se não pertencer — sem revelar existência no outro tenant).

## Critérios de Aceite

**CA1 — Adicionar treino simples ao plano:**
- Given: plano em `AGUARDANDO_REVISAO`, semana 2026-07-01 a 2026-07-07
- When: coach envia `POST /coach/planos/{planoId}/treinos` com `{ "tipoTreino": "CORRIDA_LONGA", "dataTreino": "2026-07-03", "distanciaKm": 12, "duracaoMin": 75 }`
- Then: 201 Created; novo `TreinoPlanejado` com `adicionadoPeloCoach = true` e `diaSemana = QUINTA`; plano permanece `AGUARDANDO_REVISAO`

**CA2 — Adicionar treino com etapas:**
- Given: plano em `AGUARDANDO_REVISAO`
- When: coach envia POST com `etapas: [{ "tipoEtapa": "AQUECIMENTO", "duracaoMin": 10 }, { "tipoEtapa": "PRINCIPAL", "duracaoMin": 60 }]`
- Then: 2 `EtapaTreino` criadas com `ordem = 1` e `ordem = 2` respectivamente

**CA3 — TSS calculado quando duracaoMin e RPE informados:**
- Given: coach envia `{ "tipoTreino": "TREINO_FORCA", "dataTreino": "2026-07-04", "duracaoMin": 45, "percepcaoEsforcoEsperada": 6 }`
- Then: `tssPlanejado = round(45 × 36 / 90) = 18`

**CA4 — duracaoMin ausente: default e TSS nulo:**
- Given: coach envia apenas `tipoTreino` e `dataTreino` (sem `duracaoMin` nem `tssPlanejado`)
- Then: `TreinoPlanejado.duracaoMin = Duration.ZERO` (constraint NOT NULL na entidade exige default); `tssPlanejado = null` (sem duração significativa, cálculo não é realizado)

**CA5 — dataTreino fora do intervalo do plano:**
- Given: plano com `semanaInicio = 2026-07-01` e `semanaFim = 2026-07-07`
- When: coach envia POST com `dataTreino = "2026-07-08"`
- Then: 422 com mensagem indicando data fora do intervalo do plano

**CA6 — Bloqueado em plano não-revisão:**
- Given: plano `APROVADO` ou `REJEITADO`
- When: coach tenta POST
- Then: 422 com mensagem "Plano não está em revisão"

**CA7 — Isolamento de tenant:**
- Given: plano pertence ao tenant B
- When: coach do tenant A tenta POST
- Then: 404

**CA8 — diaSemana derivado automaticamente:**
- Given: `dataTreino = "2026-07-03"` (quinta-feira)
- When: treino é criado
- Then: `diaSemana = QUINTA` (sem o cliente enviar)

**CA9 — Double-day permitido com aviso na UI:**
- Given: plano com treino existente em 2026-07-03
- When: coach seleciona 2026-07-03 no `TreinoAddDialog`
- Then: UI exibe aviso inline abaixo do campo de data: "Já existe 1 treino nesta data. Double-day é permitido — confirme se é intencional."; criação não é bloqueada; 201 após confirmação

**CA10 — Guardrail de limite máximo:**
- Given: plano com 14 treinos já adicionados na semana
- When: coach tenta adicionar o 15°
- Then: 422 com mensagem "Limite de 14 treinos por semana atingido"

**CA11 — Chip "Adicionado pelo coach" na UI:**
- Given: `adicionadoPeloCoach = true` no DTO
- When: coach visualiza a lista de treinos do plano
- Then: card exibe `data-testid="chip-adicionado-coach"` com label "Adicionado pelo coach"

## Métrica de Sucesso

**Primária (adoção):** `% de semanas de revisão em que o coach adiciona ao menos 1 treino via este endpoint` > 10% nas primeiras 4 semanas em produção. Valor <5% indica que o atrito do dialog é alto ou a lacuna não é tão frequente quanto esperado.
- **Instrumento de coleta:** log estruturado no service — `log.info("coach-adicionou-treino: planoId={}, tenantId={}, tipoTreino={}, comEtapas={}", ...)`. Query semanal: `SELECT COUNT(DISTINCT plano_semanal_id) FROM tb_treino_planejado WHERE adicionado_pelo_coach = true AND criado_em >= CURRENT_DATE - 7`.

**Secundária (impacto):** redução de ≥20% nas rejeições de plano comparado ao baseline das 4 semanas anteriores ao deploy.
- **Instrumento de coleta:** `SELECT count(*) FROM tb_plano_semanal WHERE review_status = 'REJEITADO' AND semana_inicio >= CURRENT_DATE - 28`.

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|:---:|:---:|---|
| Double-day: coach adiciona treino em data já ocupada e o atleta recebe carga excessiva | Média | Médio | Comportamento intencional (double-day é válido); UI avisa quando data já tem treino, sem bloquear; o coach é responsável pela decisão |
| Etapas sem tipo: coach salva etapa sem informar `tipoEtapa`, geração de plano subsequente fica inconsistente | Baixa | Médio | `tipoEtapa` obrigatório na etapa quando a lista de etapas for enviada; validação no service |
| `diaSemana` mapeado errado para fusos: `dataTreino.getDayOfWeek()` é agnóstico de fuso | Baixa | Baixo | `PlanoSemanal.semanaInicio` usa `LocalDate` (sem fuso) — consistência garantida |
| Dialog muito complexo: etapas dinâmicas aumentam o tempo de preenchimento, reduzindo adoção | Média | Alto | Etapas opcionais e colapsadas por default. Trip-wire: se em 30 dias o preenchimento de etapas for <5% dos treinos adicionados, a seção de etapas é removida do MVP e tratada como follow-on |
| Sem limite de treinos: coach adiciona 10+ na mesma semana por erro de clique repetido | Baixa | Médio | Guardrail no service: máximo 14 treinos/semana; 422 com mensagem explicativa. Endpoint não é idempotente — frontend deve desabilitar botão durante request |
| `adicionadoPeloCoach` não propagado ao `rag-coach-methodology-personalization` corretamente | Baixa | Baixo | Campo já presente no `TreinoPlanejadoOutputDto`; Sprint 17 lê diretamente do banco — campo rastreável desde o início |

## Open Questions & Assumptions

**Premissas fechadas:**
- `diaSemana` derivado de `dataTreino.getDayOfWeek()` no backend; cliente não envia. Mapeamento `DayOfWeek → DiaSemana` já existe em `TreinoServiceImpl` e `StravaActivityServiceImpl` — extrair para helper estático e reutilizar.
- `TreinoBase.duracaoMin` é `Duration` com `nullable=false` — quando `duracaoMin` não informado, default `Duration.ZERO` no backend. TSS permanece `null` neste caso (CA4).
- `TssCalculatorService.calcularTssEstimado(Duration, Integer)` recebe `Duration` — converter `Integer duracaoMin → Duration.ofMinutes(duracaoMin)` no service antes de chamar.
- Double-day é intencional e permitido — aviso inline na UI: "Já existe N treino(s) nesta data. Double-day é permitido — confirme se é intencional." (CA9).
- Limite máximo 14 treinos/semana por plano — guard no service; 422 com mensagem explicativa (CA10).
- `ordem` das etapas atribuída pela posição no array de entrada (backend), não pelo cliente.
- `EtapaInputDto` e `TssCalculatorService` reutilizados sem modificação.
- Seção de etapas colapsada por default no dialog.
- `adicionadoPeloCoach` é `boolean` primitivo — default `false` no JSON, sem risco de campo ausente em clientes anteriores.
- `PlanoSemanal.atleta` e `assessoria` são LAZY — service deve usar query com JOIN FETCH ou carregar explicitamente antes de criar o `TreinoPlanejado` (necessário para o `@PrePersist`).

**Em aberto:**
- Notificação ao atleta de que o plano foi enriquecido? Fora do escopo — atleta só vê o plano aprovado.
- Reordenação de etapas dentro do dialog? Adiado — lista simples sem drag-drop para o MVP.
- ~~Confirmar ausência de migration V41~~ **Fechado:** V41 livre confirmado em 2026-06-23 — nenhuma branch ativa tem migration V41; última aplicada é V40.
