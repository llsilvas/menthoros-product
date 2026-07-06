# Proposal: coach-batch-plan-generation

**Tamanho:** M · **Trilha:** Full

## Status

Proposed

## Why

A geração de planos hoje é serial: o coach dispara `POST /planos/atletas/{atletaId}/gerar` para um atleta por vez, aguarda o LLM responder, e repete. Para uma assessoria com 20 atletas, gerar planos da semana pode levar bastante interação manual — um clique por atleta, uma espera por LLM call (cada chamada tem custo real: `PlanoResilienceService` documenta ~80s por tentativa, com até 1 retry estrutural = ~160s no pior caso). Isso não é uma plataforma para escalar assessoria.

Esta change entrega geração assíncrona em lote: o coach seleciona N atletas no roster, dispara uma única operação, e recebe um `jobId` imediatamente. O frontend acompanha o progresso via polling — o contador de `gerados`/`erros` sobe conforme cada chamada ao LLM efetivamente responde, não em blocos — e notifica o resultado. O coach pode continuar usando a plataforma normalmente enquanto os planos são gerados em background.

**Dependência de `add-llm-tool-use` removida (SPRINTS.md, 2026-07-06):** a repriorização por ROI concluiu que essa dependência era artificial — o lote funciona com o prompt atual, sem tool calling. Em vez de esperar por infraestrutura de tool-use para reduzir latência, esta change ataca o gargalo diretamente: virtual threads (Java 21) eliminam o custo de dimensionar um pool de platform threads para I/O bloqueante, e um `Semaphore` dedicado limita quantas chamadas ao LLM ficam em voo simultaneamente — controlando o risco de rate-limit do provedor sem depender de mudança no prompt.

## What Changes

### Backend

**Endpoint de disparo (assíncrono):**
- `POST /api/v1/coach/planos/gerar-lote` com body `{ "atletaIds": [uuid, ...], "modo": "PROXIMA_SEMANA" | "SEMANA_ATUAL" }`.
- Limite: `@Size(max = 20)` na lista de IDs (validado sobre a lista recebida). Body inválido → 400.
- IDs duplicados no corpo são **deduplicados** antes de criar o job (`distinct`) — `totalAtletas` reflete a contagem distinta; sem erro artificial de "Plano já existe" por repetição.
- Resposta imediata: `202 Accepted` com `Location: /api/v1/coach/planos/lote/{jobId}` e body `{ "jobId": uuid, "totalAtletas": N }`.
- Processamento em background via `@Async` com executor de **virtual threads** (`BatchPlanAsyncConfig`, bean `batchPlanExecutor` = `Executors.newVirtualThreadPerTaskExecutor()`) — cada atleta roda em sua própria virtual thread, submetidas todas de uma vez (sem chunking sequencial), e não compartilha platform threads com o pool HTTP do Tomcat.
- Concorrência real de chamadas ao LLM (não o nº de virtual threads) é limitada por um `LlmConcurrencyLimiter` (`Semaphore`, tamanho configurável via `app.batch-plan.llm-concorrencia`, default 4) — evita rajada de 20 chamadas simultâneas ao provedor e risco de 429.
- Cada atleta chama `PlanoService.gerarPlanoTreino()` internamente; exceções individuais são capturadas e registradas como erros (não propagam). Erros transitórios de infra (429/5xx do provedor) recebem retry curto (2x, backoff 2s/4s) específico do fluxo em lote, antes de serem registrados como erro definitivo.

**Entidade de job (nova tabela):**
- `tb_batch_plan_job` com colunas: `id UUID PK`, `tenant_id UUID NOT NULL`, `status VARCHAR(20)` (PENDENTE | EM_PROGRESSO | CONCLUIDO | CONCLUIDO_COM_ERROS), `total_atletas INT`, `gerados INT DEFAULT 0`, `erros INT DEFAULT 0`, `criado_em TIMESTAMPTZ DEFAULT NOW()`, `concluido_em TIMESTAMPTZ`, `resultado JSONB` (lista de gerados e erros ao final).
- Migration **V52** (última aplicada é V51 — `V51__add_origem_encerramento_plano_semanal.sql`; confirmar no momento de implementar caso outra change tenha avançado a numeração antes desta).
- Atualização de progresso via **UPDATE atômico** (`@Modifying @Query`, incremento direto no banco) — não leitura + reatribuição em memória, para evitar race condition entre virtual threads concorrentes escrevendo no mesmo job.

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
- Durante `PENDENTE`/`EM_PROGRESSO`, o progresso é dado **apenas pelos contadores** (`gerados`/`erros`/`totalAtletas`); `geradosDetalhes`/`errosDetalhes` vêm **vazios (`[]`)** — não há detalhe incremental por atleta.
- Quando `status = CONCLUIDO` ou `CONCLUIDO_COM_ERROS`, o campo `resultado` está completo e `geradosDetalhes`/`errosDetalhes` são preenchidos de uma vez.

