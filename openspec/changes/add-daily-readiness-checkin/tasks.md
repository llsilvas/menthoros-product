## 1. Modelo de dados

- [x] 1.1 Criar enum `NivelProntidao` com valores `PRONTO`, `CAUTELOSO`, `DESCANSAR` e interpretações associadas
  - verify: enum compila e cada valor tem descrição; teste referencia os três valores.
- [x] 1.2 Criar entidade `CheckinProntidao` em `entity/` com campos subjetivos (sono 1-10, humor 1-10, dores 0-10, energia 1-10, estresse 0-10), `readinessScore` (BigDecimal 0-1), `nivelProntidao`, `observacoes` e `tenantId`
  - verify: `./mvnw clean compile` verde; mapeamento JPA reflete colunas da migration.
- [x] 1.3 Criar migration `V46__Create_checkin_prontidao_table.sql` com tabela `tb_checkin_prontidao` e índices `(atleta_id, data)` e `(tenant_id)`
  - verify: `./mvnw flyway:info` (ou boot da app) aplica V46 sem checksum error; tabela criada.
- [x] 1.4 Criar migration `V47__Add_readiness_to_metricas_diarias.sql` adicionando `readiness_score` e `nivel_prontidao` em `tb_metricas_diarias`
  - verify: colunas presentes em `tb_metricas_diarias` após boot; sem breaking em queries existentes.
- [x] 1.5 Adicionar constraint UNIQUE `(atleta_id, data)` em `tb_checkin_prontidao`
  - verify: segundo insert no mesmo `(atleta, data)` viola a constraint (teste de repository, seção 9).
- [x] 1.6 Documentar rollback das migrations (comentário no topo de V46/V47): `DROP TABLE IF EXISTS tb_checkin_prontidao;` e `ALTER TABLE tb_metricas_diarias DROP COLUMN IF EXISTS readiness_score, DROP COLUMN IF EXISTS nivel_prontidao;`. Reversão de comportamento via feature flag no `ReadinessService` (ver 4.5) sem tocar em dados.
  - verify: bloco de comentário de rollback presente nos dois arquivos SQL.

## 2. DTOs e Mapper

- [x] 2.1 Criar `CheckinProntidaoInputDto` com validações (@Min/@Max nos campos numéricos, @Size no texto)
  - verify: bean validation rejeita valores fora de faixa (teste do DTO / controller 400).
- [x] 2.2 Criar `CheckinProntidaoOutputDto` com todos os campos + readiness calculado
  - verify: serialização JSON expõe `readinessScore` e `nivelProntidao`.
- [x] 2.3 Criar `CheckinProntidaoMapper` (manual `@Component`, seguindo padrão dominante do módulo — não MapStruct)
  - verify: mapper compila; null-check explícito lança `IllegalArgumentException`.

## 3. Repository

- [x] 3.1 Criar `CheckinProntidaoRepository` com `findByAtletaIdAndData`, `findTopByAtletaIdOrderByDataDesc`, `findByAtletaIdAndDataBetween` (todos tenant-aware, filtram `tenant_id`)
  - verify: `@DataJpaTest` cobre os três finders com dados de fixture.

## 4. Cálculo de readiness

- [x] 4.1 Criar `ReadinessService` com método `calcularScore(CheckinProntidao)` retornando BigDecimal 0–1
  - verify: 13 testes unitários (`ReadinessServiceTest`) — sinais extremos retornam 0.0/1.0, misto entre 0–1. Verde.
- [x] 4.2 Definir função de ponderação inicial: sono 35%, energia 25%, humor 20%, dores 15%, estresse 5% (valores ajustáveis via `@ConfigurationProperties`)
  - verify: `ReadinessProperties` (prefix `app.readiness`); teste confirma somatório dos pesos = 1.0.
- [x] 4.3 Implementar `classificarNivel(BigDecimal score)`: `>= 0.75` → PRONTO, `0.50–0.74` → CAUTELOSO, `< 0.50` → DESCANSAR
  - verify: teste parametrizado (`@CsvSource`) cobre as 3 faixas incluindo bordas 0.75, 0.74, 0.50, 0.49.
