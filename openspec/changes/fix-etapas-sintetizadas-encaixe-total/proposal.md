**Tamanho:** S · **Trilha:** Fast

# Proposal — fix-etapas-sintetizadas-encaixe-total

Quando o reparo estrutural sintetiza aquecimento/desaquecimento e **eles sozinhos já passam do total
prescrito**, o treino vira um bloco contínuo único com o total — a mesma saída que
`fix-etapas-sintetizadas-sessao-curta` já dá quando a PRINCIPAL encaixada fica mais curta que o
aquecimento. Hoje esse caso cai fora da regra e o treino é gravado com card e editor divergentes.

## Status

- draft (2026-11-24): aberta a partir de relato do treinador na revisão de plano (atleta do piloto, semana
  23/11): card do regenerativo com 2 km / 25 min, editor com 5,1 km / 35 min.

## Why

O card da revisão mostra o total do treino (`distanciaKm`, `duracaoMin`); o `TreinoEditDialog` mostra e
soma as etapas. No caso relatado:

1. A LLM prescreveu um REGENERATIVO de 2 km sem aquecimento. `PlanoEstruturaReparador` sintetizou
   aquecimento de 10 min e desaquecimento de 5 min (`PlanoEstruturaReparador.java:69-75`).
2. `corrigir-temporais` deu a eles 1,43 km e 0,74 km pelo pace da PRINCIPAL (6:30–7:00/km).
3. `reconciliarContinuo` (`NormalizacaoDeTreino.java:328`) mantém o total da LLM (decisão de produto de
   22/09: não inflar o volume) e chama `encaixarPrincipalNoTotal`. A sobra é `2,0 − 2,17 < 0`, então o
   encaixe devolve vazio (`TreinoNormalizador.java:356`) e a divergência é só **contada**
   (`plano_etapas_total_divergente{motivo=etapa-sintetizada}`).
4. Na cauda, `recalcular-duracao` mantém os 25 min da LLM porque estão mais perto de ritmo × distância
   (13,5 min) do que a soma das etapas (35 min) — "DURAÇÃO MANTIDA".

Resultado: o treinador revisa um treino de 2 km e, ao editar, encontra 5,1 km. Se salvar sem perceber,
aprova volume 2,5× maior que o prescrito num atleta com lesão ativa.

`fix-etapas-sintetizadas-sessao-curta` (arquivada em 2026-11-18) resolveu o vizinho — sobra positiva
mas PRINCIPAL menor que o aquecimento vira bloco único (CA3 dela) — e deixou de fora a sobra ≤ 0.

## What Changes

Só `apps/menthoros-backend`, em `TreinoNormalizador.encaixarPrincipalNoTotal`:

1. **Sobra ≤ 0 com pace derivável → bloco único.** O treino passa a ter só a PRINCIPAL, com
   `distanciaKm` = total prescrito e duração pelo pace — o mesmo ramo da sessão curta
   (`TreinoNormalizador.java:366-373`), agora também quando não sobra distância.
2. **Sem pace derivável** o comportamento atual fica (encaixe vazio, divergência contada): não há como
   dar duração ao bloco sem inventar ritmo.
3. A duração do cabeçalho se alinha sem mudança extra: com o bloco único, a soma das etapas (~14 min)
   fica mais perto de ritmo × distância do que os 25 min da LLM, e `recalcular-duracao` adota a soma.

Sem contrato de API, sem migration, sem front.

## Fora de escopo

- Planos já gerados com a divergência: o fix vale para gerações novas. Não há backfill.
- Sobra positiva com PRINCIPAL ≥ aquecimento (já encaixa hoje).
- PRINCIPAL sem ritmo (`principal-sem-ritmo`) e a decisão de 22/09 de não inflar o volume.
- Card ou editor exibirem outra fonte de total.

## Critérios de aceite

- **CA1** — GIVEN REGENERATIVO com total 2,0 km, PRINCIPAL a 6:30–7:00/km, aquecimento (10 min) e
  desaquecimento (5 min) sintetizados que somam mais de 2,0 km, WHEN a normalização roda, THEN o treino
  tem uma etapa só, PRINCIPAL, 2,0 km, duração pelo pace (≈ 14 min), e `distanciaKm` = 2,0.
- **CA2** — GIVEN o mesmo caso pela receita TRES_ETAPAS completa, THEN `duracaoMin` do treino é a soma
  das etapas (não os 25 min da LLM) e o contador `plano_etapas_total_divergente{motivo=etapa-sintetizada}`
  não é incrementado.
- **CA3** — GIVEN sobra ≤ 0 e PRINCIPAL sem pace derivável (nem na etapa nem no `ritmoAlvo` do treino),
  THEN o encaixe continua vazio e a divergência continua contada (comportamento atual).
- **CA4** — GIVEN sobra positiva (casos de `fix-total-treino-soma-etapas` e da sessão curta), THEN nada
  muda: os testes existentes de encaixe passam sem alteração.
- **CA5** — Esperados de caracterização/golden que mudarem são alterados um a um, com o motivo.

## Métrica de sucesso

- `plano_etapas_total_divergente{motivo=etapa-sintetizada}` cai nas gerações após o deploy (linha de
  base: contagem dos 7 dias anteriores em produção).
- Revisão: o treinador não encontra mais total do card diferente do total do editor em treino com etapa
  sintetizada.

## Dependências

- Base: `fix-total-treino-soma-etapas` e `fix-etapas-sintetizadas-sessao-curta` (arquivadas).
- Sem conflito com changes ativas conhecidas em `TreinoNormalizador`; conferir no `/implement init`.

## Open Questions & Assumptions

- **A1** — O bloco único é aceitável para o coach também quando a sobra é ≤ 0: é a mesma decisão da
  sessão curta ("juntar tudo num bloco contínuo leve"), aplicada a um total ainda menor.
- **A2** — O treino relatado passou por esse caminho (reparo + sobra negativa). Inferido dos números
  (25 + 10 = 35 min; 1,43 + 0,74 > 2,0 km) e da marca "(gerado pelo sistema)" no aquecimento; não
  conferido no banco.
- **A3** — Os prints mostravam QUA 25/11 no card e SÁB 28/11 no editor; assumido que são dois treinos
  iguais (o de sábado "repete" o de quarta), não o lápis abrindo outro treino — o vínculo por id foi
  conferido em `PlanoDetalhePanel.tsx:619`.