**Segurança no lote:**
- Validação de tenant por atleta: se `atletaId` não pertencer ao tenant atual, registrar como erro com motivo `"Atleta não encontrado"` (idêntico ao inexistente — sem revelar que pertence a outro tenant).
- Atleta já com plano `AGUARDANDO_REVISAO` ou `APROVADO` na semana alvo: registrar como erro com motivo `"Plano já existe para esta semana"` — não sobrescrever. A checagem tem duas camadas: um `exists`-check *fast-path* (evita a chamada ao LLM no caso comum) e um **índice único parcial** `uk_plano_semanal_atleta_semana_ativo` em `tb_plano_semanal (atleta_id, semana_inicio) WHERE review_status <> 'REJEITADO'` como guarda autoritativa contra a corrida TOCTOU entre lotes concorrentes com o mesmo atleta (a violação vira o mesmo erro `"Plano já existe para esta semana"`).
- `TenantContext` (ThreadLocal puro, não sobrevive a handoff assíncrono) deve ser setado explicitamente e limpo no `finally` em **dois níveis** — no método `@Async` externo (envolvendo transição de status e gravação de `resultado`) e em cada task individual por atleta — mesmo padrão já usado em `EncerramentoSemanaScheduler`.

**Role:**
- Endpoint de disparo e de status: `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")`.

### Frontend

**Seleção no roster:**
- No `CoachAthletesPage` (roster de atletas), coluna de checkbox por linha + checkbox "selecionar todos" no header.
- Estado `selecionados: string[]`.
- Toolbar flutuante (MUI `Toolbar`) aparece quando `selecionados.length > 0` com botão "Gerar planos (N)".

**Dialog de confirmação:**
- Exibe lista dos atletas selecionados com nome e avatar.
- Exibe o modo de geração (padrão: próxima semana).
- Destaque: "Planos entrarão em Aguardando Revisão — você precisará aprovar cada um."
- Botões: `Confirmar` e `Cancelar`.

**Progresso e resultado:**
- Após confirmar, polling em `GET /coach/planos/lote/{jobId}` a cada 3s.
- Barra de progresso (`LinearProgress`) com contagem `X de N gerados` — atualiza continuamente conforme cada atleta individual termina no backend, não em saltos.
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
- Migration Flyway: **V52** (verificar no momento de implementar se V51 continua sendo a última aplicada).

**APIs novas:**
- `POST /api/v1/coach/planos/gerar-lote` → 202 Accepted
- `GET /api/v1/coach/planos/lote/{jobId}` → status do job

**Dependências:**
- ~~Requer `add-llm-tool-use`~~ — dependência removida (SPRINTS.md, 2026-07-06): o batch não depende de tool calling; a latência é atacada diretamente via virtual threads + limitador de concorrência.
- Requer `add-coach-shell-dashboards` (concluída) (roster do coach).
- Recomendado após `coach-edit-planned-workout` (concluída) (ciclo de edição + batch fecha o fluxo completo).

**Multi-tenancy:**
- Tenant do job é o `tenantId` do usuário autenticado no momento do POST.
- `GET /lote/{jobId}` valida que o job pertence ao tenant atual.
- IDs de atletas de outros tenants recebem `motivo = "Atleta não encontrado"` (sem oracle de enumeração).
- `tenantId` capturado na thread HTTP síncrona (no disparo) e passado explicitamente ao fluxo assíncrono — nunca resolvido de dentro do async (a thread HTTP já retornou o 202).
- `TenantContext` setado manualmente em **dois níveis**: no método `@Async` externo (que transiciona status e grava `resultado` via queries tenant-aware) e em cada task por atleta — virtual threads não herdam o ThreadLocal da thread que as submete; set no início e `clear()` no `finally` em ambos.

