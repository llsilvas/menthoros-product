# Design: coach-batch-plan-generation

## Decisões Técnicas

### 1. Padrão `202 Accepted + polling` — justificativa e estrutura

Geração de plano chama LLM (~5s/atleta). 20 atletas = ~100s, além do timeout de proxy (Nginx/ALB: 60–75s) e do risco de exaurir o pool HTTP do Tomcat (20 threads × 100s = todos bloqueados).

Padrão adotado: **async fire-and-forget** com job persistido no banco.

```
POST /coach/planos/gerar-lote           → 202 Accepted + { jobId }
                │
                └─▶ @Async thread pool "batchPlanExecutor"
                           │
                    para cada atletaId:
                           ├─ planoService.gerarPlanoTreino(atletaId, modo)
                           ├─ success → atualiza job (gerados++)
                           └─ error   → atualiza job (erros++, motivo genérico)
                           │
                    ao final → job.status = CONCLUIDO | CONCLUIDO_COM_ERROS

GET /coach/planos/lote/{jobId}          → estado atual do job (polling a cada 3s)
```

Vantagens: thread HTTP retorna em < 500ms; pool dedicado não bloqueia endpoint de saúde nem outros fluxos; job é resiliente a restart (persistido no banco).

### 2. Schema da tabela `tb_batch_plan_job`

```sql
CREATE TABLE IF NOT EXISTS tb_batch_plan_job (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDENTE',
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

### 4. Thread pool dedicado — `AsyncConfig`

```java
@Configuration @EnableAsync
public class AsyncConfig {
    @Bean("batchPlanExecutor")
    public Executor batchPlanExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(2);
        executor.setMaxPoolSize(3);
        executor.setQueueCapacity(10);
        executor.setThreadNamePrefix("batch-plan-");
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        executor.initialize();
        return executor;
    }
}
```

`CallerRunsPolicy`: se a fila estiver cheia (>10 jobs pendentes), o thread HTTP executa o job inline — degradação controlada em vez de `RejectedExecutionException`.

### 5. Tratamento de erros individuais — sem oracle de enumeração

Para qualquer `atletaId` que falhe, o `motivo` no campo `erros` segue estas regras:
- Atleta de outro tenant → `"Atleta não encontrado"` (idêntico ao não-existente — sem revelar cross-tenant).
- Atleta com plano já existente na semana → `"Plano já existe para esta semana"`.
- Qualquer exceção de geração (LLM timeout, 503, parsing) → `"Erro ao gerar plano — tente novamente"`.

Nunca propagar a mensagem interna da exceção para o campo `motivo` — risco de expor detalhes internos (stack trace, URL do LLM, modelo utilizado).

### 6. Atualização incremental do job

O service assíncrono atualiza o job no banco a cada plano concluído (sucesso ou erro), não só no final. Isso permite que o frontend mostre progresso real durante o polling.

Risco de N+1 writes: com 20 atletas, são até 20 `UPDATE tb_batch_plan_job SET gerados/erros = X`. Aceitável para o volume esperado. Caso vire problema de performance, agrupar em batch de 5.

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

Timeout de segurança: se após 5 minutos o job não terminou (edge case de travamento), mostrar mensagem de erro ao usuário e parar polling.

### 8. Validação de plano duplicado

Antes de chamar `planoService.gerarPlanoTreino(atletaId, modo)`, o service assíncrono verifica se já existe um plano para o atleta na semana alvo com `PlanoReviewStatus` diferente de `REJEITADO`. Se existir, registra o atleta como erro com `"Plano já existe para esta semana"` sem chamar o LLM.

Lógica: `planoSemanalRepository.existsByAtletaIdAndSemanaInicioAndReviewStatusNot(atletaId, semanaAlvo, REJEITADO)`.
