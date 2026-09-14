**Tamanho:** L · **Trilha:** Full (ampliada em 2026-09-14 — ver "Decisão de escopo")

## Why

`IaServiceImpl` cresceu para ~1700 linhas (medido em `develop` 2026-09-14, pós `system-user-prompt-split`) e concentra quatro responsabilidades distintas num único bean:

1. **Construção do JSON Schema** do output do LLM (`defaultJsonSchemaOptions`, `enforceAllRequired`, `putMin/putMax/putEnum`, `buildSchemaTightInlineOrDefs` — linhas ~77-247).
2. **Orquestração da geração** do plano semanal (`gerarPlanoSemanal`, `geraPlanoSemanalAvancado`, `gerarPlanosEmLote`).
3. **Validação e normalização** determinística da resposta do LLM (~1000 linhas: `validarENormalizarPlanoGerado`, validação de FC por zona, `normalizarTreinoIntervalado`, `expandirEtapasAgregadas`, `validarTreinoIntervalado/Longo/Regenerativo/Continuo`, `validarDistribuicaoCargaSemanal`).
4. Lógica auxiliar de parsing de descrição (fartlek, repetições, distância unitária).

Consequências: o método mais caro e crítico do sistema é difícil de testar (lógica de validação acoplada à chamada de IO/LLM), difícil de reusar (a mesma validação não pode ser aplicada fora do fluxo de geração) e arriscado de evoluir. A maior parte dessas ~1000 linhas é **determinística e sem IO** — exatamente o perfil de `services/helper` ou `DomainSkill`.

Esta change é **estrutural, com cinco correções de comportamento pontuais e deliberadas**
(IA-02, IA-03, IA-04, IA-05, IA-10 — ver "Decisão de escopo" abaixo), cada uma isolada no
colaborador para o qual o código relevante é extraído. Fora dessas correções nomeadas, a saída de
geração de plano deve ser idêntica antes e depois.

> Relação com `debito-tecnico-camada-ia`: aquela change tornou explícito o **roteamento de modelo** do `IaServiceImpl` (bean nomeado via `ModelRouter`) e **já está mergeada em `develop`** — não há mais conflito de sequenciamento a gerenciar.

## Decisão de escopo (2026-09-14, reverificação contra `develop` atual — 2 rodadas de DoR)

