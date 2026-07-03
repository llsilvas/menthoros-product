# Design: wire-athlete-shell-to-endpoints (Home + Plano + Chat)

> **Nota de trilha:** reescopada para **S · Fast track** (frontend-only) após o split do product-review.
> A tela de Progresso e os 4 endpoints `/me/*` foram para `wire-athlete-progress-to-endpoints`.
> Este `design.md` é mantido (mesmo sendo Fast) porque a reconciliação campo-a-campo Home/Plano é
> trabalho de design real — decidir map/derive/defer sem fabricar dado.

## Contexto

As telas Home e Plano do atleta têm UI pronta, mas servem mock. Assim como em
`wire-coach-shell-to-dashboards`, o desafio não é UI nem fetch — é a **lacuna entre os campos que o
mock exibe e os que os DTOs reais fornecem**. Todos os dados necessários já existem em `develop`
(zero endpoint novo nesta change).

## Contrato real dos DTOs (fonte: backend em develop)

```
AtletaHomeDto          { proximoTreino?, metricasChave? }             — GET /me/home (existe)
  proximoTreino         { data, tipoTreino, descricao }
  metricasChave          { ctl, atl, tsb, tss, volumeKm, statusForma }

ReadinessDto           { score?, classificacao, fatores, nota }        — GET /me/readiness (existe)
  fatores                { tsbProntidao, ctl, atl, ultimoRpe }
  // score degrada pra null sem sinais; SEM sub-fatores "recovery/fatigue/sleep" (ver D0.3)

PlanoSemanalOutputDto  { ..., volumePlanejadoKm, volumeRealizadoKm, volumeAlvoKm,
                          treinosPlanejados[], status, objetivoSemanal }  — GET /planos/{id}, filtra APROVADO p/ ATLETA
  treinosPlanejados[]   { dataTreino, tipoTreino, tssPlanejado, duracaoMin (string HH:MM:SS),
                          statusTreino (TreinoExecucaoStatus), descricao, ... }
```

## D0 — Reconciliação sem fabricar dado (regra de ouro, herdada da change do coach)

Nenhum valor inventado chega à tela. Três tratamentos, nesta ordem: **Mapear** (DTO tem o campo) →
**Derivar** (cálculo trivial e exato a partir do DTO) → **Adiar/Remover** (sem fonte → placeholder
honesto ou remover, nunca fabricar).

### D0.3 — `readiness.factors` (recovery/fatigue/sleep): remover, não inventar

`ReadinessDto.fatores` traz `{ tsbProntidao, ctl, atl, ultimoRpe }` — fisiológico bruto, **não** um
breakdown 0–100 de "recuperação/fadiga/sono" como o mock exibe. Converter `atl` em "fadiga = 100−atl"
ou fabricar "sono" violaria a regra de ouro. **Decisão (confirmada pelo founder):** a Home mostra só
`readiness.score` (0–100) + `readiness.nota` (texto do backend); os 3 sub-fatores em barra somem da
UI até uma change futura expandir o `ReadinessDto` com sinais subjetivos reais.

### D0.4 — `completionStatus` por dia: mapear de `statusTreino` (já existe)

`TreinoPlanejadoOutputDto` já traz `statusTreino` (`TreinoExecucaoStatus`:
`PENDENTE`/`REALIZADO`/`PERDIDO`). **Mapear direto** (`REALIZADO`→`completed`, `PENDENTE`→`pending`,
`PERDIDO`→`pending` no design atual; distinguir "perdido" visualmente é decisão de UI, não de dado).

### D0.5 — `MOCK_TSS` (total/target): reenquadrar para volume planejado vs. realizado

Não existe "TSS alvo" persistido no `PlanoSemanalOutputDto` (o alvo é calculado dinamicamente no
prompt do LLM, não exposto). **Decisão (confirmada pelo founder):** usar `volumeRealizadoKm` /
`volumePlanejadoKm` (ambos já no DTO) — "Realizado X km de Y km planejados" substitui "TSS 425 de
480". Barra de progresso 100% real, só muda a unidade; label explícito "Volume da semana".

## D1 — Matriz de reconciliação

### AthleteHomePage

| Campo mock | Tratamento | Origem |
|---|---|---|
| `athleteName` | **Mapear** | `useUserInfo()` (JWT `name`/`preferred_username`, hook já existe, zero fetch) |
| `nextWorkout.title/description` | **Mapear** | `proximoTreino.descricao` |
| `nextWorkout.estimatedDuration` | **Derivar** | parser `duracaoMin` "HH:MM:SS" → minutos (helper compartilhado com o Plano) |
| `metrics[]` (TSS/CTL/TSB/ATL) | **Mapear** | `metricasChave.{tss,ctl,tsb,atl}` |
| `readiness.score` | **Mapear** | `ReadinessDto.score` (+ `nota`) |
| `readiness.factors.*` | **Remover** | D0.3 — sem fonte granular, não inventar |
| `timeOfDay`, `motivationalMessage` | **Remover** | copy estático sem valor de dado; decoração de UI, não fetch |
| Estado vazio (`proximoTreino`/`metricasChave` nulos) | **Mapear** | ambos `?` (nullable) no DTO — UI trata ausência |

