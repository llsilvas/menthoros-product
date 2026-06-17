## Context

Estado real (2026-06-16):

- `PlanoTreinoPromptBuilder.buildOptimizedPrompt(Atleta, PlanoMetaDados, Prova, LocalDate, List<DiaSemana>)` — 533 linhas; agrega 8 formatters + `IntervaladoElegibilidadeService`. Monta um `historicoFinal` na ordem: alertas → hierarquia → evento → restrições lesão → decisão intervalado → histórico/dados. Sem testes.
- Skills do plano em sombra: `IntervaladoElegibilidadeService` e `MetricasAlertaService` chamam a skill correspondente só para log (D6 "delegação paralela"), com `UUID.randomUUID()` como atletaId/tenantId, e descartam o `SkillResult`.
- `SkillOrchestratorService.execute(List<DomainSkill<?,?>>, SkillContext)` → `List<SkillResult<?>>`, persiste `SkillExecution`. Mas chama `skill.execute(null, context)` — **não passa input tipado**. Skills do plano exigem inputs (ex.: `IntervaladoElegibilidadeInput`, `RecoveryCargaInput`).
- `AthleteAnalysisSnapshot(atletaId, dataReferencia, List<SkillResult<?>>)` — hoje só `toPromptSummary()` (plano demais), `hasBlocker()`, `hasCritical()`.

## D1 — Snapshot prompt-capable: renderer de três camadas, duas fontes

A serialização atual (`toPromptSummary`) é uma lista plana `[SEVERITY] skillKey: payload`. Ela não reproduz a semântica do prompt atual, e — mais importante — o prompt mistura **dois tipos de conteúdo** que não cabem na mesma forma:

- **Decisões/constraints** (elegibilidade de intervalado, descanso obrigatório, teto de pace, dias permitidos): têm severidade, evidência, recomendação → encaixam no `SkillResult`. São o que o LLM **não pode** sobrescrever.
- **Dados/contexto** (zonas fisiológicas, volume das 3 semanas, histórico de pace, dados da prova): apresentação de dados do atleta. **Não têm severidade nem decisão** — forçá-los em `SkillResult` com `severity=INFO` de mentira é prego quadrado.

**Decisão: `SnapshotPromptRenderer` dedicado, com TRÊS camadas e DUAS fontes.**

```
renderer(snapshot, inputs)            ← Opção B: dois canais
  snapshot = List<SkillResult>  (decisões)
  inputs   = atleta / metaDados / histórico  (dados, já construídos pelo runner do D2)

  → [1] CONSTRAINTS MANDATÓRIAS (topo)  ← Constraints declaradas (ver D7) + assessments BLOCKER/CRITICAL
        bloco "REGRAS QUE VOCÊ NÃO PODE VIOLAR" (equivale aos [PROIBIDO]/[FORBIDDEN] de hoje)
  → [2] ANÁLISE / ADVISORY (meio)       ← results WARNING/INFO + recommendations
  → [3] DADOS / CONTEXTO (base)         ← renderizado direto dos inputs (não via skill)
```

Implicações:
- O record `AthleteAnalysisSnapshot` permanece limpo; a formatação vive no renderer testável.
- **Um domínio pode alimentar mais de uma camada** — ex.: `pace-ceiling` contribui com o teto em [1] (constraint) e a tabela de histórico em [3] (dado).
- **Nem todo domínio vira `DomainSkill`.** A skill é o lar da *decisão*; o resíduo de *formatação de dado* (zonas, volume, histórico) permanece como **helper de formatação enxuto** (função testável), apenas movido para alimentar a camada [3]. Isso encolhe o escopo do strangler: cada incremento extrai a **decisão/constraint** para uma skill e deixa o dado como helper, em vez de criar uma skill monolítica por formatter.

Aberto (refinar quando chegar lá): se [2] advisory continua como camada própria ou colapsa (em [1] como "considerações" ou inline com os dados em [3]). Decisão registrada: começar com as três camadas separadas.

## D2 — Inputs reais + fim da execução-sombra

