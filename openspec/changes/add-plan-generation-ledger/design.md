# Design — add-plan-generation-ledger

Decisões fechadas no grilling de 2026-09-13 (Rodadas 1 e 2). Numeração D1–D11.

## D1 — Grão: uma linha por chamada ao LLM

Cada chamada é uma linha; as tentativas de uma mesma geração compartilham um
`generation_request_id`. Alternativa rejeitada: uma linha por requisição com tentativas em JSONB,
porque impede `GROUP BY` simples para "quanto custa o retry" e "qual versão falha na 1ª tentativa".

## D2 — Escopo: todas as rotas, enriquecimento só na rota `plano`

O `CostTrackingAdvisor` já intercepta as cinco rotas (`simple`, `standard`, `complex`, `expert`,
`plano`) e conhece rota, modelo, usage, cache e latência. Ele grava a parte genérica de toda
chamada. A rota `plano` é a única que conhece atleta, tentativa, versão e violações, e é a única que
preenche as colunas de enriquecimento. Uma tabela, um escritor, zero change futura para cobrir
análise de treino ou foco semanal.

Consequência no nome: a tabela é `tb_llm_call`, não `tb_plan_generation`. O change-id mantém
`add-plan-generation-ledger` por continuidade com o `SPRINTS.md`.

## D3 — `LlmCallContext` em `ThreadLocal`

```
LlmCallContext.set(new LlmCallContext(generationRequestId, atletaId, tentativa,
                                      PromptVersion.CURRENT, promptHash, SchemaVersion.CURRENT));
try {
    resposta = chatClient.prompt()...call().responseEntity(PlanoSemanalLlmDto.class);
    UUID callId = LlmCallContext.lastCallId();   // preenchido pelo advisor
    ... validar ...
    ledger.registrarResultado(callId, SUCCESS | VALIDATION_REJECTED, violacoes);
} finally {
    LlmCallContext.clear();
}
```

- Precedente: `TenantContext`. Mesma disciplina: `clear()` em `finally`, e no lote o `set` acontece
  **dentro** da virtual thread de cada atleta (`BatchPlanProcessor` já faz isso com o tenant;
  virtual threads não herdam `ThreadLocal`).
- O advisor lê o contexto se existir; ausente, grava a linha genérica com enriquecimento nulo.
- O advisor grava a linha **antes** de devolver a resposta à cadeia, então `lastCallId()` está
  disponível quando o lambda de geração retorna. Em exceção do provider, o advisor grava a linha
  com `LLM_ERROR` ou `TIMEOUT` e relança.
- `tentativa` vem do `PlanoResilienceService`: o contador `geracoes` já existe; a função `gerar`
  passa a receber o número da tentativa (ou o contexto é atualizado a cada volta do loop).

Alternativas rejeitadas: (b) segunda tabela de tentativas ligada por FK (duas escritas, dois
modelos); (c) rota `plano` gravando tudo sozinha (duplica a extração de usage que o advisor já faz
e deixa as outras rotas sem registro).

## D4 — Ligação com o plano: coluna em `tb_plano_semanal`

`tb_plano_semanal.generation_request_id UUID NULL`, escrita no `save` que já existe em
`PlanGenerationPersister.salvarPlanoCompleto`. O id nasce em `PlanoServiceImpl.gerarPlanoTreino`
(e no subtask do `BatchPlanProcessor`) e viaja até o persister pelo objeto de contexto que já cruza
as três fases. Sem `UPDATE` posterior em `tb_llm_call`, sem corrida, sem segunda escrita.

Gerações que terminam em 422/503 não têm plano; as chamadas ficam órfãs de plano, e isso é o sinal
correto ("quanto gastamos em gerações que não viraram plano").

## D5 — Veredito do coach é join, não cópia

`review_status`, `review_comment`, `origemAprovacao`, `editado_pelo_coach` e
`adicionado_pelo_coach` continuam onde estão. A pergunta "quais gerações viraram plano rejeitado"
é `JOIN tb_plano_semanal USING (generation_request_id)`. Copiar estado criaria a dúvida de qual
cópia está certa.

## D6 — `resultado` por chamada

Enum `LlmCallResult`: `SUCCESS`, `VALIDATION_REJECTED`, `LLM_ERROR`, `TIMEOUT`.

- `SUCCESS` e `VALIDATION_REJECTED` são escritos pela rota `plano` depois da validação (update pelo
  `callId`). Para as outras rotas, o advisor grava `SUCCESS` na hora (não há validação de domínio).