### AthletePlanPage

| Campo mock | Tratamento | Origem |
|---|---|---|
| dia + treino da semana | **Mapear** | `treinosPlanejados[]` (item por dia; dia sem item = descanso) |
| `workout.type` | **Mapear (adapter)** | `tipoTreino` enum → `WorkoutType` UI (reusar/espelhar `workoutType.ts` do coach) |
| `workout.description` | **Mapear** | `descricao` |
| `workout.estimatedTSS` | **Mapear** | `tssPlanejado` |
| `workout.durationMinutes` | **Derivar** | parser `duracaoMin` "HH:MM:SS" → minutos |
| `completionStatus` | **Mapear** | `statusTreino` (D0.4) |
| `weekLabel` (fase) | **Mapear** | `objetivoSemanal` (texto do backend, não fabricar "fase BUILD") |
| `MOCK_TSS` (total/target) | **Mapear (reenquadrado)** | `volumeRealizadoKm`/`volumePlanejadoKm` (D0.5) |
| Estado vazio (sem plano `APROVADO`) | **Mapear** | endpoint retorna null/404 quando não há plano aprovado — CA2 |

### AthleteCoachPage

| Campo mock | Tratamento | Origem |
|---|---|---|
| Tela inteira (`mockCoach`, `MOCK_MESSAGES`) | **Adiar (placeholder honesto)** | sem endpoint de mensageria — `add-athlete-coach-messaging` (Sprint 25). "Mensagens chegam em breve", sem simular conversa (CA3) |

## D2 — Padrão de hook, serviço, adapters (idêntico ao coach, sem React Query)

- **Hooks** em `src/features/athlete/hooks/`: `useState(data/loading/error)` + `useCallback(fetchXxx)`,
  retorno `{ data, loading, error, fetchXxx }`. Sem `@tanstack/react-query` (proibido no `CLAUDE.md`).
- **`src/api/services/AthleteShellService.ts`** (cliente curado à mão, padrão `CoachDashboardService`):
  `getHome()`, `getReadiness()`, `getPlanoSemanal(atletaId)` via `__request(OpenAPI, {...})`. **Não
  rodar `generate:api`** (destrutivo contra o cliente curado — R1).
- **`src/types/AthleteShell.ts`** — tipos de domínio (`AthleteHome`, `AthleteReadiness`, `AthletePlan`).
- **Adapters** em `src/features/athlete/adapters/`: `homeAdapter.ts`, `planAdapter.ts` — funções puras
  `buildXxxFromDto()`, testáveis. Parser `duracaoMin` num helper compartilhado (não duplicar), com
  teste (formato válido, "00:MM:SS", malformado — R5).
- **Enum `tipoTreino` → `WorkoutType`:** reusar tabela do coach (`workoutType.ts`) se compartilhável,
  ou espelhar 1:1 — não recriar do zero; tipo desconhecido cai num default seguro.

## Riscos e mitigações (pré-mortem)

> "A change foi entregue e deu errado. Por quê?"

- **R1 — `generate:api` quebra o cliente curado.** *Mitigação:* cliente curado à mão, não rodar o
  gerador nesta change (mesma decisão da change do coach). Como não há endpoint novo, o risco é ainda
  menor aqui — os métodos consomem rotas já existentes.
- **R2 — Placeholder "em breve" no chat parece produto quebrado.** *Mitigação:* placeholder explícito
  e datado pela change-fonte (`add-athlete-coach-messaging`), nunca card em branco (CA3).
- **R3 — Reenquadrar TSS→volume (D0.5) confunde quem viu "TSS 425/480" na demo.** *Mitigação:* label
  explícito "Volume da semana"; founder ciente (confirmado). É mudança de unidade honesta, não bug.
- **R4 — Remover sub-fatores de readiness (D0.3) empobrece a Home vs. mock.** *Mitigação:* founder
  confirmou preferir dado real; repor sub-fatores é change futura que expande `ReadinessDto`, não
  fabricação aqui.
- **R5 — Parser `duracaoMin` "HH:MM:SS" frágil.** *Mitigação:* teste unitário cobrindo `"00:MM:SS"`,
  `"HH:MM:SS"` e malformado (fallback seguro, não `NaN` na UI).
- **R6 — Mock removido mas fetch falha → tela morta.** *Mitigação:* estados error/empty obrigatórios
  (CA4) com retry.
- **RP1 — Atleta em onboarding (sem plano/sem dado) lê como "produto quebrado".** *Mitigação:*
  estados vazios informativos por contexto ("seu coach ainda não aprovou o plano"), nunca `-` genérico.

## Fora de escopo

Tela de Progresso e os 4 endpoints `/me/*` (`wire-athlete-progress-to-endpoints`); chat real
(`add-athlete-coach-messaging`, Sprint 25); `AthleteProfilePage` (já placeholder honesto); plugar o
botão da Home ao check-in diário da 9k; qualquer mudança de backend (zero nesta change).
