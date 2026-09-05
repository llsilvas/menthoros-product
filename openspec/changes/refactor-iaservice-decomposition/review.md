# Revisão pré-implementação — IaService

Data: 2026-09-05. Status: **aguardando revisão e decisão de escopo**.

## Decisão

**NO-GO para aprovação do estado avaliado.** Este registro documenta a revisão solicitada;
não autoriza implementação nem marca correções como concluídas.

Base backend: `develop`, commit `05377511216406b2cd5aa6aee56869436df20f90`, árvore limpa.
Escopo: interface `IaService`, implementação `IaServiceImpl`, testes existentes e colaboradores
necessários para rastrear geração, normalização e persistência. As referências abaixo são
relativas a `apps/menthoros-backend` e correspondem a esse commit.

## Achados por severidade

### IA-01 — BLOCKER — Campos internos exigidos do LLM

- **Referências:** `src/main/java/br/com/menthoros/backend/services/impl/IaServiceImpl.java:260`;
  `src/main/java/br/com/menthoros/backend/mapper/TreinoMapper.java:204`.
- **Evidência:** o schema produzido por `buildSchemaTightInlineOrDefs` contém `provaId` em
  `required`, com `type=string`, `format=uuid`, sem alternativa `null`. Também exige `descricao`
  e `zonaAlvo`. O DTO documenta esses três campos como preenchidos pelo sistema. Os
  normalizadores preservam `provaId`; o mapper converte o UUID diretamente em referência a
  `Prova`, sem verificar pertença ao atleta/tenant nesse caminho. Sem provas na semana,
  `ProvaNoPlanoService.garantirProvasNaSemana` devolve a lista recebida.
- **Impacto:** UUID inventado pode quebrar a FK; um UUID existente pode criar vínculo indevido.
  A reprodução confirmou o schema; não houve teste de exploração cross-tenant nem evidência
  de ocorrência em produção.
- **Ação proposta:** separar o DTO de resposta do modelo dos campos internos de enriquecimento;
  rejeitar ou eliminar vínculos recebidos do LLM antes do mapper. Apenas o componente interno
  autorizado deve preencher `provaId`.
- **Verificação proposta:** schema sem campos internos; saída simulada com UUID inexistente ou
  de outro atleta/tenant não chega à persistência como vínculo; prova legítima inserida pelo
  sistema continua funcionando.

### IA-02 — MAJOR — Validação altera a zona de aceleração do fartlek

- **Referência:** `src/main/java/br/com/menthoros/backend/services/impl/IaServiceImpl.java:545`.
- **Evidência reproduzida:** expandir `4x (1min Z2 + 2min Z1)` gera aceleração com tipo
  `INTERVALADO`. A validação posterior associa esse tipo a Z4–Z5 independentemente de ser
  fartlek: no cenário com Z2=136–142 bpm, a FC passa de `136-142 bpm` para `155-165 bpm`.
- **Impacto:** a normalização muda a intensidade pretendida da etapa.
- **Ação proposta:** preservar a zona pretendida na expansão e utilizá-la na validação;
  definir explicitamente a regra de precedência entre tipo de etapa, tipo de treino e zona.
- **Verificação proposta:** testar expansão seguida de validação, incluindo fartlek leve,
  fartlek intenso e intervalado convencional, comparando a saída completa.

### IA-03 — MAJOR — Parser aceita correspondências parciais de tempo e distância

- **Referência:** `src/main/java/br/com/menthoros/backend/services/impl/IaServiceImpl.java:878`.
- **Evidência reproduzida:** `5 x 10 min forte + 2 min leve` retorna cinco repetições no
  detector de distância e distância unitária zero após arredondamento; `4x1.5km` também
  retorna distância zero. O padrão pode retroceder no número e aceitar somente seu prefixo.
  O caso existente com `5 x 2 min` não cobre esse comportamento.
- **Impacto:** série temporal ou distância decimal pode virar uma sequência com distância errada.
- **Ação proposta:** reconhecer tempo antes de distância e exigir correspondência completa
  do número/unidade; definir suporte a decimais e comportamento para entradas ambíguas.
- **Verificação proposta:** casos com 2 e 10 minutos, `400m`, `1.5km`, vírgula decimal se
  suportada, espaços, sinal `×` e texto inválido, sem fabricar distância zero silenciosamente.

### IA-04 — MAJOR — Estrutura de três etapas não exige PRINCIPAL

