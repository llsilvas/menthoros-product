# Tasks: add-athlete-retention-quick-wins

> **Refinado após DoR gate (NOT READY na 1ª submissão) — ver `design.md` para o detalhamento
> completo.** Achados que corrigem a versão original:
> - Migration V50 original violava os Table Design Standards (sem `tenant_id`, sem
>   `DEFAULT gen_random_uuid()`, `TIMESTAMP` em vez de `TIMESTAMPTZ`) — corrigida no D0.1.
> - Path variable do endpoint de kudos padronizado como `{atletaId}` (a versão do proposal usava
>   `{id}`, inconsistente com o resto do spec).
> - `@PreAuthorize` do endpoint de kudos deve ser `hasAnyRole('TECNICO', 'ADMIN')` (mesmo padrão de
>   `CoachAthleteProfileController`), não `hasRole('TECNICO')` sozinho (D0.3).
> - `GET /me/kudos/recentes` não retorna `coachNome` — a UI não precisa exibir o nome do coach
>   (D0.5); contrato é `[{id, motivo, createdAt}]`.
> - `TreinoRealizadoOutputDto` e o retorno 201 de `POST /me/treinos` confirmados sem gap (D0.2).

Ordem de implementação por ROI decrescente (A → B → C), mas ordem de dependências entre
arquivos sugere fazer C por último (depende dos hooks da 9.5, já mergeados em develop).

---

## Feature A — Feedback pós-treino (XS, frontend-only, ~2-3 dias)

- [ ] A.1 `useRegistrarTreino` hook (se não existir): chamar `POST /api/v1/atletas/me/treinos`
  com `TreinoManualInputDto`, retornar o `TreinoRealizadoOutputDto` criado (o 201 já vem com o
  DTO completo — sem round-trip extra).
  - verify: hook expõe `{ registrar, loading, error }`; teste cobre sucesso e erro.
- [ ] A.2 `PostWorkoutFeedbackCard` componente: recebe `TreinoRealizadoOutputDto`, renderiza
  template baseado em `tipoTreino` + `percepcaoEsforco` (ver tabela completa de casos no
  `design.md` D1/CA-A2):
  - `tipoTreino` → emoji + verbo ("🏃 Corrida", "⚡ Intervalado", "🏔️ Longão")
  - `duracaoMin` (string `HH:MM:SS`) → "60 min"
  - `distanciaKm` → "10 km" (1 casa decimal; omitir linha se nulo/zero — ex: musculação)
  - `tssCalculado` → "TSS 62"
  - `percepcaoEsforco >= 8` → "Grande esforço! Respeite a recuperação."
  - `percepcaoEsforco <= 4` → "Bom treino leve! Ativação no ponto."
  - `percepcaoEsforco` nulo ou entre 5–7 → "Bom treino! Mantenha a consistência." (nunca fabrica
    um RPE que não veio do backend)
  - `tipoTreino` sem emoji mapeado → usa o label do enum sem emoji, nunca quebra
  - verify: teste de componente cobre os 5 casos da tabela (função pura de template, sem mock de
    rede): completo, RPE alto, RPE baixo, sem distância, tipo desconhecido.
- [ ] A.3 Integrar na `ManualTrainingFormPage`: após submit bem-sucedido, mostrar feedback card
  em vez de navegação imediata — botão "Voltar para Home" fecha e navega para `/athlete/home`.
  - verify: submeter o form mostra o card com os dados reais do 201; "Voltar para Home" navega.
- [ ] A.4 `npm run lint && npm run build && npm run test:run` verde.

---

## Feature B — Kudos do coach → atleta (XS, backend+front, ~2-3 dias)

- [ ] B.1 Migration V50 `Create_tb_kudos` (DDL corrigida — ver `design.md` D0.1/D0.6 para a
  versão completa com comentário de rollback):
  ```sql
  CREATE TABLE IF NOT EXISTS tb_kudos (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      atleta_id   UUID        NOT NULL REFERENCES tb_atleta(id) ON DELETE CASCADE,
      coach_id    UUID        NOT NULL REFERENCES tb_usuario(id) ON DELETE CASCADE,
      motivo      VARCHAR(20) NOT NULL CHECK (motivo IN ('CONSISTENCIA','MELHORA','ESFORCO','SUPERACAO','VOLTA')),
      data        DATE        NOT NULL DEFAULT CURRENT_DATE,
      tenant_id   UUID        NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT uk_kudos_atleta_coach_motivo_data UNIQUE (atleta_id, coach_id, motivo, data)
  );
  CREATE INDEX IF NOT EXISTS idx_kudos_tenant_atleta ON tb_kudos(tenant_id, atleta_id, created_at DESC);
  ```
  - verify: `./mvnw clean compile` sobe sem erro de migration; V50 é o próximo número livre
    (confirmado — última aplicada é V49).
