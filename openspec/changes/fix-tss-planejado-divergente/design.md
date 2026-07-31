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
| `SkeletonComplianceChecker` | 0 — só menções em Javadoc; planner em shadow |
| `TreinoRealizado.getDiferencaTss()` | 0 |
| view `v_metricas_diarias_agregadas` (`AVG(tp.tss_planejado)`) | 0 |
| `TreinoPlanejadoServiceImpl` (grava e recalcula) | **2** — este roda |
| `IaServiceImpl` | preserva o valor vindo do LLM |

**Consequência:** hoje o número errado é gravado e exibido, mas não decide nada. Não existe o
guard-rail cego que a versão anterior descrevia.

Registrar isto importa por dois motivos. Primeiro, honestidade: a justificativa caiu e a spec não
pode continuar apoiada nela. Segundo, porque **o pre-mortem também errou na direção oposta** —
listou consumidores como se estivessem ativos, sem checar se algum tem chamador. Lista de
consumidores não é mapa de impacto até alguém abrir o código.

## Por que a correção continua valendo

O valor está na **ordem**: `planner-engine-enforcement` vai ligar o `SkeletonComplianceChecker`, e o
guard existe pronto esperando ser ligado. Ligar consumidores sobre duas escalas convivendo significa
calibrar thresholds contra número errado — e a correção deixa de custar uma fórmula para custar a
recalibragem de tudo que foi ajustado em cima dela.

## Correção

```java
public int calcularTssEstimado(Duration duracaoMin, Integer rpe) {
    long minutos = duracaoMin != null ? duracaoMin.toMinutes() : 0L;
    int r = rpe != null ? rpe : 5;
    double duracaoHoras = minutos / 60.0;
    double intensityFactor = Math.max(MIN_IF_RPE, Math.min(MAX_IF, converterRpeParaIf(r)));
    return (int) Math.round(duracaoHoras * intensityFactor * intensityFactor * 100.0);
}
```

Idêntica ao caminho realizado, incluindo o clamp. É a correção de `949d0ff`, portada.

## Dados históricos — a decisão que falta (Q1)

`tssPlanejado` está persistido. Depois da correção, valores novos saem 2,4×–6× maiores que os
antigos, na **mesma coluna**. As opções:

| Opção | A favor | Contra |
|---|---|---|
| **Recalcular em migração** | uma escala só, comparações históricas voltam a fazer sentido | altera dado existente (gate de confirmação); precisa de `duracaoMin`/RPE preservados para recomputar |
| **Deixar conviver** | zero risco de escrita | a coluna passa a ter duas escalas sem marcação — qualquer agregação histórica mente |
| **Recalcular sob demanda** | sem migração em massa | a inconsistência persiste até o treino ser tocado, de forma imprevisível |

Não escolho aqui de propósito: é decisão de produto sobre dado existente, e a opção do meio é a
única que garante um estado permanentemente ambíguo — o que vale registrar explicitamente antes de
alguém escolhê-la por ser a mais barata.

## Riscos

| Risco | Mitigação |
|---|---|
| A premissa de segurança (guard cego) não se confirmar | Task 0.1 é discovery e roda antes do código; se cair, o CA3 é reescrito e a severidade da change baixa |
| Portar da branch antiga trazer junto o `f9e754b` refutado | Porte seletivo por commit; a branch é referência, nunca base de merge |
| Testes portados não compilarem no `develop` atual | Foram escritos antes de a `fix-tsb-recalculo-resiliente` reescrever o `TsbServiceImpl`; a task 1.1 prevê adaptação |
| Mudança de escala quebrar expectativa em outro consumidor | O levantamento achou 3 arquivos consumindo `tssEstimado`; confirmar que não há outro caminho antes de fechar |