- **Referência:** `src/main/java/br/com/menthoros/backend/services/impl/IaServiceImpl.java:1406`.
- **Evidência reproduzida:** `AQUECIMENTO → RECUPERACAO → DESAQUECIMENTO` passa por
  `validarEstrutura3Etapas` com validação de ordem habilitada. O reparador devolve o original
  quando não há exatamente uma `PRINCIPAL`, confiando que o validador rejeitará. Para `LONGO`,
  a validação verifica somente a contagem.
- **Impacto:** uma estrutura sem estímulo principal pode ser aceita como válida.
- **Ação proposta:** validar os três tipos, cardinalidade e ordem, decidindo explicitamente a
  regra de `LONGO`; não presumir que o reparador garantiu essas invariantes.
- **Verificação proposta:** principal ausente, duplicada, tipo intermediário errado e ordem
  inválida devem ter resultado explícito, incluindo o fluxo de retry estrutural.

### IA-05 — MAJOR — Ajuste de distância preserva prescrições dependentes

- **Referência:** `src/main/java/br/com/menthoros/backend/services/impl/IaServiceImpl.java:788`.
- **Evidência por inspeção:** `distribuirDeltaPorTipo` reescreve a distância e preserva duração,
  ritmo e descrição da etapa. `clampDistanciaPorTipo` faz o mesmo. A checagem do triângulo
  posterior é agregada por treino e somente registra aviso.
- **Impacto:** a etapa final pode apresentar valores e instruções contraditórios.
- **Ação proposta:** definir a grandeza que governa cada etapa e recalcular as dependentes;
  aplicar validação final depois de todos os reparos, sem acrescentar intensidade apenas
  para fechar distância sem regra de domínio explícita.
- **Verificação proposta:** casos em que clamp e distribuição alteram distância devem manter
  coerência por etapa; conferir estabilidade ao reaplicar o normalizador.

### IA-06 — MAJOR — Chamador converte erro de domínio em indisponibilidade

- **Referência:** `src/main/java/br/com/menthoros/backend/services/impl/PlanoServiceImpl.java:161`.
- **Evidência por inspeção:** `IaServiceImpl` preserva `DomainRuleViolationException` após
  falha estrutural final; o método privado `PlanoServiceImpl.gerarPlanoSemanal` captura essa
  exceção em `catch (Exception)` e a converte em `LLMException`. O handler mapeia a primeira
  para 422 e a segunda para 503.
- **Impacto:** o fluxo externo perde a mensagem de domínio e informa indisponibilidade do provedor.
- **Ação proposta:** preservar a exceção de domínio no chamador. Esta correção altera o
  comportamento HTTP atual e precisa de decisão de contrato, fora da extração mecânica.
- **Verificação proposta:** falha estrutural esgotada chega ao endpoint como 422; falha real
  do provedor continua chegando como 503.

### IA-07 — MAJOR — Cobertura isolada não protege a composição das transformações

- **Referência:** `src/test/java/br/com/menthoros/backend/services/impl/IaServiceImplFartlekExpansaoTest.java:141`.
- **Evidência:** os testes específicos acessam métodos internos por reflexão. A expansão de
  fartlek é testada isoladamente e não detecta a mudança de FC aplicada depois dela. Os
  54 testes ligados à implementação passaram apesar das reproduções IA-02, IA-03 e IA-04.
- **Impacto:** testes verdes não demonstram que a sequência completa preserva a prescrição.
- **Ação proposta:** acrescentar caracterização pelo método público com LLM simulado e
  colaboradores determinísticos reais onde a composição importa; após extração, testar
  os contratos públicos dos colaboradores.
- **Verificação proposta:** saída completa, ordem dos reparos, retry, propagação de erros e
  contexto tenant; distinguir expectativas do legado das expectativas de correções aprovadas.

### IA-08 — MINOR — Contexto relido entre prompt e validação

- **Referência:** `src/main/java/br/com/menthoros/backend/services/impl/IaServiceImpl.java:370`.
- **Evidência por inspeção:** o prompt chama `TreinoHistoricoProvider.prepararContexto`;
  a validação consulta atleta e contexto novamente a cada tentativa.
- **Impacto:** consultas extras e possibilidade de prompt e validação usarem estados distintos
  caso haja atualização concorrente. Não foi reproduzida uma corrida em banco.
- **Ação proposta:** compartilhar um contexto imutável carregado uma vez, preservando o
  isolamento de tenant e a chamada externa fora de transação. Definir política de atualização
  antes de trocar releituras por snapshot, pois isso pode alterar comportamento.
