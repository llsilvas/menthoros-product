# fix-tss-planejado-divergente — Unificar o TSS planejado com o realizado

**Tamanho:** S · **Trilha:** Full

> Full por **incerteza de design** — o que fazer com os valores já persistidos (Q1). A justificativa
> de risco de segurança que constava aqui foi **retirada**: ela não se sustentou na verificação.

**Status:** proposta
**Criado:** 2026-07-31
**Origem:** levantamento da branch `feature/testes-carga-referencia`, que tem a correção escrita
(`949d0ff`, BUG-CONF-001) e nunca foi mergeada.

## Problema

`TssCalculatorService` calcula TSS por **duas fórmulas diferentes** para a mesma grandeza:

| Caminho | Fórmula |
|---|---|
| Planejado (`calcularTssEstimado(Duration, Integer)`) | `min × RPE² / 90` |
| Realizado (pipeline RPE) | `h × IF² × 100`, com `IF = converterRpeParaIf(RPE)` |

Divergência calculada com as fórmulas em `develop`:

| RPE | 60 min planejado | 60 min realizado | razão |
|---:|---:|---:|---:|
| 3 | 6 | 36 | **6,0×** |
| 5 | 17 | 54 | **3,2×** |
| 7 | 33 | 81 | **2,5×** |
| 9 | 54 | 127 | **2,4×** |

O planejado é **sistematicamente subestimado** em 2,4× a 6× para o mesmo esforço.

## Correção de rota: a premissa inicial desta proposta era falsa

A primeira versão afirmava que o defeito cegava o `TrainingPrescriptionGuardSkill`, deixando passar
prescrição excessiva. **Isso não procede.** A verificação mostrou que os consumidores que dariam
gravidade ao bug **não estão ligados**:

| Consumidor | Estado real |
|---|---|
| `TrainingPrescriptionGuardSkill` | **zero chamadores em produção** — só o próprio teste |
| `SkeletonComplianceChecker` | citado apenas em Javadoc; o planner roda em shadow |
| `TreinoRealizado.getDiferencaTss()` | sem consumidor em `src/main` |
| view `v_metricas_diarias_agregadas` (V9), que faz `AVG(tp.tss_planejado)` | zero referências em `src/main` |

Ou seja: hoje o número errado é **gravado e exibido**, mas não alimenta nenhuma decisão automática.
Não há guard-rail cego. A severidade real é bem menor do que esta proposta afirmava.

## Por que ainda vale corrigir — antes, não depois

O argumento não é incidente em produção. É **ordem de execução**:

- `planner-engine-enforcement` (roadmap) vai ligar o `SkeletonComplianceChecker`, que soma e compara
  `tssPlanejado` contra tetos.
- O `TrainingPrescriptionGuardSkill` existe pronto e sem uso — quando for ligado, herda a escala errada.

Ligar esses consumidores com duas escalas convivendo significa **calibrar thresholds contra um
número errado**. Corrigir agora custa uma fórmula; corrigir depois custa recalibrar tudo o que foi
ajustado em cima dela — e, aí sim, com risco de segurança real.

**Um efeito é imediato, porém:** em `TreinoPlanejadoServiceImpl:437`, mudar a duração de um treino
**recalcula** `tssPlanejado` com a fórmula divergente, **sobrescrevendo** um valor que pode ter vindo
correto do gerador. Ali um dado bom é substituído por um ruim, hoje.

## Escopo

1. `calcularTssEstimado(Duration, Integer)` passa a usar o mesmo pipeline `RPE → IF → h × IF² × 100`
2. Testes de referência que provem a equivalência entre os dois caminhos
3. Decisão explícita e implementada sobre os `tssPlanejado` **já persistidos**

## Fora do escopo

- Rever o mapeamento `converterRpeParaIf` em si (é o de referência, TrainingPeaks/Coggan)
- Recalcular TSS **realizado** — o pipeline realizado não muda
- `BUG-CONF-002` e `BUG-TEC-002` da mesma branch: o primeiro parece já resolvido em `develop`
  (`MetricasThresholds` existe), o segundo foi refutado e superado por `fix-tsb-recalculo-resiliente`

