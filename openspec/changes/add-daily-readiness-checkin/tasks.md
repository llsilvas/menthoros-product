## 1. Modelo de dados

- [ ] 1.1 Criar enum `NivelProntidao` com valores `PRONTO`, `CAUTELOSO`, `DESCANSAR` e interpretações associadas
  - verify: enum compila e cada valor tem descrição; teste referencia os três valores.
- [ ] 1.2 Criar entidade `CheckinProntidao` em `entity/` com campos subjetivos (sono 1-10, humor 1-10, dores 0-10, energia 1-10, estresse 0-10), `readinessScore` (BigDecimal 0-1), `nivelProntidao`, `observacoes` e `tenantId`
  - verify: `./mvnw clean compile` verde; mapeamento JPA reflete colunas da migration.
- [ ] 1.3 Criar migration `V46__Create_checkin_prontidao_table.sql` com tabela `tb_checkin_prontidao` e índices `(atleta_id, data)` e `(tenant_id)`
  - verify: `./mvnw flyway:info` (ou boot da app) aplica V46 sem checksum error; tabela criada.
- [ ] 1.4 Criar migration `V47__Add_readiness_to_metricas_diarias.sql` adicionando `readiness_score` e `nivel_prontidao` em `tb_metricas_diarias`
  - verify: colunas presentes em `tb_metricas_diarias` após boot; sem breaking em queries existentes.
- [ ] 1.5 Adicionar constraint UNIQUE `(atleta_id, data)` em `tb_checkin_prontidao`
  - verify: segundo insert no mesmo `(atleta, data)` viola a constraint (teste de repository).
- [ ] 1.6 Documentar rollback das migrations (comentário no topo de V46/V47): `DROP TABLE IF EXISTS tb_checkin_prontidao;` e `ALTER TABLE tb_metricas_diarias DROP COLUMN IF EXISTS readiness_score, DROP COLUMN IF EXISTS nivel_prontidao;`. Reversão de comportamento via feature flag no `ReadinessService` (ver 4.5) sem tocar em dados.
  - verify: bloco de comentário de rollback presente nos dois arquivos SQL.

## 2. DTOs e Mapper

- [ ] 2.1 Criar `CheckinProntidaoInputDto` com validações (@Min/@Max nos campos numéricos, @Size no texto)
  - verify: bean validation rejeita valores fora de faixa (teste do DTO / controller 400).
- [ ] 2.2 Criar `CheckinProntidaoOutputDto` com todos os campos + readiness calculado
  - verify: serialização JSON expõe `readinessScore` e `nivelProntidao`.
- [ ] 2.3 Criar `CheckinProntidaoMapper` MapStruct
  - verify: mapper compila (annotation processor) e converte input→entity→output em teste.

## 3. Repository

- [ ] 3.1 Criar `CheckinProntidaoRepository` com `findByAtletaIdAndData`, `findTopByAtletaIdOrderByDataDesc`, `findByAtletaIdAndDataBetween`
  - verify: `@DataJpaTest` cobre os três finders com dados de fixture.

## 4. Cálculo de readiness

- [ ] 4.1 Criar `ReadinessService` com método `calcularScore(CheckinProntidao)` retornando BigDecimal 0–1
  - verify: teste unitário com sinais extremos retorna 0..1 (limites inclusivos).
- [ ] 4.2 Definir função de ponderação inicial: sono 35%, energia 25%, humor 20%, dores 15%, estresse 5% (valores ajustáveis via `@ConfigurationProperties`)
  - verify: pesos lidos de properties; somatório dos pesos = 1.0 (teste).
- [ ] 4.3 Implementar `classificarNivel(BigDecimal score)`: `>= 0.75` → PRONTO, `0.50–0.74` → CAUTELOSO, `< 0.50` → DESCANSAR
  - verify: teste parametrizado cobre as três faixas incluindo bordas 0.75 e 0.50.
- [ ] 4.4 Persistir `readinessScore` e `nivelProntidao` no próprio checkin e também na `MetricasDiarias` do dia
  - verify: após salvar checkin, `MetricasDiarias` do dia tem os campos preenchidos (upsert idempotente por atleta+data).
- [ ] 4.5 Adicionar feature flag (`@ConfigurationProperties`, default habilitado) para desabilitar leitura de readiness no motor sem remover dados — suporte a rollback
  - verify: com flag off, portão de elegibilidade ignora readiness (teste).

## 5. Integração com motor de elegibilidade

- [ ] 5.1 Adicionar portão `readinessPermite()` em `IntervaladoElegibilidadeService` como sexto portão da decisão
  - verify: portão avaliado na decisão; teste cobre presença do portão.
- [ ] 5.2 Regra: `DESCANSAR` → bloqueio total de intervalado; `CAUTELOSO` → permite mas sinaliza atenuação de volume (20–30%)
  - verify: teste de integração — DESCANSAR bloqueia mesmo com demais portões OK; CAUTELOSO permite com flag de atenuação.
- [ ] 5.3 Expor motivo do bloqueio/atenuação no output do serviço para logging e prompt
  - verify: output carrega o motivo; contador Micrometer incrementa por resultado.
- [ ] 5.4 Fallback: se não há checkin do dia, motor opera com o comportamento atual (sem readiness) e registra WARN
  - verify: sem checkin → decisão idêntica ao baseline atual + log WARN (teste).

## 6. Integração com prompt builder

- [ ] 6.1 Adicionar seção `readiness` ao contexto montado por `PlanoTreinoPromptBuilder`
  - verify: prompt gerado contém a seção quando há checkin.
- [ ] 6.2 Incluir sequência compacta dos últimos 7 dias (ex: `[PRONTO, PRONTO, CAUTELOSO, DESCANSAR, CAUTELOSO, PRONTO, PRONTO]`)
  - verify: golden/asserção sobre a sequência dos 7 dias no contexto.
- [ ] 6.3 Incluir score do dia atual se houver; instrução obrigatória de considerar readiness baixo (instruction hardening)
  - verify: contexto contém score do dia e a instrução de não prescrever intensidade alta sob DESCANSAR.

## 7. Endpoints REST

- [ ] 7.1 Criar `CheckinController` em `controller/` sob `/api/v1/checkins`
  - verify: rota mapeada em `/api/v1/checkins` (não `/api/checkins`).
- [ ] 7.2 Endpoint `POST /api/v1/checkins` (cria ou atualiza checkin do dia; idempotente por (atleta, data))
  - verify: MockMvc — primeiro POST 201, segundo POST mesmo dia atualiza (sem duplicar).
- [ ] 7.3 Endpoint `GET /api/v1/checkins/{atletaId}/atual`
  - verify: MockMvc — retorna o mais recente ou 204/nulo quando não há.
- [ ] 7.4 Endpoint `GET /api/v1/checkins/{atletaId}?dias=N` (default 7, máx 90)
  - verify: MockMvc — default 7; `dias>90` limitado/validado.
- [ ] 7.5 Anotações OpenAPI e tratamento de erros via `GlobalExceptionHandler`
  - verify: `generate:api`/Swagger sem erro; 400 em faixa inválida tratado pelo handler.

## 8. Multi-tenancy

- [ ] 8.1 Garantir que todas as queries filtram por `tenant_id` do `TenantContext`
  - verify: teste — checkin de outro tenant não é retornado/alterado.
- [ ] 8.2 Alinhamento com padrão da branch `fix-multi-tenancy-enforcement` (cache segmentado por tenant quando aplicável)
  - verify: revisão de conformidade com o padrão consolidado (sem finder sem tenant).

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
