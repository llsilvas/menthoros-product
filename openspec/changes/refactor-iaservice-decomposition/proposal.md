## Why

`IaServiceImpl` cresceu para ~1500 linhas e concentra quatro responsabilidades distintas num único bean:

1. **Construção do JSON Schema** do output do LLM (`defaultJsonSchemaOptions`, `enforceAllRequired`, `putMin/putMax/putEnum`, `buildSchemaTightInlineOrDefs` — linhas ~77-247).
2. **Orquestração da geração** do plano semanal (`gerarPlanoSemanal`, `geraPlanoSemanalAvancado`, `gerarPlanosEmLote`).
3. **Validação e normalização** determinística da resposta do LLM (~1000 linhas: `validarENormalizarPlanoGerado`, validação de FC por zona, `normalizarTreinoIntervalado`, `expandirEtapasAgregadas`, `validarTreinoIntervalado/Longo/Regenerativo/Continuo`, `validarDistribuicaoCargaSemanal`).
4. Lógica auxiliar de parsing de descrição (fartlek, repetições, distância unitária).

Consequências: o método mais caro e crítico do sistema é difícil de testar (lógica de validação acoplada à chamada de IO/LLM), difícil de reusar (a mesma validação não pode ser aplicada fora do fluxo de geração) e arriscado de evoluir. A maior parte dessas ~1000 linhas é **determinística e sem IO** — exatamente o perfil de `services/helper` ou `DomainSkill`.

Esta change é puramente **estrutural (sem mudança de comportamento)**: a saída de geração de plano deve ser idêntica antes e depois.

> Relação com `debito-tecnico-camada-ia`: aquela change torna explícito o **roteamento de modelo** do `IaServiceImpl` (bean nomeado via `ModelRouter`). Esta change trata da **decomposição estrutural** da classe. Recomenda-se executar esta change **depois** de `debito-tecnico-camada-ia` para evitar conflito na mesma classe.

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

- `plano-semanal-generation`: **mesma saída observável**, internamente decomposta em colaboradores testáveis (schema builder, validador, normalizadores). Nenhuma mudança de contrato de API.

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

- **Regressão silenciosa na geração de plano** (impacto Alto): congelar a saída com testes de caracterização (golden) sobre `geraPlanoSemanalAvancado` ANTES de mover código; rodar `./mvnw clean test` a cada extração.
- **Conflito com `debito-tecnico-camada-ia` na mesma classe** (impacto Médio): sequenciar — executar esta change após o merge daquela; rebase antes de iniciar.
- **Acoplamento escondido entre os blocos de validação** (impacto Médio): extrair um colaborador por vez, com testes verdes entre cada passo; não mover tudo num commit só.
