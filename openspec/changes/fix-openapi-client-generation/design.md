# Design: fix-openapi-client-generation

## ⚠️ Descoberta na Fase B (2026-06-18) — DECISÃO PENDENTE

A Fase B (regen do front) revelou que a estimativa "~13 import sites" do proposal **subestimou
drasticamente** o custo. Fatos validados na branch `feature/fix-openapi-client-generation` (front):

1. **O problema de geração está RESOLVIDO:** com os `@Tag` ASCII (Fase A ✅ em develop) + a flag
   **`--useUnionTypes`** no `generate:api` (gera union types em vez de `enum`/`namespace`, que violam
   `erasableSyntaxOnly` do tsconfig), a regen produz nomes limpos (CA2 ✓), **idempotente** (CA1 ✓,
   diff vazio na 2ª rodada) e sem corrupção.
2. **MAS o `src/api` curado não é só "tipos renomeados" — é uma camada de abstração deliberada.** Os
   serviços curados têm **nomes de método hand-crafted** (`obterTreino`, `marcarComoRealizado`,
   `gerarProjecao`, `listarHistorico`, `getCalendario`, `recalcularMetricas`, `listarProximas`…) que
   **não existem** no cliente gerado (que usa nomes derivados do operationId: `marcarPerdido`,
   `recalcularMetricasAtleta`, `deletePlanoSemanal`, `listarProvas`…). Há ainda **divergência de
   shape** (ex.: `listarAtletas` curado retorna array; gerado retorna objeto; `CreateProva`→`ProvaInputDto`;
   wrappers de paginação).
3. **Custo real de adotar o cliente gerado:** ~42 erros de tipo em **18 arquivos** de **6+ features**
   (atletas, planos, provas, race-projection, strava, reconciliação) — reescrita da camada de dados,
   **sem cobertura de teste** para pegar regressões de runtime (só `tsc`).

### Opções (decisão do usuário)

- **A — Migração completa agora:** adotar o cliente gerado em todas as features; reescrever ~18 call
  sites (nomes de método + shapes). Atende CA3 (src/api 100% gerado). Alto esforço/risco sem testes.
- **B — Reescopar: pipeline corrigido, adoção adiada (recomendado).** A entrega real desta change vira
  "tornar `generate:api` determinístico e correto" (Fase A `@Tag` ASCII ✅ + `--useUnionTypes`).
  Mantém o cliente curado como camada de abstração; documenta no `CLAUDE.md` que o gerado é a base e o
  curado a fachada. CA3 é abandonado conscientemente. Baixo risco.
- **C — Adoção incremental:** migrar feature por feature, cada uma em change própria com testes, ao
  longo do tempo. Combina o pipeline corrigido (B) com adoção gradual.

> Branch da Fase B deixado **pristine** (== develop) até a decisão. O fix `--useUnionTypes` está
> documentado aqui mas não commitado.

### 🔴 Achado crítico adicional — tipos gerados estão INCORRETOS para endpoints de lista

Ao tentar a migração (opção A), descobriu-se que o cliente gerado herda **tipos errados**, não só
nomes diferentes:

- `GET /api/v1/atletas` declara no `/api-docs` o `200` como **`AtletaOutputDto` (objeto único)**, não
  `array` → `listarAtletas()` gerado retorna `AtletaOutputDto`, quebrando `.map`/`.slice` em runtime.
- `GET /api/v1/provas` → **sem schema** de resposta declarado.
- Causa: as anotações `@ApiResponse(content=@Content(schema=@Schema(implementation=...)))` dos
  controllers antigos **omitem `array`** (springdoc não infere a lista). O **cliente curado corrige
  esses tipos à mão** (`Array<Atleta>`) — essa é uma das razões de ele existir.

**Consequência para a opção A:** adotar o cliente gerado exige **primeiro corrigir as anotações
OpenAPI do backend** em ~todos os endpoints de lista (outro esforço de backend + re-ship), senão o
front adota tipos incorretos e quebra em runtime. Isso é muito além de "renomear call sites".

### Opção revisada

- **A′ — Corrigir OpenAPI do backend primeiro:** anotar `array` em todos os endpoints de lista
  (`@ApiResponse` com `array = true`), re-shipar backend, então regenerar + migrar front. Maior escopo
  (backend + front, multi-ship), maior risco.
- **B — Reescopar (recomendação reforçada):** o cliente curado corrige gaps reais do OpenAPI; mantê-lo
  como fachada é o caminho de menor risco. Entrega = pipeline determinístico (tags ASCII ✅ +
  `--useUnionTypes`) + doc. Abandona CA3.

### 🔴🔴 Execução de A′ (pós-A2) — 3 bloqueios concretos com evidência (decisão pendente)

Com A2 em develop (arrays corretos) + `--useUnionTypes`, a regen ficou limpa/idempotente, mas a
adoção (CA3) revelou que o cliente curado é uma **fachada com valor real**, não dívida:

