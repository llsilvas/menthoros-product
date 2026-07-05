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
> - Kudos: constraint `UNIQUE(atleta_id, coach_id, motivo, data)` + `DuplicateResourceException`
>   (409) contra duplo-submit/retry (D0.6, achado do adversarial review Codex).
> - Kudos cross-tenant retorna **403** (`AccessDeniedException` via `@RequireTenant`), não 404
>   como a versão anterior desta spec assumia por confiar no texto do Swagger de
>   `CoachAthleteProfileController` em vez do comportamento real do `TenantValidationAspect` (D0.7,
>   corrigido durante a implementação).

Ordem de implementação por ROI decrescente (A → B → C), mas ordem de dependências entre
arquivos sugere fazer C por último (depende dos hooks da 9.5, já mergeados em develop).

---

## Feature A — Feedback pós-treino (XS, frontend-only, ~2-3 dias)

- [x] A.1 Hook já existe: `useManualTraining` (`src/hooks/useManualTraining.ts`) expõe
  `registrar(input): Promise<TreinoRealizadoDto>` que já retorna o DTO criado (o 201 vem com o
  DTO completo). Nenhum hook novo necessário — reutilizado como está.
- [x] A.2 `PostWorkoutFeedbackCard` componente: recebe `TreinoRealizadoOutputDto`, renderiza
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
- [x] A.3 Integrar na `ManualTrainingFormPage`: após submit bem-sucedido, mostrar feedback card
  em vez de navegação imediata — botão "Voltar para Home" fecha e navega para `/athlete/home`.
  - verify: submeter o form mostra o card com os dados reais do 201; "Voltar para Home" navega.
- [x] A.4 `npm run lint && npm run build && npm run test:run` verde.

---

## Feature B — Kudos do coach → atleta (XS, backend+front, ~2-3 dias)

