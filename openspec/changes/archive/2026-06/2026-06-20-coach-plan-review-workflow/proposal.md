# Proposal: coach-plan-review-workflow

**Tamanho:** M · **Trilha:** Full

## Status

Proposed

## Why

O princípio do Menthoros é *coach-in-the-loop*: a IA propõe, o treinador aprova. Esse princípio está implementado para **sinais** (fila de atenção) e **sugestões** (inbox). Mas para **planos de treino** — o produto mais sensível que a plataforma entrega — não existe nenhuma etapa de revisão. O plano gerado pela IA vai diretamente ao atleta.

Nenhum treinador profissional vai adotar uma plataforma que coloca conteúdo de IA na frente do atleta sem que ele possa ver antes. Esse é o maior bloqueador de confiança e adoção do Menthoros. Um coach de assessoria é responsável pelo plano — se a IA errar (pace errado, volume excessivo para aquela semana, objetivo fora de contexto), ele é quem responde perante o atleta.

Além disso, o fluxo de revisão é a única oportunidade de o treinador **ensinar** o sistema: aprovar sem alteração é um sinal positivo, rejeitar com comentário é feedback implícito para geração futura. Esse loop fecha a jornada de aprendizado da plataforma.

## What Changes

### Backend

- `PlanoSemanal` ganha campo `reviewStatus: PlanoReviewStatus` (enum: `AGUARDANDO_REVISAO` | `APROVADO` | `REJEITADO`) e `reviewComment: String` (nullable).
- Plano gerado pela IA entra obrigatoriamente em `AGUARDANDO_REVISAO` — **não visível ao atleta** até aprovação.
- Novo endpoint `GET /api/v1/coach/planos/pendentes` — lista planos aguardando revisão do tenant, ordenados por `createdAt ASC` (mais antigos primeiro).
- Novo endpoint `POST /api/v1/coach/planos/{id}/aprovar` — transição `AGUARDANDO_REVISAO → APROVADO`; plano torna-se visível ao atleta.
- Novo endpoint `POST /api/v1/coach/planos/{id}/rejeitar` com body `{ "motivo": "..." }` — transição `AGUARDANDO_REVISAO → REJEITADO`; atleta não vê o plano; motivo persistido para histórico.
- Transições ilegais (`APROVADO → REJEITADO`, `REJEITADO → APROVADO`) lançam `DomainRuleViolationException` → 422.
- `GET /api/v1/planos/{atletaId}/vigente` passa a retornar apenas planos `APROVADO`.
- Novo campo `reviewStatus` e `reviewComment` no `PlanoSemanalOutputDto`.

### Frontend

- Nova página `CoachPlanReviewPage` na rota `/coach/planos/revisao`.
- Layout 2-colunas: lista de planos pendentes (esquerda) + detalhe do plano selecionado (direita).
- Detalhe exibe: nome do atleta, semana, lista de sessões com dia/tipo/volume/intensidade prevista, e o raciocínio da IA (quando disponível).
- Rodapé de ações: `[Aprovar]` (verde) e `[Rejeitar]` com modal de motivo (obrigatório).
- Badge de contagem no nav do coach: número de planos pendentes de revisão.
- Após aprovação, plano sai da lista; após rejeição idem.

## Capabilities

### New Capabilities

- `coach-plan-review-workflow`: fluxo de revisão e aprovação de planos gerados por IA antes de chegarem ao atleta.

### Modified Capabilities

- `plan-generation`: geração passa a criar planos em estado `AGUARDANDO_REVISAO` (não mais direto para o atleta).
- `plan-query`: `GET /planos/{atletaId}/vigente` filtra por `APROVADO`.

## Impact

**Banco de dados:**
- Coluna `review_status VARCHAR(30) NOT NULL DEFAULT 'AGUARDANDO_REVISAO'` em `tb_plano_semanal`.
- Coluna `review_comment TEXT` (nullable) em `tb_plano_semanal`.
- Índice: `idx_plano_review_status_tenant (tenant_id, review_status)` para a query de pendentes.
- Migration Flyway: próxima versão livre (verificar antes de criar).