- Introduzir mappers entidade→input por skill (`Atleta`/`PlanoMetaDados`/histórico → `*Input`), seguindo a regra "JPA não cruza para a skill".
- Resolver o null-input do orquestrador: ou um overload `execute(List<SkillInvocation>, ctx)` com input pré-construído, ou um runner dedicado de plano que monta inputs e invoca as skills. (Mesma decisão D1 que estava na finada `wire-skills-into-plan-generation` — recomendação: runner dedicado, sem alterar o contrato já testado do orquestrador.)
- `SkillContext` com `atletaId`/`tenantId` reais (não mais `UUID.randomUUID()`), `dataReferencia` = `inicioSemana`.

## D3 — Strangler por domínio, atrás do golden-master

Ordem por risco crescente (começar onde já há skill):

```
1. interval-eligibility   (skill existe)   ── prova o padrão, ponto de injeção único
2. load/recovery          (skill existe)
3. periodization          (nova skill)
4. variability            (nova skill)
5. recovery-detail        (absorver em RecoveryCarga?)
6. pace-ceiling           (nova skill)
7. availability           (nova skill/regra)
```

Regra invariante: **cada incremento mantém o golden-master verde, ou diverge de propósito com diff revisado** e sem nova `ViolacaoQualidade` na eval determinística (ambos de `add-plan-generation-eval-harness`). É isso que torna a migração segura apesar de o prompt ser o produto.

Por incremento: (a) skill produz o resultado; (b) renderer injeta a seção a partir do snapshot; (c) remove a chamada ao formatter correspondente no `PromptBuilder`; (d) deleta o formatter e a execução-sombra; (e) golden-master regenerado com diff revisado.

## D4 — `PromptBuilder` como montador fino

Estado final: `buildOptimizedPrompt` monta `SkillContext` → roda o runner de skills (D2) → obtém `AthleteAnalysisSnapshot` → `SnapshotPromptRenderer(snapshot, inputs)` produz as três camadas (D1) → concatena com o template.

Os formatters deixam de **orquestrar o prompt**, mas nem todo código de formatter "some": a **decisão** de cada um migra para uma skill (camadas [1]/[2]); o **resíduo de formatação de dado** (zonas, volume, histórico de pace) permanece como helper enxuto e testável alimentando a camada [3]. O que desaparece é o método de 533 linhas e os formatters como pontos de composição do prompt — a lógica de decisão passa a viver em skills isoladamente testáveis.

## D6 — Resiliência estrutural do plano gerado (folded de `harden-plan-generation-resilience`)

A validação pós-geração em `IaServiceImpl.validarENormalizarPlanoGerado` rejeita o plano inteiro com `LLMException` (→ 503, após ~80s) na primeira violação estrutural que a LLM produz. Como a saída é não-determinística, isso ocorre de forma intermitente (caso real 2026-06-17: `REGENERATIVO` com 2 etapas). A `debito-tecnico-camada-ia` já reduziu a frequência ao baixar a temperatura para 0.2, mas não elimina.

**Inventário real das validações que HARD-FAIL (throw):**

| Validação | Reparável (determinístico)? |
|---|---|
| 4 validadores "3 etapas" **idênticos** (`REGENERATIVO`/`LONGO`/`CONTINUO`/`TEMPO_RUN`): `size != 3` ou ordem ≠ AQUEC→…→DESAQ | Parcial — ver abaixo |
| `validarRepeticoes` (`repeticoes != 1`) | ✅ sim — expandir (lógica `expandirEtapasAgregadas` já existe) |
| `validarTreinoIntervalado` (regras de FC/intervalo) | ❌ não — retry |

> Já são **WARN-only** (não falham, sem ação): `validarTrianguloPaceDuracaoDistancia`, `validarDistribuicaoCargaSemanal`, limites "mínimo recomendado" de duração/distância.

**Classificação de reparo dos "3 etapas":**
- Falta **AQUECIMENTO** ou **DESAQUECIMENTO** → ✅ sintetizar (formulaico: zona fácil, ~5–10 min).
- Ordem trocada mas os 3 tipos presentes → ✅ reordenar para o canônico.
- Falta **PRINCIPAL** (o estímulo real) → ❌ retry (inventar o treino principal é perigoso).

