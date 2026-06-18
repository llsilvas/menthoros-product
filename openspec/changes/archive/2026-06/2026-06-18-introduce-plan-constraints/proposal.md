**Tamanho · Trilha:** M · Full

## Why

A redução de alucinação na geração de plano **não depende** de migrar os formatters para skills. O prompt de hoje **já produz** regras mandatórias — `## DECISAO INTERVALADO - INSTRUCAO OBRIGATORIA` (`[PROIBIDO]`/`[DEGRADADO]`), `## ⛔ TETO DE PACE (NÃO ULTRAPASSAR)`, `**INSTRUÇÃO OBRIGATÓRIA:** treine EXCLUSIVAMENTE nos dias…` — mas elas estão (a) **dispersas** no meio dos dados, (b) sem uma forma declarativa comum, e (c) **não verificadas** depois que o LLM responde.

Separando o valor: "anti-alucinação" são três melhorias, e só uma é o strangler.

```
ANTI-ALUCINAÇÃO (barato, alto impacto — esta change)        MANUTENIBILIDADE (o strangler)
  [A] consolidar regras num bloco mandatório no TOPO          [C] skills viram a FONTE das
  [B] PlanQualityChecker que verifica as regras                   constraints (migrate-plan-prompt-to-skills)
```

`[A]` e `[B]` usam os valores que os formatters **já calculam** — antes de qualquer migração. O que as torna independentes do strangler é introduzir a **`Constraint` declarativa como seam**: declarada uma vez (hoje pelos formatters, amanhã pelas skills), consumida nos dois lados — renderizada no bloco [1] do prompt **e** verificada pelo `PlanQualityChecker`. Quem produz a constraint pode trocar por baixo sem mexer no renderer nem no checker.

Esta change entrega o valor anti-alucinação **cedo e mensurável**, e deixa pronto o seam que o `migrate-plan-prompt-to-skills` vai estrangular.

## What Changes

- **`Constraint` declarativa (o seam):** tipo `Constraint(ConstraintKey key, String descricao, Map params)` — `descricao` alimenta o prompt; `key`+`params` alimentam o checker. Serializável (compatível com `SkillExecution`/`V32`). Keys iniciais: `INTERVALADO_PROIBIDO`, `INTERVALADO_MAX_CATEGORIA`, `PACE_TETO`, `DIAS_PERMITIDOS`, `MAX_CONSECUTIVOS`.
- **Formatters passam a emitir `Constraint`:** os blocos mandatórios de hoje (decisão de intervalado, teto de pace, dias permitidos) viram `Constraint` declaradas, sem mover lógica para skills. Adaptador fino — os valores já são calculados.
- **Bloco [1] consolidado no topo do prompt:** o renderer compõe um bloco único "REGRAS QUE VOCÊ NÃO PODE VIOLAR" no início, a partir das `Constraint`. As demais seções (dados/análise) permanecem como estão. **Diff grande e intencional no golden-master**, revisado de uma vez.
- **`PlanQualityChecker` por `key`:** verifica o plano gerado contra as `Constraint` declaradas (`ViolacaoQualidade` por violação), via dispatch por `key` sobre os `params`. Eval offline sobre fixtures de plano "bom"/"alucinado", sem chamar o LLM. **Verifica 4 keys** (`INTERVALADO_PROIBIDO`, `PACE_TETO`, `DIAS_PERMITIDOS`, `MAX_CONSECUTIVOS`); `INTERVALADO_MAX_CATEGORIA` é **declarada e renderizada** no prompt mas a verificação fica para fatia futura (precisa do mapa de categorias).
- **Sink da violação = métrica Micrometer/Prometheus:** o checker incrementa um contador por `key` (`violacoes_plano{key=...}`) no registry existente. Esta change **mede** a aderência em produção; **não age** sobre a violação (reparo/retry é `harden-plan-generation-resilience`) nem expõe ao treinador (sem mudança de entidade/DTO/UI).

## Critérios de aceite

