# show-descanso-no-plano — o treinador vê o descanso com motivo e pode trocá-lo por treino

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta
**Criado:** 2026-09-22
**Depende de:** `add-descanso-explicito-por-fadiga` (backend: campo `descansos` no
`PlanoSemanalOutputDto`). O backend não vai para `main` antes desta change.

## Why

A change de backend transforma o dia omitido em silêncio em **descanso com motivo**
(`descansos: [{diaSemana, motivo}]` no plano). Sem UI, o dado existe na API e o treinador continua
sem vê-lo — a "janela cega" registrada como risco no backend. O descanso é uma proposta da IA como
qualquer treino: o treinador precisa ver o motivo e poder discordar.

## What Changes

Front (`apps/menthoros-front`), sem mudança de contrato além do campo aditivo já entregue.

- **Plano do treinador** (`PlanoDetalhePanel`): cada dia de `descansos` aparece na sequência da
  semana como um cartão de descanso — rótulo "Descanso", cor do tipo `rest` já existente em
  `workoutType.ts`, o **motivo** em destaque, sem duração/RPE/zona.
- **Discordar:** o cartão oferece "Prescrever treino neste dia", que abre o fluxo de criação de treino
  já existente com o dia preenchido; o backend remove o descanso ao criar o treino (CA14 do backend).
- **Home do atleta:** no dia de descanso prescrito, o estado `DESCANSO` de `selectTodayState` mostra o
  motivo em linguagem do atleta, em vez do "sem treino" genérico.
- **Cliente da API:** `descansos` no tipo do plano (cliente curado à mão — **não** rodar
  `generate:api`).

## Fora de escopo

- Converter treino em descanso pela UI (o inverso) — follow-up se o treinador pedir.
- Métrica de aceitação do descanso: o evento de "treino prescrito em dia de descanso" é gerado no
  backend; o painel de métricas é outra change.

## Critérios de aceite

- **CA1** — Given plano com `descansos: [{QUINTA, "TSB −18, abaixo do limiar de −15"}]`, then o painel
  do plano mostra, na quinta, um cartão "Descanso" com o motivo e sem duração/RPE.
- **CA2** — Given plano sem `descansos` (plano antigo, campo ausente ou vazio), then a UI é idêntica à
  de hoje.
- **CA3** — Given o treinador clica "Prescrever treino neste dia", then o diálogo de criação abre com o
  dia preenchido; ao salvar, o cartão de descanso some e o treino aparece.
- **CA4** — Given o atleta abre a home num dia de descanso prescrito, then vê o estado de descanso com
  o motivo.
- **CA5** — Acessibilidade: o cartão de descanso tem rótulo acessível ("Descanso na quinta: <motivo>")
  e contraste do tema.

## Métrica de sucesso

Tempo do treinador para entender um dia sem treino: de "abrir o atleta e investigar" para leitura
direta do motivo no plano; e a taxa de descansos convertidos em treino passa a ser observável.

## Open Questions & Assumptions

- **Assumido:** o fluxo de criação de treino do treinador aceita dia pré-preenchido sem mudança de
  contrato.
- **Em aberto:** texto do motivo para o atleta — o motivo técnico ("TSB −18") serve ao treinador; para
  o atleta, talvez uma versão amigável. Decidir no `/implement init`.
