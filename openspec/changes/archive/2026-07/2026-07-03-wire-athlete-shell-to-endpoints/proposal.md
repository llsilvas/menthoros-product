# Proposal: wire-athlete-shell-to-endpoints

**Tamanho:** S · **Trilha:** Fast (frontend-only, um repo, sem contrato de API novo)

## Status

Proposed (aprovado pelo founder em sessão 2026-07-03 — priorizado sobre `add-llm-tool-use`/RAG
para fechar o loop coach→atleta antes da demo). **Reescopada 2026-07-03** após product-review
(Refine): a tela de **Progresso** foi separada para a change `wire-athlete-progress-to-endpoints`
(justificativa distinta — engajamento do atleta, não fechamento do loop; e onde vivem os 4 endpoints
novos). Esta change fica com **Home + Plano + Chat-placeholder** — a parte demo-crítica que fecha o
loop coach→atleta e **não precisa de nenhum endpoint novo**.

## Why

O coach hoje aprova plano, registra dado do atleta e vê o roster real — mas as telas centrais do
atleta rodam em mock: `AthleteHomePage` (`MOCK_TODAY`), `AthletePlanPage` (`buildMockWeek`/`MOCK_TSS`),
`AthleteCoachPage`/`CoachChatPanel` (`MOCK_MESSAGES`/`mockCoach`).

Isso quebra o critério 4 do North Star ("o que chega ao atleta depois que o coach aprova") e o passo
4/5 do momento de valor do coach (`personas.md`): o coach aprova e edita um plano, mas **o atleta
nunca vê o resultado real** — e a demo para a assessoria (buyer) abre o app do atleta exatamente
neste ponto (confirmado com o founder, 2026-07-03). Sem isto, não há prova visível de que o loop
coach→atleta fecha.

Custo baixo e **zero backend**: os dados já existem em `develop` — `GET /me/home` e `GET /me/readiness`
(role ATLETA, de `add-athlete-progress-endpoints`) e `GET /api/v1/planos/{atletaId}`
(`PlanoTreinoController.buscarPlanoSemanal`, já filtra `APROVADO` para ATLETA). Falta só o wiring de
frontend — mesmo padrão já aplicado no coach em `wire-coach-shell-to-dashboards`.

## What Changes

### Backend

Nenhuma mudança. Todos os endpoints consumidos já existem em `develop`.

### Frontend (`apps/menthoros-front`, `features/athlete`)

- Cliente curado `AthleteShellService.ts` (padrão `CoachDashboardService`) com `getHome()`,
  `getReadiness()`, `getPlanoSemanal(atletaId)` — todos contra endpoints já existentes; + hooks
  `useAthleteHome`, `useAthleteReadiness`, `useAthletePlan` (formato `{ data, loading, error, refetch }`,
  sem React Query).
- `AthleteHomePage`: troca `MOCK_TODAY` por `GET /me/home` + `GET /me/readiness`; `athleteName` via
  `useUserInfo()` (hook JWT já existe, zero fetch). `readiness.factors` (recovery/fatigue/sleep) some
  da UI — sem fonte granular no DTO real (D0.3); mostra só o `score` + `nota`. Botão "Iniciar treino"
  e check-in seguem como estão (plugar o botão ao check-in diário — já entregue na 9k — é acréscimo
  de escopo, não incluído aqui).
- `AthletePlanPage`: troca `buildMockWeek` pelo plano semanal real (`GET /api/v1/planos/{atletaId}`,
  já filtra `APROVADO` para ATLETA); `completionStatus` por dia mapeado de `statusTreino`
  (`TreinoExecucaoStatus`, já no DTO — D0.4); "TSS total/meta" reenquadrado para "volume
  realizado/planejado" (`volumeRealizadoKm`/`volumePlanejadoKm`, já no DTO — D0.5); estado vazio
  explícito quando não há plano aprovado (ainda não chegou do coach).
- `AthleteCoachPage`: mock do chat vira placeholder "Mensagens chegam em breve"
  (change-fonte: `add-athlete-coach-messaging`, Sprint 25), sem simular conversa fake.
- `AthleteProfilePage`: sem mudança (já é placeholder honesto).

### Decisões de reconciliação (ver `design.md`)

- **D0.3** — `readiness.factors` (recovery/fatigue/sleep) não têm fonte granular no `ReadinessDto`
  real → removidos da UI, não fabricados. Home mostra só `score` + `nota`.
- **D0.4** — `completionStatus` por dia vem de `statusTreino` (`TreinoExecucaoStatus`), já no DTO.
- **D0.5** — "TSS total/meta" (sem alvo persistido no backend) → reenquadrado para volume
  planejado/realizado, ambos já no `PlanoSemanalOutputDto`.

