**Tamanho:** S · **Trilha:** Fast

# Proposal — coach-ciente-prova-na-inbox

O treinador passa a dar "Ciente" na prova cadastrada ou alterada pelo atleta **dentro da inbox**, na aba
"Provas & sugestões", sem sair para o perfil do atleta. Quando o motivo de atenção do atleta é
`PROVA_ATLETA`, a inbox já abre nessa aba.

## Status

- draft (2026-11-24): aberta a partir de avaliação de UX do fluxo de ciência.
- DoR (2026-11-24): `spec-reviewer` **READY com ressalvas**; Codex **NOT READY** (2 bloqueantes, 4
  maiores). Todos verificados no código e incorporados nesta revisão:
  - fila recarregada é a do dashboard da inbox, não só a do layout (apontado pelos dois);
  - `useCoachAthleteRaces` isolado por atleta, descartando resposta obsoleta;
  - CA2 não promete que o atleta sai da fila;
  - atleta resolvido continua selecionado (decisão do dono do produto, 2026-11-24);
  - regra da aba inicial amarrada à troca de `selectedId`;
  - e2e novo para o "Ciente".
  Risco herdado da ciência sem versão registrado em "Riscos".

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
3. **A inbox abre sempre em "Diagnóstico"** (`CoachInboxPage.tsx:127`), mesmo quando o motivo de
   atenção do atleta é a prova.

## What Changes

Tudo em `apps/menthoros-front`. Sem contrato de API novo, sem backend.

1. **Aba "Provas & sugestões" usa o painel de provas do coach.** `RacesSuggestionsTabPanel` troca a
   lista de `selected.raceCalendar` pelo `AthleteRacesPanel`, alimentado por `useCoachAthleteRaces`
   (os mesmos componente e hook do perfil). Ganha chips de alvo, preparação curta, cancelada e motivo
   da pendência, e o botão "Ciente". O texto de lista vazia do painel serve aos dois contextos e é
   mantido.
2. **Hook isolado por atleta.** `useCoachAthleteRaces` limpa `provas`/`pendentes` ao trocar de
   `atletaId` e descarta resposta de GET iniciada para outro atleta. Na inbox o atleta muda sem
   desmontar o painel; no perfil isso não acontecia.
3. **"Ciente" recarrega a fila da inbox.** Depois do PATCH, a inbox chama `reloadDashboard`
   (`useDashboardFilters.ts:107`, fonte de `dashboard.attentionQueue` e de `inboxQueue`), preservando
   os filtros, e também o `refetchQueue` do `CoachLayoutOutletContext` quando existir (badge do
   shell).
4. **Atleta resolvido continua selecionado.** Se, após o recarregamento, o atleta sair da fila
   composta (ex.: filtro "Em atenção", ou fixado pela fila fora da página do roster), a seleção e o
   detalhe permanecem nele até o treinador escolher outro. A inbox guarda a identidade do atleta
   retido (id + nome) e não aplica o salto para a primeira linha (`CoachInboxPage.tsx:268`) para esse
   id.
5. **Aba inicial por motivo.** Quando `selectedId` muda (clique, seleção automática inicial ou
   "próximo em atenção"), a aba ativa vira `races` se `selectedAttention.reason === 'PROVA_ATLETA'`,
   senão `diagnosis`. A regra **só** roda na troca de `selectedId`: recarregar a fila ou dar "Ciente"
   não muda a aba. `retorno.tab` prevalece para o `retorno.atletaId` na primeira seleção.
6. **Mantidos:** previsão de forma, "Ver calendário completo", painel "Sugestões recentes" e o card
   "Provas" do perfil (mesmo componente, então os dois lugares não divergem).

## Fora de escopo

- CRUD de prova pelo treinador.
- Mudança no cálculo do sinal de atenção ou no endpoint `PATCH .../provas/{id}/ciente`.
- Versão/lock otimista na ciência (ver Riscos).
- Ação "Ciente" em lote ou direto na linha da lista da inbox.
- Remover o card "Provas" do perfil.

## Critérios de aceite

