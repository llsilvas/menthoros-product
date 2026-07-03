# Tasks: add-athlete-retention-quick-wins

Ordem de implementação por ROI decrescente (A → B → C), mas ordem de dependências entre
arquivos sugere fazer C por último (depende dos hooks da 9.5, que ainda estão em implementação).

---

## Feature A — Feedback pós-treino (XS, frontend-only, ~2-3 dias)

- [ ] A.1 `useRegistrarTreino` hook (se não existir): chamar `POST /me/treinos` com
  `TreinoManualInputDto`, retornar o `TreinoRealizadoOutputDto` criado.
- [ ] A.2 `PostWorkoutFeedbackCard` componente: recebe `TreinoRealizadoOutputDto`, renderiza
  template baseado em `tipoTreino` + `percepcaoEsforco`:
  - `tipoTreino` → emoji + verbo ("🏃 Corrida", "⚡ Intervalado", "🏔️ Longão")
  - `duracaoMin` → "60 min"
  - `distanciaKm` → "10 km" (omitir se nulo/zero, ex: musculação)
  - `tssCalculado` → "TSS 62"
  - Se RPE ≥ 8: "Grande esforço! Respeite a recuperação."
  - Se RPE ≤ 4: "Bom treino leve! Ativação no ponto."
  - Default: "Bom treino! Mantenha a consistência."
  Testado isoladamente (função pura de template, sem mock de rede).
- [ ] A.3 Integrar na `ManualTrainingFormPage`: após submit bem-sucedido, mostrar feedback card
  em vez de navegação imediata — botão "Voltar para Home" fecha e navega.
- [ ] A.4 `npm run lint && npm run build && npm run test:run` verde.

---

## Feature B — Kudos do coach → atleta (XS, backend+front, ~2-3 dias)

- [ ] B.1 Migration V50 `CreateKudosTable`:
  ```sql
  CREATE TABLE tb_kudos (
      id UUID PRIMARY KEY,
      atleta_id UUID NOT NULL REFERENCES tb_atleta(id),
      coach_id UUID NOT NULL REFERENCES tb_usuario(id),
      motivo VARCHAR(20) NOT NULL CHECK (motivo IN ('CONSISTENCIA','MELHORA','ESFORCO','SUPERACAO','VOLTA')),
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX idx_kudos_atleta ON tb_kudos(atleta_id, created_at DESC);
  ```
- [ ] B.2 `KudosService` + `KudosController`: `POST /api/v1/coach/atletas/{atletaId}/kudos`
  (body: `{ motivo }`), `@PreAuthorize("hasRole('TECNICO')")`, tenant isolation via
  `@RequireTenant`. Teste de controller (201, 403 cross-tenant, 404 atleta).
- [ ] B.3 `GET /api/v1/atletas/me/kudos/recentes` (ATLETA, self-resolving) — últimos 10 kudos
  para exibir na Home. Retorna `[{ motivo, data, coachNome }]`.
- [ ] B.4 Front: `KudosButton` no `CoachAthleteProfilePage` (perfil do atleta) — botão
  "Reconhecer progresso" abre dialog com seleção de motivo; `POST /coach/atletas/{id}/kudos`.
- [ ] B.5 Front: card "Seu coach reconheceu sua {{motivo}}!" na `AthleteHomePage`, usando
  `useKudosRecentes` hook. Limitar aos últimos 3 kudos.
- [ ] B.6 `./mvnw clean test` + `npm run lint && npm run build && npm run test:run` verde.

---

## Feature C — Resumo semanal na Home (XS, frontend-only, ~3-4 dias)

- [ ] C.1 `buildWeeklySummary` adapter: função pura que recebe `treinos: TreinoRealizado[]`
  (7 dias), `plano: PlanoSemanal`, `readiness: AthleteReadiness`, `streak: number` e monta:
  - `totalTreinos` (count)
  - `volumeTotalKm` (soma)
  - `streak` (reusado da 9.7)
  - `formaAtual` (statusForma do readiness/PMC)
  - `proximoTreino` (do useAthleteHome)
  Testada isoladamente (zero mock de rede).
- [ ] C.2 `WeeklySummaryCard` componente: renderiza "Seu resumo da semana" com os dados;
  estado vazio honesto quando sem treinos na semana ("Você ainda não registrou treinos esta
  semana — todo treino conta!").
- [ ] C.3 Integrar na `AthleteHomePage` abaixo do TodayHeroCard, acima do grid de métricas.
- [ ] C.4 `npm run lint && npm run build && npm run test:run` verde.

---

## Fechamento

- [ ] Smoke A: logar ATLETA, registrar treino manual → feedback card aparece com dados reais.
- [ ] Smoke B: logar COACH, dar kudo no perfil do atleta → atleta vê card na Home.
- [ ] Smoke C: logar ATLETA com treinos na semana → resumo semanal correto na Home.
- [ ] Suíte completa front + backend verde.
