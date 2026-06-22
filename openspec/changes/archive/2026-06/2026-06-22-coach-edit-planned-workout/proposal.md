# Proposal: coach-edit-planned-workout

**Tamanho:** S · **Trilha:** Full

## Status

Proposed

## Why

O fluxo de revisão de planos (`coach-plan-review-workflow`, sprint 9e) entregou o loop de aprovação binário: o coach vê o plano gerado pela IA e decide — aprova ou rejeita. O fluxo binário tem uma lacuna prática: quando a IA acerta 90% do plano mas erra um treino específico (pace errado, volume excessivo num dia de folga, tipo de sessão incoerente com o ciclo), o coach precisa rejeitar o plano inteiro e regenerar — perdendo o que estava certo.

Sem edição granular, cada erro da IA gera o seguinte custo: rejeitar → regenerar → aguardar LLM → revisar de novo. Isso cria atrito repetitivo e reduz a confiança do coach no ciclo IA-coach, justamente quando a adesão ao fluxo de revisão está sendo construída.

Além disso, os treinos editados manualmente tornam-se dado implícito de preferência do coach: quais tipos de sessão ele altera, em que sentido, com que frequência. Esse sinal alimentará `rag-coach-methodology-personalization` (Sprint 17), que aprende com planos aprovados/editados para personalizar a geração futura.

## What Changes

### Backend

- Novo endpoint `PATCH /api/v1/coach/planos/{planoId}/treinos/{treinoId}` — edita campos prescritos de um `TreinoPlanejado` dentro de um plano `AGUARDANDO_REVISAO`.
- **Campos editáveis:** `tipoTreino`, `descricao`, `distanciaKm`, `duracaoMin`, `zonaAlvo`, `tssPlanejado`, `percepcaoEsforcoEsperada`, `observacoes`. Campos `null` no body são ignorados (patch semântico).
- **Campos protegidos:** `dataTreino`, `diaSemana` (identidade temporal — mover data exige reordenação do plano, fora do escopo), `statusTreino` (ciclo de execução), `justificativaIa` (auditoria imutável do que a IA propôs).
- **Restrição de estado:** edição só é permitida com `reviewStatus = AGUARDANDO_REVISAO`. Qualquer outro estado lança `DomainRuleViolationException` → 422.
- **Recálculo de TSS:** quando `distanciaKm` ou `duracaoMin` muda e `tssPlanejado` não foi explicitamente informado, o backend recalcula TSS estimado com a fórmula `TSS = round((duracaoMin.toMinutes() * rpe * rpe) / 90.0)`, onde `rpe = percepcaoEsforcoEsperada ?? 5`. Se `tssPlanejado` for informado no body, o valor do coach prevalece — sem override.
- **Rastreabilidade:** campo `editadoPeloCoach: Boolean` (default `false`) adicionado a `TreinoPlanejado`; setado para `true` em qualquer edição bem-sucedida.
- Migration V39: `ALTER TABLE tb_treino_planejado ADD COLUMN IF NOT EXISTS editado_pelo_coach BOOLEAN NOT NULL DEFAULT FALSE`.
- `TreinoPlanejadoOutputDto` ganha campo `editadoPeloCoach` para o frontend renderizar o indicador visual.

### Frontend

- Na `CoachPlanReviewPage`, cada card de treino no painel de detalhe ganha botão de edição (ícone lápis), visível apenas quando o plano está `AGUARDANDO_REVISAO`.
- Abre `TreinoEditDialog` (MUI `Dialog`) com campos pré-preenchidos: tipo (Select), distância (TextField numérico), duração (TextField em minutos), zona alvo (TextField), RPE esperado (Slider 1–10), TSS (TextField numérico, opcional — se em branco, backend recalcula), observações (TextField multiline).
- Após salvar, re-fetch do plano para refletir os novos valores; chip/badge "Editado manualmente" aparece no card do treino quando `editadoPeloCoach = true`.
- Se o plano estiver `APROVADO` ou `REJEITADO`, o botão de edição não é exibido.

## Capabilities

### New Capabilities

- `coach-edit-planned-workout`: edição granular de treinos planejados durante a revisão de plano.

### Modified Capabilities

- `coach-plan-review-workflow`: agora inclui possibilidade de editar treinos antes de aprovar.

## Impact

**Banco de dados:**
- Coluna `editado_pelo_coach BOOLEAN NOT NULL DEFAULT FALSE` em `tb_treino_planejado`.
- Sem nova tabela.
- Migration Flyway: V39.

**APIs novas:**
- `PATCH /api/v1/coach/planos/{planoId}/treinos/{treinoId}`

**APIs modificadas:**
- `TreinoPlanejadoOutputDto`: campo `editadoPeloCoach` adicionado.

**Dependências:**
- Requer `coach-plan-review-workflow` ✅ (plano em `AGUARDANDO_REVISAO` e `CoachPlanReviewPage` já existem).
- Independente de `add-llm-tool-use`.
- Alimenta `rag-coach-methodology-personalization` (futuro) — treinos com `editadoPeloCoach = true` são sinal de preferência do coach.

**Multi-tenancy:**
- `PATCH` valida que o plano pertence ao `tenantId` atual antes de qualquer modificação (404 se não pertencer — sem expor se pertence a outro tenant).

## Critérios de Aceite

**CA1 — Editar campos de um treino pendente:**
- Given: plano em `AGUARDANDO_REVISAO` com treino de corrida longa de 22km
- When: coach envia `PATCH /coach/planos/{planoId}/treinos/{treinoId}` com `{ "distanciaKm": 18, "observacoes": "Reduzir — semana de prova anterior" }`
- Then: treino atualizado com os novos valores; `editadoPeloCoach = true`; plano permanece em `AGUARDANDO_REVISAO`

