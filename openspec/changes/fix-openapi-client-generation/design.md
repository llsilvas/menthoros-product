# Design: fix-openapi-client-generation

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
