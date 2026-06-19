# Proposal: manual-training-entry-lightweight

**Tamanho:** XS · **Trilha:** Fast

## Status

Proposed

## Why

Toda a inteligência do Menthoros — TSB, fila de atenção, debrief, sugestões — depende de dado de treino. O `first-party-ingestion-architecture` (Sprint 22) é a solução completa: upload de `.fit`, dedup cross-source, compute-on-import. É uma change L que não chegará por muitos sprints.

Enquanto isso, o sistema está **funcionalmente cego**: a fila de atenção avalia aderência sem saber o que o atleta efetivamente fez, o TSB não se move, e o inbox de sugestões dispara alertas de "sem treinos recentes" que são reais mas vazios de conteúdo.

Um log manual de 4 campos (tipo + duração + RPE + data) resolve isso. Não é elegante — é um **desbloqueador de MVP**. Com dado real fluindo, a fila de atenção passa a refletir a realidade do atleta, o debrief tem conteúdo para exibir e o coach começa a ver valor nos painéis que já existem.

Esta change é **substituída naturalmente** por `first-party-ingestion-architecture` quando o upload de `.fit` estiver disponível. Os registros manuais convivem com os importados sem conflito, porque o campo `fonte` os diferencia.

## What Changes

### Backend

- Verificar se `TreinoRealizado` já tem os campos necessários (`tipo`, `duracaoMinutos`, `distanciaKm`, `percepcaoEsforco`, `data`, `fonte`). Se sim, apenas adicionar o endpoint — sem migration.
- Se campos faltarem: migration mínima adicionando `percepcao_esforco SMALLINT` e `fonte VARCHAR(20) DEFAULT 'MANUAL'` a `tb_treino_realizado`.
- Novo endpoint `POST /api/v1/atletas/me/treinos/manual` — atleta registra o próprio treino:
  - Body: `{ "tipo": "CORRIDA", "data": "2026-06-19", "duracaoMinutos": 60, "distanciaKm": 10.0, "percepcaoEsforco": 7, "observacoes": "..." }`
  - Valida: `tipo` ∈ enum `TipoTreino`, `percepcaoEsforco` ∈ [1,10], `duracaoMinutos` > 0, `data` ≤ hoje.
  - Persiste com `fonte = MANUAL` e calcula TSS estimado com a fórmula simplificada: `tss = (duracaoMinutos / 60.0) × rpeNormalizado² × 100` onde `rpeNormalizado = percepcaoEsforco / 10.0`.
  - Retorna `TreinoRealizadoOutputDto` (201 Created).
- Endpoint `GET /api/v1/atletas/me/treinos/recentes?dias=7` — últimas N entradas (manual + importadas), ordenadas por data desc. Verifica se já existe antes de criar.
- Isolamento: `atletaId` resolvido do token JWT via `CurrentAtletaResolver` — sem `@PathVariable` expondo IDs.

### Frontend

- Nova rota no shell do atleta: `/atleta/treinos/registrar`.
- Componente `ManualTrainingForm`:
  - Seletor de tipo: chips com ícone (corrida, bicicleta, natação, musculação, descanso ativo).
  - Date picker com default = hoje.
  - Campo de duração em minutos (number input).
  - Campo de distância em km (optional — oculto para tipos sem distância como musculação).
  - Slider de RPE 1–10 com label textual: 1–3 Leve / 4–6 Moderado / 7–8 Intenso / 9–10 Máximo.
  - Campo de observações (textarea, opcional).
  - Botão "Registrar treino".
- Componente `RecentTrainingsList`: lista dos últimos 7 dias com tipo + duração + distância + RPE + data. Exibido abaixo do formulário.
- Link de entrada na `AtletaHomePage` ou nav do atleta: "Registrar treino de hoje".

## Capabilities

### New Capabilities

- `manual-training-entry`: atleta registra treino manualmente (sem GPS/dispositivo); dados fluem para TSB, fila de atenção e debrief.

### Modified Capabilities

- `coach-attention-queue`: sinal de "inatividade" e "aderência baixa" passa a ter dado real para avaliar (em vez de sempre disparar por falta de dado).
- `plan-adherence-tracking`: aderência calculada sobre treinos realizados reais, não apenas planejados sem contraparte.

