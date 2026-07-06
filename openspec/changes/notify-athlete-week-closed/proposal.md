# Proposal: notify-athlete-week-closed

**Tamanho:** XS · **Trilha:** Fast (frontend-only, um repo, sem contrato de API novo)

## Status

Proposed

## Why

Retenção (causa 3 do discovery — baixa percepção de progresso/consequência): quando o treinador
**encerra a semana** (`coach-encerrar-semana`), os treinos planejados que já passaram e não foram
executados nem reagendados são marcados como **PERDIDO** e o `PlanoSemanal` fecha (`CONCLUIDO`). Hoje
o atleta **não é avisado** — abre o app e não percebe que a semana fechou nem que perdeu treinos. Sem
esse sinal, não há gancho de reengajamento ("a semana fechou, a próxima é uma nova chance").

**Definição de treino PERDIDO** (confirmada com o founder): um treino planejado é *perdido* quando a
data planejada já passou e ele não foi executado nem reagendado. O status é setado formalmente pelo
fluxo `coach-encerrar-semana` (`statusTreino = PERDIDO`) — é esse o sinal autoritativo de "semana
encerrada com treinos perdidos".

## Correção de premissa (SPRINTS)

O SPRINTS descrevia "reusa `GET /me/treinos`". **`GET /api/v1/atletas/me/treinos` retorna treinos
REALIZADOS** (`TreinoRealizadoDto[]`) — que não têm status `PERDIDO`. A fonte correta do sinal é o
**plano do atleta**: `useAthletePlan` (`GET /api/v1/planos/{atletaId}`, o backend já filtra `APROVADO`
para a role ATLETA) devolve `PlanoSemanal.treinosPlanejados[]`, cada um com
`statusTreino` (object-enum) — o banner detecta `getSafeValue(statusTreino) === 'PERDIDO'`. Continua
**frontend-only, sem endpoint novo**.

**Janela natural do banner:** `buscarPlanoPorAtleta(apenasAprovados=true)` retorna o plano APROVADO
mais recente por `semanaInicio`. Assim que o coach encerra a semana (`CONCLUIDO`) e **antes** de aprovar
o plano da próxima, esse plano encerrado (com os `PERDIDO`) é o "plano corrente" do atleta — exatamente
o momento de reengajamento. Quando a próxima semana é aprovada, o banner naturalmente some.

## What Changes

### Backend

Nenhuma mudança. Nenhum endpoint novo.

### Frontend (`apps/menthoros-front`, `features/athlete`)

- **Seletor puro** (`adapters/`) que, a partir do `PlanoSemanal`, retorna os treinos PERDIDO do plano
  (via `getSafeValue(statusTreino) === 'PERDIDO'`) e um flag "semana encerrada" (`plano.status === 'CONCLUIDO'`).
- **`WeekClosedBanner`** (componente presentacional, MUI `Alert`/`Collapse`) — exibido na `AthleteHomePage`
  quando o plano corrente está encerrado e tem ≥1 treino perdido. Tom de retenção (positivo, não punitivo):
  "Sua semana foi encerrada — N treino(s) ficaram para trás. A próxima é uma nova chance." Dispensável (X).
- **Integração na `AthleteHomePage`**: consumir `useAthletePlan` (ainda não usado na Home) e renderizar o
  banner condicionalmente, acima do conteúdo. Estados loading/erro/empty tratados (sem banner quando não há
  plano/erro).

## Capabilities

### Modified Capabilities

- `athlete-home`: novo banner contextual de semana encerrada (consumo de dado já existente).

## Impact

**Backend:** nenhum. **APIs:** nenhuma nova (reusa `GET /api/v1/planos/{atletaId}`). **DB:** nenhum.
**Multi-tenancy:** sem impacto (endpoint já é role-scoped ATLETA no backend).

## Critérios de Aceite

**CA1 — Banner aparece com semana encerrada e treinos perdidos:**
- Given: o plano corrente do atleta está `CONCLUIDO` e tem ≥1 `treinosPlanejados` com `statusTreino = PERDIDO`
- When: o atleta abre a Home
- Then: o `WeekClosedBanner` é exibido com a contagem de treinos perdidos

**CA2 — Sem banner quando não há treinos perdidos:**
- Given: o plano corrente não tem nenhum treino `PERDIDO` (ou não está `CONCLUIDO`)
- When: o atleta abre a Home
- Then: o banner não é renderizado

**CA3 — Sem banner sem plano / em erro / carregando:**
- Given: `useAthletePlan` retorna `plano = null`, erro, ou está carregando
- When: a Home renderiza
- Then: o banner não é renderizado (nunca quebra a tela)

**CA4 — Contagem correta:**
- Given: plano `CONCLUIDO` com 3 treinos `PERDIDO` e 2 realizados
- When: o banner é exibido
- Then: a contagem mostra 3

**CA5 — Banner dispensável:**
- Given: o banner está visível
- When: o atleta o fecha (X)
- Then: o banner some (na sessão/render corrente)

## Open Questions & Assumptions

**Premissas:**
- Recência ("semana fechou") é derivada de `plano.status === 'CONCLUIDO'` + ≥1 `PERDIDO`, não de um
  timestamp de "marcado em" (não exposto ao front). A janela natural do endpoint (plano encerrado é o
  corrente até a próxima aprovação) aproxima bem o "recente/contextual" do SPRINTS ("últimas 24h").
- `statusTreino` é object-enum (`{value,label,...}`) — normalizar sempre com `getSafeValue`.
- Sem notificação push (fora do escopo — não há infra de push).
- Tom positivo/retenção, não punitivo. Copy exata a ajustar na implementação.

**Em aberto:**
- Persistir o "dispensado" entre sessões (localStorage) — fora do escopo do XS; por ora dispensa só na
  render corrente. Reavaliar se o banner incomodar em testes.
