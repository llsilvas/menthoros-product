> Pré-requisito: `add-plan-generation-eval-harness` (golden-master). Entrega o valor anti-alucinação ANTES do strangler; deixa pronto o seam `Constraint` + checker que `migrate-plan-prompt-to-skills` vai consumir. Cada passo valida contra o golden-master (diffs intencionais revisados).

## 1. Contrato `Constraint` + `ConstraintKey`

- [x] 1.1 (TDD) Criar records `Constraint(ConstraintKey key, String descricao, Map<String,Object> params)` e enum `ConstraintKey` (`INTERVALADO_PROIBIDO`, `INTERVALADO_MAX_CATEGORIA`, `PACE_TETO`, `DIAS_PERMITIDOS`, `MAX_CONSECUTIVOS`); serializáveis
- [x] 1.2 Definir o schema de `params` por `key` (documentado no record/enum) — **não pular; fechar antes das tasks 2.x** (A3). Mínimo: `PACE_TETO.teto` (map tipo→pace), `DIAS_PERMITIDOS.dias` (set), `MAX_CONSECUTIVOS.n` (int)

## 2. Formatters emitem `Constraint`

- [x] 2.1 `IntervaladoElegibilidadeService`/decisão → emitir `Constraint` a partir de `RecomendacaoIntervalado` (Substituído → `INTERVALADO_PROIBIDO`; Degradado → `INTERVALADO_MAX_CATEGORIA`; Elegível → nenhuma)
- [x] 2.2 `PaceHistoricoFormatter.calcularTetoPorTipo` → `Constraint(PACE_TETO, params={teto por tipo})`
- [x] 2.3 `DisponibilidadePromptFormatter` → `Constraint(DIAS_PERMITIDOS, params={dias})` (+ `MAX_CONSECUTIVOS` se aplicável)
- [x] 2.4 Manter o texto/descrição equivalente ao `instrucaoParaLlm` atual (sem perda de conteúdo)

## 3. Bloco [1] consolidado no topo

- [x] 3.1 Renderer compõe "## ⛔ REGRAS QUE VOCÊ NÃO PODE VIOLAR" no topo a partir das `Constraint`
- [x] 3.2 Remover as regras das posições dispersas atuais (evitar duplicação no prompt)
- [x] 3.3 Golden-master: regenerar com diff intencional revisado (reestruturação)
- [x] 3.4 `./mvnw clean test`

## 4. `PlanQualityChecker`

- [x] 4.1 (TDD) `PlanQualityChecker.check(plano, List<Constraint>) → List<ViolacaoQualidade>` com dispatch por `key`
- [x] 4.2 (TDD) Regras das **4 keys verificadas**: `PACE_TETO` (nenhuma etapa mais rápida que o teto), `INTERVALADO_PROIBIDO` (sem INTERVALADO), `DIAS_PERMITIDOS` (treino ∈ dias), `MAX_CONSECUTIVOS` (≤ N). `INTERVALADO_MAX_CATEGORIA` é declarada/renderizada mas **não verificada** aqui (precisa do mapa de categorias — fatia futura)
- [x] 4.3 (TDD) Fixtures offline de plano "bom" (0 violações) e "alucinado" (violações esperadas), sem LLM — derivar de casos reais de alucinação quando possível (R7)
- [x] 4.4 Integrar o checker ao fluxo de geração: incrementar contador **Micrometer** `violacoes_plano{key=...}` no registry existente (mede aderência). **Não agir** sobre a violação (reparo/retry = `harden-plan-generation-resilience`); sem entidade/DTO/UI
- [x] 4.5 `./mvnw clean test`

## 5. Validação Final

- [x] 5.1 `./mvnw clean test` verde
- [x] 5.2 Golden-master estável após a reestruturação (diff revisado e aceito)
- [~] 5.3 (MANUAL, deferido — geração real com LLM; estrutura coberta offline pelo golden+checker) (MANUAL) Gerar um plano e confirmar o bloco [1] no topo; checker reporta aderência
- [x] 5.4 Confirmar nenhum controller, DTO de API, entidade ou migration alterado
- [x] 5.5 Atualizar este `tasks.md`

## 6. Follow-ups de QA (deferidos — não-bugs / melhorias)

> QA gate (code + security + clean-code) rodado. Corrigidos: double-compute eliminado (buildOptimizedPrompt
> retorna PromptGerado(prompt, regras); sem recomputar contexto pós-LLM), check() capturado+logado com
> atletaId, INTERVALADO_PROIBIDO cobre INTERVALADO/TIRO/SUBIDA/FARTLEK, JavaDoc órfão, PARAM_* package-private
> + accessor categoriaSegura(), guard de tamanho no parse de pace, testes de boundary (pace==teto, máx==limite,
> plano nulo, tipo desconhecido, round-trip PACE_TETO, key nula). Deferidos:

- [ ] 6.1 `Constraint.params` ainda é `Map<String,Object>` (accessor do record é público) — avaliar `sealed ConstraintParams` tipado se um 3º consumidor surgir.
- [ ] 6.2 `MAX_CONSECUTIVOS`: detecção é linear (não pega sequência circular SAB→DOM→SEG) e `maxConsecutivosConstraint` sempre emite (mesmo sem metaDados) — aceitável no MVP warn-only; revisar com a `harden`.
- [ ] 6.3 `descricaoLesao` (texto livre, truncado 80) entra na descrição da Constraint→prompt (pré-existente) — se Constraint vier a ser persistida, codificar em vez de texto literal.
- [ ] 6.4 Cosméticos: `switch`-expression em `calcularMaxDiasConsecutivos`; extrair constante do header do bloco; incremento de métrica inline (1 pass); `@ExtendWith(MockitoExtension)` no `ConstraintEmissionTest`.
