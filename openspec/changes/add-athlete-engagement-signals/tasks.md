# Tasks: add-athlete-engagement-signals

> **Refinado contra o código real (init 2026-07-04).** Confirmado: `ProvaOutputDto` já traz
> `diasFaltando` (int) calculado pelo backend — "próxima prova" usa `nomeProva`/`dataProva` (filtro
> `data >= hoje`) + `diasFaltando` direto do DTO, sem recalcular a diferença de dias no frontend.
> `GET /atletas/{atletaId}/provas` hoje não tem `@PreAuthorize` (débito pré-existente, fora de
> escopo). Frontend: `AthleteProgressService.ts` já existe (`apps/menthoros-front/src/api/services/`,
> mergeado na 9.6) — `getProvas()` estende esse arquivo, não cria um novo. `AthleteHomePage.tsx`
> ainda não busca `/me/treinos` — task 2.1 adiciona `useManualTraining(30)` (hook já existente,
> reaproveitado na 9.6) à Home.

## 0. Backend — 1 endpoint `/me/provas`

- [x] 0.1 `GET /api/v1/atletas/me/provas` em `AtletaProgressController` (mesmo arquivo dos demais
  `/me/*`) — `@PreAuthorize("hasRole('ATLETA')")`, resolve `atletaId` via
  `atletaProgressService.resolverAtletaIdAtual()`, injeta `ProvaService` (novo field no controller)
  e delega em `provaService.listarProvas(atletaId)`.
  - verify: teste de controller 200 com dado + lista vazia; 404 quando atleta do token não resolve
    (mesmo padrão de `meRecordesNotFound` etc.).
- [x] 0.2 `./mvnw clean test` verde; nenhuma mudança em `GET /atletas/{atletaId}/provas`
  (permanece sem `@PreAuthorize` — débito pré-existente, não tocado nesta change).

## 1. Cliente + hook + helper (frontend)

- [x] 1.1 `getProvas()` em `src/api/services/AthleteProgressService.ts` (arquivo já existe —
  adicionar método, não criar serviço novo).
- [x] 1.2 `useAthleteProvas` em `src/hooks/` — `{ provas, loading, error, fetchProvas }`, mesmo
  padrão dos demais hooks `useAthleteXxx`.
- [x] 1.3 `calcularStreakSemanas(treinos, hoje?): number` — função pura em
  `src/features/athlete/adapters/` (consistente com `zonesAdapter`/`recordsAdapter`/
  `aderenciaAdapter` da 9.6, não um `utils/` separado). Testes: sem treino (0), streak ativo, streak
  quebrado por lacuna, semana atual em andamento sem treino ainda.

## 2. AthleteHomePage — card de streak

- [x] 2.1 Adicionar `useManualTraining(30)` (hook já existente, reusado — não criar hook novo) à
  `AthleteHomePage.tsx` + `calcularStreakSemanas`.
- [x] 2.2 Renderizar "X semanas seguidas treinando" quando streak ≥ 1; **ocultar** o card quando
  streak = 0 (R1/D0.1.4).
- [x] 2.3 `npm run lint && npm run build && npm run test:run` verde.

## 3. AthleteProgressPage — card de próxima prova

- [x] 3.1 `useAthleteProvas` na tab Provas (`AthleteProgressPage.tsx`, `case 'provas'`), filtrar
  prova futura mais próxima (`dataProva >= hoje`, ordenar asc).
- [x] 3.2 Renderizar `nomeProva` + `diasFaltando` (do DTO, sem recalcular) na tab Provas; CTA honesto
  ("peça ao seu coach para cadastrar sua próxima meta") quando não há prova futura (CA2).
- [x] 3.3 `npm run lint && npm run build && npm run test:run` verde.

## 4. Fechamento

- [x] 4.1 Nenhum valor fabricado nos dois cards quando a fonte está vazia (CA3).
- [x] 4.2 Suíte completa front + backend verde.
- [x] 4.3 Smoke manual: login ATLETA com treino manual registrado (9d) + prova cadastrada pelo
  coach → streak e próxima prova corretos e batendo com o que o coach vê no perfil do atleta.
  - **Smoke executado (2026-07-04):** ambiente subido (postgres+redis+keycloak reaproveitando o
    volume `menthoros_pg_data` + backend na branch atual), login ATLETA real. Home mostrou "5
    semanas seguidas treinando" (streak real); tab Provas mostrou "Faltam 8 dias para NB POA"
    (`diasFaltando` direto do DTO). `GET /me/provas` retornando 200; sem erro no console.

## QA gate (`/qa`) — code-reviewer + security-reviewer (backend) + frontend-reviewer

Rodados em paralelo sobre `git diff develop...feature/add-athlete-engagement-signals`. Sem Critical.
Backend: sem Important — tenant/autorização corretos (dupla validação: `resolverAtletaIdAtual()` +
revalidação em `ProvaServiceImpl.resolveAtleta()`), sem PII exposta.

**Corrigidos (commit `27bbcf2`):**
- **Card de streak (Home) engolia erro do fetch de treinos:** `useManualTraining.fetchError` não era
  tratado — falha na rede virava "sem streak", indistinguível de streak genuinamente zero. Agora
  mostra aviso com retry (mesmo padrão do card de prontidão).
- **Tab Provas conflava loading/erro de `/me/provas` com "sem meta cadastrada":** podia mostrar o
  CTA de "peça ao coach" antes do fetch resolver, ou quando a chamada falhava (mesma classe de bug
  já corrigida no KPI "Volume total" da 9.6 — `useManualTraining.isFetching` começa `false`,
  diferente dos outros hooks). Corrigido: nada durante loading, `RetryAlert` em erro, CTA só quando
  de fato vazio.
- **`diasFaltando ?? 0` fabricava "0 dias" quando o campo não vinha no DTO:** campo virou opcional
  no adapter (`undefined`, não `0`); UI mostra "Sua próxima meta: {nome}" sem contagem quando ausente.

**Minor — registrado, não bloqueia:**
- Nomes quase-idênticos entre o novo `ProximaProva` (view model do atleta, `/me/provas`) e o
  `ProvaProxima` já existente (view model do coach, `/api/v1/provas/proximas`, multi-atleta) — ruído
  cognitivo para grep/autocomplete, sem duplicação de dado real. Considerar renomear um dos dois numa
  próxima vez que os arquivos forem tocados.
- Débito pré-existente confirmado pelo security-reviewer (fora do escopo desta change): `GET
  /atletas/{atletaId}/provas` não tem `@PreAuthorize`/`@RequireTenant` — qualquer ATLETA do tenant
  pode, em tese, ler provas de outro atleta do mesmo tenant (IDOR intra-tenant; sem vazamento
  cross-tenant, pois `ProvaServiceImpl` já filtra por tenant). Registrado para follow-up futuro.

**Suíte pós-fix:** frontend lint+build ok, **57 arquivos / 368 testes verdes**; backend **1121 testes
verdes** (`./mvnw clean test`).
