# Design: coach-batch-plan-generation

## Decisões Técnicas

### 1. Padrão `202 Accepted + polling` — justificativa e estrutura

Geração de plano chama LLM (~5s/atleta). 20 atletas = ~100s, além do timeout de proxy (Nginx/ALB: 60–75s) e do risco de exaurir o pool HTTP do Tomcat (20 threads × 100s = todos bloqueados).

Padrão adotado: **async fire-and-forget** com job persistido no banco.

```
POST /coach/planos/gerar-lote           → 202 Accepted + { jobId }
                │
                └─▶ @Async executor "batchPlanExecutor" (virtual threads)
                           │
                    para cada atletaId (todas as tasks submetidas de uma vez):
                           ├─ planoService.gerarPlanoTreino(atletaId, modo)
                           ├─ success → UPDATE atômico (gerados++)
                           └─ error   → UPDATE atômico (erros++, motivo genérico)
                           │
                    ao final → job.status = CONCLUIDO | CONCLUIDO_COM_ERROS

GET /coach/planos/lote/{jobId}          → estado atual do job (polling a cada 3s)
```

Vantagens: thread HTTP retorna em < 500ms; virtual threads não bloqueiam o pool HTTP; job é resiliente a restart (persistido no banco); progresso reportado por atleta individual conforme o LLM responde (sem barreira de bloco).

### 2. Schema da tabela `tb_batch_plan_job`

```sql
CREATE TABLE IF NOT EXISTS tb_batch_plan_job (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    status          VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    total_atletas   INT NOT NULL,
    gerados         INT NOT NULL DEFAULT 0,
    erros           INT NOT NULL DEFAULT 0,
    criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    concluido_em    TIMESTAMPTZ,
    resultado       JSONB,
    CONSTRAINT chk_batch_job_status CHECK (status IN ('PENDENTE','EM_PROGRESSO','CONCLUIDO','CONCLUIDO_COM_ERROS'))
);

CREATE INDEX IF NOT EXISTS idx_batch_plan_job_tenant ON tb_batch_plan_job(tenant_id);
```

`resultado` é um JSONB com a lista de gerados e erros ao final do job — evita nova tabela de itens:
```json
{
  "gerados": [{ "atletaId": "uuid", "planoId": "uuid", "atletaNome": "..." }, ...],
  "erros":   [{ "atletaId": "uuid", "motivo": "..." }, ...]
}
```

**Detalhes só no estado terminal.** Durante `PENDENTE`/`EM_PROGRESSO` o `resultado` ainda é `null` — o progresso é acompanhado apenas pelos contadores `gerados`/`erros`/`total_atletas` (update atômico por atleta). As listas `geradosDetalhes`/`errosDetalhes` no DTO do GET são **vazias** (`[]`) até o job atingir `CONCLUIDO`/`CONCLUIDO_COM_ERROS`, quando `resultado` é gravado de uma vez. O contrato do endpoint deve documentar isso explicitamente (não são detalhes incrementais). O front, portanto, renderiza a lista de erros só na conclusão; a barra de progresso usa os contadores.

Retenção: job é deletado após 7 dias por job de limpeza (cron, fora do escopo desta change — adicionar como follow-up).

### 3. Entidade e repositório

```java
@Entity @Table(name = "tb_batch_plan_job")
public class BatchPlanJob {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;
    @Column(name = "tenant_id") private UUID tenantId;
    @Enumerated(EnumType.STRING) private BatchJobStatus status;
    private int totalAtletas, gerados, erros;
    private LocalDateTime criadoEm, concluidoEm;
    @Column(columnDefinition = "jsonb") private String resultado; // serializado como JSON
}
```

`BatchPlanJobRepository` com `findByIdAndTenantId(UUID, UUID)` para validação de tenant no GET.

### 4. Executor — Virtual Threads (não pool dimensionado) — `BatchPlanAsyncConfig`

**Por que não `ThreadPoolTaskExecutor`:** a chamada ao LLM é I/O-bound, não CPU-bound, e a latência real por atleta é bem maior que o "~5s" estimado no proposal — `PlanoResilienceService.java:20` documenta **~80s por tentativa**, com até 1 retry estrutural = pior caso ~160s/atleta. Dimensionar um pool de platform threads (core=2/max=3) para essa espera é desperdício de recurso e ainda serializa o lote (3 atletas em voo por vez, o resto espera na fila). Java 21 (já em uso, `pom.xml`) + Spring Boot 3.5.14 suportam virtual threads nativamente — cada tarefa (1 atleta) roda na própria virtual thread, bloqueando "de graça" sem prender uma platform thread.