- [x] 4.4 Persistir `readinessScore` e `nivelProntidao` no próprio checkin e também na `MetricasDiarias` do dia — implementado em `CheckinProntidaoServiceImpl.registrarCheckin()` (upsert por atleta+data) + `propagarParaMetricasDiarias()` (atualiza se a linha do dia já existir; não cria linha nova — fora do escopo deste serviço)
  - verify: `CheckinProntidaoServiceImplTest` (10 testes) — upsert idempotente, propagação condicional para MetricasDiarias. Verde.
- [x] 4.5 Adicionar feature flag (`ReadinessProperties.enabled`, default `true`) para desabilitar leitura de readiness no motor sem remover dados — suporte a rollback
  - verify: flag adicionada; consumo pelo portão de elegibilidade e teste dedicado na seção 5.

## 5. Integração com motor de elegibilidade

- [x] 5.1 Adicionar portão de readiness (6º) em `IntervaladoElegibilidadeService` — implementado como **overload aditivo** `avaliar(atleta, meta, treinos, data, nivelProntidaoHoje)`; a assinatura de 4 args existente delega para a nova passando `null` (zero call site dos 16+ testes/callers existentes quebrado)
  - verify: 23/23 testes verdes em `IntervaladoElegibilidadeServiceTest` + `IntervaladoElegibilidadeSemanticaTest` (17 pré-existentes sem regressão + 6 novos de readiness); golden-master `PlanoTreinoPromptBuilderGoldenTest` 5/5 verde.
- [x] 5.2 Regra: `DESCANSAR` → bloqueio total (`Substituido`/REGENERATIVO), mesmo com os 5 portões fisiológicos OK; `CAUTELOSO` → atenua a decisão (`Elegivel`→`Degradado` ou nota adicional em `Degradado` existente) com instrução de redução de volume 20–30%; não sobrescreve `Substituido` de outro portão
  - verify: testes `readinessDescansarBloqueiaMesmoComPortoesFisiologicosOk`, `readinessCautelosoAtenuaElegivel`, `readinessCautelosoNaoSobrescreveSubstituidoPorLesao`. Verde.
- [x] 5.3 Expor motivo do bloqueio/atenuação no output do serviço para logging e prompt — reaproveita o campo `motivo`/`instrucaoParaLlm` já existente em `RecomendacaoIntervalado` (sealed interface) e o mecanismo `Constraint` já usado pelo bloco mandatório do prompt; sem novo contador Micrometer (fora do escopo declarado do proposal)
  - verify: `instrucaoParaLlm` contém a nota de atenuação/bloqueio (teste `contains("20-30%")`).
- [x] 5.4 Fallback: sem checkin do dia (`null`), motor opera com o comportamento atual (overload de 4 args) e registra WARN
  - verify: teste `semCheckinOperaComoFallback` — decisão idêntica entre `avaliar(..., null)` e `avaliar(...)` sem o parâmetro. Flag `app.readiness.enabled=false` testada em `flagDesabilitadaIgnoraReadiness`.

## 6. Integração com prompt builder

- [x] 6.1 Adicionar seção `readiness` ao contexto montado por `PlanoTreinoPromptBuilder` — `TreinoHistoricoProvider` carrega `checkinsUltimos7Dias` em `ContextoTreino` (mesmo padrão "1 query, formatters consomem sem acessar banco"); `ReadinessPromptFormatter` novo formata a seção; golden-master regenerado (mudança intencional, `-Dgolden.update=true`)
  - verify: seção `## 🌡️ READINESS` presente nos 5 arquétipos do golden-master (5/5 verde).
- [x] 6.2 Incluir sequência compacta dos últimos 7 dias (ex: `[PRONTO, PRONTO, CAUTELOSO, DESCANSAR, CAUTELOSO, PRONTO, PRONTO]`) — `ContextoTreino.sequenciaUltimos7Dias()`, `SEM_DADO` nos dias sem checkin
  - verify: `TreinoHistoricoProviderContextoTreinoTest` + `ReadinessPromptFormatterTest` (11 testes). Verde.
- [x] 6.3 Incluir score do dia atual se houver; instrução obrigatória de considerar readiness baixo (instruction hardening) — bloco "⚠️ ATENÇÃO OBRIGATÓRIA" quando `nivelHoje == DESCANSAR`
  - verify: teste `incluiInstrucaoObrigatoriaQuandoDescansar` / `naoIncluiInstrucaoDeBloqueioForaDeDescansar`. Verde.