**Configuração de infra:**
- `BatchPlanAsyncConfig` com executor de virtual threads (`Executors.newVirtualThreadPerTaskExecutor()`) — sem pool dimensionado, sem fila; cada atleta processado em sua própria virtual thread.
- `LlmConcurrencyLimiter` (`Semaphore`, configurável via `app.batch-plan.llm-concorrencia`, default 4) — controla quantas chamadas reais ao LLM ficam em voo, independente do nº de virtual threads.
- Retry curto (2x, backoff 2s/4s) para 429/5xx do provedor, específico do fluxo em lote.

## Critérios de Aceite

**CA1 — Disparo retorna 202 imediatamente:**
- Given: 5 atletas selecionados do tenant
- When: coach envia `POST /coach/planos/gerar-lote`
- Then: resposta 202 com `jobId` e `Location` header; retorno em < 500ms (antes de qualquer LLM call)

**CA2 — Polling acompanha progresso de forma contínua:**
- Given: job em andamento com 3 de 5 gerados
- When: `GET /coach/planos/lote/{jobId}`
- Then: `{ "status": "EM_PROGRESSO", "gerados": 3, "erros": 0, "totalAtletas": 5 }` — contador reflete atletas concluídos individualmente, na ordem em que o LLM responde (sem barreira de bloco)

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

**CA8 — Virtual threads não afetam outras requests:**
- Given: lote em andamento para 10 atletas (processo demorado)
- When: outro endpoint é chamado (ex: `GET /api/v1/coach/attention-queue`)
- Then: resposta do outro endpoint em tempo normal (< 200ms) — virtual threads não bloqueiam o pool HTTP do Tomcat (platform threads)

**CA9 — Concorrência ao LLM respeita o limite configurado:**
- Given: lote de 20 atletas, `app.batch-plan.llm-concorrencia = 4`
- When: job em processamento
- Then: no máximo 4 chamadas ao LLM em voo simultaneamente (verificável via métrica/log de aquisição do semáforo)

**CA10 — Recovery fecha job órfão após restart:**
- Given: job em `EM_PROGRESSO` com `criado_em` anterior ao limiar de recovery (> 30 min)
- When: a aplicação reinicia
- Then: o job é finalizado como `CONCLUIDO_COM_ERROS` com `concluido_em` preenchido e uma `observacao` de job no `resultado` (contagem de não processados, sem detalhe por atleta); jobs já em estado terminal permanecem inalterados (idempotência)

**CA11 — IDs de atletas duplicados no request são normalizados:**
- Given: corpo com `atletaIds = [A, A, B]` (A repetido)
- When: `POST /coach/planos/gerar-lote`
- Then: job criado com `totalAtletas = 2` (lista distinta); nenhum erro artificial de "Plano já existe" gerado pela repetição

## Métrica de Sucesso

**Primária:** tempo médio entre início da sessão de geração e aprovação do último plano da semana, comparado ao baseline de geração individual. Meta: redução de ≥60% no tempo total.
**Coleta de baseline (mensurável a partir dos dados já existentes):** nas 2 semanas anteriores ao deploy, agrupar os planos gerados individualmente por coach + semana-alvo (`semana_inicio`) e calcular, por grupo, o delta entre `MIN(criado_em)` (primeiro plano gerado na sessão) e `MAX(criado_em)` (último) — a média desses deltas é o baseline "tempo de geração serial da semana". Após o deploy, o mesmo delta é medido a partir de `tb_batch_plan_job` (`criado_em` → `concluido_em`). Query de baseline documentada na task de QA; se não houver ao menos 3 grupos com ≥2 planos no período, estender a janela até obter amostra mínima.

**Secundária:** taxa de adoção do batch — % de semanas em que o coach gerou ≥2 planos e usou o batch (vs. geração individual sequencial). Meta: ≥60% das semanas com ≥2 planos gerados passam a usar o batch.

## Open Questions & Assumptions

