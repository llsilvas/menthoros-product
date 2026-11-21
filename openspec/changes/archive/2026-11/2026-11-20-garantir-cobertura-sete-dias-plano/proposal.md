# garantir-cobertura-sete-dias-plano — todo dia da semana é treino ou descanso explícito

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta
**Criado:** 2026-11-16

## Por que

Na revisão cega de 2026-11-16, vários planos dos dois modelos (gpt-4o e gpt-6-luna) deixam dias sem
treino e sem descanso declarado — o coach não sabe se é folga ou esquecimento, e um caso marcou o dia da
prova como "sem treino prescrito". O schema já tem `restDays` (`RestDayLlmDto`), mas nada exige que
`treinosPlanejados ∪ restDays` cubra os 7 dias.

## O que muda

- Pós-geração determinística: dia sem treino e sem `restDay` vira `restDay` com motivo
  "sem prescrição" (não inventa treino).
- Check equivalente no `EvalDeterministicGrader` para o eval medir a lacuna.
- Dia de prova nunca vira descanso: se a prova cai num dia sem treino, o plano é sinalizado (o treino
  PROVA é garantido pelo service de prova no plano — `prova-no-plano-semanal`).

## Critérios de aceite

- **CA1** — GIVEN plano com 4 treinos e 1 `restDay`, THEN os 2 dias restantes viram `restDay` "sem prescrição".
- **CA2** — GIVEN plano com os 7 dias cobertos, THEN inalterado.
- **CA3** — GIVEN eval, THEN a lacuna aparece como violação de qualidade antes da correção.

## Open Questions

- O motivo "sem prescrição" aparece para o coach ou só no log? (Preferência: aparecer, para ele decidir.)

## Evidência adicional (rodada 3 da revisão cega, 2026-11-18)

Nos casos 1, 2 e 7 a 12 o gpt-6-luna lista só um descanso e deixa vários dias sem dizer se são treino ou
descanso. Com o luna como modelo da rota `plano`, esta change sobe de prioridade.
