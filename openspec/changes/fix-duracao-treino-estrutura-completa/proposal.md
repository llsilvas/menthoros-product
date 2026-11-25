**Tamanho:** S · **Trilha:** Fast

# Proposal — fix-duracao-treino-estrutura-completa

Com a estrutura completa escrita pela LLM (aquecimento, PRINCIPAL, desaquecimento) e pace derivável, o
total do treino já vira a soma das etapas (`adotarSomaDasEtapas`, regra de 16/11). A **duração** do treino
não acompanha: fica a da LLM quando o ritmo do cabeçalho diverge do ritmo das etapas, e o card da revisão
mostra um tempo diferente do editor. Esta change alinha a duração e troca, na matriz de invariantes, a
exceção "estrutura completa" por uma asserção da regra.

## Status

- draft (2026-11-24): follow-up de `fix-etapas-sintetizadas-encaixe-total` (arquivada), que deixou 1.004
  cenários da matriz na exceção `estrutura-completa`.
- **Decisão do dono do produto (2026-11-24):** com a estrutura completa da LLM, o volume prescrito é a
  **soma das etapas**. O aquecimento e o desaquecimento escritos pela LLM são volume prescrito; a regra de
  22/09 ("não inflar") vale só para as etapas que o sistema sintetiza. Mantém a decisão de 16/11
  (`fix-total-treino-soma-etapas`). Alternativas descartadas: encaixar a PRINCIPAL no total declarado;
  medir em planos reais antes de decidir.

## Why

A matriz `NormalizacaoDeTreinoInvarianteTotalTest` (5.042 cenários) tem 1.004 na exceção
`estrutura-completa`, com dois tipos de violação:

1. **total ≠ prescrito** — o total vira a soma (ex.: longão de 12 km declarado com aquecimento de 10 min
   e desaquecimento de 5 min sai com 14,5 km). Pela decisão acima, **é o comportamento certo**; a
   invariante "total = prescrito" é que não vale para esse caminho.
2. **card ≠ editor na duração** — `adotarSomaDasEtapas` (`TreinoNormalizador.java`) só troca a distância.
   Na cauda, `recalcular-duracao` (`NormalizacaoDeTreino.java:724`) mantém a duração da LLM quando ela
   está mais perto de `ritmoAlvo` do cabeçalho × distância do que a soma das etapas. Com o ritmo do
   cabeçalho divergente do da PRINCIPAL, a LLM vence e card e editor contam tempos diferentes — o mesmo
   desempate que `fix-etapas-sintetizadas-encaixe-total` resolveu no encaixe (task 1.2c).

## What Changes

Só `apps/menthoros-backend`:

1. **`TreinoNormalizador.adotarSomaDasEtapas` grava também a duração** do treino = soma das durações das
   etapas (`formatarDuracao`), quando todas têm duração. Sem duração em alguma etapa, a soma é piso e a
   cauda decide, como hoje.
2. **Matriz:** na estrutura completa com pace derivável, a segunda invariante passa a ser
   "total = soma das etapas" (a regra de 16/11) em vez de "total = prescrito"; a exceção
   `estrutura-completa` sai de `EXCECOES` e do `INVENTARIO`.

Sem contrato de API, sem migration, sem front, sem dependência nova.

## Fora de escopo

- Mudar a regra de volume da estrutura completa (decidido: soma das etapas).
- PRINCIPAL sem pace (exceção `sem-pace`, follow-up A9) e TEMPO_RUN com etapa sintetizada
  (`tempo-run-sintetizado`, follow-up A6).
- `tssPlanejado` quando a duração muda; planos já gerados (sem backfill).

## Critérios de aceite

- **CA1** — GIVEN LONGO de 12 km com aquecimento 10 min, PRINCIPAL 12 km a 5:36–5:54/km e desaquecimento
  5 min, ritmo do cabeçalho 8:00/km e duração da LLM 96 min, WHEN normalizado, THEN `distanciaKm` = soma
  das etapas e `duracaoMin` = soma das durações das etapas.
- **CA2** — GIVEN o mesmo treino com uma etapa sem duração, THEN a duração do treino não é gravada por
  `adotarSomaDasEtapas` (a cauda decide, comportamento atual).
- **CA3** — GIVEN a matriz, THEN nenhum cenário de estrutura completa com pace derivável viola
  "card = editor" (distância e duração) nem "total = soma das etapas"; `EXCECOES` e `INVENTARIO` ficam só
  com `sem-pace` (504) e `tempo-run-sintetizado` (252).
- **CA4** — Esperados de caracterização/golden alterados aparecem em "Esperados alterados" no `tasks.md`,
  com cenário e motivo; nenhum muda fora dessa lista.

## Métrica de sucesso

- Exceções da matriz: 1.760 → 756 cenários (só as duas causas restantes).
- Revisão: o treinador não vê mais duração do card diferente da do editor em treino com estrutura
  completa.

## Dependências

- Base: `fix-etapas-sintetizadas-encaixe-total` (arquivada) — matriz, `formatarDuracao`, encaixe com
  duração.

## Open Questions & Assumptions

- **A1** — O desempate de `recalcular-duracao` continua igual para os caminhos que não passam pelo encaixe
  nem por `adotarSomaDasEtapas` (ex.: PRINCIPAL sem pace). Assumido; esses casos estão na exceção `sem-pace`.
- **A2** — Os números da matriz vêm de um modelo de entrada (total concentrado na PRINCIPAL, aquecimento
  e desaquecimento com 0 km); a frequência real desse formato nos planos não foi medida.