**Premissas fechadas:**
- Batch assíncrono com `202 Accepted + polling`: elimina o risco de timeout HTTP e esgotamento do pool do Tomcat.
- Limite fixo de 20 atletas por lote — suficiente para 95% das assessorias solo.
- IDs de atletas de outros tenants → motivo `"Atleta não encontrado"` (sem oracle de enumeração).
- Atleta com plano existente na semana alvo → motivo `"Plano já existe para esta semana"` (sem sobrescrever).
- Virtual threads (não pool dimensionado) + `Semaphore` dedicado para controlar concorrência real ao LLM — mais adequado que thread pool de platform threads para carga I/O-bound.
- `Semaphore` é por instância da JVM — se o backend escalar horizontalmente no futuro, o teto real de concorrência ao LLM vira 4x o número de instâncias. Aceitável na escala atual (single instance); revisitar se houver múltiplas instâncias em produção.

**Em aberto:**
- Retenção dos jobs: quanto tempo manter `tb_batch_plan_job` para consulta? (Sugestão: 7 dias, com job de limpeza cron.) Decidir no momento de implementar.
- Cancelamento de job em andamento: o coach pode interromper um lote em progresso? (Fora do escopo do v1 — jobs completam ou falham individualmente. Implementar se houver demanda após entrega.)
- Notificação push/email quando o lote conclui: o polling é suficiente enquanto o coach está na tela; para conclusão em background (coach fechou o browser), falta notificação. (Fora do escopo — entra com infraestrutura de notificações que ainda não existe.)
- Valor default de `app.batch-plan.llm-concorrencia` (4): ajustar conforme observação real de rate-limit do provedor em produção.

## Riscos, Mitigações e Rollback

**Riscos e mitigações:**

| Risco | Mitigação |
|-------|-----------|
| Rajada de 20 chamadas simultâneas ao LLM → 429/custo | `LlmConcurrencyLimiter` (`Semaphore`, default 4) limita concorrência real; retry curto (2x, 2s/4s) para 429/5xx transitório. |
| Corrida entre lotes concorrentes gera plano duplicado para o mesmo atleta (TOCTOU no `exists`-check) | Índice único parcial `uk_plano_semanal_atleta_semana_ativo` como guarda autoritativa; `DataIntegrityViolationException` vira erro individual `"Plano já existe para esta semana"`. |
| Aplicação cai no meio → job preso em `EM_PROGRESSO` para sempre | Recovery no startup (`ApplicationReadyEvent`) fecha jobs órfãos (> 30 min) como `CONCLUIDO_COM_ERROS`, por contagem (nível de job, não por atleta — o schema não persiste `atletaIds` nem detalhe parcial); planos já gerados persistem (transação curta por atleta). O coach reenvia o lote (seguro: atletas já com plano caem no índice único). |
| Virtual threads saturam o pool HTTP do Tomcat | Executor dedicado de virtual threads (`batchPlanExecutor`), isolado das platform threads do Tomcat (CA8). |
| Race condition ao incrementar `gerados`/`erros` no mesmo job | UPDATE atômico no banco (`@Modifying`), sem leitura+reatribuição em memória. |
| `Semaphore` é por JVM — escala horizontal multiplica o teto real | Aceitável na escala atual (single instance); revisitar com limitador distribuído se houver múltiplas instâncias. |

**Plano de rollback:**
- A feature é aditiva: nova tabela `tb_batch_plan_job`, novos endpoints, novo índice único. A geração individual existente (`POST /planos/atletas/{atletaId}/gerar`) permanece intacta e é o caminho de fallback imediato — desabilitar a UI de lote no front já reverte o comportamento visível ao coach sem tocar no backend.
- **Migration V52:** `CREATE TABLE`/`CREATE INDEX` são reversíveis por uma migration de compensação (`DROP INDEX uk_plano_semanal_atleta_semana_ativo; DROP TABLE tb_batch_plan_job;`) caso o índice único cause atrito inesperado com outro fluxo de criação de plano. **Pré-condição:** o pré-check de duplicatas (task 1.1.a) deve rodar antes do deploy — se houver duplicatas ativas pré-existentes, a migration falha no `CREATE UNIQUE INDEX` e o deploy é abortado (fail-safe, sem estado parcial).
- Sem migração de dados destrutiva: nenhum dado existente é alterado ou removido; rollback não implica perda.