## 7. Endpoints REST

- [x] 7.1 Criar `CheckinProntidaoController` em `controller/` sob `/api/v1/checkins` — POST resolve o atleta autenticado via `AtletaProgressService.resolverAtletaIdAtual()` (mesmo padrão de `AtletaTreinoController`); GETs por `{atletaId}` usam `@RequireTenant(resourceParamIndex = 0)`
  - verify: rota mapeada em `/api/v1/checkins` (não `/api/checkins`); 8 testes MockMvc verdes.
- [x] 7.2 Endpoint `POST /api/v1/checkins` (cria ou atualiza checkin do dia; idempotente por (atleta, data))
  - verify: idempotência já coberta em `CheckinProntidaoServiceImplTest` (seção 4); MockMvc cobre 201 + 400 (campo ausente/fora de faixa).
- [x] 7.3 Endpoint `GET /api/v1/checkins/{atletaId}/atual`
  - verify: MockMvc — 200 com body quando existe, 204 quando ausente.
- [x] 7.4 Endpoint `GET /api/v1/checkins/{atletaId}?dias=N` (default 7, máx 90)
  - verify: MockMvc — default 7 (verificado via `verify(...).buscarHistorico(atletaId, 7)`); 400 quando `dias=91` ou `dias=0` (bean validation `@Min`/`@Max`).
- [x] 7.5 Anotações OpenAPI e tratamento de erros via `GlobalExceptionHandler` — `@Tag`/`@Operation`/`@ApiResponses` completos, `@ArraySchema` no endpoint de lista; erros de validação já cobertos pelos handlers existentes (`MethodArgumentNotValidException`, `ConstraintViolationException`, `DomainNotFoundException`) — nenhuma exceção nova introduzida
  - verify: `./mvnw clean compile` verde (springdoc/annotation processing sem erro); 400 confirmado nos testes MockMvc.

## 8. Multi-tenancy

- [x] 8.1 Garantir que todas as queries filtram por `tenant_id` do `TenantContext` — os 3 finders de `CheckinProntidaoRepository` recebem `tenantId`; `resolveAtleta()` usa `AtletaRepository.findByIdAndTenantId`; controller usa `@RequireTenant` nos GETs por `{atletaId}`. Nota: `MetricasDiariasRepository.findByAtletaIdAndData` (pré-existente, fora de escopo) não filtra tenant diretamente, mas o `atletaId` já foi validado contra o tenant em `resolveAtleta()` antes de chegar lá — sem brecha nova introduzida
  - verify: teste `lancaExcecaoQuandoAtletaDeOutroTenant` em `CheckinProntidaoServiceImplTest` — atleta de outro tenant resulta em `DomainNotFoundException`.
- [x] 8.2 Alinhamento com padrão da branch `fix-multi-tenancy-enforcement` — não aplicável: esta feature não introduz cache (sem `@Cacheable`/`CacheProperties` novo)
  - verify: revisão manual — nenhum finder de `CheckinProntidaoRepository` sem filtro de tenant.

## 9. Testes

- [ ] 9.1 Testes unitários do `ReadinessService`: score com diferentes combinações, classificação de níveis, fallback
  - verify: `./mvnw clean test` verde para a suíte do service.
- [ ] 9.2 Testes de integração do portão de elegibilidade: bloqueio por DESCANSAR, atenuação por CAUTELOSO, operação normal sem checkin
  - verify: suíte de integração do `IntervaladoElegibilidadeService` verde.
- [ ] 9.3 Testes do controller com MockMvc: criação idempotente, paginação de histórico, erro 400 em valores fora de faixa
  - verify: suíte do `CheckinController` verde.

## Gate de validação (aplicável a toda a change)

- `./mvnw clean test` verde (sem `-DskipTests`, sem `@SuppressWarnings` para mascarar).
- Todas as queries de checkin filtram `tenant_id` do `TenantContext`.
- Endpoints sob `/api/v1/`; contrato OpenAPI gerado sem erro.
- Migrations V46/V47 aplicam limpo (sem checksum mismatch) e têm bloco de rollback documentado.