```java
@Configuration
@EnableAsync
public class BatchPlanAsyncConfig implements AsyncConfigurer {

    @Bean("batchPlanExecutor")
    public Executor batchPlanExecutor() {
        return new TaskExecutorAdapter(Executors.newVirtualThreadPerTaskExecutor());
    }
}
```

Nome de classe segue a convenção existente no projeto (`StravaWebhookAsyncConfig`, `WorkoutAnalysisAsyncConfig` — uma config por feature, não uma `AsyncConfig` genérica compartilhada).

**Todas as N tasks (até 20) são submetidas de uma vez ao executor** — sem chunking sequencial nem barreira `allOf().join()` por grupo. O frontend faz polling a cada 3s e precisa ver o contador subir *conforme o LLM responde*, não em saltos de bloco; qualquer barreira intermediária trava o progresso no ritmo do atleta mais lento do grupo.

### 4.1 Controle de concorrência real — `Semaphore`, não pool size

Sem limitador, 20 virtual threads disparariam até 20 chamadas simultâneas ao provedor do LLM (risco de 429/rate-limit) e 20 escritas concorrentes no job. Virtual threads não enfileiram por si — o throttle precisa ser explícito:

```java
@Component
public class LlmConcurrencyLimiter {
    private final Semaphore semaphore;

    public LlmConcurrencyLimiter(@Value("${app.batch-plan.llm-concorrencia:4}") int permits) {
        this.semaphore = new Semaphore(permits);
    }

    public <T> T executar(Supplier<T> chamadaLlm) throws InterruptedException {
        semaphore.acquire();
        try {
            return chamadaLlm.get();
        } finally {
            semaphore.release();
        }
    }
}
```

`app.batch-plan.llm-concorrencia` configurável em `application.yml`, default 4 — quantas chamadas ao LLM em voo por vez, independente de quantas virtual threads existem no lote.

**Premissa em aberto:** o `Semaphore` é por instância da JVM, não um limite global distribuído. Se o backend escalar horizontalmente no futuro, o teto real de concorrência ao LLM vira `4 × nº de instâncias`. Para a escala atual (single instance) isso é aceitável; revisitar se/quando houver múltiplas instâncias em produção.

### 4.2 Retry curto para erro transitório de infra (rate-limit/503) no modo lote

`PlanoResilienceService` já faz retry (1x) apenas para falha *estrutural* de validação — falhas de infra/rede propagam direto (correto no fluxo unitário síncrono, onde 503/429 é raro). Em lote, a concorrência introduzida pelo próprio batch aumenta a chance de 429 do provedor. Sem tratamento, isso viraria falso "erro" pro coach mesmo quando o atleta poderia ter tido plano gerado com sucesso.

Adicionar, só no fluxo de lote, um retry curto e específico para exceções de rate-limit/infra do provedor (não para falha de validação estrutural, que já é tratada a montante):
- 2 tentativas, backoff 2s → 4s.
- Só cobre `HttpClientErrorException.TooManyRequests` (429) e erros 5xx do provedor — qualquer outra exceção (parsing, validação de domínio) segue para o tratamento de erro padrão do item (sem retry adicional, evita mascarar bug real).

### 5. Tratamento de erros individuais — sem oracle de enumeração

Para qualquer `atletaId` que falhe, o `motivo` no campo `erros` segue estas regras:
- Atleta de outro tenant → `"Atleta não encontrado"` (idêntico ao não-existente — sem revelar cross-tenant).
- Atleta com plano já existente na semana → `"Plano já existe para esta semana"`.
- Qualquer exceção de geração (LLM timeout, 503, parsing) → `"Erro ao gerar plano — tente novamente"`.

Nunca propagar a mensagem interna da exceção para o campo `motivo` — risco de expor detalhes internos (stack trace, URL do LLM, modelo utilizado).

**Normalização de `atletaIds` duplicados no request.** Se o mesmo `atletaId` vier repetido no corpo (ex.: `[A, A, B]`), duas tasks competiriam pelo mesmo plano — uma geraria e a outra viraria `"Plano já existe"` (via índice único), inflando `total_atletas` e produzindo um erro artificial. Para evitar isso, `iniciarLote` **deduplica a lista** (`atletaIds.stream().distinct().toList()`) antes de criar o job — `total_atletas` reflete a contagem distinta. A deduplicação é silenciosa (não é erro de input): a seleção no front já é baseada em `Set`, então duplicata só ocorre em uso direto da API. O limite `@Size(max = 20)` é validado sobre a lista recebida (antes da dedup) — 21 IDs, mesmo com repetição, ainda retornam 400 (o limite protege o payload, não a cardinalidade efetiva).