## Critérios de aceite

- **CA1 — Home real:** atleta autenticado abre `/athlete/home` e vê seu treino de hoje + métricas
  reais de `GET /me/home` + `GET /me/readiness`, zero `MOCK_TODAY`.
- **CA2 — Plano real:** `/athlete/plan` mostra o plano semanal **aprovado** real do atleta (ou
  estado vazio "seu coach ainda não aprovou o plano desta semana" quando não houver), zero
  `buildMockWeek`/`MOCK_TSS`.
- **CA3 — Chat honesto:** `/athlete/coach` não simula mensagens fake; mostra placeholder claro
  "em breve" linkado à change-fonte.
- **CA4 — Estados explícitos** (loading/error/empty) nas 2 telas de dado, mesmo padrão do
  `wire-coach-shell-to-dashboards`.
- **CA5 — Sem dado inventado:** nenhum widget mostra número fabricado quando o backend não tem
  fonte (readiness sub-fatores removidos, não estimados; volume real em vez de TSS-alvo inexistente).
- **CA6 — Sem regressão:** `npm run lint && npm run build && npm run test:run` verde.

## Métrica de sucesso

Zero referências a `MOCK_TODAY`/`buildMockWeek`/`MOCK_TSS`/`MOCK_MESSAGES`/`mockCoach` no bundle das
telas Home/Plano/Chat do atleta. Proxy demonstrável: logar como ATLETA de um tenant com plano
aprovado e ver o plano da Home/Plano bater com o que o coach aprovou no perfil dele
(`athlete-profile-drilldown`). Sinal de negócio real: o loop coach→atleta fica demonstrável na demo
para a assessoria (validação do founder na próxima demo — sem métrica instrumentada, aceitável para
change de wiring).

## Revisão de produto (coach lens) — veredito: Refine → resolvido

`product-reviewer` (2026-07-03). Pontos fortes confirmados: coach-in-the-loop bem preservado (plano
só `APROVADO` chega ao atleta; chat vira placeholder honesto em vez de IA crua ao atleta; D0.3/D0.5
escolhem dado real sobre fabricado); zero LLM (economia unitária intacta). Refinos aplicados:

1. **Escopo dividido** — a parte de justificativa mais fraca (Progresso: histórico do atleta,
   engajamento) foi separada para `wire-athlete-progress-to-endpoints`. Esta change fica só com o
   núcleo forte (Home+Plano fecham o loop coach→atleta, critério 4 do North Star). Decisão do founder
   (2026-07-03).
2. **Demo abre o app do atleta** (confirmado pelo founder) → Home+Plano é bloqueador real do próximo
   pitch, prioridade sobre `add-llm-tool-use` justificada.
3. **Paridade table-stakes, não diferenciação** — reconhecido: fechar este gap não é o que vence a
   concorrência (isso é `add-llm-tool-use`, critérios 2/3), mas é pré-requisito da demo.

## Impact

- **Depende de:** `add-athlete-progress-endpoints` (`/me/home`, `/me/readiness`),
  `coach-plan-review-workflow` (`/planos/{id}` filtra APROVADO) — ambas já em `develop`.
- **Repos:** `apps/menthoros-front` apenas. Zero backend, zero migration.
- **Não bloqueia nem é bloqueada por:** `wire-athlete-progress-to-endpoints` (change irmã, Progresso
  — arquivos de frontend disjuntos: esta toca Home/Plan/Coach, a outra toca Progress). Podem ir em
  paralelo; esta tem prioridade (demo-crítica).
- **Reordenação de roadmap:** inserida antes do Sprint 10-11 (`add-llm-tool-use`) em `SPRINTS.md`,
  como intercalação de feature visível (mesmo padrão de `6b`, `9b`).

## Open Questions & Assumptions

- ✅ **Demo abre o app do atleta** (Q1, founder 2026-07-03) — Home+Plano é bloqueador real.
- ✅ **Progresso separado** (Q2, founder 2026-07-03) — ver `wire-athlete-progress-to-endpoints`.
- ✅ **D0.3/D0.5 confirmados** (Q4, founder 2026-07-03) — dado real/honesto, sem fabricar; founder
  ciente de que muda visualmente vs. demos anteriores.
- Assume-se que `TreinoExecucaoStatus.PERDIDO` é tratado como "pending" (não completado) na UI de
  `completionStatus` — sem terceiro estado visual "perdido" no design atual. Distinguir "perdido" de
  "ainda não fez" é decisão de UI adicional na implementação (não muda o dado).
- Sinal de sucesso (Q3): sem métrica instrumentada; proxy = números batem com o perfil do coach +
  validação do founder na demo. Aceitável para change de wiring, registrado explicitamente.
