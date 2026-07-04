# Proposal: add-athlete-engagement-signals

**Tamanho:** XS · **Trilha:** Full (backend pequeno + frontend)

## Status

Proposed (2026-07-03). Sequenciada **depois** de `wire-athlete-progress-to-endpoints` (Sprint 9.6):
reusa o mesmo endpoint `/me/treinos` e toca a mesma tela (`AthleteProgressPage`) + `AthleteHomePage`,
evitando reabrir os mesmos arquivos duas vezes em changes concorrentes.

## Why

O discovery de retenção já feito (`prd/product-discovery-retencao-atletas-90d.md`) aponta como
causa nº1 de churn a "falha na formação de hábito" e nº2 "falta de clareza do próximo passo". As
soluções desenhadas para isso (`prd/prd-retention-loop-90d.md` — Retention Radar, Next Best Action)
são todas **coach-facing**, na fila de atenção, e founder-gated (Sprint 26+, dependem de
messaging/weekly-review ainda não construídos).

Existe uma fatia **athlete-facing** de baixo custo que não depende de nenhuma daquelas peças: o
próprio atleta ver a própria consistência (streak) e a própria meta (próxima prova) na Home/
Progresso. O dado já existe:
- `GET /me/treinos` (`manual-training-entry-lightweight`, já em `develop`) — treinos registrados.
- `ProvaService.listarProvas(atletaId)` (já em `develop`, hoje só exposto via
  `GET /atletas/{atletaId}/provas` para TECNICO/ADMIN) — provas cadastradas pelo coach.

**Nota de proveniência:** esta ideia surgiu numa sessão de CPO anterior (2026-07-03) e foi
inicialmente encaixada dentro do escopo de `wire-athlete-shell-to-endpoints`; no refino/split
daquela change (product-review) ficou de fora sem rejeição explícita do founder. Recuperada aqui
como change própria, pequena, para não bloquear nem inflar a 9.5/9.6 (que são demo-críticas).

## What Changes

### Backend (`AtletaProgressController` ou `ProvaController`, 1 endpoint novo)

- `GET /api/v1/atletas/me/provas` — `@PreAuthorize("hasRole('ATLETA')")`, resolve `atletaId` via
  `AtletaProgressService.resolverAtletaIdAtual()`, delega em `ProvaService.listarProvas(atletaId)`.
  Mesmo padrão de segurança dos demais `/me/*` (sem `atletaId` no path — sem risco de IDOR). Sem
  migration, sem endpoint de escrita novo (atleta só lê; cadastro de prova continua com o coach).

### Frontend (`apps/menthoros-front`, `features/athlete`)

- **Streak de consistência** (`AthleteHomePage`): "X semanas seguidas treinando", calculado
  client-side por `calcularStreakSemanas(treinos, hoje?)` sobre `GET /me/treinos?dias=30`
  (já existe). Regra v1: semana conta como consistente com ≥1 `TreinoRealizado` registrado;
  streak = semanas consecutivas terminando na semana atual ou anterior. Card **oculto** (não "0
  semanas") quando streak = 0 — não reforça quebra de hábito com número negativo.
- **Próxima prova/meta** (`AthleteProgressPage`, tab Provas): "faltam N dias para {{prova}}", a
  partir de `GET /me/provas`, filtrando a prova futura mais próxima (`data >= hoje`). Sem prova
  cadastrada → CTA honesto ("peça ao seu coach para cadastrar sua próxima meta"), não valor
  fabricado.

## Critérios de aceite

Critérios formais em Given/When/Then (vinculantes): `specs/athlete-engagement-signals/spec.md`.
Resumo:

- **CA1 — Streak real:** GIVEN um ATLETA com ao menos uma semana consistente (≥1 treino) terminando
  na semana atual ou anterior WHEN abre `/athlete/home` THEN a Home exibe o streak calculado
  client-side sobre `GET /me/treinos`; GIVEN a semana atual e a anterior sem nenhum treino WHEN a
  Home renderiza THEN o card fica oculto (não mostra "0 semanas").
- **CA2 — Próxima prova real:** GIVEN um ATLETA com prova futura cadastrada WHEN abre a tab Provas
  em `/athlete/progress` THEN exibe a prova futura mais próxima (nome + dias restantes) via
  `GET /me/provas`; GIVEN nenhuma prova futura WHEN a tab renderiza THEN exibe CTA honesto pedindo
  ao coach que cadastre a próxima meta, sem fabricar prova ou contagem de dias.
- **CA3 — Sem dado inventado:** nenhum dos dois cards fabrica valor quando a fonte está vazia.
- **CA4 — Sem regressão:** `npm run lint && npm run build && npm run test:run` (front) e suíte
  backend verdes; o endpoint novo tem teste de controller.
- **CA5 — Sem risco de IDOR:** `/me/provas` segue o mesmo padrão dos demais `/me/*` (resolve via
  JWT, não recebe `atletaId` no path).

## Métrica de sucesso

**Gate de aceite (o que valida a entrega):** streak e próxima prova visíveis e corretos em smoke
manual — login ATLETA de um tenant com treino manual registrado (9d) e prova cadastrada pelo coach.

**Métrica de negócio (exploratória, pós-deploy, NÃO é gate de aceite):** correlação informal entre
streak visível e retenção D30/D60 — sinal antes do Retention Radar formal medir isso com rigor
(Sprint 26+); sem baseline ainda, não instrumentada nesta change.

## Impact

- **Depende de:** `manual-training-entry-lightweight` (treinos), cadastro de provas já existente
  (`ProvaController`) — ambos em `develop`. Não depende de `wire-athlete-progress-to-endpoints`
  tecnicamente, mas está sequenciada depois por tocar os mesmos arquivos de frontend.
- **Repos:** `apps/menthoros-backend` (1 endpoint novo, sem migration) + `apps/menthoros-front`.
- **Não bloqueia nem altera:** `add-llm-tool-use`, RAG, `add-athlete-retention-loop-90d`
  (Sprint 26+, coach-facing, founder-gated) — esta change é puramente athlete-facing e não
  antecipa nem substitui o Retention Radar formal.
- **Roadmap:** inserida como Sprint 9.7 em `SPRINTS.md`, depois de 9.6.
