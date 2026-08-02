# Design — fix-tss-planejado-divergente

## O defeito, com o código

`TssCalculatorService` em `develop`:

```java
// Caminho PLANEJADO — linha 60
public int calcularTssEstimado(Duration duracaoMin, Integer rpe) {
    long minutos = duracaoMin != null ? duracaoMin.toMinutes() : 0L;
    int r = rpe != null ? rpe : 5;
    return (int) Math.round((double) minutos * r * r / 90.0);   // min × RPE² / 90
}

// Caminho REALIZADO — mesmo arquivo
private double converterRpeParaIf(double rpe) { ... }           // RPE → IF (Coggan)
// TSS = h × IF² × 100
```

Duas fórmulas para a mesma grandeza, no mesmo arquivo. A divergência não é de arredondamento: é de
**escala**, e varia com o RPE (6,0× em RPE 3, 2,4× em RPE 9), porque `RPE²/90` cresce em ritmo
diferente de `IF(RPE)²`.

## Onde o valor errado circula

```
TreinoPlanejadoServiceImpl:220   fallback quando o gerador não informa tssPlanejado
TreinoPlanejadoServiceImpl:437   RECALCULA ao mudar duração — sobrescreve valor possivelmente correto
        ↓
TreinoPlanejado.tssPlanejado (persistido)
        ↓
TrainingPrescriptionGuardSkill:119   soma o TSS das sessões propostas
        ↓
:153   if (tssTotal > metaTssSemanal × 1,15) → BLOCKER
```

O ponto de maior dano não é o fallback — é a **linha 437**. Ali um `tssPlanejado` que veio correto
do gerador é substituído por um valor na escala errada só porque a duração mudou.

## Mapa de consumidores — verificado, não presumido

A primeira versão deste design afirmava que o defeito cegava um guard-rail de segurança. O
pre-mortem cross-model listou mais consumidores, e a verificação mostrou que **quase nenhum está
ligado**:

| Consumidor | Chamadores em `src/main` |
|---|---|
| `TrainingPrescriptionGuardSkill` | **0** (só o próprio teste) |
| `SkeletonComplianceChecker` | **ligado** — injetado em `PlannerShadowService` (`:65`), que passa `tssPlanejado` para `GeneratedSessionSnapshot` (`:260`, `:271`) |
| `TreinoRealizado.getDiferencaTss()` | 0 |
| view `v_resumo_semanal_atleta` (`AVG(tp.tss_planejado)`, V9 linha 83) | 0 |
| `TreinoPlanejadoServiceImpl` (grava e recalcula) | **2** — este roda |
| **Frontend** — `TreinoEditDialog`, `buildWeeklyPlan`, `DetalheTreinoDialog` | exibem o valor ao coach e ao atleta |
| `IaServiceImpl` | preserva o valor vindo do LLM |

**Consequência:** o número errado é gravado, exibido e **entra no cálculo de compliance do shadow** —
mas o shadow nasce desligado (`planner-engine.shadow: false`), então não altera plano nenhum hoje.

**Este mapa foi corrigido duas vezes, e vale registrar como.** A primeira versão afirmava que só
`TreinoPlanejadoServiceImpl` estava ligado; o levantamento usara `head -3` e truncou antes de
alcançar `PlannerShadowService`. Antes disso, o pre-mortem tinha listado consumidores sem checar se
algum tinha chamador. Nenhuma das duas passadas estava certa: uma superestimou o alcance, a outra
subestimou. Só a leitura completa, sem truncagem, fechou o quadro.

Registrar isto importa por dois motivos. Primeiro, honestidade: a justificativa caiu e a spec não
pode continuar apoiada nela. Segundo, porque **o pre-mortem também errou na direção oposta** —
listou consumidores como se estivessem ativos, sem checar se algum tem chamador. Lista de
consumidores não é mapa de impacto até alguém abrir o código.

## Por que a correção continua valendo

O valor está na **ordem**: `planner-engine-enforcement` (change ativa em
`openspec/changes/planner-engine-enforcement/`) vai ligar o `SkeletonComplianceChecker`, e o
guard existe pronto esperando ser ligado. Ligar consumidores sobre duas escalas convivendo significa
calibrar thresholds contra número errado — e a correção deixa de custar uma fórmula para custar a
recalibragem de tudo que foi ajustado em cima dela.

## Correção

A correção de `949d0ff` foi portada, mas **não como cópia da fórmula**: o núcleo do pipeline
RPE → IF → TSS foi extraído para um método privado que os dois caminhos chamam.

```java
public int calcularTssEstimado(Duration duracaoMin, Integer rpe) {
    long minutos = duracaoMin != null ? duracaoMin.toMinutes() : 0L;
    int r = rpe != null ? rpe : 5;
    return calcularTssPorRpe(minutos / 60.0, r);
}

/** Núcleo único: h × IF × 100 × IF, com o IF clampado. Chamado pelo planejado E pelo realizado. */
private int calcularTssPorRpe(double duracaoHoras, double rpe) {
    double intensityFactor = converterRpeParaIf(rpe);
    intensityFactor = Math.max(MIN_IF_RPE, Math.min(MAX_IF, intensityFactor));
    return (int) Math.round(duracaoHoras * intensityFactor * 100 * intensityFactor);
}
```

