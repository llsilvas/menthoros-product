# alinhar-teto-pace-prompt-checker — prompt e checker usam o mesmo teto; ativação em ritmo de prova sem violar o teto

**Tamanho:** XS · **Trilha:** Fast (backend; prompt muda uma linha → eval candidato)
**Status:** entregue e arquivada (2026-11-21, menthoros-backend#257)
**Origem:** eval de `validar-ritmo-etapa-contra-zona` (#255), 3 rodadas.

## Por que

1. **Teto arredondado diferente em cada lugar.** `PaceHistoricoFormatter.calcularTetoPorTipo` gera o teto com 4 casas
   (`5,635` = 5:38,1). O prompt formata ao segundo ("não mais rápido que 5:38/km"), e normalizador e
   `PlanQualityChecker` usam o valor exato — o modelo obedece o prompt e o checker acusa `PACE_TETO`.
2. **Ativação em ritmo de prova colide com o teto de contínuo.** `ajustar-taper-pre-prova` permite ao avançado trocar
   os strides por 2–3 km em ritmo de prova; o modelo prescreve isso como `CONTINUO`, cujo teto vem das rodagens fáceis
   do histórico (4:54 para um atleta de prova a 4:10) → violação.

## O que muda

- O teto nasce arredondado **para o segundo de cima** em `calcularTetoPorTipo` — prompt, `Constraint`, normalizador e
  checker passam a ver o mesmo número, sem afrouxar a regra (arredonda para mais lento).
- A regra de ativação pede o trecho em ritmo de prova como **`TEMPO_RUN`** (zona Z3–Z4, teto do histórico de tempo),
  não `CONTINUO`.

## Critérios de aceite

- **CA1** — melhor recente 5:45 → teto 5:38 (338,1 s → 339 s = 5:39), igual no prompt e no mapa.
- **CA2** — a linha da ativação do bloco de prova cita `TEMPO_RUN` para o trecho em ritmo de prova.
- **CA3** — eval candidato sem violação `PACE_TETO` atribuível a arredondamento ou à ativação.