- [ ] B.2 `KudosService` + `KudosController`: `POST /api/v1/coach/atletas/{atletaId}/kudos`
  (body: `{ motivo }`, retorna 201 com `{id, atletaId, coachId, motivo, createdAt}`),
  `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")` (mesmo padrão de
  `CoachAthleteProfileController`), tenant isolation via `@RequireTenant` — cross-tenant deve
  retornar 404, não 403/500. **Idempotência (achado do adversarial review, D0.6):** antes de
  persistir, `KudosService` valida via
  `kudosRepository.existsByAtletaIdAndCoachIdAndMotivoAndData(...)` — se já existe kudo do mesmo
  motivo, do mesmo coach, para o mesmo atleta, no mesmo dia, lança `DuplicateResourceException`
  (já mapeada para 409 no `GlobalExceptionHandler` — não criar handler novo). A constraint
  `UNIQUE` no banco é a defesa de última linha contra race condition entre a pré-validação e o
  insert (dois requests concorrentes) — `DataIntegrityViolationException` nesse caso já é
  capturada genericamente pelo handler existente (409 também).
  - verify: teste de controller — 201 happy path, 404 cross-tenant, 400 motivo inválido
    (fora do enum), **409 ao repetir o mesmo motivo/atleta/coach no mesmo dia** (teste de
    duplo-submit/retry — o caso que o adversarial review apontou como não coberto).
- [ ] B.3 `GET /api/v1/atletas/me/kudos/recentes` (ATLETA, self-resolving) — últimos 10 kudos
  para exibir na Home. Retorna `[{id, motivo, createdAt}]` (sem `coachNome` — a UI não precisa,
  ver D0.5).
  - verify: teste de controller — retorna vazio quando sem kudos (não erro), ordenado
    `created_at DESC`.
- [ ] B.4 Front: `KudosButton` no `CoachAthleteProfilePage` (perfil do atleta) — botão
  "Reconhecer progresso" abre dialog com seleção de motivo; `POST /api/v1/coach/atletas/{atletaId}/kudos`.
  - verify: clicar + selecionar motivo + confirmar dispara o POST; erro mantém o dialog aberto
    com alerta (nunca fecha silenciosamente numa falha).
- [ ] B.5 Front: card "Seu coach reconheceu sua {{motivo em texto}}!" na `AthleteHomePage`, usando
  `useKudosRecentes` hook. Mapear motivo→texto (CONSISTENCIA→"consistência", MELHORA→"melhora",
  ESFORCO→"esforço", SUPERACAO→"superação", VOLTA→"volta por cima"). Limitar aos 3 mais recentes;
  sem kudos → nenhum card (estado vazio honesto, não card vazio).
  - verify: teste cobre 0 kudos (nada renderizado), 1–3 kudos (todos), >3 kudos (só os 3 mais
    recentes).
- [ ] B.6 `./mvnw clean test` + `npm run lint && npm run build && npm run test:run` verde.

---

## Feature C — Resumo semanal na Home (XS, frontend-only, ~3-4 dias)

- [ ] C.1 `buildWeeklySummary` adapter: função pura que recebe `treinos` (últimos 7 dias, de
  `useManualTraining`/`useAthleteHome`), `readiness` (de `useAthleteReadiness`, pode ser `null`),
  `streak: number` (de `calcularStreakSemanas`, já existe em `streakAdapter.ts`) e monta:
  - `totalTreinos` (count)
  - `volumeTotalKm` (soma de `distanciaKm`, ignorando nulos)
  - `streak` (repassado, sem recalcular)
  - `formaAtual` (statusForma do readiness; `null` → "—", nunca fabrica um valor)
  - `proximoTreino` (do `useAthleteHome`)
  - verify: testada isoladamente (zero mock de rede) com: dados completos, sem treinos na
    semana (0/0), sem streak (0), readiness ausente (`formaAtual` vira "—", não quebra).
- [ ] C.2 `WeeklySummaryCard` componente: renderiza "Seu resumo da semana" com os dados;
  estado vazio honesto quando sem treinos na semana ("Você ainda não registrou treinos esta
  semana — todo treino conta!", nunca "0 treinos, 0 km" fabricado).
  - verify: teste cobre estado com dados e estado vazio (`totalTreinos === 0`).
- [ ] C.3 Integrar na `AthleteHomePage` abaixo do `TodayHeroCard`, acima do grid de métricas.
- [ ] C.4 `npm run lint && npm run build && npm run test:run` verde.

---

## Fechamento

- [ ] Smoke A: logar ATLETA, registrar treino manual → feedback card aparece com dados reais.
- [ ] Smoke B: logar COACH, dar kudo no perfil do atleta → atleta vê card na Home.
- [ ] Smoke C: logar ATLETA com treinos na semana → resumo semanal correto na Home.
- [ ] Suíte completa front + backend verde.