- **Verificação proposta:** prompt e validação recebem os mesmos dados, incluindo no retry;
  sem transação aberta durante a chamada ao LLM.

### IA-09 — MINOR — Classe concentra responsabilidades demais

- **Referência:** `src/main/java/br/com/menthoros/backend/services/impl/IaServiceImpl.java:63`.
- **Evidência:** 1.608 linhas e 13 dependências; construção de schema, chamada externa,
  parsing e regras de normalização/validação coexistem no mesmo bean.
- **Impacto:** mudanças locais exigem compreender muitas responsabilidades e a ordem entre elas.
- **Ação proposta:** executar a decomposição já prevista nesta change, com colaboradores
  coesos para schema, normalização e validação e um orquestrador fino.
- **Verificação proposta:** caracterização preservada a cada extração; nenhuma correção de
  comportamento escondida em movimentação de código.

### IA-10 — MINOR — Método de lote não implementado retorna sucesso vazio

- **Referência:** `src/main/java/br/com/menthoros/backend/services/impl/IaServiceImpl.java:1603`.
- **Evidência:** `gerarPlanosEmLote` apenas registra aviso e retorna `Map.of()`; não foram
  encontrados consumidores no código de produção inspecionado.
- **Impacto:** um futuro chamador pode interpretar ausência de implementação como resultado válido.
- **Ação proposta:** decidir pela retirada do contrato obsoleto ou falha explícita; não
  implementar um segundo fluxo de lote por inferência desta revisão.
- **Verificação proposta:** confirmar consumidores antes da mudança; documentar o contrato
  escolhido e preservar o fluxo de lote efetivamente utilizado pelo produto.

## Conformidade OpenSpec e decisão de escopo pendente

A proposta atual é **estrutural, com preservação de comportamento**. IA-09 e a rede de
segurança de IA-07 se alinham ao escopo existente. IA-01 a IA-06 são correções de
comportamento; IA-08 e IA-10 também exigem decidir mudanças observáveis antes de implementá-las.

IA-01 contraria a decisão D2 do
[design de prova-no-plano-semanal](../archive/2026-09/2026-09-04-prova-no-plano-semanal/design.md):
os campos de enriquecimento não deveriam ser preenchidos pelo LLM.

**Recomendação para revisão:** priorizar IA-01 a IA-06 em correções identificadas separadamente,
protegidas por regressões, e executar a extração estrutural sobre o baseline corrigido. Se for
preferido ampliar esta change, atualizar primeiro proposal/design/tasks e os contratos afetados;
a promessa de saída idêntica deve ficar restrita à fase de extração. Não congelar os defeitos
conhecidos como resultados desejados em testes golden.

Para cada achado, registrar uma decisão antes da implementação: corrigir (com change responsável),
adiar com justificativa, ou descartar com evidência. O BLOCKER não pode ser tratado como resolvido
apenas porque a suíte existente está verde. A inclusão deste documento não toma essas decisões.

## Evidência de testes e reproduções

- `./mvnw clean test`, executado no backend em 2026-09-05 fora do sandbox: **BUILD SUCCESS**;
  **3.233 testes, 0 falhas, 0 erros, 0 ignorados**, duração 1min36s.
- Testes ligados a `IaServiceImpl`: **54**, todos passando.
- A primeira execução no sandbox falhou com restrições de portas locais/infraestrutura;
  a execução fora dele é a evidência válida de baseline.
- Reproduções Java locais, sem LLM real: schema de IA-01, expansão seguida de validação
  de FC de IA-02, parser de IA-03 e estrutura de IA-04.
- `verify` não foi executado nesta avaliação; os `*IT` não estão cobertos por este resultado.
- Logs locais temporários da sessão: `/tmp/iaservice-review-tests-unrestricted.log` e
  `/tmp/iaservice-review-probe.log`. Não são artefatos permanentes; os resultados relevantes
  estão transcritos acima. Nenhum arquivo de produção ou teste foi alterado pela revisão.

## Riscos residuais

- Sem chamadas reais ao provedor e sem confirmação dos defeitos em produção.
- Vínculo cross-tenant é risco identificado por inspeção, não exploração demonstrada.
- Os exemplos de FC demonstram alteração de dados pelo código, não validam clinicamente zonas.
- Linhas e baseline devem ser reconferidos caso haja commits posteriores à revisão.
- Não há aprovação de merge: faltam as decisões de escopo, implementação e evidências de
  validação final, incluindo `./mvnw clean verify` e revisão de impacto de contrato.