## Critérios de aceite

**CA1 — As duas fórmulas convergem**
> **Dado** duração e RPE idênticos
> **Quando** se calcula o TSS pelo caminho planejado e pelo realizado
> **Então** os dois resultados são iguais.

**CA2 — Recalcular não piora um valor bom**
> **Dado** um treino cujo `tssPlanejado` veio do gerador de plano
> **Quando** a duração muda e o TSS é recalculado
> **Então** o valor resultante está na mesma escala do realizado.

**CA3 — O guard, quando for ligado, enxerga a escala certa**
> **Dado** o `TrainingPrescriptionGuardSkill` (hoje sem chamador em produção)
> **Quando** ele soma o TSS de sessões propostas
> **Então** a soma está na mesma escala da meta semanal.
>
> Verificável só por teste unitário do skill — **não** por comportamento de sistema, porque o skill
> não está no fluxo. Afirmar o contrário seria testar algo que não roda.

**CA4 — Valores históricos têm destino definido**
> **Dado** treinos planejados com `tssPlanejado` na escala antiga
> **Quando** a correção sobe
> **Então** o comportamento é o decidido na Q1, e não um estado ambíguo em que a mesma coluna
> guarda duas escalas sem marcação.

## Métrica de sucesso

- **Convergência:** para uma grade de (duração × RPE), planejado e realizado diferem em **zero**.
- **Sem métrica de guard.** A primeira versão propunha medir "planos bloqueados deixam de ser zero";
  isso não é mensurável, porque o guard não roda. Quando `planner-engine-enforcement` o ligar, a
  métrica de aceitação pertence àquela change — inclusive a contra-métrica que o product-review
  pediu (um guard que bloqueia demais é aprendido a ser ignorado, o que o mata mais rápido que
  estar desligado).

## Open Questions & Assumptions

**Premissas verificadas em 2026-07-31:**

- **A1.** As duas fórmulas coexistem hoje em `develop` (`TssCalculatorService:60-64` vs. pipeline
  RPE). Verificado lendo o arquivo.
- **A2.** A fórmula divergente é usada em dois pontos de `TreinoPlanejadoServiceImpl` (linhas 220 e
  437), sempre como **fallback** quando o `tssPlanejado` não vem informado — e no recálculo por
  mudança de duração, onde sobrescreve.
- **A3.** A correção e os testes já existem escritos na branch `feature/testes-carga-referencia`
  (commits `949d0ff` e os cinco `RefCarga*`), nunca mergeados.

**Em aberto — bloqueiam a implementação:**

- **Q1.** O que fazer com os `tssPlanejado` **já gravados** na escala antiga? Recalcular em
  migração, deixar como estão (convivendo duas escalas na mesma coluna), ou recalcular sob demanda?
  Sem decisão aqui, o CA4 não é implementável.
- ~~**Q2.** `metaTssSemanal` é derivada de carga realizada?~~ **Perdeu a urgência:** o guard não
  está ligado, então a resposta não muda a severidade hoje. O `LoadTargetResolver` documenta que o
  alvo parte do CTL atual (carga realizada), o que sugere "sim" — mas isso passa a ser problema de
  `planner-engine-enforcement`, não desta change.

- **Q3.** *(nova)* A correção iguala apenas o **fallback por RPE**. O caminho realizado completo
  também usa FC, pace, etapas, elevação e fator por `TipoTreino`. "As duas fórmulas convergem" (CA1)
  vale só para o caminho RPE-only — o planejado, sendo estimativa a priori, não tem esses dados.
  Confirmar que essa é a equivalência desejada, e não uma paridade mais ampla.

## Impacto

- **Backend:** `TssCalculatorService` (1 método), mais o destino dos dados históricos conforme Q1
- **Sem migration** se a decisão da Q1 for não recalcular; **com migration** se for
- **Sem mudança de contrato de API** — muda o valor, não a forma
