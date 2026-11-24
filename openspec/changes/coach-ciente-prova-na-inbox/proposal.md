**Tamanho:** S · **Trilha:** Fast

# Proposal — coach-ciente-prova-na-inbox

O treinador passa a dar "Ciente" na prova cadastrada ou alterada pelo atleta **dentro da inbox**, na aba
"Provas & sugestões", sem sair para o perfil do atleta. Quando o motivo de atenção do atleta é
`PROVA_ATLETA`, a inbox já abre nessa aba.

## Why

A change `atleta-cadastra-prova` deu ao atleta autonomia para criar, editar e cancelar provas sem
aprovação. O treinador é avisado pela fila de atenção (motivo `PROVA_ATLETA`, flag
`revisadaPeloCoach=false`) e resolve o aviso com "Ciente". Hoje esse fluxo tem três atritos:

1. **O "Ciente" só existe no perfil** (`CoachAthleteProfilePage`, card "Provas"). O aviso aparece na
   inbox, mas a ação mora em outra tela: o treinador sai da triagem, clica e volta, perdendo o lugar
   na fila para a ação mais leve que existe.
2. **A aba "Provas & sugestões" da inbox não mostra a pendência.** Ela lista `selected.raceCalendar`
   (dado do dashboard): data, nome e tag. Não mostra o motivo ("Nova", "Alvo trocada", "Data
   alterada", "Cancelada"), não mostra preparação curta e não oferece ação.
3. **A inbox abre sempre em "Diagnóstico"** (`CoachInboxPage.tsx:127`), mesmo quando o único motivo
   de atenção do atleta é a prova.

## What Changes

Tudo em `apps/menthoros-front`. Sem contrato de API novo, sem backend.

1. **Aba "Provas & sugestões" usa o painel de provas do coach.** `RacesSuggestionsTabPanel` troca a
   lista de `selected.raceCalendar` pelo `AthleteRacesPanel`, alimentado por `useCoachAthleteRaces`
   (os mesmos componente e hook do perfil). Ganha chips de alvo, preparação curta, cancelada e motivo
   da pendência, e o botão "Ciente".
2. **"Ciente" atualiza a fila.** Depois de marcar ciente, a inbox recarrega a fila de atenção (mesmo
   comportamento do perfil, `CoachAthleteProfilePage.tsx:116`), e o aviso some da lista.
3. **Aba inicial por motivo.** Ao selecionar um atleta cujo motivo de atenção
   (`selectedAttention.reason`) é `PROVA_ATLETA`, a aba ativa vira `races`. Retorno explícito de outra
   tela (`retorno.tab`) continua tendo prioridade.
4. **Mantidos:** previsão de forma, "Ver calendário completo", painel "Sugestões recentes" e o card
   "Provas" do perfil (mesmo componente, então os dois lugares não divergem).

## Fora de escopo

- CRUD de prova pelo treinador.
- Mudança no cálculo do sinal de atenção ou no endpoint `PATCH .../provas/{id}/ciente`.
- Ação "Ciente" em lote ou direto na linha da lista da inbox.
- Remover o card "Provas" do perfil.

## Critérios de aceite

- **CA1** — Given um atleta com prova pendente de ciência, When o treinador abre a aba "Provas &
  sugestões" da inbox, Then a prova aparece com o chip do motivo e o botão "Ciente".
- **CA2** — Given a aba aberta com prova pendente, When o treinador clica "Ciente", Then
  `ProvaService.marcarCiente(atletaId, provaId)` é chamado, a lista de provas recarrega sem o botão
  e a fila de atenção é recarregada.
- **CA3** — Given um atleta cujo motivo de atenção é `PROVA_ATLETA`, When o treinador o seleciona na
  inbox, Then a aba ativa é "Provas & sugestões".
- **CA4** — Given um atleta com outro motivo de atenção (ou sem atenção), When selecionado, Then a aba
  inicial continua "Diagnóstico". Given um `retorno.tab` explícito, Then ele prevalece.
- **CA5** — Given a aba aberta, Then a previsão de forma (quando existe), "Ver calendário completo" e
  "Sugestões recentes" continuam presentes.
- **CA6** — Given falha ao carregar as provas, Then a aba mostra o erro com "Tentar novamente", sem
  derrubar o restante da inbox.

## Métrica de sucesso

- **Cliques e telas para resolver um aviso de prova**: hoje ≥ 4 cliques e 2 trocas de tela
  (selecionar atleta, abrir perfil, Ciente, voltar à inbox); meta 2 cliques e 0 trocas (selecionar
  atleta, Ciente). Verificado no teste de componente e na validação manual.
- **O que a change não afirma**: tempo de triagem em minutos; o front não tem telemetria para isso.

## Dependências

- Base: `atleta-cadastra-prova` (arquivada) — `AthleteRacesPanel`, `useCoachAthleteRaces`,
  `coachRaceAdapters`, endpoint de ciência.
- **`coach-inbox-notebook-height`** (ativa) também mexe em `CoachInboxPage.tsx`. Sem conflito de
  comportamento (aquela é altura; esta é conteúdo da aba e aba inicial). A aba fica mais alta com os
  chips; a 6.3 daquela change já verifica as três abas em 1366×625.

## Open Questions & Assumptions

- **A1** — O `atletaId` usado pelo hook é o `selectedId` da inbox (mesmo id do perfil). Confirmar na
  task 1.1.
- **A2** — `refetchQueue` (ou o recarregamento do dashboard que alimenta `inboxQueue`) está
  acessível na `CoachInboxPage`. Se a fila vier só do `CoachLayoutOutletContext`, usar o mesmo
  caminho do perfil.
- **A3** — Quando o atleta tem `PROVA_ATLETA` e outro motivo ao mesmo tempo, a fila expõe um único
  `reason` (o de maior prioridade). Assumido: a aba inicial segue esse `reason`; se ele não for
  `PROVA_ATLETA`, abre em "Diagnóstico", e a prova pendente continua visível pela aba.
- **A4** — Trocar de atleta na lista reaplica a regra da aba inicial; trocar de aba manualmente não é
  sobrescrito enquanto o atleta selecionado não mudar.
