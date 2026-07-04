# Proposal: wire-readiness-checkin-to-athlete

**Tamanho:** S · **Trilha:** Full (backend pequeno + frontend)

## Status

Proposed (2026-07-03). Achado durante auditoria de lacunas do roadmap: `add-daily-readiness-checkin`
(Sprint 9k) foi entregue **backend-only** e o `SPRINTS.md` já registrava explicitamente
"Front (UI de captura/dashboard) fica para change separada — fora do escopo aprovado no DoR", mas
essa change nunca foi criada nem colocada no radar. Sequenciada perto de 9.5/9.6/9.7 por tocar a
mesma `AthleteHomePage` e o mesmo `GET /me/readiness`.

## Why

O motor de elegibilidade de intervalado (`IntervaladoElegibilidadeService`) já tem o 6º portão de
readiness pronto e testado; o prompt do LLM (`PlanoTreinoPromptBuilder`) já injeta a seção
READINESS; o endpoint `POST /api/v1/checkins` já calcula `readinessScore` + `NivelProntidao`
(PRONTO/CAUTELOSO/DESCANSAR). **Nada disso é acionado hoje** porque não existe UI para o atleta
preencher o check-in — o sinal nunca chega ao banco.

Além disso, `GET /api/v1/atletas/me/readiness` (consumido pela `AthleteHomePage` na change 9.5,
em implementação) ainda tem o comentário no código: *"Provisório: enquanto a change
`add-daily-readiness-checkin` não entrega o sinal subjetivo... o score é derivado apenas de
sinais objetivos"* — mas essa change **já foi mergeada**. O endpoint nunca foi atualizado para
consumir o check-in mesmo tendo o dado disponível em `tb_checkin_prontidao`.

**Achado extra (reuso):** já existe um scaffold de UI parcial —
`QuickCheckInModal.tsx` (na Home do atleta, hoje só chama `console.log` no submit) — com sliders
de humor e energia. Falta expandir para os 5 campos do contrato (`qualidadeSono`, `humor`,
`doresMusculares`, `nivelEnergia`, `estresse`) e ligar ao endpoint real.

## What Changes

### Backend (`AtletaProgressServiceImpl.getReadinessAtual`)

- Consultar `CheckinProntidaoRepository.findByAtletaIdAndData(atletaId, hoje, tenantId)`
  diretamente (não `CheckinProntidaoService.buscarAtual()`, que retorna o **mais recente**, não
  necessariamente o de hoje — ver D0.1/D0.2 do `design.md` para o detalhamento e o motivo de
  injetar o repository em vez do service, que criaria dependência circular de bean).
- Se existir check-in de hoje: usar `readinessScore`/`nivelProntidao` já calculados e persistidos
  pelo `CheckinProntidaoServiceImpl` (não recalcular — fonte única de verdade; ver D0.3 para a
  reconciliação de escala/vocabulário com o `ReadinessDto`).
- Se não existir: manter o comportamento atual (score objetivo, TSB/CTL/ATL/RPE), com a nota
  ajustada para refletir que o check-in existe mas não foi preenchido hoje (não mais "a change
  não entrega o sinal").
- Sem migration — reuso total da camada de dados já existente (`CheckinProntidaoRepository`).

### Frontend (`apps/menthoros-front`, `features/athlete`)

- `QuickCheckInModal`: expandir de 2 para 5 campos (`qualidadeSono`, `humor`, `doresMusculares`,
  `nivelEnergia`, `estresse`), todos 1–10 (dores/estresse 0–10 conforme contrato), + observações
  opcional (já existe). Mapear 1:1 para `CheckinProntidaoInputDto`.
- `AthleteHomePage.handleCheckInSubmit`: trocar o `console.log` por chamada real a
  `POST /api/v1/checkins` (cliente curado, novo `useRegistrarCheckin` hook).
- Após submit bem-sucedido: refetch de `useAthleteReadiness` para refletir o novo score
  imediatamente (sem esperar reload da página).
- Estado de "já fez check-in hoje": `GET /api/v1/checkins/{atletaId}/atual` (já existe) informa
  se há check-in do dia — se sim, botão de check-in mostra "Editado hoje" em vez de reabrir do
  zero (o backend já é idempotente por data, mas a UX deve refletir isso).

## Critérios de aceite

Critérios formais em Given/When/Then (vinculantes): `design.md`. Resumo:

- **CA1 — Check-in completo:** `QuickCheckInModal` coleta os 5 campos do contrato do backend,
  não apenas humor/energia.
- **CA2 — Persistência real:** submeter o modal chama `POST /api/v1/checkins` de verdade; deixa
  de ser um `console.log`.
- **CA3 — Readiness reflete o check-in:** quando existe check-in do dia, `GET /me/readiness`
  retorna o `readinessScore`/`nivelProntidao` calculados a partir dele, não apenas o score
  objetivo.
- **CA4 — Sem regressão do score objetivo:** quando não há check-in do dia, o comportamento
  atual (score só objetivo) é preservado — este é o fallback, não é removido.
- **CA5 — Sem dado inventado:** nota do `ReadinessDto` reflete a realidade (check-in existe mas
  não foi preenchido hoje vs. tela nunca fez isso).
- **CA6 — Sem regressão:** `npm run lint && npm run build && npm run test:run` (front) + suíte
  backend verdes.

## Métrica de sucesso

O check-in diário passa a ter uma via de entrada real: submeter pela Home grava em
`tb_checkin_prontidao` e o motor de elegibilidade de intervalado + o prompt do LLM passam a
receber o sinal subjetivo real (não mais dado morto). Proxy demonstrável: registrar check-in
como ATLETA, gerar plano como coach para esse atleta, e ver a seção READINESS do prompt (via log)
refletindo o check-in, não o fallback objetivo.

## Impact

- **Depende de:** `add-daily-readiness-checkin` (Sprint 9k, já em `develop`) — reuso total da
  camada de serviço (`CheckinProntidaoService`, `AtletaProgressService`).
- **Repos:** `apps/menthoros-backend` (ajuste em `AtletaProgressServiceImpl`, sem endpoint novo,
  sem migration) + `apps/menthoros-front` (expandir `QuickCheckInModal`, wiring real).
- **Não bloqueia nem é bloqueada por:** `wire-athlete-shell-to-endpoints` (9.5),
  `wire-athlete-progress-to-endpoints` (9.6), `add-athlete-engagement-signals` (9.7) — arquivos
  frontend parcialmente sobrepostos (`AthleteHomePage`), mas mudanças pontuais e não
  conflitantes. Sugerido sequenciar **depois** da 9.5 (que já toca `AthleteHomePage` para o wiring
  de dado real) para evitar dois PRs concorrentes no mesmo arquivo.
- **Roadmap:** inserida como Sprint 9.8 em `SPRINTS.md`, após 9.7.
