# Tasks: add-athlete-engagement-signals

## 0. Backend — 1 endpoint `/me/provas`

- [ ] 0.1 `GET /api/v1/atletas/me/provas` — `@PreAuthorize("hasRole('ATLETA')")`, resolve
  `atletaId` via `AtletaProgressService.resolverAtletaIdAtual()`, delega em
  `ProvaService.listarProvas(atletaId)`. Decidir no init: método adicional em
  `AtletaProgressController` (mantém `/me/*` num só lugar) — preferir esta opção sobre adicionar em
  `ProvaController` (evita path ambíguo com `/{atletaId}/provas`).
  - verify: teste de controller 200 com dado; lista vazia não quebra.
- [ ] 0.2 `./mvnw clean test` verde; nenhuma mudança em `GET /atletas/{atletaId}/provas`
  (permanece TECNICO/ADMIN).

## 1. Cliente + hook + helper (frontend)

- [ ] 1.1 `getProvas()` no serviço curado do atleta (estender o que já existir de
  `wire-athlete-shell-to-endpoints`/`wire-athlete-progress-to-endpoints` — confirmar no init qual
  service já está em `develop`).
- [ ] 1.2 `useAthleteProvas` — `{ data, loading, error, refetch }`, mesmo padrão dos demais hooks.
- [ ] 1.3 `calcularStreakSemanas(treinos, hoje?): number` — função pura em
  `src/features/athlete/utils/` (ou local equivalente). Testes: sem treino (0), streak ativo,
  streak quebrado por lacuna, semana atual em andamento sem treino ainda.

## 2. AthleteHomePage — card de streak

- [ ] 2.1 Buscar `GET /me/treinos?dias=30` (hook dedicado ou reuso do que a Home já busca) +
  `calcularStreakSemanas`.
- [ ] 2.2 Renderizar "X semanas seguidas treinando" quando streak ≥ 1; **ocultar** o card quando
  streak = 0 (R1/D0.1.4).
- [ ] 2.3 `npm run lint && npm run build && npm run test:run` verde.

## 3. AthleteProgressPage — card de próxima prova

- [ ] 3.1 `useAthleteProvas`, filtrar prova futura mais próxima (`data >= hoje`, ordenar asc).
- [ ] 3.2 Renderizar nome + dias restantes na tab Provas; CTA honesto ("peça ao seu coach para
  cadastrar sua próxima meta") quando não há prova futura (CA2).
- [ ] 3.3 `npm run lint && npm run build && npm run test:run` verde.

## 4. Fechamento

- [ ] 4.1 Nenhum valor fabricado nos dois cards quando a fonte está vazia (CA3).
- [ ] 4.2 Suíte completa front + backend verde.
- [ ] 4.3 Smoke manual: login ATLETA com treino manual registrado (9d) + prova cadastrada pelo
  coach → streak e próxima prova corretos e batendo com o que o coach vê no perfil do atleta.
