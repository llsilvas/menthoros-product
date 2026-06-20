# Proposal: coach-batch-plan-generation

**Tamanho:** M · **Trilha:** Full

## Status

Proposed

## Why

A geração de planos hoje é serial: o coach dispara `POST /planos/atletas/{atletaId}/gerar` para um atleta por vez, aguarda o LLM responder (~5s), e repete. Para uma assessoria com 20 atletas, gerar planos da semana pode levar 20 minutos de interação manual — um clique por atleta, uma espera por LLM call. Isso não é uma plataforma para escalar assessoria.

Esta change entrega geração assíncrona em lote: o coach seleciona N atletas no roster, dispara uma única operação, e recebe um `jobId` imediatamente. O frontend acompanha o progresso via polling e notifica o resultado. O coach pode continuar usando a plataforma normalmente enquanto os planos são gerados em background.

O sequenciamento após `add-llm-tool-use` (Sprints 10–11) é intencional: com tool calling, o LLM pede apenas os dados que precisa, reduzindo latência e tornando o processamento do lote mais rápido e previsível. Implementar o batch antes tornaria o worst-case de latência ainda mais imprevisível.

## What Changes

### Backend

**Endpoint de disparo (assíncrono):**
- `POST /api/v1/coach/planos/gerar-lote` com body `{ "atletaIds": [uuid, ...], "modo": "PROXIMA_SEMANA" | "SEMANA_ATUAL" }`.
- Limite: `@Size(max = 20)` na lista de IDs. Body inválido → 400.
- Resposta imediata: `202 Accepted` com `Location: /api/v1/coach/planos/lote/{jobId}` e body `{ "jobId": uuid, "totalAtletas": N }`.
- Processamento em background via `@Async` + `CompletableFuture` (thread pool dedicado, configurado em `AsyncConfig` para não compartilhar threads com o pool HTTP).
- Cada atleta chama `PlanoService.gerarPlanoTreino()` internamente; exceções individuais são capturadas e registradas como erros (não propagam).

**Entidade de job (nova tabela):**
- `tb_batch_plan_job` com colunas: `id UUID PK`, `tenant_id UUID NOT NULL`, `status VARCHAR(20)` (PENDENTE | EM_PROGRESSO | CONCLUIDO | CONCLUIDO_COM_ERROS), `total_atletas INT`, `gerados INT DEFAULT 0`, `erros INT DEFAULT 0`, `criado_em TIMESTAMPTZ DEFAULT NOW()`, `concluido_em TIMESTAMPTZ`, `resultado JSONB` (lista de gerados e erros ao final).
- Migration V40 (ou próxima após `coach-edit-planned-workout` V39).

**Endpoint de status (polling):**
- `GET /api/v1/coach/planos/lote/{jobId}` — retorna o estado atual do job:
  ```json
  {
    "jobId": "uuid",
    "status": "EM_PROGRESSO",
    "totalAtletas": 10,
    "gerados": 6,
    "erros": 1,
    "geradosDetalhes": [...],
    "errosDetalhes": [{ "atletaId": "uuid", "motivo": "Erro ao gerar plano — tente novamente" }]
  }
  ```
- 404 se `jobId` não existe ou pertence a outro tenant.
- Quando `status = CONCLUIDO` ou `CONCLUIDO_COM_ERROS`, o campo `resultado` está completo.

**Segurança no lote:**
- Validação de tenant por atleta: se `atletaId` não pertencer ao tenant atual, registrar como erro com motivo `"Atleta não encontrado"` (idêntico ao inexistente — sem revelar que pertence a outro tenant).
- Atleta já com plano `AGUARDANDO_REVISAO` ou `APROVADO` na semana alvo: registrar como erro com motivo `"Plano já existe para esta semana"` — não sobrescrever.

**Role:**
- Endpoint de disparo e de status: `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")`.

### Frontend

**Seleção no roster:**
- No `CoachDashboardPage` (roster de atletas), coluna de checkbox por linha + checkbox "selecionar todos" no header.
- Estado `selecionados: string[]`.
- Toolbar flutuante (MUI `Toolbar`) aparece quando `selecionados.length > 0` com botão "Gerar planos (N)".

**Dialog de confirmação:**
- Exibe lista dos atletas selecionados com nome e avatar.
- Exibe o modo de geração (padrão: próxima semana).
- Destaque: "Planos entrarão em Aguardando Revisão — você precisará aprovar cada um."
- Botões: `Confirmar` e `Cancelar`.

**Progresso e resultado:**
- Após confirmar, polling em `GET /coach/planos/lote/{jobId}` a cada 3s.
- Barra de progresso (`LinearProgress`) com contagem `X de N gerados`.
- Quando concluído, Snackbar: "N planos gerados" (verde) e/ou "N erros" (amarelo) com link para ver detalhes.
- Badge de planos pendentes no nav atualizado após conclusão.
- Limpar seleção do roster.

## Capabilities

### New Capabilities

- `coach-batch-plan-generation`: geração assíncrona de planos para múltiplos atletas com acompanhamento de progresso.

### Modified Capabilities

- `plan-generation`: a geração unitária é reutilizada internamente pelo job de lote.
- `coach-plan-review-workflow`: badge de pendentes reflete novos planos gerados pelo lote.

## Impact