- [x] B.1 Migration V50 `Create_tb_kudos` (DDL corrigida — ver `design.md` D0.1/D0.6 para a
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
- [x] B.2 `KudosService`/`KudosServiceImpl` + `CoachKudosController` (implementado como
  controller dedicado, base `/api/v1/coach/atletas`, em vez de um único `KudosController` — mais
  consistente com o padrão de controllers por capability já usado no codebase):
  `POST /api/v1/coach/atletas/{atletaId}/kudos`
  (body: `{ motivo }`, retorna 201 com `{id, atletaId, coachId, motivo, createdAt}`),
  `@PreAuthorize("hasAnyRole('TECNICO', 'ADMIN')")` (mesmo padrão de
  `CoachAthleteProfileController`), tenant isolation via `@RequireTenant` — cross-tenant retorna
  403 (`AccessDeniedException` via `TenantValidationAspect`, confirmado no código real — ver
  `design.md` D0.7; a doc Swagger do controller de referência citava 404, mas o comportamento
  real do aspecto é 403). **Idempotência (achado do adversarial review, D0.6):** antes de
  persistir, `KudosService` valida via
  `kudosRepository.existsByAtletaIdAndCoachIdAndMotivoAndData(...)` — se já existe kudo do mesmo
  motivo, do mesmo coach, para o mesmo atleta, no mesmo dia, lança `DuplicateResourceException`
  (já mapeada para 409 no `GlobalExceptionHandler` — não criar handler novo). A constraint
  `UNIQUE` no banco é a defesa de última linha contra race condition entre a pré-validação e o
  insert (dois requests concorrentes) — `DataIntegrityViolationException` nesse caso já é
  capturada genericamente pelo handler existente (409 também).
  - verify: teste de controller (`@WebMvcTest`) — 201 happy path, 400 motivo ausente/fora do
    enum, 409 duplicata (mock do service lançando `DuplicateResourceException`). **403
    cross-tenant não é testável isoladamente neste nível** — `@RequireTenant`/`TenantValidationAspect`
    não é tecido pelo slice `@WebMvcTest` (mesmo motivo pelo qual
    `CoachAthleteProfileControllerTest` também não testa esse cenário no controller); a garantia
    vem da aplicação correta da anotação (revisada) + da infraestrutura já testada do aspecto.
    Serviço testado via `KudosServiceImplTest` (Mockito puro): cria kudo, rejeita duplicata
    mesmo dia, permite motivo diferente, atleta não encontrado, cobertura de todo o enum
    `MotivoKudos`.
- [x] B.3 `GET /api/v1/atletas/me/kudos/recentes` (ATLETA, self-resolving, controller dedicado
  `AtletaKudosController`) — até 10 kudos para exibir na Home. Retorna
  `[{id, motivo, createdAt}]` (sem `coachNome` — a UI não precisa, ver D0.5).
  - verify: teste de controller — retorna vazio quando sem kudos (não erro), lista com kudos.
- [x] B.4 Front: `KudosButton` no `CoachAthleteProfilePage` (perfil do atleta) — botão
  "Reconhecer progresso" abre dialog com seleção de motivo; `POST /api/v1/coach/atletas/{atletaId}/kudos`.
  - verify: clicar + selecionar motivo + confirmar dispara o POST; erro mantém o dialog aberto
    com alerta (nunca fecha silenciosamente numa falha).
- [x] B.5 Front: card "Seu coach reconheceu sua {{motivo em texto}}!" na `AthleteHomePage`, usando
  `useKudosRecentes` hook. Mapear motivo→texto (CONSISTENCIA→"consistência", MELHORA→"melhora",
  ESFORCO→"esforço", SUPERACAO→"superação", VOLTA→"volta por cima"). Limitar aos 3 mais recentes;
  sem kudos → nenhum card (estado vazio honesto, não card vazio).
  - verify: teste cobre 0 kudos (nada renderizado), 1–3 kudos (todos), >3 kudos (só os 3 mais
    recentes).
- [x] B.6 `./mvnw clean test` + `npm run lint && npm run build && npm run test:run` verde.

---

## Feature C — Resumo semanal na Home (XS, frontend-only, ~3-4 dias)

- [x] C.1 `buildWeeklySummary` adapter (correção de fonte de dado durante a implementação:
  `formaAtual` vem de `home.metricasChave.statusForma`, não de `readiness` como a versão original
  do proposal assumia — `AthleteReadiness` não tem esse campo; `readiness` nem é parâmetro do
  adapter). Função pura que recebe `treinos` (qualquer janela já buscada — filtra os últimos 7
  dias internamente via `differenceInCalendarDays`, evitando um segundo fetch), `metricasChave`
  e `proximoTreino` (de `useAthleteHome`), `streak: number` (de `calcularStreakSemanas`, já
  existe) e monta `totalTreinos`/`volumeTotalKm`/`streak`/`formaAtual`/`proximoTreino`. Reusa
  `FAIXA_APRESENTACAO` (já existe em `features/coach/types/AthleteForm.ts`, mapeia o enum
  `FaixaTsbStatus` do backend para label PT-BR) em vez de duplicar o mapeamento.
  - verify: testada isoladamente (zero mock de rede) com: dados completos (filtra janela de 7
    dias corretamente), sem treinos na semana (0/0), distância nula/zero ignorada na soma, forma
    ausente ou fora do mapa vira "—" (nunca fabrica), próximo treino ausente vira `null`.
- [x] C.2 `WeeklySummaryCard` componente: renderiza "Seu resumo da semana" com os dados;
  estado vazio honesto quando sem treinos na semana ("Você ainda não registrou treinos esta
  semana — todo treino conta!", nunca "0 treinos, 0 km" fabricado).
  - verify: teste cobre estado com dados e estado vazio (`totalTreinos === 0`).
- [x] C.3 Integrado na `AthleteHomePage` acima do grid de métricas (abaixo dos demais cards da
  Home — hero, readiness, kudos, streak, próxima prova — todos já ocupando o espaço logo abaixo
  do `TodayHeroCard`).
- [x] C.4 `npm run lint && npm run build && npm run test:run` verde (69 arquivos / 437 testes).

---

## Fechamento

- [x] Smoke A: logado como ATLETA, registrado treino manual (Intervalado, 45min, 6km) →
  `PostWorkoutFeedbackCard` apareceu com dados reais ("⚡ Intervalado", "45 min", "6.0 km",
  "Bom treino! Mantenha a consistência.") após corrigido um bug real encontrado ao vivo (ver
  abaixo). "Voltar para Home" navegou corretamente.
- [x] Smoke B: logado como COACH, clicado "Reconhecer progresso" no perfil do atleta, motivo
  "Consistência" → `POST /coach/atletas/{id}/kudos` retornou 201. Relogado como ATLETA → card
  na Home mostrou "Seu coach reconheceu sua consistência!" corretamente. Bug de concordância de
  gênero encontrado e corrigido (ver abaixo).
- [x] Smoke C: logado como ATLETA com treinos na semana → "Seu resumo da semana" mostrou
  "5 treinos", "28.3 km", "5 semanas", "Forma ideal", "Próximo: Longo" — todos com dado real.
- [x] Suíte completa front + backend verde (438 testes frontend / 1148 testes backend).

### Bugs encontrados e corrigidos durante o smoke ao vivo

1. **`parseDuracaoMin` não tratava o formato "MM:SS"** (adapter compartilhado,
   `features/athlete/adapters/parseDuracaoMin.ts`) — o backend retorna `duracaoMin` como
   `"45:00"` (sem hora) para treinos manuais com duração < 1h, mas o parser só aceitava
   exatamente 3 partes (`HH:MM:SS`), retornando `null` e fazendo o `PostWorkoutFeedbackCard`
   omitir silenciosamente a duração. Corrigido para aceitar 2 ou 3 partes; teste de regressão
   adicionado (`parseDuracaoMin('45:00') === 45`). Afeta também `buildWeeklyPlan.ts` (mesmo
   adapter), sem quebrar nenhum teste existente.
2. **Concordância de gênero errada no card de kudos** (`KudosCard.tsx`) — o template fixo "Seu
   coach reconheceu **sua** {motivo}!" está incorreto para `ESFORCO` ("esforço" é masculino →
   "**seu** esforço", não "sua esforço"). Corrigido movendo o possessivo para dentro do mapa de
   texto por motivo (`ESFORCO: 'seu esforço'`, demais mantêm `'sua ...'`), eliminando a
   concordância genérica incorreta.

## Gate de QA (`/qa`, após o fechamento)

Backend: `code-reviewer` + `security-reviewer` + `clean-code-reviewer` em paralelo, mais
`./mvnw clean test`. Frontend: `frontend-reviewer` + `clean-code-reviewer` em paralelo, mais
`npm run lint && npm run build && npm run test:run`. Cross-model: `/codex:review` em ambos os
repos (fora da cota Claude). **Nenhum finding Critical** em nenhuma das 6 análises.

### Achados corrigidos

- **[Important, backend]** `Kudos.motivo` sem `length = 20` — divergia da migration
  (`VARCHAR(20)`), risco de `SchemaManagementException` com `ddl-auto=validate`. Corrigido.
- **[Minor, backend]** 3 gaps de cobertura de branch: coach não encontrado
  (`KudosServiceImplTest`), 404 em ambos os controllers (`CoachKudosControllerTest`,
  `AtletaKudosControllerTest`). Testes adicionados. Uma tentativa de testar "403 por role
  inválida" no `CoachKudosControllerTest` revelou que `@WebMvcTest(addFilters=false)` não tece
  `@PreAuthorize` neste slice — a request passou com 201 mesmo com `ROLE_ATLETA`. Removido o
  teste (daria falso positivo) e registrado como débito de teste: a aplicação correta da
  anotação foi verificada por leitura de código, mas o caminho negativo não é regression-tested
  neste nível (mesma limitação já presente em `CheckinProntidaoControllerTest` e outros
  controllers do módulo — não é uma regressão desta change).
- **[P2, Codex frontend]** `KudosDialog` não resetava o `motivo` selecionado ao reabrir (o
  dialog não desmonta, só alterna `open`) — mesma classe de bug já corrigida no
  `QuickCheckInModal` (9.8). Corrigido com `useEffect` + teste de regressão.
- **[Important, frontend]** `WeeklySummaryCard` podia mostrar "você ainda não registrou treinos
  esta semana" (estado vazio fabricado) enquanto `useManualTraining` ainda buscava os treinos —
  faltava o gate de `isFetching`/`fetchError` que os demais cards da Home já têm (kudos,
  próxima prova). Corrigido + teste de regressão.
- **[Important, convergência entre 2 revisores independentes]** `FAIXA_APRESENTACAO` morava em
  `features/coach/types/AthleteForm.ts` mas passou a ser consumida por
  `buildWeeklySummary.ts` (shell do atleta) — acoplamento lateral entre shells. Movido para
  `types/FaixaTsb.ts` (local neutro, ao lado de `FaixaTsbStatus`); `AthleteForm.ts` mantém
  re-export para não quebrar os consumidores existentes do coach shell. Corrigido também o cast
  `as FaixaTsbStatus` no adapter — `AthleteMetricasChave.statusForma` agora tipado
  corretamente em vez de `string` solto.
- **[Important, frontend]** Erro de kudos exibido ao coach usava `.message` direto do
  `ApiError`, mas `request.ts` inclui o corpo bruto da resposta na mensagem para status não
  mapeados em `KudosService.errors` (500, rede) — risco de vazar detalhe interno. Corrigido com
  fallback genérico para status fora de `{400,403,404,409}`.

### Achados registrados como débito (não corrigidos agora — fora de escopo desta change XS)

- **[Important, adiável]** `AthleteHomePage.tsx` acumulou 7 hooks de fetch independentes ao
  longo das mudanças 9.5–9.9 e repete o padrão de alerta de erro 5 vezes. Refactor sugerido
  pelo `clean-code-reviewer`: extrair `AsyncSectionAlert` (elimina a duplicação) + um hook de
  orquestração `useAthleteHomeData()`. Vale fazer na próxima mudança que tocar esse arquivo, não
  bloqueia este pilot.
- **[Low, backend]** Sem rate limiting em `POST /coach/atletas/{atletaId}/kudos` — consistente
  com o resto da superfície de escrita autenticada do backend (só o `/waitlist` público tem
  rate limit hoje); não é uma regressão desta change.

### Suítes revalidadas após as correções

Backend: 1151/1151. Frontend: 440/440 (69 arquivos), lint + build limpos.