**CA2 — Patch semântico: campos null não são alterados:**
- Given: treino com `tipoTreino = CORRIDA_LONGA` e `zonaAlvo = "z2"`
- When: coach envia `PATCH` com apenas `{ "distanciaKm": 15 }` (sem informar `tipoTreino` nem `zonaAlvo`)
- Then: `distanciaKm` atualizada; `tipoTreino` e `zonaAlvo` permanecem inalterados

**CA3 — TSS recalculado automaticamente quando duração muda sem TSS explícito:**
- Given: treino com `duracaoMin = 60min`, `percepcaoEsforcoEsperada = 7`, `tssPlanejado = 55`
- When: coach envia `PATCH` com `{ "duracaoMin": "PT90M" }` (sem `tssPlanejado`)
- Then: `tssPlanejado` recalculado para `round(90 * 7 * 7 / 90) = 49`

**CA4 — TSS do coach prevalece quando informado:**
- Given: mesmas condições do CA3
- When: coach envia `PATCH` com `{ "duracaoMin": "PT90M", "tssPlanejado": 65 }`
- Then: `tssPlanejado = 65` (valor do coach, sem recálculo)

**CA5 — Edição bloqueada em plano aprovado:**
- Given: plano `APROVADO`
- When: coach tenta `PATCH /coach/planos/{planoId}/treinos/{treinoId}`
- Then: resposta 422 com mensagem "Plano não está em revisão"

**CA6 — Isolamento de tenant:**
- Given: treino pertence ao tenant B
- When: coach do tenant A tenta `PATCH`
- Then: 404 (sem revelar que o recurso pertence a outro tenant)

**CA7 — Chip "Editado manualmente" na UI:**
- Given: treino com `editadoPeloCoach = true` no DTO
- When: coach visualiza o painel de detalhe do plano
- Then: card do treino exibe indicador visual (chip) "Editado manualmente"; `data-testid="chip-editado-coach"` presente no DOM

## Métrica de Sucesso

**Primária (adoção):** `% de planos aprovados com ≥1 treino editado (editadoPeloCoach = true)` > 20%. Indica que a feature é usada sem ser excessiva — se 100%, a IA está falhando sistematicamente; se <5%, o feature não está sendo adotado ou o atrito é alto.

**Secundária (impacto):** redução de ≥40% nas rejeições de plano comparado ao baseline pré-edição — coach corrige em vez de rejeitar.
**Coleta de baseline:** na semana imediatamente anterior ao deploy, contar `PlanoSemanal` com `reviewStatus = REJEITADO` via query `SELECT count(*) FROM tb_plano_semanal WHERE review_status = 'REJEITADO' AND semana_inicio >= CURRENT_DATE - 7`.

**Trip-wire de UX:** se após 2 semanas em produção a taxa de uso do dialog for <15% dos planos em revisão, investigar atrito antes de investir nas features de Sprint 17 (`rag-coach-methodology-personalization`).

## Riscos e Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|---|:---:|:---:|---|
| Concorrência silenciosa: dois `PATCH` simultâneos no mesmo treino (multi-device / duas abas) sobrescrevem sem aviso | Baixa | Alto | Adicionar `@Version` a `TreinoPlanejado`; handler de `OptimisticLockException` → 409 |
| TSS recalculado com `rpe=5` default produz carga incorreta para treinos sem RPE informado | Média | Médio | Logar warning + retornar `tssPlanejado=null` (em vez de default silencioso) quando `percepcaoEsforcoEsperada` é nulo e recálculo é disparado |
| Atrito alto em edições em lote (IA erra 4+ treinos): dialog sequencial pode ser mais custoso que rejeitar e regenerar | Média | Alto | Trip-wire de adoção (ver Métricas); se acionado, avaliar modo de edição inline ou edição em lote como follow-on |
| `treinoId` intra-tenant cruzado: coach passa `planoId` válido + `treinoId` de outro plano do mesmo tenant | Baixa | Alto | Verificação explícita `treino.planoSemanal.id == planoId` no service + test case dedicado |

## Open Questions & Assumptions

**Premissas fechadas:**
- TSS é recalculado automaticamente quando `distanciaKm` ou `duracaoMin` mudam e `tssPlanejado` não é informado explicitamente. Valor do coach prevalece quando informado. Fórmula: `round(duracaoMinutos * rpe² / 90.0)`, com `rpe` padrão 5 quando `percepcaoEsforcoEsperada` é nulo.
- Edição de `EtapaTreino` (passos internos) está **fora do escopo** — edição no nível `TreinoPlanejado` é suficiente para o MVP.
- Edição de `dataTreino` e `diaSemana` está **fora do escopo** — mover a data de um treino reordena o plano semanal e pode colidir com outros treinos.
- O campo `justificativaIa` é imutável — auditoria do que a IA propôs.

**Em aberto:**
- O objetivo semanal do `PlanoSemanal` (`objetivoSemanal`) deve ser atualizado quando treinos são editados? (Sugestão: não — o objetivo é nível plano, a edição é nível treino. Decidir apenas se surgir necessidade após entrega.)
- Notificação ao atleta indicando que o plano aprovado inclui treinos editados manualmente? (Fora do escopo — atleta só vê o plano aprovado; os detalhes editoriais são internos ao coach.)
- ~~TSS recalculado silenciosamente vs. TSS pré-preenchido no dialog~~ **Fechado:** recálculo automático no backend prevalece (CA3/CA4 corretos). `TssEstimator` é necessário na task 1.3. Frontend mantém campo TSS opcional (sem valor default diferente do atual).
