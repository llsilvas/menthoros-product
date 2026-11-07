**Tamanho:** S · **Trilha:** Fast (só front; sem contrato novo; só a coluna da lista do inbox)

# Proposal — inbox-lista-triagem

## Why

Prioridade 2 da crítica de design do `/coach/inbox` (2026-11-07, artboard "Coach Inbox — crítica
e proposta"), depois de `inbox-barra-unica-sem-rodape` (PR llsilvas/menthoros-front#204). A coluna
da lista é onde o treinador decide quem abrir, e hoje ela custa leitura em quatro pontos:

1. **Card de ~75px**: "Alerta" aparece duas vezes (no chip e no início da linha de motivo), a
   aderência aparece três vezes (rótulo, número, barra), e um atleta sem sinal só diz "Ativo".
   Em 1366×625 cabem 2,5 atletas por vez.
2. **Dois chips iguais no header da lista**: "Todos" (filtro de status) e "Prioridade alta"
   (rótulo da ordenação) têm a mesma forma e funções diferentes; o coach lê um segundo filtro
   ativo e duvida do que a lista mostra. Não há como ver "só quem está em atenção".
3. **Busca longe do que filtra**: fica na barra do topo, enquanto o próprio código manda os
   filtros viverem na coluna ("um controle longe do que ele afeta faz o coach duvidar").
4. **Texto em `surface-500`** (#64748B) a 11–14px: 3,8:1 no canvas e 3,5:1 no card, abaixo dos
   4,5:1 que o design system exige ("10 de 23 · página 1/3", rodapé de paginação). A paginação
   sai em inglês ("1–10 of 23").

## What Changes

Só `apps/menthoros-front`: `QueueRow`, `AttentionOnlyRow`, o header da coluna da lista em
`CoachInboxPage`, `buildInboxQueue`.

- **Linha de ~46px** em `QueueRow` e `AttentionOnlyRow`: avatar, nome, **uma** linha de contexto,
  aderência em número mono à direita (cor pelo valor: ≥ 85 success, ≥ 70 neutro, abaixo warning;
  "—" quando `aderenciaPercentual` vem ausente — hoje o adapter o converte em 0 e marca
  `adherenceAvailable: true`; passa a preservar a ausência). O chip de status e a barra saem; a
  severidade fica na moldura e na cor da linha de contexto. Contexto, nesta precedência, só com
  campos que o `CoachAtletaResumo` tem (`status`, `fase`, `lastActivity`; **não** há prova nem
  semanas no plano no roster — `weeksOnPlan` sai 0 e `raceCalendar` `[]` fora do perfil):
  1. sinal: `INATIVIDADE` com `lastActivity` → "Inatividade · N dias sem treino"; demais motivos
     → "{motivo} · sinal há N dias" (idade do alerta, dita como tal);
  2. `status === 'paused'` → "Pausado";
  3. senão "{fase} · último treino há N dias" (sem `fase`: "Sem plano"; sem `lastActivity`:
     "sem treino registrado").
  Prova próxima na linha fica para quando o DTO do roster a trouxer.
- **Filtro segmentado** no header da coluna: "Todos (T)", "Em atenção (M)", "Pausados". "Em
  atenção" mostra a fila de atenção **inteira** (não é paginada; roster só completa os dados de
  quem está na página) e esconde a paginação; "Pausados" é o status `paused` da API; "Todos" é o
  de hoje. A ordenação vira `IconButton` com menu (mesmas opções), sem chip. Contrato interno do
  modo atenção: `DashboardStatusFilter` ganha `'attention'`; vai à URL como `?status=attention`
  e `parseDashboardStatus` o aceita (F5 e link compartilhado preservam); a API recebe `status`
  **ausente**; `buildInboxQueue` ignora o status do roster, `q` continua filtrando a fila por
  nome e `hiddenAttentionCount` conta só os escondidos pela busca; `dashboardPage` **não** é
  zerado ao entrar nem ao sair de atenção (voltar a "Todos" devolve a página anterior);
  `resetFilters` volta a `all`; fila vazia nesse modo é o estado `vazio-atencao` ("Ninguém em
  atenção agora"), distinto de `vazio-filtrado`.
- **Busca na coluna**, acima do filtro, com o mesmo `q`. Sai da barra do topo.
- **Contraste**: texto secundário da coluna em `surface-400`; `surface-500` só em "—" e ícones
  desabilitados. `TablePagination` com `labelDisplayedRows` em PT-BR ("1–10 de 23") e só com
  `totalPages > 1`.

## Non-Goals

- Mudar `GET /coach/dashboard` (filtro de atenção no servidor). "Em atenção" é a fila que já vem
  completa.
- Cabeçalho do atleta, Diagnóstico, atalhos: `inbox-proximo-em-atencao`.
- Lista densa só em `TELA_BAIXA` (D5 de `coach-inbox-notebook-height`): esta change densifica em
  todas as alturas; ao retomar aquela, 5.1 e 5.2 ficam entregues aqui.

## Impact

- `src/features/coach/components/QueueRow.tsx`, `AttentionOnlyRow.tsx` e testes.
- `src/features/coach/pages/CoachInboxPage.tsx` (header da coluna, busca, paginação) e teste.
- `src/features/coach/adapters/coachInboxAdapters.ts` (`buildInboxQueue` com modo "atenção") e
  teste; `src/features/coach/hooks/useDashboardFilters.ts` (valor `attention` no filtro, sem ir
  para a API).
- `tests/e2e/coach/inbox.spec.ts` (o teste "nenhum texto visível abaixo de 11px" continua).
- Sem backend, sem contrato.

## Critérios de aceite

1. **Linha densa** — Given 1366×625 e 10 atletas no roster, When o inbox carrega, Then pelo
   menos 6 linhas de atleta aparecem inteiras sem rolar, e cada linha tem no máximo 52px.
2. **Sem redundância** — Given um atleta com sinal CRITICA/INATIVIDADE há 6 dias, Then a linha
   mostra "Inatividade · há 6 dias" uma vez, sem chip "Alerta", e a aderência uma vez.
3. **Contexto sem sinal** — Given atleta sem sinal com `fase` "Base" e último treino há 2 dias,
   Then a linha diz "Base · último treino há 2 dias"; pausado, "Pausado"; sem `fase`, "Sem plano
   · …"; `aderenciaPercentual` ausente, "—" em vez de "0%".
4. **Em atenção** — Given 3 atletas na fila, 15 no roster e o coach na página 2, When escolhe
   "Em atenção", Then a lista mostra exatamente os 3, inclusive quem não está na página corrente,
   a URL diz `status=attention` e a paginação some; "Todos" volta à página 2. Given busca "ana"
   nesse modo, Then só os da fila com "ana" no nome, e o aviso "N em atenção fora do filtro"
   conta os demais.
5. **Busca na coluna** — Given a tela carregada, Then o campo "Buscar atleta" está no header da
   coluna da lista, não na barra do topo, e filtra por `q` como hoje.
6. **Contraste** — Given os textos da coluna, Then nenhum texto legível usa `surface-500`
   (teste de componente por token; 4,5:1 conferido no DS).
7. **Paginação PT-BR** — Given 23 atletas, Then o rodapé diz "1–10 de 23"; given 10 atletas,
   Then não há rodapé de paginação.
8. **Regressão** — lint, build, `test:run`, E2E (`inbox.spec.ts`) verdes, com as asserções
   migradas: `/\d+d/` → "N dias sem treino" / "sinal há N dias"; "of 15" → "de 15"; menu
   "Atenção" do chip → segmento "Em atenção"; o teste de 11px continua.

## Métrica de sucesso

- 1366×625: de 2,5 para ≥ 6 atletas visíveis sem rolar.
- "Quem precisa de mim hoje" em um clique ("Em atenção"), sem paginar.

## Riscos e mitigações

- **"Em atenção" sem dados do roster** para quem está fora da página: a linha usa o
  `AttentionOnlyRow` (nome, motivo, recência) como hoje; aderência "—"; recência de
  `INATIVIDADE` sem `lastActivity` é dita como "sinal há N dias", nunca como dias sem treino.
- **Teste "nenhum texto abaixo de 11px"**: a linha de contexto fica em 11px (`0.6875rem`), no
  limite; o teste continua valendo.
- **Testes existentes de `QueueRow`** afirmam chip e "Aderência N%": reescritos junto.
- **Rollback:** reverter o PR.

## Open Questions & Assumptions

- **Premissa:** "Pausados" como terceiro segmento basta; `active`/`warning`/`danger` como filtros
  isolados não ajudam a triagem (atenção já cobre os dois últimos). Se o coach sentir falta,
  voltam no menu de ordenação como "filtrar por status".
- **Decidido:** a barra sai; a cor do número de aderência diz o estado. Dono: produto, na
  crítica de 2026-11-07.
- **Premissa:** sinal tem precedência sobre "Pausado" (um pausado em atenção ainda precisa de
  ação).

## Status

- draft (2026-11-07), a partir da crítica de design.
