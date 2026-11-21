# ajustar-taper-pre-prova — ativação antes da prova e ritmo coerente com a FC no taper

**Tamanho:** S · **Trilha:** Full (muda prompt/planner → eval gate + leitura do coach)
**Status:** proposta (2026-11-18)
**Origem:** rodada 3 da revisão cega da migração OpenAI (casos 13–15, preferência leve pelo gpt-4o).

## Por que

1. **Sem ativação pré-prova.** Nenhum dos dois modelos coloca ativação específica na semana da prova
   (strides, ou 2–3 km em ritmo de prova na quinta). Para um avançado buscando 1:28 nos 21 km, o coach
   colocaria.
2. **Ritmo × FC incoerente no taper.** O gpt-6-luna prescreveu contínuo a 6:55–7:05 com FC 145–152,
   quando as zonas do atleta dão ~5:50 para essa FC; ele diz estar "sem exceder os limites de pace
   informados" — conferir quais faixas de pace o prompt manda na fase SEMANA_PROVA.

## O que muda (a detalhar)

- Planner/skeleton da semana de prova reserva uma sessão de ativação (tipo e volume por nível) — ou regra
  explícita no prompt da fase SEMANA_PROVA.
- Investigar e corrigir as faixas de pace que o prompt envia no taper.

## Critérios de aceite (esboço)

- **CA1** — GIVEN atleta avançado com prova no domingo, THEN a semana tem uma sessão de ativação entre
  quarta e sexta (strides ou 2–3 km em ritmo de prova).
- **CA2** — GIVEN o prompt da SEMANA_PROVA, THEN as faixas de pace batem com as zonas de FC do atleta.
- **CA3** — eval candidato + leitura do coach sem regressão.
