**Tamanho:** XS · **Trilha:** Fast

# Proposal — coach-profile-provas

O perfil do atleta para o treinador (`GET /api/v1/coach/atletas/{atletaId}/perfil`) passa a devolver a lista
`provas`: as provas futuras e não canceladas do atleta, em ordem de data. O front já lê esse campo; o
backend nunca o enviou.

## Why

Com `SEASON_PLAN_ENABLED=true`, a aba Temporada do inbox dizia "Sem prova-alvo" para atleta que tem
prova-alvo cadastrada (reportado em 2026-11-24, em dev local).

Causa: o front decide se há prova-alvo por `selectedProfile.provas`
(`CoachInboxPage.tsx`, `hasTargetRace`), com fallback para `[proximaProva]`. O DTO do backend não tem
`provas`, então vale só o fallback. E `proximaProva` é a prova futura **mais próxima**, alvo ou não
(`CoachAthleteProfileServiceImpl.getProximaProva`). Basta uma preparatória antes da prova-alvo para a
aba concluir que não há alvo e esconder o botão de gerar a temporada.

O mesmo buraco afeta o calendário de provas do inbox (`buildRaceCalendarFromProfile`): ele foi escrito
para a lista inteira, e hoje mostra uma prova só.

## What Changes

- `AtletaPerfilCoachOutputDto` ganha `List<ProvaOutputDto> provas`, preenchido com a lista que o
  service já busca (`findUpcomingByAtletaIdAndTenantId`: data ≥ hoje, status ≠ `CANCELADA`, ordem de
  data). Mudança aditiva no contrato.
- `proximaProva` não muda (continua a prova futura mais próxima). O `@Schema` dele, que dizia "Prova
  alvo do atleta", passa a dizer o que o campo faz.
- Front: nenhuma mudança. `hasTargetRace` e o calendário já consomem `provas`.

## Fora de escopo

- Prova-alvo com data passada continua sem temporada (o filtro de provas futuras é intencional).
- Regenerar o client OpenAPI do front: o tipo `AtletaPerfilCoachDto` é escrito à mão e já tem
  `provas?: Prova[]`.

## Critérios de aceite

1. Atleta com uma prova preparatória antes da prova-alvo: o perfil traz as duas em `provas`, em ordem
   de data, e `proximaProva` continua sendo a preparatória.
2. Atleta sem provas futuras: `provas` é lista vazia (não nulo) e `proximaProva` é nulo.
3. Na aba Temporada, o atleta do item 1 mostra o botão de gerar a temporada (validação manual em dev).

## Riscos

- Payload do perfil cresce pelo número de provas futuras do atleta (poucas, na prática).
- Rollback: reverter o commit; o front volta ao fallback de `proximaProva`.
