## Context

`PlanoTreinoPromptBuilder.buildOptimizedPrompt` (533 linhas) já injeta regras mandatórias no prompt, mas dispersas e em prosa ad-hoc: decisão de intervalado (`formatarDecisaoIntervalado`, com `[PROIBIDO]`/`[DEGRADADO]`/`[AUTORIZADO]`), teto de pace (`formatarTetoPace`, "⛔ NÃO ULTRAPASSAR"), dias permitidos (`DisponibilidadePromptFormatter`, "INSTRUÇÃO OBRIGATÓRIA"). Os valores são calculados deterministicamente (skill de intervalado, `calcularTetoPorTipo`, `diasEfetivos`). Nada verifica, depois, se o LLM obedeceu.

Esta change introduz a abstração que falta — `Constraint` — e a usa para (A) consolidar as regras num bloco no topo e (B) verificá-las após a geração. Não migra lógica para skills (isso é o `migrate-plan-prompt-to-skills`); apenas declara, consolida e verifica o que já existe.

## Goals

- Declarar as regras mandatórias como `Constraint` (forma única, serializável).
- Consolidar as `Constraint` num bloco mandatório no topo do prompt (anti-alucinação).
- Verificar o plano gerado contra as `Constraint` (`PlanQualityChecker`).
- Deixar pronto o **seam** que o strangler vai consumir trocando a fonte das `Constraint`.

## Non-Goals

- Migrar formatters para skills (escopo de `migrate-plan-prompt-to-skills`).
- Reparo/retry de violações estruturais de etapas (escopo de `harden-plan-generation-resilience`).
- Eval ao vivo com LLM real (Pós-MVP).

## D1 — `Constraint` como seam: `key + descrição + params`

Uma `Constraint` tem duas metades — a **descrição** (→ prompt) é uniforme; a **verificação** (→ checker) é heterogênea e fecha sobre dados próprios. Um `Predicate` puro quebraria a serialização (a `SkillExecution`/`V32` persiste resultados). Então:

```
Constraint {
  ConstraintKey  key;          // INTERVALADO_PROIBIDO, INTERVALADO_MAX_CATEGORIA,
                               // PACE_TETO, DIAS_PERMITIDOS, MAX_CONSECUTIVOS…
  String         descricao;    // → bloco [1] do prompt  (o instrucaoParaLlm de hoje)
  Map<String,?>  params;       // teto-por-tipo / set-de-dias / tipoFallback / N  (serializável)
}
        │
        ▼
PlanQualityChecker faz dispatch por `key` → avalia `params` contra o plano gerado
```

A **declaração** (key + descrição + params) é a fonte única; o **algoritmo** de verificação vive no checker mas é *dirigido* pela constraint (lê o limiar/conjunto dos `params`, não reimplementa). Meio-termo entre "texto opaco" (não verificável) e "predicate puro" (não serializável).

**Validação em 3 domínios de formatos diferentes** (confirma que a forma generaliza):

```
DOMÍNIO         CONSTRAINT (predicado)                      ESCOPO              SEVERIDADE?
────────────    ─────────────────────────────────────      ─────────────────   ──────────────
pace-ceiling    ritmoAlvo[tipo] não mais rápido que teto    por etapa (numérico) não — regra de dado
interval-elig.  Substituído: plano NÃO contém INTERVALADO    presença/categoria   sim → constraint
                Degradado:  intervalado ≤ categoriaSegura      no plano             (lesão = BLOCKER)
                Elegível:   (permissão — emite 0 constraints)
disponibilidade treino.diaSemana ∈ diasEfetivos             conjunto (membership) não — regra dura
                ≤ N dias consecutivos                        agregado da semana
```

- "Mandatório independente de severidade" vale nos três → consolidar só por severidade falharia; por isso `Constraint` explícita.
- `List<Constraint>` é **0..N**: Elegível (permissão) e dia-preferido-longo (advisory) emitem **zero**.
- A `RecomendacaoIntervalado` (sealed, com `instrucaoParaLlm`) já é praticamente um carregador de `Constraint` — bom template; é a 1ª a virar `Constraint`.

## D2 — Bloco [1] consolidado no topo (o lever anti-alucinação)

O renderer compõe um bloco único no início do prompt:

```
## ⛔ REGRAS QUE VOCÊ NÃO PODE VIOLAR
- <descricao da Constraint 1>
- <descricao da Constraint 2>
…
(estas regras são determinísticas e substituem qualquer raciocínio independente)
```

As demais seções (dados, análise) permanecem onde estão nesta change — o foco é tirar as regras do meio do texto e pô-las no topo, consolidadas. É uma **hipótese de prompt-engineering** (LLM respeita mais regra proeminente); o `PlanQualityChecker` (D3) é a métrica que a valida. Gera **diff grande e intencional** no golden-master, revisado de uma vez.

