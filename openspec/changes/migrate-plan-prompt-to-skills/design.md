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

> **Divisão de trabalho com `introduce-plan-constraints`:** o seam `Constraint` (key+descrição+params), o **bloco mandatório [1]** no topo e o `PlanQualityChecker` são introduzidos *antes* desta change, em `introduce-plan-constraints` — alimentados pelos **formatters**. O que ESTA change faz é trocar a **fonte** das `Constraint` (e das demais seções) de formatter→skill, fazendo o **snapshot** ser o produtor, e evoluir o renderer para ler [2]/[3] do snapshot+inputs. Renderer [1] e checker não mudam — só passam a ser alimentados por skills.

**Decisão: `SnapshotPromptRenderer` dedicado, com TRÊS camadas e DUAS fontes.**

```
renderer(snapshot, inputs)            ← Opção B: dois canais
  snapshot = List<SkillResult>  (decisões + Constraints)
  inputs   = atleta / metaDados / histórico  (dados, já construídos pelo runner do D2)

  → [1] CONSTRAINTS MANDATÓRIAS (topo)  ← Constraints (de introduce-plan-constraints) + assessments BLOCKER/CRITICAL
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

Regra invariante: **cada incremento mantém o golden-master verde, ou diverge de propósito com diff revisado** (golden-master de `add-plan-generation-eval-harness`) e sem nova `ViolacaoQualidade` no `PlanQualityChecker` (de `introduce-plan-constraints`). É isso que torna a migração segura apesar de o prompt ser o produto.

Por incremento: (a) skill produz o resultado **e declara suas `Constraint`** (que o formatter emitia); (b) renderer injeta a seção a partir do snapshot; (c) remove a chamada ao formatter correspondente no `PromptBuilder`; (d) deleta/retrai o formatter (a decisão; o resíduo de dado vira helper) e a execução-sombra; (e) golden-master regenerado com diff revisado. O checker não muda — só passa a receber a `Constraint` da skill.

## D4 — `PromptBuilder` como montador fino

Estado final: `buildOptimizedPrompt` monta `SkillContext` → roda o runner de skills (D2) → obtém `AthleteAnalysisSnapshot` → `SnapshotPromptRenderer(snapshot, inputs)` produz as três camadas (D1) → concatena com o template.

Os formatters deixam de **orquestrar o prompt**, mas nem todo código de formatter "some": a **decisão** de cada um migra para uma skill (camadas [1]/[2]); o **resíduo de formatação de dado** (zonas, volume, histórico de pace) permanece como helper enxuto e testável alimentando a camada [3]. O que desaparece é o método de 533 linhas e os formatters como pontos de composição do prompt — a lógica de decisão passa a viver em skills isoladamente testáveis.

## D6 — `Constraint` como seam (estabelecido em `introduce-plan-constraints`)

O contrato `Constraint` (`key + descrição + params`), o bloco mandatório [1] e o `PlanQualityChecker` **não são definidos aqui** — vêm de `introduce-plan-constraints`, que os introduz com os formatters como fonte. Ver o `design.md` daquela change para a forma, a validação em 3 domínios e o dispatch por `key`.

O que ESTA change faz com o seam: trocar a **fonte** das `Constraint` de formatter→skill. Cada skill de plano passa a **declarar** suas `Constraint` (a `RecomendacaoIntervalado` já é quase isso); o renderer [1] e o checker, estáveis, passam a ser alimentados pela skill em vez do formatter. A "regra do checker por domínio" **não nasce aqui** (nasce na change do seam) — o strangler só troca o produtor.

> A resiliência estrutural de etapas (reparo + 1 retry; o 503 do `REGENERATIVO` com 2 etapas) é a change irmã `harden-plan-generation-resilience` — concern distinto (validade estrutural ≠ constraint de coaching), independente e sequenciável à parte.

## D5 — Relação com as changes vizinhas

- **`add-plan-generation-eval-harness` (depende):** rede obrigatória. Sem ela, esta migração é cega.
- **`introduce-plan-constraints` (depende):** estabelece o seam `Constraint`, o bloco [1] e o `PlanQualityChecker` (com formatters como fonte). Esta migração só troca a fonte para skills — por isso vem depois.
- **`harden-plan-generation-resilience` (irmã, independente):** resiliência estrutural de etapas; coordenar janela do `IaServiceImpl`.
- **`llm-code-switching` (vem depois):** as skills migradas já emitem estrutura em EN / valores em PT — o code-switching só precisa cuidar do que sobrar (templates, system-prompt, formatters não migrados). Fazer code-switching antes seria traduzir código condenado.
- **`add-llm-tool-use` (ortogonal):** tools = dado sob demanda; skills = decisão determinística. Compatíveis; a migração não bloqueia nem é bloqueada.
- **`refactor-iaservice-decomposition` (coordenar janela):** mesma vizinhança de código (`IaServiceImpl`/prompt). Sequenciar para não conflitar.

## Risks / Trade-offs

- **[Risco] O prompt é o produto — regressão de qualidade.** Mitigação central: golden-master + eval determinística por incremento; nunca migrar dois domínios sem revalidar.
- **[Risco] Mudança grande (L/XL).** Mitigação: strangler — entregável por domínio, cada um mergeável e reversível isoladamente.
- **[Risco] Skills novas reimplementam lógica sutil dos formatters.** Mitigação: caracterizar o formatter (teste) antes de extrair; portar a lógica 1:1 e comparar saída.
- **[Trade-off] Indireção snapshot→renderer vs. formatter direto.** Aceitável: troca um método de 533 linhas por skills testáveis + um renderer testável.