- `LLM_ERROR` e `TIMEOUT` são escritos pelo advisor no caminho de exceção (`TIMEOUT` quando há
  `SocketTimeoutException` na cadeia de causas, mesma detecção do counter `llm.timeout`).
- O desfecho da **requisição** (plano persistido, 422, 503) não é coluna: sai do join com o plano e
  da última chamada do grupo.

`violacoes JSONB`: lista de `{ "key": "...", "mensagem": "..." }`, mesmo formato de
`PlannerViolation` e `ViolacaoQualidade`.

## D7 — Resposta bruta guardada, prompt não

`response_json JSONB` recebe o JSON como veio do modelo, antes de qualquer reparo. É o insumo das
fixtures de caracterização da Fase 2 e do eval set da Fase 5; o plano persistido já passou por
reparo, redistribuição e prova e não serve para isso. O schema de saída não tem campo de
identificação do atleta. O prompt **não** é guardado (PII, tamanho, precedente da V58): só
`prompt_version` e `prompt_hash`.

## D8 — Retenção: linha para sempre, payload por 90 dias

`@Scheduled` diário (padrão dos sete schedulers existentes):

```sql
UPDATE tb_llm_call SET response_json = NULL
 WHERE created_at < now() - interval '90 days' AND response_json IS NOT NULL;
```

Idempotente, uma linha de log com o total. As colunas de custo e latência ficam para FinOps.

## D9 — Versionamento: constante + hash

- `PromptVersion.CURRENT = "plano-v1"` (espelho de `PlannerVersion.CURRENT = "planner-v1"`).
- `SchemaVersion.CURRENT = "schema-v1"`, separado porque a Fase 4 muda o schema sem mudar o prompt
  inteiro.
- `prompt_hash`: SHA-256 do conteúdo do template estático, calculado uma vez no startup
  (`@PostConstruct` no `PromptTemplateLoader` ou bean próprio), logado em INFO. Um teste compara o
  hash do template no classpath com o hash registrado junto ao golden, para pegar mudança acidental
  sem bump da constante.
- A Fase 1 promove para `plano-v2`.

## D10 — Integridade e índices

- `id UUID PK DEFAULT gen_random_uuid()`, `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.
- `tenant_id UUID NULL` (solto, regra do projeto; nullable por D2).
- `atleta_id UUID NULL REFERENCES tb_atleta(id) ON DELETE SET NULL`.
- `plano_id` **não existe** em `tb_llm_call` (D4); a ligação é por `generation_request_id`.
- Índices: `idx_llm_call_tenant_created (tenant_id, created_at)`,
  `idx_llm_call_generation_request (generation_request_id)`,
  `idx_plano_semanal_generation_request (generation_request_id)`.
- `route VARCHAR(20) NOT NULL`, `model VARCHAR(80) NOT NULL`, `resultado VARCHAR(30) NOT NULL`
  com `CHECK` nos quatro valores.
- Tokens e latência como `INTEGER`/`BIGINT`; custo como `NUMERIC(12,10)` (o advisor já calcula com
  10 casas).

## D11 — Exposição mínima

Nenhuma UI nem endpoint. Acrescenta-se a tag `tenant` ao counter `llm.cost.estimated.usd` quando o
contexto existir (cardinalidade limitada pelo número de assessorias). Um endpoint admin fica para
quando alguém pedir.

## Riscos e mitigação

- **Falha do ledger derruba a geração.** Mitigação: toda escrita em `try/catch` com `warn`; teste
  CA8 com repositório lançando exceção.
- **`ThreadLocal` vazando entre chamadas no lote.** Mitigação: `clear()` em `finally` e teste no
  `BatchPlanProcessor` com dois atletas verificando ids distintos (CA9).
- **Cardinalidade de métrica.** Tag `tenant` só quando presente; com 10 assessorias é irrelevante,
  e a tabela é a fonte de verdade, não a métrica.
- **Crescimento do JSONB.** ~1,4k tokens de saída por chamada ≈ 6 KB; 600 linhas/mês ≈ 3,6 MB/mês
  antes da purga. Irrelevante.

## Dependências

- Nenhuma change bloqueante. O `chore` de `spring.ai.retry` sai antes, separado.
- Desbloqueia: `system-user-prompt-split` (gate medido na tabela), Fase 2 (fixtures), Fase 5 (eval
  set).