**Status: GO, escopo ampliado.** O relatório [review.md](review.md) (2026-09-05) registrou dez
achados (IA-01 a IA-10) e concluiu NO-GO. Cada achado foi reverificado contra o `develop` real
(pós `debito-tecnico-camada-ia`, `prova-no-plano-semanal` PR #101, `planner-engine-enforcement`,
`add-plan-generation-ledger`, `system-user-prompt-split` PR #118) em duas rodadas: a 1ª
(spec-reviewer) confirmou a classificação linha a linha; a 2ª (Codex adversarial) achou que a 1ª
versão desta tabela tinha **três fixes incompletos** — corrigidos abaixo. Decisão: **corrigir os
achados de comportamento DENTRO da extração de cada colaborador afetado**, não como change
separada.

| ID | Severidade | Status em 2026-09-14 | Decisão |
|---|---|---|---|
| IA-01 | BLOCKER | ✅ **Já resolvido** — `provaId`/`descricao`/`zonaAlvo` removidos do schema antes de `enforceAllRequired` (`IaServiceImpl.java:192-194`, prova-no-plano-semanal PR #101) | Nenhuma ação; confirmar que a extração do schema (seção 2) preserva a remoção |
| IA-02 | MAJOR | ❌ Confirmado presente, **em duas frentes** — (a) expansão de fartlek gera etapas `tipoEtapa=INTERVALADO` e `zonaEsperadaFC` força Z4-Z5 pra esse tipo ignorando `tipoTreino`; (b) achado do Codex na 2ª rodada: a etapa `RECUPERACAO` do fartlek tem zona explícita computada na expansão (`zonaParaFc(fp.zonaRecuperacao(),...)`, ex. Z2), mas `zonaEsperadaFC` força **Z1 fixo pra qualquer `RECUPERACAO`, também ignorando `tipoTreino`** — meu 1º fix só cobria (a) | **Corrigir na seção 4**: `zonaEsperadaFC` passa a considerar `tipoTreino` tanto pra `INTERVALADO` quanto pra `RECUPERACAO` — em `FARTLEK`, `RECUPERACAO` aceita Z1-Z2 (não só Z1) |
| IA-03 | MAJOR | ❌ Confirmado presente — `REPETICOES_PATTERN` casa por backtracking em `"5 x 10 min..."` e `"4x1.5km"` (reproduzido isoladamente, e a correção também testada isoladamente) | **Corrigir na seção 3**: grupo do número vira atômico — `(?>(\d+(?:\.\d+)?))` — impede o backtracking pro dígito errado que hoje escapa do `(?!\s*min)`; testado contra os 2 casos quebrados + os 3 que já funcionavam (`6x400m`, `8-12× 400m`, `10-15× 200m`) |
| IA-04 | MAJOR | ❌ Confirmado presente, **e mais abrangente do que a 1ª versão desta tabela assumia** — achado do Codex: `validarTreinoLongo` chama `validarEstrutura3Etapas(..., validarOrdem=false)`, e meu 1º fix só adicionava a checagem de `PRINCIPAL` quando `validarOrdem=true` — ou seja, LONGO continuaria aceitando `AQUECIMENTO→RECUPERACAO→DESAQUECIMENTO`. Verificado: `PlanoEstruturaReparador` (o reparo que roda antes da validação) trata LONGO **identicamente** aos outros 3 tipos (`TIPOS_3_ETAPAS = {REGENERATIVO, CONTINUO, TEMPO_RUN, LONGO}`) — não há razão de domínio pra LONGO ser exceção | **Corrigir na seção 5**: a checagem de `PRINCIPAL` no meio passa a ser **incondicional** (não gated por `validarOrdem`) — remove a distinção artificial de LONGO |
| IA-05 | MAJOR | ❌ Confirmado presente — `clampDistanciaPorTipo`/`distribuirDeltaPorTipo` reescrevem `distanciaKm` preservando `duracaoMin`/`ritmoAlvo`; `validarTrianguloPaceDuracaoDistancia` só loga `warn` a nível de treino agregado, nunca corrige a etapa | **Corrigir na seção 5 — regra decidida (fechava um gap do spec-reviewer):** `ritmoAlvo` é a fonte de verdade quando presente na etapa — após ajustar `distanciaKm`, recalcular `duracaoMin = distanciaKm ÷ paceMedio(ritmoAlvo)`; se `ritmoAlvo` for `null`, `duracaoMin` não é tocado (mantém o valor atual, já que não há pace pra recalcular a partir dele) |
| IA-06 | MAJOR | ❌ Confirmado presente, **e é pré-requisito funcional de IA-04, não um achado independente** — achado do Codex: fixar IA-04 rejeita MAIS planos por estrutura inválida (correto); após esgotar o retry, `PlanoResilienceService` lança `DomainRuleViolationException`, mas o método privado `PlanoServiceImpl.gerarPlanoSemanal` (que envolve a chamada ao `IaService`) tem só `catch(InterruptedException)`/`catch(LLMException)`/`catch(Exception e)` genérico — sem clause pra `DomainRuleViolationException`, que cai no genérico e vira `LLMException`, chegando ao treinador como **503** em vez de **422**. Sem esse fix, IA-04 pioraria a experiência (mais planos rejeitados, todos mascarados como "indisponibilidade do provedor") | **Entra no escopo — fix mínimo isolado, fora da extração mecânica:** adicionar `catch (DomainRuleViolationException e) { throw e; }` em `PlanoServiceImpl.gerarPlanoSemanal`, espelhando o catch que já existe no método público `gerarPlanoTreino`. Arquivo `PlanoServiceImpl` não faz parte da decomposição de `IaServiceImpl`, mas o fix é 3 linhas e desbloqueia IA-04 corretamente |
| IA-07 | MAJOR | Coberto pelo desenho já existente | Seção 1 (rede de caracterização) já cobre pelo método público; reforçar que os testes novos por colaborador (seções 2-6) não substituem a caracterização de ponta a ponta — em particular, IA-02(b) e IA-04/LONGO só foram achados por raciocínio de composição (expansão→validação, reparo→validação), não por teste isolado, confirmando a preocupação original do IA-07 |
| IA-08 | MINOR | Não reproduzido (risco por inspeção) | **Adiado** — releitura de contexto exige decisão de política própria (transformar em snapshot pode mudar comportamento sob concorrência); fora do escopo mecânico desta change |
| IA-09 | MINOR | É o próprio objetivo da change | Resolvido pela decomposição em si |
| IA-10 | MINOR | ❌ Confirmado presente, inalterado — `gerarPlanosEmLote` retorna `Map.of()` com `log.warn`; zero consumidores confirmados por grep em `src/main/java` além da própria interface/implementação | **Corrigir na seção 6**: remover o método do contrato de `IaService`/`IaServiceImpl` — contrato obsoleto, não fallback silencioso nem exceção nova para um método que pode simplesmente não existir |

**Fora do escopo desta change:** apenas IA-08 (exige decisão de política de concorrência própria,
sem bug reproduzido). Todo o resto (IA-01 a IA-07, IA-09, IA-10) é resolvido ou corrigido aqui.

## Métrica de sucesso

Nas duas semanas seguintes ao merge, zero incremento no contador `plano_violacao_estrutural`
(Micrometer, já existente) atribuível a LONGO ou aos tipos "3 etapas" — hoje ele não captura essas
violações porque `validarEstrutura3Etapas` não as detecta (IA-04). Nenhuma ocorrência nova de
plano rejeitado por estrutura chegando como 503 ao invés de 422 (IA-06) — verificável pelo
`GenerationOutcome` gravado em `tb_llm_call` (add-plan-generation-ledger): `REJECTED_POST_LLM`
correto vs. `PERSIST_ERROR` incorreto para o mesmo tipo de falha.

## Rollback

Sem migration nem mudança de contrato de API — reversão é `git revert` do(s) commit(s) de merge.
As 5 correções de comportamento (IA-02/03/04/05/10) e o fix isolado de IA-06 são funcionalmente
independentes da extração estrutural (cada uma vive na função pura que foi movida, não na
movimentação em si) — se algo quebrar em produção, é possível reverter só a correção específica
sem desfazer a decomposição inteira, revertendo o commit daquela seção (2-6 são commits
separados).

## What Changes

**Extrair construção de schema:**
- Novo `LlmJsonSchemaBuilder` (em `services/prompt` ou `services/helper`) com toda a lógica de `buildSchemaTightInlineOrDefs` + helpers `enforceAllRequired`/`putMin`/`putMax`/`putEnum`. `IaServiceImpl` passa a injetá-lo.

**Extrair validação/normalização do plano gerado:**
- Novo `PlanoLlmValidator` (orquestrador da validação) que recebe `PlanoSemanalLlmDto` + contexto do atleta (zonas FC, nível) e devolve o DTO normalizado/validado.
- Mover para `services/helper` os blocos coesos: validação de FC por etapa/zona, normalização de intervalado (`normalizarTreinoIntervalado`, `expandirEtapasAgregadas`, `reordenarEtapas`), reconciliação distância↔etapas, e os validadores por tipo de treino (intervalado/longo/regenerativo/contínuo) e de distribuição de carga semanal.
- **Decisão (fecha a ambiguidade "avaliar" de uma versão anterior desta proposta):** os validadores
  extraídos **ficam como classes `services/helper` comuns nesta change**, não viram `DomainSkill`.
  O input de cada validador não cabe limpo num record hoje (depende de `PlanoSemanalLlmDto` +
  contexto do atleta mutável entre chamadas) — forçar o encaixe em `DomainSkill` agora ampliaria
  ainda mais uma change já grande (L). Migração pra `DomainSkill` fica como follow-up natural
  quando/se `semantic-session-schema` (F4) mudar o formato do DTO de saída.

**`IaServiceImpl` vira orquestrador fino:**
- Monta prompt (via `PlanoTreinoPromptBuilder`) → chama LLM com schema (via `LlmJsonSchemaBuilder` + `ModelRouter`) → delega validação/normalização (`PlanoLlmValidator`) → retorna DTO. Alvo: bem abaixo de ~400 linhas.

**Cobertura de testes:**
- Testes unitários dedicados para cada colaborador extraído (validação de FC, normalização de intervalado, distribuição de carga), que hoje só são exercitados indiretamente.

## Capabilities

### Modified Capabilities

- `plano-semanal-generation`: internamente decomposta em colaboradores testáveis (schema builder, validador, normalizadores), com 5 correções pontuais de comportamento (IA-02/03/04/05/10). Nenhuma mudança de contrato de API.

## Impact

**Código alterado:**
- `IaServiceImpl`: remoção dos blocos de schema e de validação/normalização; passa a injetar os novos colaboradores.
- `PlanoServiceImpl`: fix isolado de 3 linhas em `gerarPlanoSemanal` (IA-06) — fora da decomposição mecânica, mas pré-requisito funcional de IA-04.

**Arquivos novos:**
- `services/prompt/LlmJsonSchemaBuilder.java` (ou `services/helper/`)
- `services/helper/PlanoLlmValidator.java`
- `services/helper/` validadores/normalizadores extraídos (intervalado, FC por zona, distribuição de carga) — quantidade definida no design.
- Testes correspondentes em `src/test/.../services/helper/`.

**Sem impacto em API:** nenhum endpoint novo ou alterado; refactor interno à camada de serviço. Sem mudança de schema de banco.

## Riscos e mitigações

- **Regressão silenciosa não-intencional** (impacto Alto): congelar a saída com testes de
  caracterização (golden) sobre `geraPlanoSemanalAvancado` ANTES de mover código, cobrindo
  especificamente os 5 cenários que vão mudar de comportamento de propósito (fartlek IA-02, parser
  IA-03, estrutura IA-04, triângulo IA-05, lote IA-10) — o golden trava o comportamento ATUAL
  nesses cenários antes da correção (TDD vermelho), então a correção o move pro comportamento
  correto (verde); todo o resto do golden deve permanecer byte-idêntico. Rodar
  `./mvnw clean test` a cada extração.
- **Confundir bug fixado com regressão introduzida:** cada correção (IA-02/03/04/05/10) precisa de
  um teste que falha ANTES da correção (prova de que o bug existia) e passa DEPOIS — não just
  "mudar o golden e seguir".
- **Acoplamento escondido entre os blocos de validação** (impacto Médio): extrair um colaborador por vez, com testes verdes entre cada passo; não mover tudo num commit só.
