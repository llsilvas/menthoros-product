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

- [ ] 4.1 (TDD) `PlanQualityChecker.check(plano, List<Constraint>) → List<ViolacaoQualidade>` com dispatch por `key`
- [ ] 4.2 (TDD) Regras das **4 keys verificadas**: `PACE_TETO` (nenhuma etapa mais rápida que o teto), `INTERVALADO_PROIBIDO` (sem INTERVALADO), `DIAS_PERMITIDOS` (treino ∈ dias), `MAX_CONSECUTIVOS` (≤ N). `INTERVALADO_MAX_CATEGORIA` é declarada/renderizada mas **não verificada** aqui (precisa do mapa de categorias — fatia futura)
- [ ] 4.3 (TDD) Fixtures offline de plano "bom" (0 violações) e "alucinado" (violações esperadas), sem LLM — derivar de casos reais de alucinação quando possível (R7)
- [ ] 4.4 Integrar o checker ao fluxo de geração: incrementar contador **Micrometer** `violacoes_plano{key=...}` no registry existente (mede aderência). **Não agir** sobre a violação (reparo/retry = `harden-plan-generation-resilience`); sem entidade/DTO/UI
- [ ] 4.5 `./mvnw clean test`

## 5. Validação Final

- [ ] 5.1 `./mvnw clean test` verde
- [ ] 5.2 Golden-master estável após a reestruturação (diff revisado e aceito)
- [ ] 5.3 (MANUAL) Gerar um plano e confirmar o bloco [1] no topo; checker reporta aderência
- [ ] 5.4 Confirmar nenhum controller, DTO de API, entidade ou migration alterado
- [ ] 5.5 Atualizar este `tasks.md`
