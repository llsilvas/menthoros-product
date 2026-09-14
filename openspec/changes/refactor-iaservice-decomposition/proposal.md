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

## Decisão de escopo (2026-09-14, reverificação contra `develop` atual)

**Status: GO, escopo ampliado.** O relatório [review.md](review.md) (2026-09-05) registrou dez
achados (IA-01 a IA-10) e concluiu NO-GO. Antes de iniciar a implementação, cada achado foi
reverificado contra o `develop` real (pós `debito-tecnico-camada-ia`, `prova-no-plano-semanal` PR
#101, `planner-engine-enforcement`, `add-plan-generation-ledger`, `system-user-prompt-split` PR
#118) — os números de linha do relatório original estão defasados, mas o comportamento foi
confirmado linha a linha no código atual. Decisão: **corrigir os achados de comportamento
DENTRO da extração de cada colaborador afetado**, não como change separada — evita reabrir os
mesmos arquivos duas vezes, e cada correção fica isolada e testável exatamente no colaborador
para o qual está sendo movida.

| ID | Severidade | Status em 2026-09-14 | Decisão |
|---|---|---|---|
| IA-01 | BLOCKER | ✅ **Já resolvido** — `provaId`/`descricao`/`zonaAlvo` removidos do schema antes de `enforceAllRequired` (`IaServiceImpl.java:192-194`, prova-no-plano-semanal PR #101) | Nenhuma ação; confirmar que a extração do schema (seção 2) preserva a remoção |
| IA-02 | MAJOR | ❌ Confirmado presente — expansão de fartlek gera etapas `tipoEtapa=INTERVALADO` (linha ~1054), e `zonaEsperadaFC` força Z4-Z5 pra esse tipo **ignorando `tipoTreino`** (linha ~610) | **Corrigir na seção 4** (extração da validação de FC): `zonaEsperadaFC` passa a considerar o tipo de treino também para etapas rotuladas `INTERVALADO`, não só `PRINCIPAL` |
| IA-03 | MAJOR | ❌ Confirmado presente — `REPETICOES_PATTERN` casa por backtracking em `"5 x 10 min..."` e `"4x1.5km"`, gerando distância zero (reproduzido isoladamente) | **Corrigir na seção 3** (extração da normalização de intervalado): regex exige `\b` de fim de número e trata `min` como token completo, sem backtrack pro dígito errado |
| IA-04 | MAJOR | ❌ Confirmado presente — `validarEstrutura3Etapas` nunca checa que a etapa do meio é `PRINCIPAL` | **Corrigir na seção 5** (extração dos validadores por tipo): adicionar checagem explícita da etapa central |
| IA-05 | MAJOR | ❌ Confirmado presente — `clampDistanciaPorTipo`/`distribuirDeltaPorTipo` reescrevem `distanciaKm` preservando `duracaoMin`/`ritmoAlvo`; `validarTrianguloPaceDuracaoDistancia` só loga `warn`, nunca corrige | **Corrigir na seção 5**: após qualquer ajuste de distância, recalcular `duracaoMin` (ou vice-versa, a favor de manter `ritmoAlvo` como fonte de verdade) antes de retornar a etapa |
| IA-06 | MAJOR | ❌ Confirmado presente, **em forma diferente** do relatório original — o método privado `PlanoServiceImpl.gerarPlanoSemanal` (não o público `gerarPlanoTreino`) converte `DomainRuleViolationException` em `LLMException` no seu `catch (Exception e)` genérico, antes que o catch específico do método público (adicionado depois pelo ledger) possa vê-la | **Corrigir fora desta change** — `PlanoServiceImpl` não faz parte do escopo de arquivos desta decomposição (é `IaServiceImpl`); registrar como achado para change própria ou fix isolado |
| IA-07 | MAJOR | Coberto pelo desenho já existente | Seção 1 (rede de caracterização) já cobre pelo método público; reforçar que os testes novos por colaborador (seções 2-6) não substituem a caracterização de ponta a ponta |
| IA-08 | MINOR | Não reproduzido (risco por inspeção) | **Adiado** — releitura de contexto exige decisão de política própria (transformar em snapshot pode mudar comportamento sob concorrência); fora do escopo mecânico desta change |
| IA-09 | MINOR | É o próprio objetivo da change | Resolvido pela decomposição em si |
| IA-10 | MINOR | ❌ Confirmado presente, inalterado — `gerarPlanosEmLote` retorna `Map.of()` com `log.warn` | **Decidir e corrigir na seção 6** (orquestrador fino): sem consumidores encontrados em produção — remover o método do contrato de `IaService` ou lançar `UnsupportedOperationException` explícita, não devolver sucesso vazio |

**Fora do escopo desta change:** IA-06 (vive em `PlanoServiceImpl`, não em `IaServiceImpl`) e IA-08
(exige decisão de política de concorrência própria).

## What Changes

**Extrair construção de schema:**
- Novo `LlmJsonSchemaBuilder` (em `services/prompt` ou `services/helper`) com toda a lógica de `buildSchemaTightInlineOrDefs` + helpers `enforceAllRequired`/`putMin`/`putMax`/`putEnum`. `IaServiceImpl` passa a injetá-lo.

**Extrair validação/normalização do plano gerado:**
- Novo `PlanoLlmValidator` (orquestrador da validação) que recebe `PlanoSemanalLlmDto` + contexto do atleta (zonas FC, nível) e devolve o DTO normalizado/validado.
- Mover para `services/helper` os blocos coesos: validação de FC por etapa/zona, normalização de intervalado (`normalizarTreinoIntervalado`, `expandirEtapasAgregadas`, `reordenarEtapas`), reconciliação distância↔etapas, e os validadores por tipo de treino (intervalado/longo/regenerativo/contínuo) e de distribuição de carga semanal.
- Avaliar promover a validação por tipo de treino a `DomainSkill` se o input couber em record (ver `skills/`), reaproveitando a infraestrutura de skills.

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
