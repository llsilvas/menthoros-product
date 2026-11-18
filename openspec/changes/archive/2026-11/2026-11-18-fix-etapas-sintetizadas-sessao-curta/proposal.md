# fix-etapas-sintetizadas-sessao-curta — aquecimento nunca mais rápido que o principal, e sessão curta vira bloco único

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta (2026-11-18)
**Criado:** 2026-11-18
**Origem:** veredito da rodada 2 da revisão cega (`docs/ia/revisao-cega-planos-2026-11-16-rodada2.md`).

## Por que

1. **Aquecimento/desaquecimento mais rápido que o principal.** Sem `ritmoAlvo` próprio (caso das etapas
   geradas pelo reparo), `corrigirDistanciasEtapasTemporais` deriva a distância por `paceLimiar × 1,20`
   (Z2) ou `× 1,35` (Z1), sem olhar o tipo de sessão: 2,18 km em 10 min (4:35/km) num regenerativo de
   TSB baixo, 2,06 km em 10 min (4:51/km) no regenerativo do taper. O aquecimento sai mais rápido que o
   principal.
2. **Principal menor que o aquecimento.** Com total pequeno, `fix-total-treino-soma-etapas` encaixa a
   PRINCIPAL no que sobra depois do aquecimento/desaquecimento gerados: principais de 2 a 4 min num
   regenerativo de 14 min (casos 7 e 9). O coach: juntar tudo num bloco contínuo leve.

## O que muda

1. Etapa temporal sem `ritmoAlvo` próprio usa o **mais lento** entre o pace da zona (fator sobre o
   limiar) e o pace médio da PRINCIPAL do mesmo treino.
2. No encaixe da PRINCIPAL no total (etapa sintetizada): se a PRINCIPAL resultante dura menos que o
   aquecimento, o treino vira **um bloco único** — só a PRINCIPAL, com a distância total e a duração
   pelo pace —, sem as etapas sintetizadas.

## Critérios de aceite

- **CA1** — GIVEN REGENERATIVO com PRINCIPAL a 6:30–7:00/km e aquecimento sintetizado, atleta com limiar
  3:50/km (Z2 4:36/km), THEN o aquecimento usa 6,75 min/km (o mais lento).
- **CA2** — GIVEN aquecimento sem ritmo e PRINCIPAL mais rápida que a zona, THEN usa a zona (comportamento atual).
- **CA3** — GIVEN total de 2,0 km com aquecimento e desaquecimento sintetizados que deixariam a PRINCIPAL
  com 2 min, THEN o treino tem uma etapa só, 2,0 km, duração pelo pace.
- **CA4** — esperados de caracterização alterados um a um, com o motivo.

## Fora de escopo

Fatores de zona (`revalidar-fatores-pace-zonas`); faixas de ritmo inválidas (`validar-ritmo-etapa-contra-zona`).
