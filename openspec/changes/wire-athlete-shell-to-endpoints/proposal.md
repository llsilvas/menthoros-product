# Proposal: wire-athlete-shell-to-endpoints

**Tamanho:** M/L · **Trilha:** Full (backend pequeno + frontend)

## Status

Proposed (aprovado pelo founder em sessão 2026-07-03 — priorizado sobre `add-llm-tool-use`/RAG
para fechar o loop coach→atleta antes da demo). Escopo ampliado em 2026-07-03 (mesma sessão) com
2 features XS de engajamento/retenção, encaixadas por tocarem as mesmas telas já abertas nesta
change (ver seção "Engajamento e retenção (adição XS)").

## Why

O coach hoje aprova plano, registra dado do atleta e vê o roster real — mas o **shell do atleta
inteiro roda em cima de mock**: `AthleteHomePage` (`MOCK_TODAY`), `AthletePlanPage`
(`buildMockWeek`/`MOCK_TSS`), `AthleteProgressPage` (`MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`),
`AthleteCoachPage`/`CoachChatPanel` (`MOCK_MESSAGES`/`mockCoach`). `AthleteProfilePage` é um
placeholder "em construção".

Isso quebra o critério 4 do North Star ("o que chega ao atleta depois que o coach aprova") e o
passo 4/5 do momento de valor do coach (`personas.md`): o coach pode aprovar um plano e editar
treinos, mas **o atleta nunca vê o resultado real** — a demo para cliente para exatamente aqui.

O custo é baixo: os endpoints de dado (`add-athlete-progress-endpoints` já em develop) e o plano
aprovado (`PlanoTreinoController.buscarPlanoSemanal`, já filtra `APROVADO` para role ATLETA) já
existem em `develop`. Falta (a) 3 endpoints `/me/*` pequenos no backend para os dados hoje só
expostos via `{id}` para TECNICO/ADMIN, e (b) o wiring de frontend — mesmo padrão já aplicado no
coach em `wire-coach-shell-to-dashboards`.

**Fora de escopo:** chat coach<->atleta real (`CoachChatPanel`/`AthleteCoachPage`) — depende de
`add-athlete-coach-messaging` (Sprint 25, mensageria ainda não construída no backend). Esta
change troca o mock por um placeholder "em breve" nessa tela, sem inventar dado.
`AthleteProfilePage` segue como placeholder "em construção" (fora do momento de valor do coach).

## What Changes

### Backend (pequeno, `AtletaProgressController`)

- `GET /me/metricas/historico` (PMC, ATLETA) — espelha `/{id}/metricas/historico`, resolve
  `atletaId` via `resolverAtletaIdAtual()`, reusa `AtletaProgressService.getHistoricoPmc`.
- `GET /me/metricas/zonas` (ATLETA) — idem para `getDistribuicaoZonas`.
- `GET /me/recordes` (ATLETA) — idem para `getRecordes`.
- `GET /me/provas` (ATLETA, novo — ver "Engajamento e retenção") — espelha
  `GET /atletas/{atletaId}/provas` (`ProvaController`, já existe para TECNICO/ADMIN via
  path `atletaId`), resolvendo `atletaId` via `resolverAtletaIdAtual()`; reusa
  `ProvaService.listarProvas`. Sem novo endpoint de escrita — atleta só lê.
- Sem migration, sem mudança de contrato dos endpoints `{id}` existentes (permanecem
  TECNICO/ADMIN). Reuso total da camada de serviço — apenas 4 métodos de controller novos.

### Frontend (`apps/menthoros-front`, `features/athlete`)

- Cliente curado `AthleteProgressService.ts` (padrão `CoachDashboardService`) + hooks
  `useAthleteHome`, `useAthletePlan`, `useAthletePmc`, `useAthleteZones`, `useAthleteRecordes`.
- `AthleteHomePage`: troca `MOCK_TODAY` por `GET /me/home` (já existe) + `GET /me/readiness`
  (já existe). Botão "Iniciar treino" e check-in seguem como estão (fora de escopo — dependem de
  `add-daily-readiness-checkin`, Sprint 9k, ainda em progresso). **Adição:** card de streak
  (semanas consecutivas com pelo menos 1 treino registrado) derivado client-side de
  `GET /me/treinos` — ver "Engajamento e retenção".
- `AthletePlanPage`: troca `buildMockWeek`/`MOCK_TSS` pelo plano semanal real
  (`GET /api/v1/planos/{id}` com `id=atletaId`, já filtra `APROVADO` para ATLETA); estado vazio
  explícito quando não há plano aprovado (ainda não chegou do coach).
- `AthleteProgressPage`: troca `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS` pelos 4 endpoints
  `/me/*` (3 já previstos + `/me/provas` novo); tab "Provas" sem fonte de PR real muda mensagem
  para "em breve" se `recordes` vier vazio (não fabrica valor). **Adição:** dentro da tab
  "Provas", card de próxima prova/meta (nome + dias restantes) a partir de `GET /me/provas`
  filtrando a mais próxima com `data >= hoje` — ver "Engajamento e retenção".
- `AthleteCoachPage`: mock do chat vira placeholder "Mensagens chegam em breve" (change-fonte:
  `add-athlete-coach-messaging`), sem simular conversa fake.
- `AthleteProfilePage`: sem mudança (já é placeholder honesto).

