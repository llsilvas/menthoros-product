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
  "—" sem dado). O chip de status e a barra saem; a severidade fica na moldura e na cor da linha
  de contexto. Contexto, nesta precedência: sinal (motivo + recência, "Inatividade · há 6 dias");
  prova próxima ("Maratona de SP · 22 dias"); pausado ("Pausado"); senão
  "{disciplina} · {N} semanas no plano".
- **Filtro segmentado** no header da coluna: "Todos (T)", "Em atenção (M)", "Pausados". "Em
  atenção" mostra a fila de atenção **inteira** (não é paginada; roster só completa os dados de
  quem está na página) e esconde a paginação; "Pausados" é o status `paused` da API; "Todos" é o
  de hoje. A ordenação vira `IconButton` com menu (mesmas opções), sem chip.
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
3. **Contexto sem sinal** — Given atleta sem sinal com prova em 22 dias, Then a linha diz
   "{prova} · 22 dias"; sem prova, "{disciplina} · {N} semanas no plano"; pausado, "Pausado".
4. **Em atenção** — Given 3 atletas na fila e 23 no roster, When o coach escolhe "Em atenção",
   Then a lista mostra exatamente os 3, inclusive quem não está na página corrente, e a paginação
   some; "Todos" volta ao estado anterior.
5. **Busca na coluna** — Given a tela carregada, Then o campo "Buscar atleta" está no header da
   coluna da lista, não na barra do topo, e filtra por `q` como hoje.
6. **Contraste** — Given os textos da coluna, Then nenhum texto legível usa `surface-500`
   (teste de componente por token; 4,5:1 conferido no DS).
7. **Paginação PT-BR** — Given 23 atletas, Then o rodapé diz "1–10 de 23"; given 10 atletas,
   Then não há rodapé de paginação.
8. **Regressão** — lint, build, `test:run`, E2E (`inbox.spec.ts`) verdes.

## Métrica de sucesso

- 1366×625: de 2,5 para ≥ 6 atletas visíveis sem rolar.
- "Quem precisa de mim hoje" em um clique ("Em atenção"), sem paginar.

## Riscos e mitigações

- **"Em atenção" sem dados do roster** para quem está fora da página: a linha usa o
  `AttentionOnlyRow` (nome, motivo, recência) como hoje; aderência "—".
- **Teste "nenhum texto abaixo de 11px"**: a linha de contexto fica em 11px (`0.6875rem`), no
  limite; o teste continua valendo.
- **Testes existentes de `QueueRow`** afirmam chip e "Aderência N%": reescritos junto.
- **Rollback:** reverter o PR.

## Open Questions & Assumptions

- **Premissa:** "Pausados" como terceiro segmento basta; `active`/`warning`/`danger` como filtros
  isolados não ajudam a triagem (atenção já cobre os dois últimos). Se o coach sentir falta,
  voltam no menu de ordenação como "filtrar por status".
- **Premissa:** a barra sai (`weeksOnPlan`/prova no texto bastam); a cor do número de aderência
  já diz o estado.

## Status

- draft (2026-11-07), a partir da crítica de design.