1. **Models gerados são TODOS opcionais** (`status?: string`, `isKeyWorkout?: boolean`, `kpis?`,
   `treinos?`…) — os DTOs do backend não marcam `required`. Adotá-los **degrada a tipagem** (perde a
   union `CoachAtletaStatus`, exige null-handling pervasivo em código já limpo).
2. **Nomes de método divergem** — o curado renomeou para ergonomia (`getCalendario`,`gerarProjecao`,
   `obterTreino`,`listarPlanosPorAtleta`…); o gerado usa operationId (`getCalendarioSemanal`,`generate`,…).
   ~18 call sites a reescrever em 6 features **sem testes de runtime**.
3. **Calls pendurados (hard-blocker):** `DetalheTreinoDialog`→`TreinoService.obterTreino` chama
   `GET /api/v1/treinos/{treinoId}` que **não existe** no backend e **não tem método gerado**. O curado
   referencia endpoints inexistentes → cada caso exige decisão (código morto? criar endpoint? remover?).

**Conclusão:** o objetivo "generate:api determinístico/correto" está **atingido** (Fase A + A2 +
`--useUnionTypes`). A adoção total (CA3) é cara, arriscada (6 features sem teste) e **degrada** o
código, além de esbarrar em endpoints inexistentes. **Recomendação forte: opção B** — fechar a change
com o pipeline corrigido + doc, manter o cliente curado como fachada, e tratar adoção (se desejada)
como changes incrementais por-feature com testes.

## Problema