**Banco de dados:**
- Nova tabela `tb_batch_plan_job`.
- Migration Flyway: próxima após V39 (verificar no momento de implementar).

**APIs novas:**
- `POST /api/v1/coach/planos/gerar-lote` → 202 Accepted
- `GET /api/v1/coach/planos/lote/{jobId}` → status do job

**Dependências:**
- Requer `add-llm-tool-use` ✅ (latência de geração mais previsível com tool calling).
- Requer `add-coach-shell-dashboards` ✅ (roster do coach).
- Recomendado após `coach-edit-planned-workout` ✅ (ciclo de edição + batch fecha o fluxo completo).

**Multi-tenancy:**
- Tenant do job é o `tenantId` do usuário autenticado no momento do POST.
- `GET /lote/{jobId}` valida que o job pertence ao tenant atual.
- IDs de atletas de outros tenants recebem `motivo = "Atleta não encontrado"` (sem oracle de enumeração).

**Configuração de infra:**
- `AsyncConfig` com pool dedicado `batchPlanExecutor`: pool size `= 3`, queue capacity `= 10`, thread name prefix `batch-plan-`. Configurado em `application.yml` para não competir com o pool HTTP do Tomcat.

## Critérios de Aceite

**CA1 — Disparo retorna 202 imediatamente:**
- Given: 5 atletas selecionados do tenant
- When: coach envia `POST /coach/planos/gerar-lote`
- Then: resposta 202 com `jobId` e `Location` header; retorno em < 500ms (antes de qualquer LLM call)

**CA2 — Polling acompanha progresso:**
- Given: job em andamento com 3 de 5 gerados
- When: `GET /coach/planos/lote/{jobId}`
- Then: `{ "status": "EM_PROGRESSO", "gerados": 3, "erros": 0, "totalAtletas": 5 }`

**CA3 — Job concluído com sucesso total:**
- Given: 5 atletas todos do tenant, sem plano existente
- When: polling após conclusão
- Then: `{ "status": "CONCLUIDO", "gerados": 5, "erros": 0 }` + 5 planos em `AGUARDANDO_REVISAO`

**CA4 — Erro parcial não aborta o lote:**
- Given: 3 atletas válidos e 1 atleta de outro tenant
- When: job concluído
- Then: `{ "status": "CONCLUIDO_COM_ERROS", "gerados": 3, "erros": 1 }` + `errosDetalhes[0].motivo = "Atleta não encontrado"`

**CA5 — Atleta com plano já existente registrado como erro:**
- Given: atleta já tem plano `AGUARDANDO_REVISAO` para a semana alvo
- When: incluído no lote
- Then: `errosDetalhes[n].motivo = "Plano já existe para esta semana"` — plano existente não alterado

**CA6 — Limite de 20 atletas validado:**
- Given: lista com 21 IDs
- When: `POST /coach/planos/gerar-lote`
- Then: 400 com mensagem de validação (sem criar job)

**CA7 — Isolamento de tenant no job:**
- Given: jobId pertence ao tenant B
- When: coach do tenant A chama `GET /coach/planos/lote/{jobId}`
- Then: 404

**CA8 — Pool assíncrono não afeta outras requests:**
- Given: lote em andamento para 10 atletas (processo demorado)
- When: outro endpoint é chamado (ex: `GET /api/v1/coach/attention-queue`)
- Then: resposta do outro endpoint em tempo normal (< 200ms) — pool dedicado não bloqueia o HTTP pool

## Métrica de Sucesso

**Primária:** tempo médio entre início da sessão de geração e aprovação do último plano da semana, comparado ao baseline de geração individual. Meta: redução de ≥60% no tempo total (de ~20min de cliques para ≤5min incluindo revisão dos planos gerados).
**Coleta de baseline:** semana anterior ao deploy, medir delta entre `MIN(criado_em)` e `MAX(atualizadoEm)` dos planos aprovados por sessão de coach.

**Secundária:** taxa de adoção do batch — % de semanas em que o coach gerou ≥2 planos e usou o batch (vs. geração individual sequencial). Meta: ≥60% das semanas com ≥2 planos gerados passam a usar o batch.

## Open Questions & Assumptions

**Premissas fechadas:**
- Batch assíncrono com `202 Accepted + polling`: elimina o risco de timeout HTTP e esgotamento do pool do Tomcat.
- Limite fixo de 20 atletas por lote — suficiente para 95% das assessorias solo.
- IDs de atletas de outros tenants → motivo `"Atleta não encontrado"` (sem oracle de enumeração).
- Atleta com plano existente na semana alvo → motivo `"Plano já existe para esta semana"` (sem sobrescrever).
- Thread pool dedicado com 3 workers — evita contenção com pool HTTP.

**Em aberto:**
- Retenção dos jobs: quanto tempo manter `tb_batch_plan_job` para consulta? (Sugestão: 7 dias, com job de limpeza cron.) Decidir no momento de implementar.
- Cancelamento de job em andamento: o coach pode interromper um lote em progresso? (Fora do escopo do v1 — jobs completam ou falham individualmente. Implementar se houver demanda após entrega.)
- Notificação push/email quando o lote conclui: o polling é suficiente enquanto o coach está na tela; para conclusão em background (coach fechou o browser), falta notificação. (Fora do escopo — entra com infraestrutura de notificações que ainda não existe.)