**APIs novas:**
- `GET /api/v1/coach/planos/pendentes` — `@PreAuthorize("hasAnyRole('TECNICO','ADMIN')")`
- `POST /api/v1/coach/planos/{id}/aprovar`
- `POST /api/v1/coach/planos/{id}/rejeitar` — body: `{ "motivo": "string" }`

**Breaking change controlado:**
- Atletas com planos gerados antes desta change (sem `review_status`) precisam de migration de dados: definir `review_status = 'APROVADO'` para planos já existentes (retrocompatibilidade).

**Dependências:**
- Requer `add-coach-shell-dashboards` ✅ (shell do coach existente).
- Independente de `first-party-ingestion` — funciona com planos gerados mesmo sem treinos registrados.
- Complementado por `add-post-workout-debrief` no futuro: o debrief do plano aprovado fecha o ciclo.

**Multi-tenancy:**
- Todos os endpoints novos usam `TenantContext.getRequiredTenantId()`.
- Coach só vê planos do seu tenant; isolamento garantido nas queries.

## Critérios de Aceite

**CA1 — Plano gerado fica visível ao coach antes do atleta:**
- Given: coach solicita geração de plano para atleta
- When: IA retorna o plano
- Then: plano aparece na lista de pendentes do coach com `reviewStatus = AGUARDANDO_REVISAO`
- And: atleta não vê o plano em `GET /planos/{atletaId}/vigente`

**CA2 — Aprovação libera o plano para o atleta:**
- Given: plano em `AGUARDANDO_REVISAO`
- When: coach chama `POST /coach/planos/{id}/aprovar`
- Then: `reviewStatus` muda para `APROVADO`
- And: plano aparece em `GET /planos/{atletaId}/vigente`
- And: plano some da lista de pendentes do coach

**CA3 — Rejeição exige motivo e remove da lista:**
- Given: plano em `AGUARDANDO_REVISAO`
- When: coach chama `POST /coach/planos/{id}/rejeitar` com `{ "motivo": "Volume excessivo para a semana de prova" }`
- Then: `reviewStatus = REJEITADO`, `reviewComment` persistido
- And: atleta não vê o plano
- And: plano some da lista de pendentes do coach

**CA4 — Transição ilegal retorna 422:**
- Given: plano já `APROVADO`
- When: coach tenta `POST /coach/planos/{id}/rejeitar`
- Then: resposta 422 com mensagem de transição ilegal

**CA5 — Isolamento cross-tenant:**
- Given: coach do tenant A tenta aprovar plano do tenant B
- When: `POST /coach/planos/{idDeTenantB}/aprovar`
- Then: resposta 403 ou 404 (tenant não vê recurso alheio)

**CA6 — Badge de pendentes:**
- Given: 3 planos aguardando revisão
- When: coach abre o shell
- Then: badge no nav mostra "3"

## Métrica de Sucesso

**Primária:** tempo médio entre geração do plano e aprovação pelo coach < 4h (meta: coach revisa no mesmo dia de geração).

**Secundária:** taxa de aprovação sem alteração ≥ 70% após 30 dias de uso — indica que a IA está calibrada para a metodologia do coach.

## Open Questions & Assumptions

**Premissas assumidas:**
- `PlanoSemanal` é a entidade persistida no backend (existe em `develop`); verificar se tem `status` próprio antes de adicionar `reviewStatus` separado.
- Coach que gera o plano é o mesmo que revisa — não há delegação para outro treinador nesta versão.
- v1 sem edição inline de sessões — coach aprova o plano como um todo ou rejeita. Edição granular entra em change futura (`coach-plan-inline-editing`).
- Rejeição sem regeneração automática no v1 — coach rejeita e dispara nova geração manualmente.

**Em aberto:**
- Notificação ao coach quando novo plano entra na fila de revisão (push/email) — fora do escopo do v1, mas necessário para alta frequência de uso.
- O que acontece com o atleta enquanto o plano está pendente? Ele vê o plano anterior? Recebe mensagem automática? Definir no design.md.
- Limite de tempo para revisão: plano não aprovado em X dias expira automaticamente ou o coach é alertado?