## Impact

**Banco de dados:**
- Verificar `tb_treino_realizado` antes de qualquer migration. Campos mínimos: `percepcao_esforco SMALLINT`, `fonte VARCHAR(20)`.
- Se ambos ausentes: migration `Vxx__Add_manual_training_fields_to_tb_treino_realizado.sql`.
- Nenhuma tabela nova.

**APIs novas:**
- `POST /api/v1/atletas/me/treinos/manual`
- `GET /api/v1/atletas/me/treinos/recentes?dias=7` (verificar se já existe; se sim, só usar)

**Dados existentes:**
- Registros existentes em `tb_treino_realizado` recebem `fonte = 'IMPORTADO'` via migration UPDATE (retrocompatível).

**Dependências:**
- `add-current-user-endpoint` ✅ — resolução da identidade do atleta.
- `add-assessoria-onboarding` ✅ — tenant resolution.
- Substituído futuramente por `first-party-ingestion-architecture` (Sprint 22): os campos manuais sobrevivem, o `fonte` diferencia as origens.
- Desbloqueia: `add-post-workout-debrief` (dados para comparar planejado vs realizado) e `add-daily-readiness-checkin` (complemento de contexto diário).

**Multi-tenancy:**
- `atletaId` resolvido do token — sem possibilidade de cross-tenant por construção.

## Critérios de Aceite

**CA1 — Atleta registra treino e dado aparece no sistema:**
- Given: atleta autenticado sem treinos registrados
- When: envia `POST /atletas/me/treinos/manual` com tipo=CORRIDA, duração=45min, distância=8km, RPE=6
- Then: resposta 201 com id; `GET /atletas/me/treinos/recentes` retorna o registro; fila de atenção não dispara mais "sem treinos recentes" para este atleta

**CA2 — Validação de RPE:**
- Given: atleta envia RPE=11
- Then: resposta 422 com mensagem "percepcaoEsforco deve estar entre 1 e 10"

**CA3 — Data futura rejeitada:**
- Given: atleta envia data = amanhã
- Then: resposta 422 com mensagem "data não pode ser futura"

**CA4 — TSS estimado calculado:**
- Given: treino com duração=60min e RPE=7
- When: registro criado
- Then: campo `tssEstimado` no retorno = 49 (60/60 × 0.49 × 100)

**CA5 — Isolamento: atleta não registra por outro atleta:**
- Given: endpoint usa `me` (resolução via JWT)
- Then: não há parâmetro de atletaId exposto; registro sempre vai para o atleta autenticado

**CA6 — Frontend: formulário disponível e funcional:**
- Given: atleta autenticado abre o shell
- When: navega para "Registrar treino"
- Then: formulário exibe campos; submissão bem-sucedida mostra confirmação e atualiza lista recente

## Métrica de Sucesso

**Primária:** ≥ 1 treino registrado manualmente por atleta ativo por semana — indica que o fluxo de dado está funcionando e a fila de atenção tem insumo real.

**Secundária:** taxa de "sinal de inatividade" na fila de atenção cai ≥ 50% após ativação — prova que o dado está fluindo para os avaliadores.

## Open Questions & Assumptions

**Premissas assumidas:**
- `TreinoRealizado` já existe em `develop` (referenciado em múltiplas changes); verificar estrutura antes de criar migration.
- Formula de TSS simplificada é boa o suficiente para o MVP; `first-party-ingestion-architecture` substituirá por TSS real baseado em FC/pace.
- v1 append-only: sem edição ou exclusão de registros manuais (reduz complexidade; adicionar em follow-up se necessário).
- Atleta registra o próprio treino; coach não registra pelo atleta no v1.

**Em aberto:**
- `CurrentAtletaResolver` já existe como componente reutilizável? Se não, criar e reusar em `athlete-profile-drilldown` também.
- `TipoTreino` enum já cobre os tipos relevantes (corrida, bicicleta, natação, musculação, descanso)? Verificar antes de criar novo.
- Distância obrigatória para esportes de endurance ou sempre opcional? Definir no design se necessário — para Fast track, fazer opcional simplifica validação.
