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

## Decisão de escopo (coach-fundador, 2026-11-18)

**Esta change faz só a sanidade das faixas de ritmo.** O cruzamento com a zona do atleta fica para
depois de `revalidar-fatores-pace-zonas`: as zonas de pace atuais (Z1/Z2) estão 20–40 s/km mais rápidas que
a literatura, e validar contra elas espalharia o erro para todas as etapas.

Sanidade (antes de qualquer derivação de distância, no início de toda receita de `NormalizacaoDeTreino`,
no ritmo do treino e no de cada etapa):

- faixa invertida (`11:00-7:00`) → desinvertida (`7:00-11:00`, e aí cai na regra seguinte se absurda);
- faixa zerada (`00:00-00:00`) ou absurda (mais rápida que 2:30/km ou mais lenta que 12:00/km) →
  descartada (`null`), e a etapa passa a usar o ritmo do treino ou a zona (fallbacks já existentes);
- ritmo único (`4:10`, do treino PROVA) e texto livre ficam como estão.

**Critérios de aceite desta fatia:** S1 — `"11:00-7:00/km"` vira `"7:00-11:00/km"`; S2 — `"00:00-00:00/km"`,
`"70:00-60:00/km"`, `"20:00-20:00/km"` viram `null`; S3 — `"6:30-7:00/km"` e `"4:10"` intactos; S4 — a etapa
com ritmo descartado ganha distância pelo ritmo do treino (cadeia existente).
