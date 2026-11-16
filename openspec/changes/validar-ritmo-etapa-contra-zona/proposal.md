# validar-ritmo-etapa-contra-zona — o ritmo declarado em cada etapa contra a zona fisiológica do atleta

**Tamanho:** S · **Trilha:** Full (muda prescrição da IA → eval gate + validação com treinador)
**Status:** proposta
**Criado:** 2026-11-16
**Depende de:** `add-etapa-pace-validator` (que torna distância e duração coerentes com o ritmo declarado)
e, para os números das zonas, `revalidar-fatores-pace-zonas`.

## Por que

`add-etapa-pace-validator` assume que o `ritmoAlvo` da etapa é a verdade e repara a distância. Mas o
ritmo escrito pela LLM pode estar errado para o tipo de etapa: na revisão cega de 2026-11-16 o sub-3h
(limiar 3:50/km) recebeu aquecimento de 6:00–6:30/km, e um "regenerativo" do gpt-4o veio com FC de
limiar. A etapa fica coerente consigo mesma e errada para o atleta. O `EtapaFcValidator` já faz isso
para FC (zona esperada por tipo de etapa); para pace não existe nada.

## O que muda

- Validador de pace por tipo de etapa (AQUECIMENTO/DESAQUECIMENTO/RECUPERACAO/PRINCIPAL por tipo de
  treino) contra a zona de `ZonaTreinoService.calcularZonasPace(paceLimiar)`, no padrão do
  `EtapaFcValidator`: fora da zona esperada, corrige o `ritmoAlvo`; roda **antes** do reparo de
  distância de `add-etapa-pace-validator`, para que a distância saia do ritmo já corrigido.
- Sem `paceLimiar`, não valida.

## Fora de escopo

Mudar os fatores das zonas (é `revalidar-fatores-pace-zonas`).

## Critérios de aceite

- **CA1** — GIVEN atleta com limiar 3:50/km e AQUECIMENTO com ritmo 6:00–6:30/km, THEN o ritmo vai para a
  faixa de aquecimento da zona do atleta e a distância é recalculada a partir dele.
- **CA2** — GIVEN ritmo dentro da zona esperada, THEN inalterado.
- **CA3** — GIVEN atleta sem `paceLimiar`, THEN inalterado.
- **CA4** — eval candidato e revisão do coach sem regressão (gate de `plan-generation-eval-set`).

## Open Questions

- Qual zona é "esperada" para cada par (tipo de etapa, tipo de treino) — mesma tabela do `EtapaFcValidator`?
- Tolerância antes de corrigir (o `EtapaFcValidator` usa sobreposição de 50%).
