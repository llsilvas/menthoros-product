# show-descanso-no-plano — o treinador vê o descanso com motivo e pode trocá-lo por treino

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta
**Criado:** 2026-09-22
**Revisado:** 2026-09-22 (contrato corrigido e escopo do atleta ampliado — ver "Correções de 22/09")
**Depende de:** `add-descanso-explicito-por-fadiga` (backend, PR #142 **mergeado em `develop`**).
O backend não vai para `main` antes desta change (task 5.3 de lá).

## Why

A change de backend transformou o dia omitido em silêncio em **descanso com motivo**. Sem UI, o dado
existe na API e o treinador continua sem vê-lo — é a "janela cega" registrada como risco lá.

O descanso é uma proposta da IA como qualquer treino: o treinador precisa ver **por que** a IA tirou
a sessão e poder discordar. Hoje o atleta também não distingue "a IA decidiu que você descansa" de
"não tem nada marcado" — as duas coisas aparecem como dia vazio.

## Contrato (verificado no código, não na spec anterior)

```ts
restDays: Array<{ dayOfWeek: string; reason: string }>   // ex.: { dayOfWeek: "QUINTA", reason: "..." }
```

`PlanoSemanalOutputDto.restDays` (`dto/output/PlanoSemanalOutputDto.java:91`), vazio quando a semana
é toda de treino **ou** o plano é anterior à feature — o front trata ausente e vazio igual.

> **Correções de 22/09.** A versão anterior desta proposta dizia `descansos: [{diaSemana, motivo}]`,
> em PT-BR. O backend entregou em inglês (ADR-0007) e a spec ficou para trás; implementar pelo texto
> antigo daria campo inexistente em runtime. Também ampliei o escopo do atleta: a spec só citava a
> *home*, e a decisão do founder (22/09) foi cobrir **as duas telas** dele.

## What Changes

Front (`apps/menthoros-front`) apenas. Nenhuma mudança de contrato: o campo é aditivo e já está em
`develop`.

- **Tipos (cliente curado à mão — NÃO rodar `generate:api`):** `restDays` em `PlanoSemanalDto`
  (`src/types/PlanoReview.ts:113`) e no `PlanoSemanal` do domínio do atleta
  (`src/types/PlanoSemanal.ts:10`).

- **Plano do treinador** (`src/features/coach/components/PlanoDetalhePanel.tsx`): os descansos entram
  **na mesma lista de chips** dos treinos (`:606`), ordenados por dia da semana, como um chip de
  descanso — rótulo "Descanso", o **motivo** visível, sem duração/RPE/zona.

  **Decisão de escopo (founder, 22/09):** intercalar na lista existente, **não** converter o painel
  numa grade de 7 dias. O painel hoje é uma lista achatada (`sessoes.map`), sem slot para dia sem
  treino; virar grade é redesenho de uma tela estável e não é o que entrega o valor aqui — o valor é
  o motivo ficar visível. Grade fica como follow-up, se o treinador sentir falta.

- **Discordar:** o chip de descanso oferece "Prescrever treino neste dia", que abre o
  `TreinoAddDialog` já existente com `dataTreino` pré-preenchida com a data daquele dia. O backend
  remove o descanso ao criar o treino (CA14 de lá), então o front só precisa recarregar o plano.

- **Atleta — agenda da semana** (`src/features/athlete/adapters/buildWeekAgenda.ts` +
  `components/WeekAgendaRow.tsx`): hoje o dia sem treino é inferido por `workout === null`. Passa a
  distinguir **descanso prescrito** (com motivo) de **dia vazio**.

- **Atleta — home** (`selectTodayState`): no dia de descanso prescrito, mostra o motivo em vez do
  "sem treino" genérico.

## Fora de escopo

- Converter treino em descanso pela UI (o inverso).
- Grade de 7 dias no painel do treinador (ver decisão acima).
- Painel de métricas de aceitação do descanso — a telemetria é do backend
  (`plano_descanso_nao_autorizado`, `plano_dia_sem_prescricao`).

## Critérios de aceite

- **CA1** — Given plano com `restDays: [{dayOfWeek: "QUINTA", reason: "Readiness do dia é DESCANSAR,
  TSB -11,8 (limiar -25)"}]`, when o treinador abre o painel, then vê um chip "Descanso" na posição
  da quinta, com o motivo e sem duração/RPE.
- **CA2** — Given plano com `restDays` ausente, `null` ou `[]` (plano anterior à feature), then a UI é
  **idêntica** à de hoje — nenhum elemento novo.
- **CA3** — Given o treinador clica "Prescrever treino neste dia" num descanso de quinta, then o
  `TreinoAddDialog` abre com `dataTreino` = a data da quinta daquela semana; ao salvar, o chip de
  descanso some e o treino aparece.
- **CA4** — Given o atleta abre a agenda da semana, then o dia de descanso prescrito aparece marcado
  como descanso **com o motivo**, e um dia sem nada continua aparecendo como dia vazio (os dois
  estados são distinguíveis).
- **CA5** — Given o atleta abre a home num dia de descanso prescrito, then vê o estado de descanso com
  o motivo.
- **CA6** — Ordenação: com treinos e descansos na mesma semana, a lista do treinador sai em ordem de
  dia (segunda→domingo), sem duplicar dia.
- **CA7** — Acessibilidade: o chip de descanso tem rótulo acessível ("Descanso na quinta: <motivo>") e
  respeita o contraste do tema.

## Métrica de sucesso

O treinador entende um dia sem treino lendo o plano, em vez de abrir o atleta e investigar. E a taxa
de descansos convertidos em treino passa a ser observável — insumo da task 5.4 do backend (revisão de
calibração dos limiares depois de 4 semanas).

## Riscos

- **Motivo técnico vazando para o atleta.** O `reason` é escrito para o treinador e cita sinal, valor
  e limiar ("TSB -11,8 (limiar -25)"). Exibir isso cru na tela do atleta é ruim — ver Open Questions.
- **Plano legado.** Todo plano anterior à feature tem `restDays` vazio; CA2 existe para garantir que
  nada muda para eles.

## Open Questions & Assumptions

- **Assumido (verificado):** `TreinoAddDialog` aceita a data pré-preenchida — o payload
  `TreinoPlanejadoAddPayload` já leva `dataTreino` ISO (`src/types/PlanoReview.ts:65`).
- **Em aberto — texto para o atleta.** O `reason` técnico serve ao treinador. Para o atleta, decidir
  no `/implement init` entre: (i) mostrar o mesmo texto; (ii) mapear por tipo de sinal para uma frase
  amigável no front; (iii) o backend devolver as duas versões (aí vira change de backend).
  Recomendação: (ii) nesta change, com (iii) como evolução se o mapeamento crescer.
