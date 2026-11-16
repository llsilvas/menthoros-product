# add-regra-dor-lesao-prompt — regra de dor para atleta com lesão ativa

**Tamanho:** S · **Trilha:** Full (muda prompt de produção → eval gate)
**Status:** proposta
**Criado:** 2026-11-16

## Por que

Na revisão cega de 2026-11-16 (tendinite e Aquiles inflamado), nenhum dos dois modelos incluiu regra de
interrupção por dor. Na prática clínica de retorno de tendinopatia, o padrão é: parar se a dor passar de
3/10 durante o treino ou se piorar nas 24 h seguintes. O coach precisa ver essa regra no plano do atleta
com lesão.

## O que muda

- Prompt de geração de plano: quando o atleta tem lesão ativa, cada treino traz na descrição a regra de
  dor (limiar 3/10 e janela de 24 h) — texto fixo, não gerado livremente.
- Alternativa determinística a avaliar: anexar o texto no pós-processamento em vez de pedir à LLM.

## Critérios de aceite

- **CA1** — GIVEN atleta com lesão ativa, THEN todo treino do plano traz a regra de dor.
- **CA2** — GIVEN atleta sem lesão, THEN nenhum traz.
- **CA3** — eval candidato sem regressão (`plan-generation-eval-set`).

## Open Questions

- Texto exato e limiar (3/10 é o default da literatura de tendinopatia; o coach confirma).
- Prompt ou pós-processamento determinístico? (Preferência: pós-processamento — não depende da LLM.)