### 6. Atualização incremental do job — update atômico por atleta

O service assíncrono atualiza o job no banco a cada plano concluído (sucesso ou erro), individualmente, assim que aquele atleta termina — não em blocos, não só no final. É isso que dá ao frontend o efeito de "vai atualizando conforme o LLM vai respondendo" no polling.

**Pitfall de concorrência:** com N virtual threads terminando em momentos diferentes e escrevendo no mesmo registro de job, um `save()` JPA convencional (ler entidade → incrementar campo em memória → salvar) tem race condition real — duas threads podem ler o mesmo valor antes de qualquer uma persistir, perdendo um incremento; e o `@Version` (optimistic locking, já usado em `PlanoSemanal`) pode lançar `OptimisticLockException` sob concorrência real, exigindo retry manual do próprio update.

**Solução:** increment atômico via query `@Modifying`, sem carregar/reatribuir o campo em memória:

```java
@Modifying
@Query("UPDATE BatchPlanJob b SET b.gerados = b.gerados + 1 WHERE b.id = :id")
void incrementarGerados(@Param("id") UUID id);

@Modifying
@Query("UPDATE BatchPlanJob b SET b.erros = b.erros + 1 WHERE b.id = :id")
void incrementarErros(@Param("id") UUID id);
```

Cada virtual thread chama `incrementarGerados`/`incrementarErros` (dentro de `@Transactional` próprio, curto) assim que o atleta individual termina — sem N+1 real (é o comportamento esperado, não um problema: 1 UPDATE atômico por atleta, sem leitura prévia, sem race).

**Propagação de tenant em dois níveis (método externo + subtasks).** O `TenantContext` (ThreadLocal) não sobrevive ao handoff assíncrono, então precisa ser setado manualmente em **dois** pontos, não só nas subtasks:
1. **No método `@Async` externo** (`processarLote`): ele roda em uma virtual thread própria do `batchPlanExecutor` (não na thread HTTP) e executa queries tenant-aware fora das subtasks — transição do job para `EM_PROGRESSO`, gravação de `resultado`, fechamento do status. Setar `TenantContext.setTenantId(tenantId)` no início do método e `clear()` no `finally` que envolve todo o processamento.
2. **Em cada subtask por atleta**: cada atleta roda em *outra* virtual thread (submetida ao executor), que também não herda o ThreadLocal — set/clear próprios, como já descrito na task 1.5.b.

Como o `tenantId` não vem mais do `TenantContext` no momento do disparo (a thread HTTP já retornou o 202), ele é **capturado no controller/service síncrono e passado explicitamente** como parâmetro (`processarLote(..., UUID tenantId)`) — nunca resolvido de dentro do fluxo assíncrono.

### 7. Frontend — polling strategy

Intervalo de polling: 3s enquanto `status = PENDENTE | EM_PROGRESSO`. Parar polling quando `status = CONCLUIDO | CONCLUIDO_COM_ERROS`.

Implementação com `useEffect` + `setInterval`:
```ts
useEffect(() => {
  if (!jobId || isTerminal(status)) return;
  const interval = setInterval(() => fetchJobStatus(jobId), 3000);
  return () => clearInterval(interval);
}, [jobId, status]);
```

**Timeout de segurança — adaptativo ao tamanho do lote, não fixo.** Um teto fixo de 5 min está errado: o pior caso documentado (§4 — ~160s/atleta, concorrência 4) para 20 atletas é `⌈20/4⌉ × 160s ≈ 13min20s` de processamento *saudável*. Um timeout de 5 min abortaria o polling de jobs que estão progredindo normalmente. O timeout deve derivar do pior caso previsto:

```ts
// margem sobre o pior caso: ceil(N/concorrencia) * ~160s, com folga
const timeoutMs = Math.max(5, Math.ceil(totalAtletas / 4) * 3) * 60_000; // ~3 min por "onda" de 4, mínimo 5 min
```

Além disso, o timeout é apenas uma rede de segurança do cliente — a fonte de verdade sobre "job travado" é o backend (o recovery de jobs órfãos, §9, fecha no servidor). O polling também deve parar imediatamente se o backend já reportou estado terminal, sem esperar o timeout. Ao estourar o timeout sem estado terminal, mostrar aviso ("A geração está demorando mais que o esperado — verifique novamente em instantes") e parar o polling, sem descartar o `jobId` (o coach pode reconsultar).