### Engajamento e retenção (adição XS, 2026-07-03)

Duas features pequenas, respaldadas pelo discovery de retenção já feito
(`prd/product-discovery-retencao-atletas-90d.md`): a causa nº1 de churn ali listada é "falha na
formação de hábito" e a nº2 é "falta de clareza do próximo passo". O bloco grande de retenção
(`add-athlete-retention-loop-90d`) é coach-facing e founder-gated (Sprint 26+, radar/fila de
atenção) — mas a fatia *athlete-facing* (o atleta ver a própria consistência e a própria meta)
não depende de nada daquele bloco e cabe aqui, nas mesmas telas que já estamos abrindo:

- **Streak de consistência** (`AthleteHomePage`): "X semanas seguidas treinando" — calculado
  client-side a partir de `GET /me/treinos` (já existe, `manual-training-entry-lightweight` ✅).
  Regra v1: semana conta como "consistente" se tiver ≥1 `TreinoRealizado` registrado; streak =
  contagem de semanas consecutivas consistentes terminando na semana atual ou anterior. Sem
  gamificação punitiva — streak zera silenciosamente, sem alerta negativo ao atleta.
- **Próxima prova/meta** (`AthleteProgressPage`, tab Provas): "faltam N dias para {{prova}}" —
  a partir do novo `GET /me/provas`, filtrando a prova futura mais próxima. Se não houver prova
  cadastrada, mostra call-to-action honesto ("peça ao seu coach para cadastrar sua próxima
  meta"), não um valor fabricado.

**Fora de escopo desta adição:** qualquer coisa do Retention Radar/Next Best Action (são
coach-facing, dependem de fila de atenção + regras de risco ainda não implementadas) e qualquer
notificação push/e-mail (o produto não envia nada automaticamente ao atleta sem coach — princípio
coach-in-the-loop).

## Critérios de aceite

- **CA1 — Home real:** atleta autenticado abre `/athlete/home` e vê seu treino de hoje + métricas
  reais de `GET /me/home` + `GET /me/readiness`, zero `MOCK_TODAY`.
- **CA2 — Plano real:** `/athlete/plan` mostra o plano semanal **aprovado** real do atleta (ou
  estado vazio "seu coach ainda não aprovou o plano desta semana" quando não houver), zero
  `buildMockWeek`.
- **CA3 — Progresso real:** `/athlete/progress` consome os 3 endpoints `/me/*` novos para
  PMC/zonas/recordes, zero `MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`.
- **CA4 — Chat honesto:** `/athlete/coach` não simula mensagens fake; mostra placeholder claro
  "em breve" linkado à change-fonte.
- **CA5 — Estados explícitos** (loading/error/empty) nas 3 telas de dado, mesmo padrão do
  `wire-coach-shell-to-dashboards`.
- **CA6 — Sem regressão:** `npm run lint && npm run build && npm run test:run` (front) e suíte
  backend verdes; os 3 endpoints novos têm teste de controller/service.
- **CA7 — Sem dado inventado:** nenhum widget mostra número fabricado quando o backend não tem
  fonte (ex. PRs vazios -> "ainda sem recordes", não um valor mock).
- **CA8 — Streak real:** a Home exibe streak de semanas consistentes calculado sobre
  `GET /me/treinos`, atualizado a cada novo treino registrado; zero streak fabricado.
- **CA9 — Próxima prova real:** a tab Provas exibe a prova futura mais próxima (nome + dias
  restantes) via `GET /me/provas`, ou CTA honesto quando não há prova cadastrada.

## Métrica de sucesso

Zero referências a `MOCK_TODAY`/`buildMockWeek`/`MOCK_PMC`/`MOCK_ZONES`/`MOCK_KPI`/`MOCK_PRS`/
`MOCK_MESSAGES`/`mockCoach` no bundle das páginas do atleta. Proxy demonstrável: logar como
ATLETA de um tenant com plano aprovado e dado manual registrado (via 9d) e ver os números
baterem com o que o coach vê no perfil dele (`athlete-profile-drilldown`).

**Métrica de engajamento (a acompanhar pós-deploy, sem baseline ainda):** correlação entre
streak visível na Home e retenção D30/D60 — sinal informal antes do Retention Radar formal medir
isso com rigor (Sprint 26+). Não é gate de aceite desta change, é hipótese a observar.

## Impact

- **Depende de:** `add-athlete-progress-endpoints`, `manual-training-entry-lightweight`,
  `coach-plan-review-workflow` (todas já em `develop`). A adição de streak/próxima-prova depende
  apenas de `manual-training-entry-lightweight` (treinos) e do cadastro de provas já existente
  (`ProvaController`) — nenhuma dependência nova em relação ao escopo original.
- **Repos:** `apps/menthoros-backend` (3 endpoints novos, sem migration) + `apps/menthoros-front`.
- **Não bloqueia nem altera:** `add-llm-tool-use`, RAG, `add-daily-readiness-checkin` (9k, em
  progresso) — mensageria e check-in diário seguem como estão, apenas isolados via placeholder
  honesto onde tocam esta change.
- **Reordenação de roadmap:** inserida antes do Sprint 10-11 (`add-llm-tool-use`) em `SPRINTS.md`,
  como intercalação de feature visível (mesmo padrão de `6b`, `9b`).