- **CA1** — Given um atleta com prova pendente de ciência, When o treinador abre a aba "Provas &
  sugestões" da inbox, Then a prova aparece com o chip do motivo e o botão "Ciente".
- **CA2** — Given a aba aberta com prova pendente, When o treinador clica "Ciente", Then
  `ProvaService.marcarCiente(atletaId, provaId)` é chamado, a lista de provas recarrega sem o botão
  naquela prova, e `reloadDashboard` da inbox é chamado. O atleta só sai da fila se não restar outra
  pendência nem outro motivo de atenção — a change não afirma que o aviso some.
- **CA3** — Given um atleta cujo `reason` é `PROVA_ATLETA`, When ele passa a ser o selecionado
  (clique ou seleção automática), Then a aba ativa é "Provas & sugestões".
- **CA4** — Given um atleta com outro `reason` (inclusive de maior prioridade que uma prova pendente)
  ou sem atenção, When selecionado, Then a aba é "Diagnóstico". Given `retorno.tab` para
  `retorno.atletaId`, Then ele prevalece nessa seleção.
- **CA5** — Given o treinador trocou de aba manualmente, When a fila recarrega (inclusive após
  "Ciente"), Then a aba não muda.
- **CA6** — Given "Ciente" faz o atleta sair da fila visível, When a fila recarrega, Then o atleta
  continua selecionado e o detalhe continua dele, até o treinador escolher outro.
- **CA7** — Given a troca de atleta A→B com GET de provas de A em voo, When a resposta de A chega,
  Then ela é descartada e o painel só mostra provas de B.
- **CA8** — Given falha no PATCH de ciência ou no GET de provas, Then a aba mostra o erro com
  "Tentar novamente", sem derrubar o restante da inbox. Previsão de forma (quando existe), "Ver
  calendário completo" e "Sugestões recentes" continuam presentes.

## Métrica de sucesso

- **Cliques e telas para resolver um aviso de prova**: hoje ≥ 4 cliques e 2 trocas de tela
  (selecionar atleta, abrir perfil, Ciente, voltar à inbox); meta 2 cliques e 0 trocas (selecionar
  atleta, Ciente). Verificado no e2e e na validação manual.
- **O que a change não afirma**: tempo de triagem em minutos; o front não tem telemetria para isso.

## Riscos

- **Ciência sem versão (herdado).** `PATCH .../ciente` não recebe versão
  (`ProvaServiceImpl.java:357`): se o atleta editar a prova entre a leitura e o clique, o treinador
  dá ciência a uma mudança que não viu. Já existe no perfil; mover o botão para a inbox não piora a
  janela. Fica como débito para uma change de backend.
- **Conflito de merge** com `coach-inbox-notebook-height` em `CoachInboxPage.tsx` (ver Dependências).

## Dependências

- Base: `atleta-cadastra-prova` (arquivada) — `AthleteRacesPanel`, `useCoachAthleteRaces`,
  `coachRaceAdapters`, endpoint de ciência.
- **`coach-inbox-notebook-height`** (ativa) também mexe em `CoachInboxPage.tsx`. Sem conflito de
  comportamento (aquela é altura; esta é conteúdo da aba e aba inicial). Quem entrar depois rebaseia.
  A aba fica mais alta com os chips; a 6.3 daquela change já verifica as três abas em 1366×625.

## Open Questions & Assumptions

- **A1 — verificada.** O `selectedId` da inbox é o `atletaId` do perfil; o hook recebe
  `selectedRosterItem.atletaId`, como `useSeasonPlan` (`CoachInboxPage.tsx:187`).
- **A2 — corrigida.** A inbox não consome `refetchQueue`; a fila dela vem de `useCoachDashboard`.
  Recarregar = `reloadDashboard` (+ `refetchQueue` do layout para o badge).
- **A3 — verificada.** A fila expõe um único `reason` por atleta (`coachInboxAdapters.ts:514`,
  `primaryReason`). Prova pendente com motivo de maior prioridade abre em "Diagnóstico"; a prova segue
  visível pela aba.
- **A4 — decidida (2026-11-24).** Atleta resolvido continua selecionado; a regra da aba só roda na
  troca de `selectedId`.