**A ordem das multiplicações é normativa, não estilo.** Multiplicação em ponto flutuante não é
associativa: escrever `h × IF² × 100` em vez de `h × IF × 100 × IF` muda o último bit e vira o
arredondamento em **8 pares (duração, RPE) da faixa válida** — todos em treinos longos, ex.
RPE 9 / 288 min, cujo produto exato cai em 607,4999999999999 em vez de 607,5, devolvendo 607 em vez
de 608. Como a ordem preservada é a que o caminho **realizado** já usava, a extração fica neutra
para ele e o planejado passa a ser idêntico por construção — que é o CA1. Dois casos-sentinela
(`288min/RPE 9 = 608`, `410min/RPE 7 = 554`) travam isso em teste; sem eles, "simplificar" a
expressão passa verde.

Copiar a fórmula corrigida para o método do planejado deixaria os dois caminhos numericamente iguais
**hoje** e livres para divergir de novo amanhã — que é literalmente a história do BUG-CONF-001: duas
cópias da mesma conta evoluindo em separado. Com o núcleo compartilhado, mexer na fórmula ou no
clamp move os dois de uma vez, e a divergência deixa de ser possível por construção.

**Ressalva de escopo — RPE nulo continua divergindo, de propósito.** O planejado sem RPE assume 5 e
estima; o realizado sem RPE, FC, pace e tipo devolve 0. São contratos diferentes, não um defeito: um
treino planejado sempre precisa de estimativa a priori, um realizado sem nenhum dado genuinamente
não tem o que calcular. Comportamento pré-existente, fora do escopo desta change.

## Dados históricos — DECIDIDO (Q1, terceira e última decisão): não migrar

**Nenhuma linha é recalculada. A migração saiu do escopo e o mecanismo construído foi revertido.**

As duas decisões anteriores (recalcular só os `PENDENTE`; depois recalcular todos os 129) assentavam
na mesma premissa: que as 129 linhas com `tssPlanejado` vinham da fórmula antiga. **Executar em dev
derrubou a premissa.**

Das 129 linhas, **3** foram produzidas pela fórmula antiga. As outras **126 vieram do gerador de
plano** — `TreinoPlanejadoServiceImpl.calcularTss` usa a fórmula apenas como *fallback*, quando o
gerador não informa TSS. E o gerador já opera na escala certa:

| RPE | Gerador (dev) | Fórmula nova | Fórmula antiga |
|---:|---:|---:|---:|
| 3 | 40,9 | 36,0 | 6,0 |
| 5 | 57,6 | 53,9 | 16,7 |
| 7 | 67,3 | 81,0 | 32,7 |
| 9 | 126,8 | 126,6 | 54,0 |

O gerador está na família da fórmula **nova**; a antiga é a outlier por uma ordem de grandeza. Isso
valida a correção empiricamente **e** elimina a migração: recalcular as 126 substituiria um número
que considera a estrutura do treino por uma estimativa que só olha duração e RPE — perda de sinal.
As 3 restantes estão subestimadas, mas não justificam migração, runner nem gate de confirmação.

Some assim também o custo que a decisão anterior tinha aceitado: nenhum treino já executado muda de
número, e nada que coach ou atleta já viram na tela (`TreinoEditDialog`, `buildWeeklyPlan`,
`DetalheTreinoDialog`) é reescrito.

### Opções consideradas

| Opção | A favor | Contra | Veredito |
|---|---|---|---|
| **Não migrar** | preserva os 126 valores bons do gerador; sem escrita em dado existente | 3 linhas seguem subestimadas | **escolhida** |
| **Recalcular em migração** | uma escala só na coluna | destrói 126 valores melhores que o substituto; gate de confirmação | rejeitada pela evidência acima |
| **Separar por `status_treino`** | migração parcial, menor risco | critério instável: `PENDENTE` vira `REALIZADO`/`PERDIDO` (`TreinoServiceImpl:122`, `:393`), então as escalas se misturam semanas depois | rejeitada no DoR |
| **Coluna marcadora de versão de escala** | desambigua para sempre | deixa no schema, permanentemente, uma coluna cuja única função é registrar uma dívida de duas semanas | rejeitada |

**Registro do método:** a execução só foi segura porque havia snapshot, e ele só existia porque o
`spec-reviewer` exigiu plano de rollback no DoR. Sem isso, 126 valores do gerador teriam sido
substituídos sem volta — e a premissa errada nunca teria aparecido.

## Riscos

| Risco | Mitigação |
|---|---|
| A premissa de segurança (guard cego) não se confirmar | Task 0.1 é discovery e roda antes do código; se cair, o CA3 é reescrito e a severidade da change baixa |
| Portar da branch antiga trazer junto o `f9e754b` refutado | Porte seletivo por commit; a branch é referência, nunca base de merge |
| Testes portados não compilarem no `develop` atual | Foram escritos antes de a `fix-tsb-recalculo-resiliente` reescrever o `TsbServiceImpl`; a task 1.1 prevê adaptação |
| Mudança de escala quebrar expectativa em outro consumidor | O levantamento achou 3 arquivos consumindo `tssEstimado`; confirmar que não há outro caminho antes de fechar |