**Decisão — reparo-first + 1 retry (teto):**
1. **Dedup primeiro:** unificar os 4 validadores idênticos em um `validarEstrutura3Etapas(tipo)` e um único ponto de reparo.
2. **Reparar** o que é seguro (aquec/desaq faltante, ordem, `repeticoes`) — cobre o caso comum sem custo de LLM; reparo **logado e contado** (telemetria Micrometer), nunca silencioso.
3. **Retry único** (1 tentativa, ~80s) só quando o reparo não se aplica, re-chamando o LLM com o motivo da rejeição anexado ao prompt. Teto = 1 para não criar esperas de minutos.
4. **Falha clara** (erro de domínio mapeado no `GlobalExceptionHandler`) só após reparo + retry esgotados.

Onde mora: como o D4 já reescreve `buildOptimizedPrompt`/o miolo da geração, a orquestração de reparo+retry entra junto — preferir um colaborador dedicado (não re-inflar o `IaServiceImpl`; coordenar com `refactor-iaservice-decomposition`). As **regras** de validação permanecem inalteradas — muda só o comportamento de recuperação.

## D7 — `Constraint` declarativa: fonte única para prompt e checker

Descer no `pace-ceiling` (5 métodos do `PaceHistoricoFormatter`) revelou dois pontos que refinam o D1:

**Problema: rotear a camada [1] por severidade é insuficiente.** Há dois tipos de coisa que precisam ir para o bloco mandatório:
- **Assessment** — observação sobre o estado do atleta, com severidade (`recovery` BLOCKER → "descanso obrigatório"; `interval-eligibility` degradado).
- **Regra/constraint** — derivada de dado, **mandatória por natureza e sem severidade** (`teto de pace`; `dias permitidos`; `TSS alvo semanal`; `máx. dias consecutivos`).

O `SkillResult` atual (`severity/evidence/recommendations`) só modela o primeiro. Não há onde declarar "esta é uma regra que o plano deve satisfazer". Hoje essas regras vivem **duplicadas e desacopladas**: viram prosa no prompt (`formatarTetoPace`) E são validadas em outro lugar na normalização (`paceValidator` usa teto/piso).

**Decisão: skills de plano declaram `List<Constraint>` (ortogonal à severidade).** Uma `Constraint` é uma regra declarativa que o plano gerado deve satisfazer. Declarada **uma vez** pela skill, é usada **duas vezes**:

```
        skill (ex.: pace-ceiling)
        declara Constraint("ritmoAlvo ≤ teto por tipo", dados)
              │
   ┌──────────┴───────────┐
   ▼                      ▼
[1] no PROMPT          PlanQualityChecker (pós-geração)
"NÃO ultrapasse X"     verifica: nenhuma etapa mais rápida que o teto
(instrui o LLM)        (confere se o LLM obedeceu)
```

Forma de saída das skills de plano:

```
SkillResult {
  severity, evidence, recommendations,   // o assessment (já existe)
  constraints: List<Constraint>          // NOVO — 0..N regras que o plano deve satisfazer
}
```

**Validação em 3 domínios de formatos diferentes** (confirma que generaliza além do pace):

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

Conclusões da validação:
- "Mandatório independente de severidade" vale nos três → routing por severidade sozinho falharia. Confirma a necessidade de `constraints` explícitas.
- `List<Constraint>` é **0..N**: Elegível (permissão) e dia-preferido-longo (advisory) emitem **zero** constraints.
- `RecomendacaoIntervalado` (sealed Elegivel/Degradado/Substituido, cada uma já com `instrucaoParaLlm`) já é praticamente um carregador de `Constraint` — bom template; por isso migrar interval primeiro (D3 fatia 3.x) prova o contrato no caso mais rico.

**Forma da `Constraint` (fecha o ponto que estava aberto): `key + descrição + params`, não predicate puro.** Uma constraint tem duas metades: a **descrição** (→ prompt [1]) é uniforme e fácil (os 3 domínios já emitem texto via `instrucaoParaLlm`); a **verificação** (→ checker) é heterogênea (numérico / conjunto / presença / agregado-de-semana) e fecha sobre dados próprios. Um `Predicate<PlanoSemanalLlmDto>` puro resolveria, mas quebra a serialização — e a `SkillExecution` (`V32`) persiste resultados de skill. Então:

```
Constraint {
  ConstraintKey  key;          // PACE_TETO, INTERVALADO_PROIBIDO, INTERVALADO_MAX_CATEGORIA,
                               // DIAS_PERMITIDOS, MAX_CONSECUTIVOS…
  String         descricao;    // → renderiza no prompt [1]  (o instrucaoParaLlm de hoje)
  Map<String,?>  params;       // teto-por-tipo / set-de-dias / tipoFallback / N  (dado serializável)
}
        │
        ▼
PlanQualityChecker faz dispatch por `key` → avalia `params` contra o plano gerado
```

A **declaração** (key + descrição + params) é a fonte única e serializável; o **algoritmo** de verificação vive no checker, mas é *dirigido* pela constraint declarada (lê o limiar/conjunto dos `params`, não reimplementa). Meio-termo entre "texto opaco" (não verificável) e "predicate puro" (não serializável).

**Cruzamento com o D6:** `MAX_CONSECUTIVOS` é um agregado da semana — exatamente o que `validarDistribuicaoCargaSemanal` hoje só **avisa** (WARN). Promovê-la a `Constraint` unifica prompt [1] + checker + resiliência (D6) na mesma declaração.

Roteamento do renderer (revisa o D1):
- `[1]` = todas as `constraints` (de qualquer skill) + assessments `BLOCKER`/`CRITICAL`
- `[2]` = assessments `WARNING`/`INFO` + recommendations
- `[3]` = dado (helper, dos inputs)
- **`PlanQualityChecker`** = checa as mesmas `constraints` → a regra do checker por domínio (tasks 3.4, 4.4, 5.4, 7.4) deixa de ser reimplementada: é a constraint declarada.

**Benefícios:** elimina a dupla implementação (prompt vs. validação); a regra do checker sai de graça; e a constraint vira o ponto de extensão por domínio. **Bônus de determinismo:** ao virar skill, `verificarPaceLimiarAtualizado` (que hoje usa `LocalDate.now()`) passa a usar `dataReferencia` do `SkillContext` — fecha um dos buracos de não-determinismo do golden-master.

**Aberto (refinar fatia a fatia):** o conjunto de `ConstraintKey` e o schema de `params` de cada domínio (acima já há os candidatos). A forma do contrato (`key + descrição + params` + dispatch no checker) está decidida; a 1ª fatia (interval-eligibility, task 3.x) materializa o contrato `Constraint` + `ConstraintKey.INTERVALADO_*` + a 1ª regra do checker, e cada domínio seguinte adiciona suas keys.

## D5 — Relação com as changes vizinhas

- **`add-plan-generation-eval-harness` (depende):** rede obrigatória. Sem ela, esta migração é cega.
- **`llm-code-switching` (vem depois):** as skills migradas já emitem estrutura em EN / valores em PT — o code-switching só precisa cuidar do que sobrar (templates, system-prompt, formatters não migrados). Fazer code-switching antes seria traduzir código condenado.
- **`add-llm-tool-use` (ortogonal):** tools = dado sob demanda; skills = decisão determinística. Compatíveis; a migração não bloqueia nem é bloqueada.
- **`refactor-iaservice-decomposition` (coordenar janela):** mesma vizinhança de código (`IaServiceImpl`/prompt). Sequenciar para não conflitar.

## Risks / Trade-offs

- **[Risco] O prompt é o produto — regressão de qualidade.** Mitigação central: golden-master + eval determinística por incremento; nunca migrar dois domínios sem revalidar.
- **[Risco] Mudança grande (L/XL).** Mitigação: strangler — entregável por domínio, cada um mergeável e reversível isoladamente.
- **[Risco] Skills novas reimplementam lógica sutil dos formatters.** Mitigação: caracterizar o formatter (teste) antes de extrair; portar a lógica 1:1 e comparar saída.
- **[Trade-off] Indireção snapshot→renderer vs. formatter direto.** Aceitável: troca um método de 533 linhas por skills testáveis + um renderer testável.
