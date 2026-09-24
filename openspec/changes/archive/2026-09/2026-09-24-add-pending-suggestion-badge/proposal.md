# add-pending-suggestion-badge — O coach vê, sem clicar, quais atletas têm sugestão nova da IA

**Tamanho:** M · **Trilha:** Full

> Full porque toca os dois repositórios e adiciona campo novo ao contrato de
> `GET /api/v1/coach/atletas` (`CoachAtletaResumoDto`). Sem migration — é leitura agregada nova,
> nenhuma tabela ou coluna criada.

## Status

Proposta. Nasceu de uma pergunta direta do founder durante a implementação de
`add-coach-suggestion-review-actions`: hoje uma `SugestaoCoach` só aparece se o coach abrir o
perfil individual do atleta — não há sinal nenhum na lista/roster nem no dashboard. Achado central
da investigação: **metade disto já foi construída e nunca ligada**. `CoachCalendarioDto.
TreinoAgendado.hasPendingSuggestion` existe desde `add-coach-suggestion-inbox` (arquivada,
2026-06-19), mas o backend sempre envia `false` (comentário no código: *"fonte:
add-coach-suggestion-inbox (não entregue)"*) — e o **frontend do calendário já renderiza o ponto
visual** (`CoachCalendarPage.tsx`, "Pending suggestion dot"), sem nunca ter recebido `true` uma
vez sequer. Essa change fecha essa lacuna e estende o mesmo sinal ao roster, que nunca teve o
campo.

## Revisão de produto (2026-09-23, `product-reviewer`)

**Veredito: Go.** A `SugestaoCoach` é o produto de IA que justifica o investimento da assessoria —
hoje invisível fora de um clique cego por atleta, o que também deprime a adoção de
`add-coach-suggestion-review-actions`, recém-entregue. Coach-in-the-loop preservado (leitura pura,
sem escrita/automação). Custo marginal ~zero (sem chamada de IA, `SELECT` sobre índice já
existente). Duas perguntas não bloqueantes, registradas em "Open Questions & Assumptions":
o boolean sem deep-link resolve "descoberta" mas não "atrito de acesso" até a sugestão — o deep-link
pode ser a próxima change natural, não um requisito desta; e o proposal deveria confirmar que
`add-coach-suggestion-review-actions` já está em `develop` quando este badge for entregue, senão o
coach vê o ponto e não acha onde agir.

## Pre-mortem (2026-09-23, Codex adversarial review — duas rodadas, ambas incorporadas)

**Rodada 1** (design inicial): (1) a query esquecia de excluir sugestões expiradas —
`SugestaoCoachServiceImpl.listar(PENDING)` já filtra `expiresAt`, sem a mesma regra o badge
acenderia para sugestão que o próprio inbox já esconde (contradiria CA2); (2)
`GET /api/v1/coach/dashboard` rodaria a query nova 3× na mesma requisição
(`getDashboard()` → `getRoster()` + `getInsights()` [rechama `getRoster()`] + `getCalendarioSemanal()`)
— corrigido com um set resolvido uma vez e reaproveitado (design.md D2), reduz para 2×.

**Rodada 2** (DoR check, achado `high`): o badge podia sinalizar uma pendência que o coach não
conseguiria achar pelo caminho prometido — `sugestoesRecentes` do perfil mostra as 3 sugestões
mais recentes **de qualquer status**, sem filtrar `PENDING`; uma pendência válida mais antiga que
3 sugestões já decididas nunca apareceria no `RecentSuggestionsPanel`, quebrando a única forma de
acesso que esta change promete (sem deep-link, por decisão de escopo). Corrigido priorizando
`PENDING` não-expiradas na mesma query do painel (design.md D6) — ver CA9.

## Why

O coach só descobre uma sugestão nova entrando manualmente em cada perfil de atleta — não escala
além de um punhado de atletas, e é o oposto de "otimizar a rotina do treinador": a informação
existe (o job já gerou a sugestão às 6h) mas fica invisível até uma ação deliberada e às cegas do
coach. Sinalizar isso onde o coach já está olhando (roster, calendário) transforma "sugestão
gerada" em "sugestão vista", pré-requisito para o coach agir sobre ela — inclusive as ações que
`add-coach-suggestion-review-actions` acabou de habilitar.

## What Changes

### Backend (`menthoros-backend`)

- **`SugestaoCoachRepository`** ganha uma query nova: IDs de atletas com `SugestaoCoach` `PENDING`
  no tenant, uma consulta só, agrupada — mesmo padrão de
  `CoachAttentionQueueServiceImpl.getAttentionQueue()` (`Set<UUID>` resolvido uma vez, sem N+1).
- **`CoachDashboardServiceImpl.getRoster()`**: resolve esse `Set<UUID>` uma vez para o roster
  inteiro (ao lado de `cobranca`, já resolvida do mesmo jeito) e passa para `montarResumo()`.
- **`CoachAtletaResumoDto`** ganha `temSugestaoPendente` (boolean, não nulo — mesmo padrão de
  `hasAlert`/`hasPendingSuggestion` em `TreinoAgendado`, não um campo anulável estilo billing).
- **`CoachDashboardServiceImpl.getCalendarioSemanal()`**: resolve o mesmo `Set<UUID>` (junto com
  `atletasEmAtencao`, já resolvido ali) e substitui o `false` hardcoded de
  `montarTreinoAgendado()` pelo valor real.
- **`SugestaoCoachRepository.findAllByAtletaIdAndTenantId`** (usada por `sugestoesRecentes` do
  perfil do atleta, achado do pre-mortem — ver design.md D6): passa a priorizar `PENDING`
  não-expiradas antes de completar por `createdAt`, garantindo que uma pendência sinalizada pelo
  badge sempre apareça no `RecentSuggestionsPanel`, sem criar uma tela de listagem nova.
- Sem migration, sem endpoint novo — é leitura agregada sobre a tabela `tb_sugestao_coach` já
  existente.

### Frontend (`menthoros-front`)

- **Calendário:** nada a fazer — `CoachCalendarPage.tsx` já lê `hasPendingSuggestion` e desenha o
  ponto (`primary[500]`, canto superior direito do card do treino). Passa a receber `true` de
  verdade.
- **Roster:** `CoachAtletaResumo` (tipo) e `AthleteRow` (`CoachAthletesPage.tsx`) ganham
  `temSugestaoPendente: boolean`. `AthleteNameCell.tsx` (já tem um padrão de indicador "linha
  viva" para geração de plano) ganha um indicador visual quando `temSugestaoPendente` — reaproveita
  o mesmo ponto visual do calendário (`primary[500]`, sem inventar uma cor nova) em vez de um
  `StatusBadge` de coluna como o de cobrança, porque isto é um sinal de atenção pontual por linha,
  não um status contínuo do atleta.
- Clicar no indicador (ou na linha) não abre a sugestão diretamente nesta change — isso já existe
  via o fluxo atual (abrir o perfil do atleta → `RecentSuggestionsPanel`). Ver "Fora do escopo".

## Capabilities

### Modified Capabilities

- `coach-suggestion-inbox` (spec original, se existir em `openspec/specs/`): ganha o requisito de
  visibilidade agregada que a v1 arquivada deixou como "follow-up" explícito.

## Fora do escopo

- Contagem de sugestões (mostrar "3 pendentes"): boolean é suficiente e já é o contrato existente
  do calendário — mudar para contagem quebraria esse contrato sem necessidade.
- Clique no indicador do roster abrir a sugestão direto (deep-link para o perfil ou um popover) —
  fica para uma iteração seguinte se o coach pedir; hoje o clique na linha já leva ao perfil.
- Reativar/cabear `DashboardSuggestionsPanel.tsx` e `useCoachSugestoes.ts` (órfãos, não importados
  por nenhuma página) — é um painel de listagem completo, escopo diferente de um indicador pontual.
- Notificação (push/e-mail) de sugestão nova — fora do escopo desde a spec original.
- Qualquer mudança em `SugestaoCoachGeneratorJob` ou no modelo de dados de `SugestaoCoach`.

## Dependências e ordem

- **Não depende tecnicamente** de `add-coach-suggestion-review-actions` nem de
  `add-coach-suggestion-edit-delta` — é uma leitura agregada independente de status `PENDING`, não
  interage com aprovar/editar/rejeitar.
- **Depende de produto** de `add-coach-suggestion-review-actions` já estar em `develop` antes do
  merge deste badge (não bloqueia a implementação, bloqueia o *deploy* em conjunto): sem os
  botões Aprovar/Rejeitar já ligados, o coach vê o ponto e clica na linha sem achar onde agir —
  achado do `product-reviewer`. `add-coach-suggestion-review-actions` está com PR aberto
  (`menthoros-front#126`) no momento desta proposta; confirmar merge antes de subir este badge
  para produção.
- Nenhuma change depende desta até o momento.

## Critérios de aceite

1. **Given** atleta com uma `SugestaoCoach` `PENDING`, **when** o coach abre o roster
   (`GET /api/v1/coach/atletas`), **then** `temSugestaoPendente = true` para aquele atleta.
2. **Given** atleta sem nenhuma `SugestaoCoach` `PENDING` não-expirada (nunca teve, todas já
   `APPROVED`/`REJECTED`, ou a única `PENDING` já passou de `expiresAt`), **then**
   `temSugestaoPendente = false` — mesma regra de expiração que `listar(PENDING)` já aplica.
3. **Given** atleta com um `TreinoPlanejado` na semana corrente e uma `SugestaoCoach` `PENDING`,
   **when** o coach abre `GET /api/v1/coach/calendario`, **then** o `TreinoAgendado` daquele
   atleta tem `hasPendingSuggestion = true` (hoje sempre `false`).
4. **Given** N atletas no roster, **when** `getRoster()` roda, **then** a resolução de
   `temSugestaoPendente` usa uma única query para o tenant inteiro (sem N+1) — mesmo padrão de
   `cobranca`/`atletasEmAtencao`.
5. **Given** o coach decide (aprova/rejeita) a única sugestão `PENDING` de um atleta, **when** o
   roster é recarregado, **then** `temSugestaoPendente` volta a `false` para aquele atleta.
6. **Given** roster e calendário de dois tenants diferentes, **then** a sugestão `PENDING` de um
   tenant nunca aparece como `true` no outro.
7. **Given** o indicador visual no roster, **when** renderizado, **then** usa a mesma cor/forma do
   ponto já usado no calendário (`primary[500]`), não uma nova convenção visual.
8. **Given** uma chamada a `GET /api/v1/coach/dashboard` (que agrega roster + insights +
   calendário), **when** o backend monta a resposta, **then** a query de sugestões pendentes
   roda no máximo 2 vezes (não 3) — achado do pre-mortem, ver design.md D2.
9. **Given** atleta com uma `SugestaoCoach` `PENDING` não-expirada mais antiga do que 3 outras
   sugestões já decididas do mesmo atleta, **when** o coach abre o perfil (com o badge aceso),
   **then** a pendência aparece em `sugestoesRecentes`/`RecentSuggestionsPanel` — a query
   prioriza `PENDING` não-expiradas antes de completar por `createdAt` (design.md D6, achado do
   pre-mortem, rodada 2).

## Métrica de sucesso

Rotina do treinador: **tempo até a primeira visualização de uma sugestão** cai. Hoje não é medido
(a sugestão é invisível fora do perfil individual); depois do merge, medir o intervalo entre
`SugestaoCoach.createdAt` e a primeira `GET /sugestoes/{id}` (que já existe, é o `detalhe()` do
`RecentSuggestionsPanel`) daquela sugestão. **Apuração:** cruzamento manual entre `createdAt` (banco) e o log estruturado já existente de
`detalhe()` (`SugestaoCoachServiceImpl`, "detalhe: id=..., tenantId=...") na ferramenta de
observabilidade — sem instrumentação de app nova nesta change, não um dashboard de métrica.
Baseline após 2 semanas com as assessorias fundadoras.

## Riscos e mitigações

- **Query agregada nova sobre `tb_sugestao_coach` sem índice dedicado:** a tabela já tem índice
  parcial em `(atleta_id, tipo)` WHERE `status = 'PENDING'` (`uk_sugestao_pending`,
  `V36__Create_tb_sugestao_coach.sql`) — a query `WHERE tenant_id = :t AND status = 'PENDING'`
  também se beneficia dele parcialmente; volume por tenant é baixo (a fila de atenção já limita
  a geração). Sem necessidade de índice novo nesta change.
- **Sinal fica obsoleto entre o momento em que o coach decide e o próximo carregamento do
  roster/calendário:** aceito — é leitura, não push; o próprio `add-coach-suggestion-review-actions`
  já recarrega o perfil ao decidir, e o roster/calendário são recarregados na navegação normal.
- **Rollback:** reverter o deploy do backend e/ou do front independentemente — campo aditivo em
  DTO existente, sem migration, sem estado persistido novo, sem efeito colateral em dado gravado.
  Reverter o backend volta `hasPendingSuggestion`/`temSugestaoPendente` a `false`/ausente; reverter
  o front some com o indicador sem quebrar o roster.

## Open Questions & Assumptions

- ✅ Boolean, não contagem — já é o contrato existente do calendário (`hasPendingSuggestion`);
  manter os dois campos com a mesma semântica evita um roster que conta e um calendário que só
  sinaliza.
- ✅ Reaproveitar o ponto visual do calendário no roster, não criar uma cor/forma nova — decisão
  registrada no design.md.
- **Assunção:** o indicador no roster fica em `AthleteNameCell` (perto do nome), não em coluna
  própria. Se a implementação achar melhor uma coluna dedicada (como billing), é decisão de
  implementação a validar no `frontend-reviewer`.
- **Aberto (founder, do product-reviewer):** o badge resolve "descoberta" (existe algo novo), não
  "atrito de acesso" (chegar até a sugestão) — sem deep-link, o caminho até o `RecentSuggestionsPanel`
  continua o mesmo de hoje. O deep-link do indicador deveria já entrar como próxima change
  imediata, ou o objetivo desta é só validar que o coach nota o badge antes de investir nisso?