### 8. Validação de plano duplicado

Antes de chamar `planoService.gerarPlanoTreino(atletaId, modo)`, o service assíncrono verifica se já existe um plano para o atleta na semana alvo com `PlanoReviewStatus` diferente de `REJEITADO`. Se existir, registra o atleta como erro com `"Plano já existe para esta semana"` sem chamar o LLM.

Lógica: `planoSemanalRepository.existsByAtletaIdAndSemanaInicioAndReviewStatusNot(atletaId, semanaAlvo, REJEITADO)`.

**Corrida entre lotes concorrentes (TOCTOU) — guarda autoritativa no banco.** O `exists`-check acima é *best-effort*: cobre o caso comum (sequencial), mas dois lotes concorrentes com o mesmo atleta podem passar no `exists` ao mesmo tempo e gerar dois planos `AGUARDANDO_REVISAO`. A guarda real é um **índice único parcial** em `tb_plano_semanal`:

```sql
-- na migration V52, após verificar que não há duplicatas pré-existentes (ver task 1.1.a):
CREATE UNIQUE INDEX IF NOT EXISTS uk_plano_semanal_atleta_semana_ativo
    ON tb_plano_semanal (atleta_id, semana_inicio)
    WHERE review_status <> 'REJEITADO';
```

Com o índice, a persistência do segundo plano concorrente lança `DataIntegrityViolationException` — o fluxo do lote captura essa exceção **por atleta** e a converte em erro `"Plano já existe para esta semana"` (mesma mensagem do `exists`-check), sem abortar os demais. O `exists`-check permanece como fast-path (evita a chamada ao LLM no caso comum); o índice fecha a janela de corrida.

> ⚠️ **Pré-condição da migration:** antes de criar o índice único, a task 1.1 deve verificar que não existem duplicatas ativas no dado atual (`SELECT atleta_id, semana_inicio, COUNT(*) ... GROUP BY 1,2 HAVING COUNT(*) FILTER (WHERE review_status <> 'REJEITADO') > 1`). Se houver, o índice falha e é preciso limpar antes — decidir no momento de implementar.

### 9. Resiliência a restart — recovery de jobs órfãos

O job é persistido, mas o processamento é fire-and-forget em virtual threads: se a aplicação cair no meio, o registro fica preso em `EM_PROGRESSO` para sempre e o polling do frontend só desiste após o timeout de 5 min. Os planos já gerados **persistem** (cada atleta commita em sua própria transação curta), então não há perda de dado — mas o job precisa ser fechado.

**Recovery no startup** (`ApplicationReadyEvent` listener, ou um `@Scheduled` leve): busca jobs em `PENDENTE`/`EM_PROGRESSO` cujo `criado_em` seja anterior a um limiar (ex.: > 30 min — nenhum lote real dura tanto) e os finaliza como `CONCLUIDO_COM_ERROS`.

**Fechamento em nível de job (por contagem, não por atleta).** O schema não persiste a lista original de `atletaIds` submetidos nem o detalhe parcial por atleta durante o `EM_PROGRESSO` — só os contadores `gerados`/`erros` (que já refletem o que foi processado até a queda, via update atômico). Portanto o recovery **não tem como nomear quais atletas individuais faltaram** e não tenta: ele apenas fecha o job com um `resultado` de nível de job:
- calcula `nao_processados = total_atletas - gerados - erros` (um número, não uma lista);
- grava em `resultado` uma nota de job: `{ "observacao": "Lote interrompido por reinício da aplicação. N atleta(s) podem não ter sido processados — reenvie o lote para os atletas sem plano nesta semana." }`, preservando os `gerados`/`erros` já contabilizados;
- seta `concluido_em`.

Não reprocessa automaticamente (evita duplicar planos já gerados antes da queda); o coach reenvia o lote — os atletas que já receberam plano caem no fast-path/índice único (`"Plano já existe para esta semana"`), então o reenvio é seguro e idempotente do ponto de vista de dados. O próprio recovery é idempotente: só atua sobre jobs em estado não-terminal, então rodar duas vezes não altera um job já `CONCLUIDO`/`CONCLUIDO_COM_ERROS`.

> Nomear os atletas faltantes exigiria persistir `atleta_ids` + detalhe parcial incremental (nova coluna + escrita por atleta) — fora do escopo do v1; a UX de "reenviar o lote" cobre o caso sem esse custo.
