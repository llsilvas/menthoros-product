**Tamanho:** S · **Trilha:** Fast

> Fast: prompt de tradução e um pós-processador determinístico no backend, sem schema nem contrato.

**Status:** proposta (2026-11-16)
**Criado:** 2026-11-16
**Origem:** veredito do coach em `docs/ia/traducao-simple-vs-haiku-2026-11-15.md` (backend), task 3.2 de
`consolidate-llm-on-openai`.

## Por que

A revisão cega de 40 traduções mostrou problemas que nenhum modelo resolve sozinho, inclusive o Haiku de
produção: gênero de "o RPE", ordem de "delta de RPE", *overreaching* traduzido de três jeitos, pace × ritmo,
nota/pontuação/score, rótulo de produto (`CONCERNING`) traduzido como "ALERTA", e números fora da norma
pt-BR ("+2.5", "800m", "24-48"). Consistência é o que o coach percebe ao ler análises em sequência.

## O que muda

1. **Glossário** de ~20 termos travado em `prompts/translate-field-prompt.txt`, incluindo a regra de não
   traduzir rótulos de faixa em caixa alta.
2. **Pós-processador determinístico** aplicado à saída de `WorkoutAnalysisTranslator`: vírgula decimal,
   espaço entre número e unidade (`800 m`, `9,4 km`), intervalo com travessão curto (`24–48`).
3. **Checagem de cobertura** no script do comparativo (`docs/ia/traducao-simple-vs-haiku-comparar.py`):
   além de números, sinalizar frase do original sem correspondente na tradução.

## Fora de escopo

Trocar de modelo (feito em `consolidate-llm-on-openai`); traduzir rótulos de faixa no front.

## Critérios de aceite

- **CA1** — GIVEN textos com "+2.5", "800m", "24-48" e "9.4km", WHEN pós-processados, THEN saem "+2,5",
  "800 m", "24–48" e "9,4 km"; horários ("5:12/km") e siglas (Z1, TSB) ficam intactos (teste unitário
  parametrizado).
- **CA2** — GIVEN o comparativo rodado de novo com o glossário, THEN zero ocorrências de "a RPE",
  *overreaching* fora da forma escolhida e rótulo de faixa traduzido.
- **CA3** — GIVEN uma tradução sem uma frase do original, THEN o script do comparativo a sinaliza.

## Métrica de sucesso

Coach lê análises com o mesmo vocabulário em todos os campos e treinos; nenhuma ocorrência dos termos
do glossário fora da forma travada numa nova rodada do comparativo.

## Open Questions & Assumptions

- **Aberto (coach):** forma final de cada termo do glossário (ex.: *overreaching* em inglês ou
  "excesso de treino"; pace ou ritmo). Preciso da lista dele antes da task 1.
- **Assumido:** o pós-processador roda só na tradução da análise; outros textos gerados (plano,
  mensagem ao atleta) ficam para depois.
