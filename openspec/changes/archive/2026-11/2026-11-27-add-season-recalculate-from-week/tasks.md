## 1. Backend

Ordem: 1.1 → 1.2 (motor puro, sem dependência) → 1.3 → 1.4 (serviço usa a função) → 1.5. O front (2.x)
só começa com o backend em `develop` (Dependências e rollout).

- [x] 1.1 `SeasonPlannerTest` (`domain/planner`), `@Nested` da função nova: rampa ancorada com os
      números do proposal (âncora 20,0 km e TSS 188, pico 30: semana 3 com 197 e 21,0 km; descarga com
      164 e 17,4 km; última de subida com 282 e 30,0 km); Polimento sobre a referência (282; 188 quando a
      13 é preservada; antes do fator quando a última de subida é descarga livre); longão pela proporção
      da âncora (8,0 em 20 km dá 12,0 em 30 km) e 28% sem longão na âncora; pico acima do teto de rampa
      para no teto; `n = 0`; índices fora da lista de livres não mudam; `plan` com números fixos.
      verify: `./mvnw test -Dtest=SeasonPlannerTest` vermelho só nos testes novos
- [x] 1.2 `SeasonPlanner` (`domain/planner/SeasonPlanner.java`): função pura da rampa ancorada sobre
      `WeekPlan` e lista de índices livres, reaproveitando `longao` (`:257`), `tetoLongao` e
      `TAPER_STRATEGY` (design, Decisão 2). `gerar` não muda.
      verify: `./mvnw test -Dtest=SeasonPlannerTest` verde
- [x] 1.3 `SeasonPlanAdjustmentServiceImplTest`, `@Nested` `updateWeek` com `followingPeakVolumeKm`:
      seguintes livres regravadas como `ENGINE` (inclusive `AI_ACCEPTED`); travadas, `COACH` e anteriores
      não mudam; fase, descarga e marco preservados; trava por `SeasonWeekLock.forPlan` (v1 recalcula a
      semana da prova; ajuste mantém a corrente e a da prova); 422 sem `save` (âncora em Polimento, em
      descarga, com TSS zero; pico menor que a âncora ou acima de 500; semana calculada acima de 500 km
      ou TSS 3000; prova remarcada com número de semanas diferente); semana seguinte com TSS nulo não
      quebra; âncora como última de subida (`n = 0`: Polimento sobre 188, pico alcançado 20,0 no log);
      sem o campo, comportamento atual (`verify(..., never())` na regravação).
      verify: `./mvnw test -Dtest=SeasonPlanAdjustmentServiceImplTest` vermelho só nos testes novos
- [x] 1.4 `SeasonWeekUpdateInputDto.followingPeakVolumeKm` (com `@Schema`); em `updateWeek`
      (`SeasonPlanAdjustmentServiceImpl.java:~140`): validação, checagem de horizonte extraída do
      `recalculate` (`:182`) para método privado comum, conversão `SeasonWeek` → `WeekPlan` (nulos como
      zero), regravação das livres e `recalcularPicos`; log da edição estruturado (temporada, semana,
      `reanchored`) e `season-plan.week-reanchored`; JavaDoc do método atualizado.
      verify: `./mvnw test -Dtest='SeasonPlan*'` verde
- [x] 1.5 Validar: `./mvnw clean verify`.
      verify: BUILD SUCCESS, 0 falhas nos `*IT`

## 2. Frontend

- [x] 2.1 `SeasonPlan.ts` (`SeasonWeekUpdate`): `followingPeakVolumeKm?: number` (cliente curado à mão,
      não rodar `generate:api`).
      verify: `bun run build` sem erro de tipo
- [x] 2.2 Testes do `seasonWeekForm.ts` e do `SeasonWeekEditDialog`: TSS proporcional ao volume e parado
      depois de editado; sem TSS ou volume zero não preenche; opção de recalcular só com fase e descarga
      do formulário em Base, Construção ou Pico sem descarga; pico sugerido pela proporção na alta (24,9)
      e vazio na redução; pico atual ao lado; linhas de consequência com N e M; aviso a partir de 0,5 km
      de diferença (26,4 de 30,0 avisa; 24,1 de 24,2 não; âncora como última de subida usa o volume
      dela); pico menor que o volume desabilita o salvar;
      só envia o pico com a opção marcada.
      verify: `bun test:run` vermelho só nos testes novos
- [x] 2.3 `seasonWeekForm.ts`, `SeasonWeekEditDialog.tsx` (nova prop com as semanas) e
      `SeasonAdjustTable.tsx` (passa `weeks` ao diálogo; mostra o aviso depois de salvar).
      verify: `bun test:run` verde
- [x] 2.4 Validar: `bun lint && bun run build && bun test:run`.
      verify: os três sem erro

## 3. Fechamento

- [ ] 3.1 **Adiada (2026-11-27, arquivamento):** Conferir no homelab: no ajuste do atleta do caso real, editar a próxima semana com recálculo
      das seguintes e pico de 30 km, e ler as semanas no banco
