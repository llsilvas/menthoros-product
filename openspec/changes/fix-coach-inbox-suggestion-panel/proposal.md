# Proposal: fix-coach-inbox-suggestion-panel

**Tamanho:** S · **Trilha:** Fast (frontend-only, sem contrato de API, sem migration; um hook
compartilhado e dois componentes do inbox)

## Status

- Proposta inicial (2026-09-28), a partir da validação manual da task 2.2 de
  `add-coach-suggestion-review-actions` (arquivada), feita no ambiente local + homelab.

## Why

A validação no navegador (sugestão real da Maria Santos, gerada pelo `SugestaoCoachGeneratorJob`)
mostrou que aprovar funciona no backend — `POST /coach/sugestoes/{id}/aprovar` 200, status persiste —,
mas o **inbox** mostra ao treinador um estado falso em dois pontos:

1. **A lista de sugestões não atualiza depois da decisão.** O coach aprova, fecha o dialog e a lista
   segue "Pendente" até recarregar a página. Causa: `RacesSuggestionsTabPanel.tsx:101` monta o
   `RecentSuggestionsPanel` sem `onDecisao`; só `CoachAthleteProfilePage` repassa o refetch. A
   `CoachInboxPage` já tem `fetchSelectedProfile` (`CoachInboxPage.tsx:111`) e não o entrega.
2. **O painel do atleta selecionado mistura dados de dois atletas.** Observado: Maria Santos
   destacada no roster, com cabeçalho e KPIs do Leandro Silva; depois, Diagnóstico da Maria sob o
   cabeçalho do Leandro. Causa: `useAthleteProfile.fetchProfile` grava qualquer resposta que chegar,
   sem descartar a de uma requisição anterior. No inbox o id buscado é
   `selectedId ?? dashboardRoster[0]?.atletaId`; o dashboard é pedido duas vezes na carga, o
   primeiro do roster muda entre as respostas, saem duas buscas de perfil e vale a última a chegar.
   O `selected` combina então o item do roster de um atleta com o perfil de outro.

O item 2 é o mais grave: o coach pode ler carga, forma e risco de um atleta achando que são de outro
— justamente a tela onde ele decide. O item 1 é a tela contradizendo a ação que o coach acabou de
fazer.

Junto, polimento do mesmo dialog (item 3): os chips de tipo e confiança mostram o enum cru
(`PLAN_ADJUST`, `MEDIUM`) enquanto a lista, ao lado, já mostra "Ajuste de plano" e "Média"; e a
justificativa exibe o nome interno das regras (`CoachAttentionSignalEvaluator.avaliarAderencia, …`).

## What Changes

- **`useAthleteProfile`**: descartar resposta que não corresponde ao `atletaId` da requisição mais
  recente (guarda por requisição — ex. id/ref da última chamada, ou flag de cancelamento no efeito).
  Vale para os três consumidores do hook (inbox, perfil do atleta, `useWeeklyAthleteReview`).
- **Inbox**: o painel do atleta selecionado só combina roster e perfil quando o perfil é do mesmo
  atleta (`profile.atletaId === selectedRosterItem.atletaId`); enquanto não for, trata como
  carregando, em vez de mostrar dados de outro atleta.
- **Inbox**: `CoachInboxPage` → `RacesSuggestionsTabPanel` → `RecentSuggestionsPanel` recebe
  `onDecisao={fetchSelectedProfile}`, como já faz `CoachAthleteProfilePage`.
- **Dialog de sugestão**: chips de tipo e confiança usam os mesmos rótulos PT-BR da lista; a linha de
  regras internas não é exibida ao coach.

## Impact

- `menthoros-front`: `src/hooks/useAthleteProfile.ts`, `features/coach/pages/CoachInboxPage.tsx`,
  `features/coach/components/panels/RacesSuggestionsTabPanel.tsx`,
  `features/coach/components/RecentSuggestionsPanel.tsx` e testes.
- **Backend:** nenhum. **Contrato de API:** nenhum. **Migration:** nenhuma.

## Critérios de aceite

- **CA1 — Resposta antiga não sobrescreve a atual**
  - **Given** duas buscas de perfil em sequência (atleta A, depois atleta B), com a de A respondendo
    por último
  - **When** as duas respostas chegam
  - **Then** o hook expõe o perfil de B, e a resposta de A é descartada

- **CA2 — Inbox não mistura atletas**
  - **Given** o inbox com o atleta X selecionado no roster e o perfil carregado sendo de outro atleta
  - **When** o painel é renderizado
  - **Then** nenhum dado do outro atleta aparece (cabeçalho, KPIs, diagnóstico, sugestões); o painel
    fica em estado de carregamento até o perfil de X chegar

- **CA3 — Lista do inbox atualiza após a decisão**
  - **Given** uma sugestão PENDING aberta no dialog pelo inbox
  - **When** o coach aprova (ou rejeita, ou recebe 422 de decisão já tomada)
  - **Then** o perfil do atleta selecionado é recarregado e a lista mostra o novo status sem
    recarregar a página

- **CA4 — Dialog em linguagem do coach**
  - **Given** o dialog de uma sugestão
  - **When** é aberto
  - **Then** tipo e confiança aparecem com os rótulos PT-BR da lista ("Ajuste de plano", "Média"), e
    o nome interno das regras não aparece

## Métrica de sucesso

- Revalidação manual no local + homelab: aprovar e rejeitar pelo inbox com a lista refletindo o
  status na hora, e o painel nunca exibindo cabeçalho de um atleta com o roster em outro.

## Open Questions & Assumptions

1. **Remover a linha de regras ou só esconder?** Assumido: não exibir ao coach. Se tiver valor de
   depuração, pode ir para um tooltip ou log — decisão do founder se quiser mantê-la.
2. **Dashboard pedido duas vezes na carga** (`GET /coach/dashboard` duplicado): é o gatilho da
   corrida, mas a correção de raiz é o hook descartar resposta antiga — que protege contra qualquer
   troca rápida de atleta. Deduplicar a chamada do dashboard fica fora de escopo.

## Riscos e mitigações

- **Hook compartilhado** (BAIXO): a guarda muda o comportamento dos três consumidores. Mitigação: é
  estritamente mais correta (só descarta resposta obsoleta) e os testes existentes dos consumidores
  seguem valendo.
- **Sobreposição com `refine-inbox-mobile-breakpoint`** (BAIXO): change ativa, ainda não iniciada
  (0/5 tasks), mexe no layout do mesmo `CoachInboxPage`. Esta change toca lógica de dados e props,
  não layout; quem entrar depois resolve o conflito de merge.

## Non-goals

- Deduplicar o `GET /coach/dashboard` da carga do inbox.
- Validação da rejeição confirmada da task 2.2 de `add-coach-suggestion-review-actions` — segue como
  validação manual pendente (precisa de uma segunda sugestão PENDING).
- Mudanças de layout do inbox (escopo de `refine-inbox-mobile-breakpoint`).
- Qualquer mudança no backend ou no `SugestaoCoachGeneratorJob`.

## Referências

- Validação manual 2026-09-28 (local + homelab): sugestão `e9cec477-…`, atleta Maria Santos
  (`20102cd6-…`), aprovação 200 e persistida; lista do inbox ficou "Pendente".
- Change de origem: `archive/2026-09/2026-09-27-add-coach-suggestion-review-actions/` (front #126).