- **CA1 — Constraint declarada** — *Given* uma regra mandatória derivada (intervalado/pace/dias), *When* o builder a produz, *Then* ela é uma `Constraint(key, descricao, params)`; uma permissão (intervalado elegível) emite **zero** constraints. *(verificável: teste de unidade dos formatters)*
- **CA2 — Bloco [1] no topo** — *Given* o prompt montado, *Then* as `Constraint` ativas aparecem num bloco "regras que não pode violar" no topo, e a regra **não** se repete dispersa no corpo. *(golden-master)*
- **CA3 — Checker detecta violação** — *Given* um plano que viola uma das 4 keys verificadas, *When* o `PlanQualityChecker` avalia, *Then* retorna `ViolacaoQualidade` com a `key`; plano "bom" → zero. Offline, sem LLM. *(fixtures)*
- **CA4 — Seam estável** — *Given* a fonte da `Constraint` muda (formatter→skill), *Then* renderer e checker permanecem inalterados. *(contrato — verificado quando o strangler rodar)*
- **CA5 — Métrica exposta** — *Given* uma geração de plano, *Then* o checker incrementa o contador Micrometer por `key` violada. *(teste de integração do contador)*
- **CA6 — Sem impacto de contrato** — `./mvnw clean test` verde; nenhum controller/DTO de API/entidade/migration alterado.

## Métrica de sucesso

**Métrica de entrega (verificável agora):** o `PlanQualityChecker` retorna 0 violações para fixtures de plano "bom" e detecta todas as violações esperadas nas fixtures "alucinadas" (4 keys) — a rede determinística existe e funciona.

**Métrica de aderência (a acompanhar pós-deploy, honesta):** taxa de violação por `key` (contador Micrometer) nas gerações reais. **Baseline:** auditar manualmente ~10–20 planos históricos para estimar a taxa de violação *antes* da consolidação; comparar com a taxa medida pós-deploy. *Sem eval ao vivo com LLM nesta change — a prova final da hipótese "regra no topo reduz alucinação" é a queda do contador em produção.*

## Open Questions & Assumptions

- **A1 (resolvida):** sink da violação = **contador Micrometer** por `key` (não entidade/UI). *(common-ground)*
- **A2 (resolvida):** `INTERVALADO_MAX_CATEGORIA` é declarada+renderizada mas **não verificada** nesta change (verificação precisa do mapa de categorias → fatia futura). *(common-ground)*
- **A3:** schema exato de `params` por `key` — **fechar na task 1.2 antes** das tasks 2.x (não pular). Mínimo: `PACE_TETO.teto` (map tipo→pace), `DIAS_PERMITIDOS.dias` (set), `MAX_CONSECUTIVOS.n` (int).
- **A4:** quais formatters emitem `Constraint` nesta change = **mínimo** (intervalado, pace-teto, dias); os demais ficam para o strangler.
- **Q1:** existe um conjunto de planos históricos auditável para a baseline (A-acima)? Se não, o "antes" fica como estimativa manual pontual.
- **R-janela:** `harden-plan-generation-resilience` toca o mesmo pós-geração — coordenar janela para evitar conflito no ponto de integração do checker (task 4.4).

## Capabilities

### Modified Capabilities

- `plan-generation`: as regras determinísticas que o plano deve respeitar passam a ser declaradas como `Constraint`, renderizadas num bloco mandatório no topo do prompt e verificadas após a geração — substituindo regras dispersas e não-verificadas por uma fonte única.

## Impact

**Backend (`apps/menthoros-backend`):**
- Novos tipos `Constraint` / `ConstraintKey` (records, serializáveis).
- Formatters de decisão (intervalado, pace-teto, disponibilidade) emitem `Constraint` além do texto atual.
- `PlanoTreinoPromptBuilder`: renderer compõe o bloco [1] no topo a partir das `Constraint`.
- Novo `PlanQualityChecker` (dispatch por `key`) + fixtures de eval offline.
- Golden-master de `add-plan-generation-eval-harness` **regenerado** (diff intencional da reestruturação).

**Dependências e ordem:**
- **Depende de `add-plan-generation-eval-harness`** — o golden-master protege a reestruturação do prompt.
- **Antes de `migrate-plan-prompt-to-skills`** — introduz o seam `Constraint` + checker que o strangler vai consumir; a migração troca a *fonte* (formatter→skill) por baixo do seam estável, sem tocar renderer/checker.
- **Hipótese mensurável:** consolidar regras no topo é prompt-engineering — o `PlanQualityChecker` é a métrica que prova se a aderência melhorou.

**Sem impacto em:** controllers, DTOs de API, entidades persistidas, migrations, frontend.
