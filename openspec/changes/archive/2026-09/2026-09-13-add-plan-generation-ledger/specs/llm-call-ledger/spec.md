# LLM call ledger

Contrato de registro persistido de cada chamada ao LLM, da ligação com o plano gerado, do
versionamento de prompt e schema, e da retenção. Observabilidade técnica, não evento de domínio.
Termos: **Chamada LLM** (uma linha) e **Requisição de geração** (o grupo de chamadas de uma geração
de plano).

## ADDED Requirements

### Requirement: Uma linha por Chamada LLM, em toda rota (CA1, CA2)

O sistema SHALL gravar uma linha em `tb_llm_call` para cada chamada ao LLM, em qualquer rota, com
rota, modelo, tokens de entrada, saída, cache-read e cache-write, custo estimado, latência e
`created_at`. A rota `plano` SHALL enriquecer a linha com `generation_request_id`, `atleta_id`,
`tentativa`, `prompt_version`, `prompt_hash`, `schema_version`, `violacoes` e `response_json`; nas
demais rotas essas colunas SHALL ser nulas.

#### Scenario: Geração com retry
- **Given** uma geração de plano cuja 1ª resposta é rejeitada pela validação e a 2ª aceita
- **When** a geração termina
- **Then** existem 2 linhas com o mesmo `generation_request_id`, `tentativa` 1 e 2, cada uma com seus
  próprios tokens e latência

#### Scenario: Rota sem contexto
- **Given** uma chamada da rota `standard` sem `LlmCallContext`
- **When** a chamada termina
- **Then** existe 1 linha com rota, modelo, tokens, custo e latência, enriquecimento nulo e
  `resultado = SUCCESS`

### Requirement: Resultado por chamada (CA3, CA13)

Cada linha SHALL ter `resultado` em {`PENDING`, `SUCCESS`, `VALIDATION_REJECTED`, `PARSE_ERROR`,
`LLM_ERROR`, `TIMEOUT`}. Na rota `plano` a linha SHALL nascer `PENDING`; `SUCCESS` e
`VALIDATION_REJECTED` SHALL ser escritos após a validação e `PARSE_ERROR` quando a conversão para
DTO falha; `LLM_ERROR` e `TIMEOUT` SHALL ser escritos no caminho de exceção do provider. Uma linha
SHALL representar uma chamada lógica; os retries de transporte da mesma chamada SHALL ser contados
em `transport_retries`. `violacoes` SHALL ser uma lista JSON de `{key, mensagem}`.

#### Scenario: Rejeição pela validação
- **Given** uma resposta que viola `INTERVALADO_PROIBIDO`
- **When** a validação rejeita
- **Then** a linha tem `resultado = VALIDATION_REJECTED` e `violacoes` contém a key e a mensagem

#### Scenario: Timeout do provider
- **Given** uma chamada cuja exceção tem `SocketTimeoutException` na cadeia de causas
- **When** a exceção é relançada
- **Then** a linha existe com `resultado = TIMEOUT`, tokens nulos e latência preenchida

#### Scenario: Conversão falha depois do HTTP 200
- **Given** uma resposta 200 cujo JSON não desserializa em `PlanoSemanalLlmDto`
- **When** o lambda `gerar` captura a exceção
- **Then** a linha passa de `PENDING` para `PARSE_ERROR`

#### Scenario: Retry de transporte
- **Given** uma sequência HTTP 500 → 500 → 200 na rota `plano`
- **Then** existe uma única linha, `SUCCESS` após a validação, com `transport_retries = 2`

### Requirement: Ligação com o plano e desfecho da Requisição de geração (CA4, CA9)

O sistema SHALL criar um `generation_request_id` por geração de plano (no carregamento do
contexto, individual ou por atleta do lote) e SHALL gravá-lo em `tb_plano_semanal` no mesmo `save`
que persiste o plano. A ligação chamada ↔ plano e o veredito do coach SHALL ser por join nessa
coluna. O desfecho da requisição SHALL ser gravado na última chamada do grupo em `request_outcome`
∈ {`PERSISTED`, `CONFLICT`, `REJECTED_POST_LLM`, `PERSIST_ERROR`}, best-effort.

#### Scenario: Plano persistido
- **Given** uma geração que terminou em plano salvo
- **Then** `tb_plano_semanal.generation_request_id` é igual ao das chamadas que o geraram

#### Scenario: Geração que falhou antes de o LLM aceitar
- **Given** uma geração que terminou em 422 ou 503 sem chamada `SUCCESS`
- **Then** as chamadas existem, nenhum plano tem aquele id e `request_outcome` é nulo