## D3 — `PlanQualityChecker` dirigido por `key`

`check(PlanoSemanalLlmDto, List<Constraint>) → List<ViolacaoQualidade>`. Dispatch por `key`:
- `PACE_TETO` → nenhuma etapa mais rápida que o teto por tipo (lê `params.teto`).
- `INTERVALADO_PROIBIDO` → plano não contém `INTERVALADO`.
- `DIAS_PERMITIDOS` → todo treino em `params.dias`.
- `MAX_CONSECUTIVOS` → agregado da semana ≤ `params.n`.

Eval offline sobre fixtures de plano "bom" (0 violações) e "alucinado" (violações esperadas), sem LLM. A regra de cada `key` é definida aqui — o strangler depois não reimplementa o checker, só troca quem emite a `Constraint`.

**Escopo de verificação (common-ground):** verifica **4 keys** — `INTERVALADO_PROIBIDO`, `PACE_TETO`,
`DIAS_PERMITIDOS`, `MAX_CONSECUTIVOS`. `INTERVALADO_MAX_CATEGORIA` é declarada+renderizada no prompt
mas **não verificada** aqui (precisa do mapa de categorias de intervalado → fatia futura).

**Sink (common-ground):** o checker incrementa um contador **Micrometer** `violacoes_plano{key=...}` no
registry existente — mede a aderência em produção. **Não age** sobre a violação (reparo = `harden`) nem
persiste/expõe ao treinador (sem entidade/DTO/UI). Valor desta change = seam + consolidação +
**instrumentação** da aderência.

## D4 — Onde mora, e relação com as vizinhas

- O seam `Constraint` é consumido por dois pontos estáveis (renderer [1] + checker); a fonte é trocável.
- **`add-plan-generation-eval-harness` (depende):** golden-master protege a reestruturação do prompt.
- **`migrate-plan-prompt-to-skills` (vem depois):** troca a fonte das `Constraint` de formatter→skill, por baixo do seam; renderer e checker não mudam. As "regras do checker por domínio" que estavam no migrate **nascem aqui**.
- **`harden-plan-generation-resilience` (irmã, independente):** trata violações *estruturais* de etapas (3 etapas, repeticoes) com reparo+retry — concern distinto das `Constraint` de coaching; ambas tocam o pós-geração, coordenar janela.

**Aberto (fatia a fatia):** schema exato de `params` por `key`; quais formatters emitem `Constraint` nesta change (mínimo: intervalado, pace-teto, dias) vs. quais ficam para o strangler.

## Riscos e mitigações (inclui pré-mortem the-fool)

> Pré-mortem — "a change foi entregue e a alucinação não caiu / algo quebrou. Por quê?"

- **R1 — Consolidar no topo não reduz alucinação** (a hipótese de prompt-engineering falha). *Mitigação:*
  o contador Micrometer (CA5) + baseline manual tornam isso **mensurável** pós-deploy; se a taxa não cair,
  a evidência aponta para `harden` (reparo+retry) como o lever real — esta change não promete a queda,
  entrega o seam + a métrica que decide.
- **R2 — Perda de conteúdo ao migrar texto→`Constraint`** (descrição empobrece vs. `instrucaoParaLlm` atual).
  *Mitigação:* task 2.4 exige descrição equivalente ao texto de hoje; golden-master pega qualquer perda no diff.
- **R3 — Diff gigante do golden-master mascara um erro real** na reestruturação do prompt. *Mitigação:*
  revisar o diff por seção (regras movidas vs. removidas) e confirmar que nenhuma regra sumiu; o checker
  sobre fixtures dá uma segunda rede.
- **R4 — Duplicação de regra** (bloco [1] no topo **e** texto disperso não removido). *Mitigação:* task 3.2
  remove as posições antigas; golden-master confirma ausência de repetição (CA2).
- **R5 — `params` mal especificado** quebra o dispatch do checker (ex.: `PACE_TETO.teto` com chave de tipo
  divergente entre formatter e checker). *Mitigação:* fechar o schema na task 1.2 **antes** das 2.x (A3);
  teste de contrato sobre cada `key`.
- **R6 — Conflito de merge com `harden`** no ponto de integração pós-geração (task 4.4). *Mitigação:*
  coordenar janela; manter o ponto de integração mínimo (só incrementa contador) para reduzir superfície.
- **R7 — Checker passa 100% nas fixtures mas LLM alucina em produção** (fixtures não representam o real).
  *Mitigação:* fixtures derivadas de casos reais de alucinação observados (ex.: o 503 do REGENERATIVO);
  a métrica de produção é a validação final, não as fixtures.