`openapi-typescript-codegen@0.29` nomeia cada serviço pelo **primeiro `@Tag`** da operação,
PascalCase + `Service`, e sanitiza mal caracteres não-ASCII (acento → removido). Os `@Tag` do backend
são frases PT-BR ("Análise de Treino", "Métricas da Assessoria"), gerando nomes corrompidos. Além
disso o cliente curado **consolidou e renomeou** (4 controllers Strava → 1 `StravaService`; "Planos
de Treino" → `PlanoSemanalService`). Restaurar a geração exige (a) tags ASCII estáveis e (b) decidir
consolidação e absorver o churn de naming/tipos no front.

## D1 — Princípio de naming: minimizar churn

Escolher cada `@Tag` ASCII de modo que **o serviço gerado tenha o mesmo nome do serviço curado já
consumido** — assim os import sites de *serviço* não mudam; só os de *tipo* (que passam de
`src/types/` para `src/api/models/`). Para tags não consumidas pelo front, nome ASCII descritivo.

### Tabela de naming (proposta — refinar no init)

| `@Tag` atual (PT) | `@Tag` novo (ASCII) | Serviço gerado | Curado hoje | Churn de serviço |
|---|---|---|---|---|
| Atletas | `atletas` | `AtletasService` | `AtletasService` | nenhum ✓ |
| Projeção de Prova | `race-projection` | `RaceProjectionService` | `RaceProjectionService` | nenhum ✓ |
| Análise de Treino | `analise` | `AnaliseService` | `AnaliseService` | nenhum ✓ |
| Reconciliação Manual | `reconciliacao` | `ReconciliacaoService` | `ReconciliacaoService` | nenhum ✓ |
| Treinos Realizados | `treino` | `TreinoService` | `TreinoService` | nenhum ✓ |
| Planos de Treino | `plano-semanal` | `PlanoSemanalService` | `PlanoSemanalService` | nenhum ✓ |
| Provas | `prova` | `ProvaService` | `ProvaService` | nenhum ✓ |
| Strava OAuth/Status/Sync/Webhook | `strava` (consolidado, D2) | `StravaService` | `StravaService` | nenhum ✓ |
| Dashboards do Coach | `coach-dashboard` | `CoachDashboardService` | — (6b ia criar) | novo |
| Métricas (`MetricasController`) | `metricas` | `MetricasService` | — | novo (não consumido) |
| Métricas da Assessoria (`AssessoriaMetricasController`) | `assessoria-metricas` | `AssessoriaMetricasService` | — | novo |
| Progresso do Atleta | `progresso-atleta` | `ProgressoAtletaService` | — | novo |
| Provas Próximas | `provas-proximas` | `ProvasProximasService` | — | novo |
| Assessorias | `assessorias` | `AssessoriasService` | — | novo |
| Status | `status` | `StatusService` | — | novo |
| Usuários | `usuarios` | `UsuariosService` | — | novo |

> Mantendo os nomes **PT ASCII** dos tags atuais (sem acento/espaço), o PascalCase do gerador já bate
> com os serviços curados — churn de serviço **zero** nos 8 consumidos. (Nomes em inglês — `races`,
> `completed-workouts` — maximizariam o churn; rejeitados.)
>
> Colisão verificada (Q4): "Métricas" e "Métricas da Assessoria" são controllers **distintos**
> (`MetricasController` / `AssessoriaMetricasController`) → tags distintos `metricas`/`assessoria-metricas`,
> sem colisão.

## D2 — Consolidação Strava

Os 4 controllers Strava recebem o **mesmo** `@Tag(name = "strava")` → o gerador agrupa as operações
num único `StravaService`, idêntico ao curado. Alternativa (4 serviços) rejeitada: quebraria o
`StravaService` curado e os 3 import sites. `@Tag` é por-operação, então 4 controllers podem
compartilhar o mesmo nome de tag sem problema.

## D3 — Migração de tipos (`src/types/` → `src/api/models/`)

O gerador cria `src/api/models/*` para todo schema. Os hooks/serviços curados hoje importam tipos de
`src/types/` (ex.: `import { Atleta } from '../../types/Atleta'`). Após a regen:

- Tipos que **duplicam** schema de API (`Atleta`, `CreateAtleta`, etc.) → migrar imports para
  `src/api/models/...` e **remover** de `src/types/` (regra do CLAUDE.md: não redeclarar tipo gerado).
- Tipos **domain/UI** sem contraparte na API (ex.: `WorkoutType`, `FormVariant`, `AvatarStatus`) →
  **permanecem** em `src/types/` / `src/features/coach/types/`.
- Fazer isso por arquivo, guiado pelo `tsc` (`npm run build`) — cada erro de tipo aponta um import a migrar.

## D4 — Idempotência (a prova de que o conserto funcionou)

Critério objetivo de "consertado": `generate:api` rodado 2× seguidas → **diff vazio** na 2ª (CA1).
Garante que a saída é estável e que `src/api` versionado == saída do gerador (sem hand-edit residual).

## D5 — Ordem de execução (duas fases mergeáveis — product-review)

- **Fase A — Backend (`@Tag` ASCII + consolidação Strava), mergeável sozinha.** Spike de 1 tag → todos
  → `./mvnw clean test` → merge. É a correção de raiz; pode preceder a 6b sem tocar o front.
- **Fase B — Front, após a 6b estabilizar.** Com o backend novo no ar: `generate:api` → revisar diff →
  migrar imports de tipo → remover dupes de `src/types/` → smoke auth (CA7) → `lint && build && test:run`.
- **Docs:** alinhar `CLAUDE.md` (front + nota no backend) — junto da fase correspondente.

Branches `feature/fix-openapi-client-generation` separadas por repo. O front (Fase B) depende do
backend (Fase A) já **mergeado e no ar** para gerar do contrato novo.

## Riscos e mitigações (inclui pré-mortem)

> Pré-mortem — "restauramos a geração e algo quebrou. Por quê?"

- **R1 — Naming gerado ≠ esperado** (o gerador PascalCaseia diferente do previsto, ex.: hífens).
  *Mitigação:* validar a tabela D1 empiricamente no 1º item do init (renomear 1 tag, gerar, conferir o
  nome) antes de renomear os 20. Ajustar a tabela com o resultado real.
- **R2 — Tipos gerados divergem dos de `src/types/`** (campos opcionais, enums como `string`,
  nullability) → quebra sutil em componentes. *Mitigação:* migração guiada por `tsc`; revisar cada
  enum/optional; não suprimir erro com `as any` (regra CLAUDE.md).
- **R3 — Consolidação Strava muda a ordem/assinatura dos métodos** no `StravaService` gerado vs curado.
  *Mitigação:* conferir que os 3 import sites de Strava chamam métodos que existem no serviço gerado;
  ajustar chamadas se a assinatura gerada diferir.
- **R4 — Regen arrasta mudanças de contrato não intencionais** (algum endpoint mudou desde o último
  client curado). *Mitigação:* o diff da regen é revisado item a item; mudança de path/schema vira
  follow-up, não entra silenciosa.
- **R5 — Headers de auth/tenant param de funcionar** se a regen sobrescrever `core/OpenAPI.ts`
  (risco mais sério, product-review). `main.tsx` seta `OpenAPI.BASE`/`OpenAPI.HEADERS` em runtime; se o
  gerador mudar a forma do objeto `OpenAPI` (campo `HEADERS` some/muda de tipo), `main.tsx`
  **compila mas falha silenciosamente em runtime** — nenhum erro de `tsc`. *Mitigação:* CA7 — smoke
  obrigatório de uma chamada autenticada (verificar `X-Tenant-ID` no request), não confiar só no build.
- **R6 — Conflito com `wire-coach-shell` (6b)** em andamento. *Mitigação:* sequenciar esta antes (ver
  proposal Impact/Q3); a 6b então consome `CoachDashboardService` gerado.
- **R7 — `@Tag` ASCII piora a Swagger UI** (nomes menos legíveis p/ humanos). *Mitigação:* manter o
  `description` do `@Tag` em PT-BR rico; só o `name` vira ASCII. Swagger UI mostra ambos.

## Fora de escopo

Trocar o gerador (orval); mudar contrato de API; adicionar endpoints; mexer em auth/tenant; refatorar
hooks além do necessário para compilar com os tipos gerados.