#### Scenario: LLM aceito, plano não persistido
- **Given** uma chamada `SUCCESS` seguida de corrida perdida no índice de plano ativo
- **Then** a última chamada tem `request_outcome = CONFLICT`; rejeição terminal do estágio 2 dá
  `REJECTED_POST_LLM`; exceção na persistência dá `PERSIST_ERROR`

#### Scenario: Plano excluído depois
- **Given** um plano persistido (`PERSISTED`) que o coach exclui
- **Then** `request_outcome` permanece `PERSISTED` e o join não encontra mais o plano

#### Scenario: Lote
- **Given** um lote com 2 atletas do mesmo tenant
- **Then** cada atleta tem um `generation_request_id` distinto e `tenant_id` preenchido

### Requirement: Versão e hash do prompt (CA5)

O sistema SHALL manter `PromptVersion.CURRENT` e `SchemaVersion.CURRENT` como constantes e SHALL
calcular no startup o SHA-256 do template estático, logando-o e gravando-o em cada chamada da rota
`plano`. Um teste SHALL falhar se o hash do template no classpath divergir do hash registrado junto
ao golden-master.

#### Scenario: Mudança acidental no template
- **Given** o template estático alterado sem bump de `PromptVersion`
- **When** a suíte roda
- **Then** o teste de hash falha

### Requirement: Resposta bruta como dado sensível (CA6)

A rota `plano` SHALL gravar em `response_json` o JSON como veio do modelo, antes de qualquer
reparo, com o nome do atleta substituído por `[ATLETA]`. Nenhuma coluna SHALL conter o prompt. A
exclusão do atleta SHALL anular `response_json` das linhas dele. Nenhum endpoint SHALL expor a
coluna.

#### Scenario: Fixture de caracterização
- **Given** uma chamada rejeitada pela validação de um atleta chamado "Maria Souza"
- **Then** `response_json` reproduz a saída do modelo que causou a rejeição, com "Maria Souza"
  substituído por `[ATLETA]`

#### Scenario: Exclusão do atleta
- **Given** linhas com `response_json` de um atleta
- **When** o atleta é excluído
- **Then** `atleta_id = NULL` e `response_json = NULL` nessas linhas

### Requirement: Retenção (CA7)

Um job diário SHALL anular `response_json` das linhas com mais de 90 dias, preservando as demais
colunas, de forma idempotente, logando o total anulado.

#### Scenario: Purga idempotente
- **Given** 2 linhas com 91 dias e 1 com 10 dias, todas com `response_json`
- **When** o job roda duas vezes
- **Then** a 1ª execução anula 2 e a 2ª anula 0; tokens, custo e latência permanecem nas 3

### Requirement: Best-effort e isolamento transacional (CA8)

Nenhuma falha ao gravar ou atualizar o ledger SHALL impedir a geração, a validação ou a
persistência do plano. A falha SHALL ser logada em `warn`. A escrita SHALL ocorrer em transação
própria (`REQUIRES_NEW`) com teto de 5 s, de modo que rollback do chamador não apague a linha e
uma escrita bloqueada não retenha permits de concorrência.

#### Scenario: Rollback do chamador
- **Given** uma chamada feita dentro de `@Transactional(REQUIRES_NEW)` que depois faz rollback
- **Then** a linha do ledger permanece

#### Scenario: Banco do ledger indisponível
- **Given** o repositório do ledger lança exceção
- **When** uma geração roda
- **Then** o plano é gerado e persistido normalmente e um `warn` é logado

### Requirement: Integridade e atribuição por tenant (CA10, CA11, CA12)

`tenant_id` SHALL ser solto (sem FK) e nullable, com `warn` quando ausente. `atleta_id` SHALL ser
FK com `ON DELETE SET NULL`. SHALL existir índice `(tenant_id, created_at)` e
`(generation_request_id)`. O counter `llm.cost.estimated.usd` SHALL ter sempre a tag `tenant`, com
`none` quando ausente. Os pontos de entrada assíncronos que conhecem o `tenantId`
(`WorkoutAnalysisListener`, `WeeklyFocusNarrativeService`) SHALL publicá-lo no `TenantContext` em
volta da chamada ao LLM.

#### Scenario: Custo do listener atribuído
- **Given** uma análise de treino disparada por evento com `tenantId`
- **Then** a linha em `tb_llm_call` tem `tenant_id` preenchido

#### Scenario: Atleta excluído
- **Given** linhas de chamadas de um atleta
- **When** o atleta é excluído
- **Then** as linhas permanecem com `atleta_id = NULL`
