**Tamanho:** S · **Trilha:** Fast

# Proposal — fix-distancia-treino-soma-etapas

Em treino de três etapas (REGENERATIVO, CONTINUO, LONGO) cuja PRINCIPAL não tem ritmo — nem na etapa nem
no cabeçalho, caso típico de atleta sem limiar cadastrado —, o total do treino fica o da LLM e não bate
com a soma das etapas. Aquecimento e desaquecimento ganham distância pelo pace Z2 (`corrigir-temporais`),
a PRINCIPAL fica com a distância da LLM, e card (total) e editor (etapas) contam volumes diferentes.
Esta change dá à PRINCIPAL sem ritmo o mesmo pace de fallback do aquecimento, e o treino passa pelo
caminho que já existe: distância pelo pace e total = soma das etapas.

## Status

- draft (2026-11-27): follow-up A9 de `fix-duracao-treino-estrutura-completa` (arquivada), que deixou a
  exceção `sem-pace` (504 cenários) na matriz de invariantes.
- Fecha o follow-up **A9** de `fix-etapas-sintetizadas-encaixe-total` ("PRINCIPAL sem pace: derivar o pace da
  zona do atleta, como já se faz no aquecimento"), que somava 492 cenários (240 completa + 252 sintetizada).
  É a 7ª change da série total × etapas desde 2026-09-24; depois dela a única exceção de contínuo é TEMPO_RUN.
- **Decisão do dono do produto (2026-11-27):** PRINCIPAL sem ritmo recebe o pace Z2 (limiar × 1,20, ou
  7:00/km sem limiar) e o total vira a soma das etapas, com a duração da LLM preservada. Alternativas
  descartadas: encaixar a PRINCIPAL no total da LLM (paces de 10–20 min/km, bloco único quando não sobra
  distância); só adotar a soma como total (mantém o pace absurdo na PRINCIPAL e infla quando a LLM
  concentrou o total ali).

## Why

Caso real (homelab, Carla Oliveira, sem `pace_limiar`, semanas de 30/11 e 07/12/2026, geradas em
27/11 com develop em `f9cdf72`):

| Treino | Total gravado | Soma das etapas | PRINCIPAL (LLM) |
|---|---|---|---|
| REGENERATIVO 30/11 | 1,00 km | 2,94 km | 10 min / 0,80 km (12:30/km) |
| CONTINUO 03/12 | 1,20 km | 2,02 km | 8 min / 0,60 km (13:20/km) |
| LONGO 05/12 | 2,50 km | 3,22 km | 20 min / 1,80 km (11:07/km) |
| CONTINUO 10/12 | 1,00 km | 2,20 km | 7 min / 0,35 km (20:00/km) |
| FARTLEK 01/12 | 3,60 km | 3,60 km | — (receita própria, bate) |

Caminho: `NormalizacaoDeTreino.reconciliarContinuo` → `principaisComDistanciaPorPace` falso (o
`paceDerivavel` não acha ritmo) → `registrarDivergenciaMantida(…, "principal-sem-ritmo")` → total da LLM
mantido. O desvio existe para não inflar quando a LLM concentra o total do treino na PRINCIPAL; aqui ela
não concentrou, e o aquecimento já foi recalculado pelo pace Z2 — as duas metades do treino usam
critérios diferentes.

## What Changes

Só `apps/menthoros-backend`:

1. **PRINCIPAL sem ritmo derivável recebe o pace Z2 de fallback** — o mesmo de
   `corrigirDistanciasEtapasTemporais` (`paceLimiar × FATOR_PACE_Z2`, ou `PACE_Z2_DEFAULT_MIN_KM`) — nos
   tipos REGENERATIVO, CONTINUO e LONGO. O fallback entra em `paceDerivavel` (depois do ritmo da etapa e
   do cabeçalho, e só com duração > 0 — a guarda de duração continua antes), então vale para os três
   consumidores:
   - **Estrutura completa** (`distanciaPrincipalPorPace` + `principaisComDistanciaPorPace`): distância da
     PRINCIPAL = `duracaoMin ÷ pace`, e `reconciliarContinuo` segue para `adotarSomaDasEtapas` (total = soma,
     duração = soma das durações).
   - **Etapa sintetizada** (`encaixarPrincipalNoTotal`, decisão do dono do produto em 2026-11-27): o total da
     LLM continua a verdade (regra de 22/09, não inflar o que o sistema sintetiza); a PRINCIPAL recebe a
     sobra e a **duração pelo pace Z2**, e o treino a duração = soma das etapas. Sem sobra, ou com a PRINCIPAL
     encaixada mais curta que o aquecimento, bloco único com o total da LLM e duração = total × pace (regras de
     `fix-etapas-sintetizadas-sessao-curta` e `fix-etapas-sintetizadas-encaixe-total`).
2. O `ritmoAlvo` da etapa **não é preenchido**: o fallback serve só para derivar distância/duração (o atleta
   não passa a ver um ritmo-alvo que ninguém prescreveu).
3. **Matriz:** a grade ganha limiar nulo; o predicado `volumeEhASoma` passa a valer também sem ritmo nos três
   tipos; a exceção `sem-pace` fica só com o que continua divergindo (TEMPO_RUN). O inventário final é medido
   na implementação e registrado em "Esperados alterados".

Sem contrato de API, sem migration, sem front, sem dependência nova. **Rollback:** revert do PR (sem dado
persistido de forma diferente além dos planos gerados no intervalo).

## Fora de escopo

- TEMPO_RUN sem ritmo: pace Z2 seria o estímulo errado (limiar); continua na exceção.
- PRINCIPAL sem duração (sem como derivar distância): comportamento atual (a grade da matriz não gera esse
  caso; coberto por teste unitário).
- Etapa auxiliar (aquecimento/desaquecimento) que chega com distância 0 e sem duração: `adotarSomaDasEtapas`
  e `encaixarPrincipalNoTotal` continuam devolvendo o treino intacto — a promessa "total = soma" vale só
  quando toda etapa auxiliar tem distância calculável.
- Paces absurdos da LLM e TSS dos treinos sem limiar (ex.: regenerativo de 25 min com TSS 25) — outra causa.
- Bloquear geração para atleta sem limiar; planos já gerados (sem backfill).

## Critérios de aceite

- **CA1** — GIVEN atleta sem `pace_limiar`, REGENERATIVO de 1,00 km da LLM com aquecimento 10 min,
  PRINCIPAL 10 min / 0,80 km e desaquecimento 5 min, nenhum ritmo na etapa nem no cabeçalho, WHEN
  normalizado pela receita completa, THEN a PRINCIPAL tem `distanciaKm` = 10 ÷ 7,0 ≈ 1,43 km, o
  `distanciaKm` do treino = soma das etapas (≈ 3,57 km), `duracaoMin` = `25:00` e o `ritmoAlvo` da
  PRINCIPAL continua nulo.
- **CA2** — GIVEN o mesmo treino com atleta de limiar 5:00/km, THEN a PRINCIPAL usa 6:00/km
  (5,00 × 1,20) e o total = soma das etapas.
- **CA3** — GIVEN TEMPO_RUN com PRINCIPAL sem ritmo, THEN comportamento atual (total da LLM mantido,
  contador `plano_etapas_total_divergente{motivo=principal-sem-ritmo}` incrementado).
- **CA4** — GIVEN PRINCIPAL com ritmo (na etapa ou no cabeçalho), THEN nada muda: o ritmo declarado vence
  o fallback.
- **CA5** — GIVEN a matriz (com limiar nulo na grade), THEN nenhum cenário REGENERATIVO/CONTINUO/LONGO sem
  ritmo viola as invariantes da sua estrutura (completa: total = soma; sintetizada: total = prescrito e
  card = editor); `sem-pace` fica só com TEMPO_RUN.
- **CA7** — GIVEN atleta sem limiar, CONTINUO de 4,00 km da LLM só com PRINCIPAL sem ritmo (o reparador
  sintetiza aquecimento 10 min e desaquecimento 5 min → 1,43 + 0,71 km pelo pace 7:00), WHEN normalizado,
  THEN total = 4,00 km, PRINCIPAL = 1,86 km e `round(1,86 × 7) = 13` min, `duracaoMin` do treino = `28:00`.
- **CA7b** — GIVEN o mesmo com 3,00 km, THEN a PRINCIPAL encaixada (0,86 km, 6 min) fica mais curta que o
  aquecimento → bloco único de 3,00 km, `duracaoMin` = `21:00`.
- **CA8** — GIVEN o mesmo com total de 1,00 km (aquecimento + desaquecimento sintetizados não cabem),
  THEN bloco único: 1,00 km, `duracaoMin` = `07:00`.
- **CA6** — Esperados de caracterização/golden alterados aparecem em "Esperados alterados" no `tasks.md`,
  com cenário e motivo.

## Métrica de sucesso

- Exceção `sem-pace` da matriz: 504 → só os cenários de TEMPO_RUN.
- Revisão: o treinador não vê mais total do card diferente da soma das etapas em treino contínuo de atleta
  sem limiar.

## Dependências

- Base: `fix-duracao-treino-estrutura-completa` (arquivada) — `adotarSomaDasEtapas` com duração, matriz.

## Open Questions & Assumptions

- **A1** — O volume do treino pode subir em relação ao declarado pela LLM (caso CA1: 1,00 → 3,57 km).
  Aceito pela decisão: a duração da LLM é o dado mais confiável quando não há pace, e o pace Z2 é o mesmo já
  aplicado ao aquecimento.
- **A2** — A soma da semana passa a ser outra que o `volume_planejado_km` que o planner mirou; os gates de
  volume/TSS da semana podem apontar violação nova em atletas sem limiar. Não medido.
- **A1b** — Com etapa sintetizada o efeito é o inverso: a duração pode cair muito (CA8: treino de 1,00 km
  passa a 7 min). Aceito pela decisão: o total da LLM é a verdade nesse caminho.
- **A3** — Z2 para a PRINCIPAL de LONGO e CONTINUO é uma aproximação: quem tem limiar normalmente recebe
  ritmo da LLM e não cai neste caminho.
