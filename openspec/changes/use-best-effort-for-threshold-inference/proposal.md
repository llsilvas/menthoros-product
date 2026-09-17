# use-best-effort-for-threshold-inference — usar o melhor esforço atual como insumo de limiar/projeção de prova

**Tamanho:** a definir (provável M · Full) · **Status:** 🔴 **NÃO PRONTA — bloqueada por
`add-athlete-best-efforts`**
**Criado:** 2026-09-18

> Destacada de `add-athlete-best-efforts` (D5) por decisão do founder em 2026-09-18: mudar o insumo
> de uma inferência que afeta zonas/prescrição é risco próprio, e merece sequenciamento e DoR
> próprios em vez de ir junto com "mostrar uma tabela de melhores esforços".
>
> **Pré-requisito:** `add-athlete-best-efforts` em produção. Sem o dado real (`melhoresEsforcos` no
> perfil do coach) disponível e conferido em atletas reais, não há base para desenhar esta change.

## Why (rascunho — completar quando destravada)

`ThresholdInferenceService` já infere `paceLimiar` de duas fontes: passiva (mediana do quintil mais
rápido de treinos recentes, `inferirPaceLimiar`) e de prova registrada
(`inferirPaceLimiarDeProva`, via `RiegelCalculator`, change `infer-threshold-from-race-result`,
arquivada 2026-07-17). Nenhuma das duas olha pro **melhor esforço recente** do atleta (janela
rolante de 42 dias, distâncias curtas inclusive) — que `add-athlete-best-efforts` passa a expor no
perfil do coach.

Hipótese a validar quando esta change for retomada: usar o melhor esforço atual (mesma fórmula de
Riegel já usada por `RaceProjectionSkill`/`inferirPaceLimiarDeProva`) como uma terceira fonte, ou
substituindo a inferência passiva por quintil — precedência entre as três fontes é a decisão de
design central, análoga à D2 já resolvida em `infer-threshold-from-race-result`.

## Open Questions (a resolver no design.md, quando destravada)

- Precedência entre prova registrada, melhor esforço recente e inferência passiva por quintil —
  qual vence quando há mais de uma disponível?
- O melhor esforço de 400m/800m (esforços muito curtos, anaeróbicos) é apto pra Riegel/limiar de
  corrida contínua, ou só as distâncias 3k+ entram nessa fórmula?
- Janela de 42 dias é a certa pra "atual", ou precisa de uma janela própria pra esse uso (a de
  exibição no perfil não precisa ser a mesma da inferência)?
- Como isso interage com `fc-limiar-zones`/TSS/TSB e o prompt de geração de plano — mesmos
  consumidores downstream que `infer-threshold-from-race-result` já mapeou.

## Impact (provisório)

- **Repositórios:** `apps/menthoros-backend` — mexe em `ThresholdInferenceService`, que alimenta
  zonas de treino, TSS/TSB e o prompt de geração de plano. Risco de regressão na cadeia inteira se
  a precedência entre fontes for mal desenhada — por isso o DoR próprio.
