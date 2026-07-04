# Design: wire-readiness-checkin-to-athlete

## Contexto

`add-daily-readiness-checkin` (Sprint 9k) entregou o motor de check-in (`CheckinProntidaoService`,
`POST /api/v1/checkins`, `readinessScore`/`nivelProntidao` persistidos) mas ficou backend-only.
`GET /me/readiness` (`AtletaProgressServiceImpl.getReadinessAtual`) e o `QuickCheckInModal.tsx`
nunca foram ligados a esse dado. Esta change fecha o loop.

## Achados da verificação contra o código real (init 2026-07-04)

### D0.1 — `buscarAtual()` retorna o mais recente, não o de hoje — NÃO reusar

`CheckinProntidaoServiceImpl.buscarAtual` (linha 99-106) chama
`checkinProntidaoRepository.findTopByAtletaIdOrderByDataDesc(...)` — **o check-in mais recente**,
não necessariamente de hoje. Se o atleta fez check-in ontem e não fez hoje, esse método retornaria
o de ontem, fazendo `GET /me/readiness` mostrar prontidão desatualizada como se fosse a de hoje.

**Decisão:** não usar `buscarAtual()`. `CheckinProntidaoRepository` já expõe
`findByAtletaIdAndData(atletaId, data, tenantId)` (query exata por data) — usar esse método
diretamente, filtrando por `LocalDate.now(clock)` (mesmo `Clock` injetado já usado por
`getHome()`, para consistência de teste determinístico).

### D0.2 — Dependência circular: NÃO injetar `CheckinProntidaoService` em `AtletaProgressServiceImpl`

`CheckinProntidaoServiceImpl` já injeta `AtletaProgressService` (usa só
`resolverAtletaIdAtual()`, linha 137). Se `AtletaProgressServiceImpl` passasse a injetar
`CheckinProntidaoService`, criaria um ciclo de bean (`AtletaProgressServiceImpl` →
`CheckinProntidaoService` → `AtletaProgressService`), que o Spring rejeita na inicialização
(`BeanCurrentlyInCreationException`).

**Decisão:** `AtletaProgressServiceImpl` injeta `CheckinProntidaoRepository` diretamente (não o
service) — mesmo padrão já usado pela classe para as demais fontes de dado
(`TreinoRealizadoRepository`, `PlanoMetadadosRepository`, etc.), sem introduzir ciclo. Lê os
campos `readinessScore`/`nivelProntidao` direto da entity `CheckinProntidao` — não precisa do
mapper/DTO de saída do checkin para este uso interno.

### D0.3 — Reconciliação de escala e vocabulário (`ReadinessDto` não muda de contrato)

| Campo | Path objetivo (hoje) | Path check-in (novo) |
|---|---|---|
| `score` (Integer 0–100) | `round(60 + 1.5·tsbProntidao)` | `round(readinessScore · 100)` — `readinessScore` da entity é `BigDecimal` 0–1 |
| `classificacao` (String) | `classificar(score)` → OTIMO/BOM/MODERADO/BAIXO | `nivelProntidao.name()` → PRONTO/CAUTELOSO/DESCANSAR — **não recalcular via `classificar()`** (a proposta já manda usar o valor persistido como fonte única de verdade; recalcular arriscaria divergir do motor de elegibilidade que já usa `nivelProntidao`) |
| `nota` | "Provisório: sem check-in subjetivo..." | "Baseado no seu check-in de hoje." |

**Confirmado sem risco de contrato:** `classificacao` é tipado como `string` solto no frontend
(`src/types/AthleteHome.ts:35`) e **não é consumido** por nenhum componente hoje (`ReadinessCard`
só recebe `score`/`recommendation`, ver `AthleteHomePage.tsx`) — o vocabulário diferente
(4 valores objetivos vs. 3 valores do check-in) não quebra nada existente.

### D0.4 — Nota quando check-in existe mas não é de hoje

Fora do escopo mudar o comportamento objetivo — quando não há check-in de hoje, mantém o cálculo
atual, mas a nota deixa de negar a existência da feature. Novo texto:
"Baseado em TSB de prontidão e carga — faça seu check-in de hoje para um sinal mais preciso."
(troca "sem check-in subjetivo" por um convite a fazer, já que a feature existe).

## D1 — Fluxo do `QuickCheckInModal` (frontend)

1. **Abrir:** `AthleteHomePage` já busca `useCheckinAtual` (novo hook, `GET
   /api/v1/checkins/{atletaId}/atual`) no mount, junto com `useAthleteHome`/`useAthleteReadiness`.
2. **Botão de abertura:** label muda conforme `checkinAtual` ser de hoje ou não —
   "Check-in do dia" (sem check-in ainda) vs. "Editado hoje" (já existe, reabre pré-preenchido).
3. **Campos:** 5 sliders — `qualidadeSono` (1–10), `humor` (1–10), `doresMusculares` (0–10),
   `nivelEnergia` (1–10), `estresse` (0–10) — mais `observacoes` (textarea opcional, já existe).
   Pré-preenche com `checkinAtual` quando já existe check-in de hoje (edição, não recomeça do zero
   — o backend já é upsert por data).
4. **Submit:** `useRegistrarCheckin().registrar(dto)` → `POST /api/v1/checkins`. Em sucesso:
   fecha o modal, dispara `fetchReadiness()` (refetch, aguardado antes de fechar — evita mostrar
   score desatualizado por uma race entre o fechamento do modal e o refetch).
5. **Erro no submit:** modal permanece aberto, `Alert` inline dentro do modal com a mensagem de
   erro + botão "Tentar novamente" (reenvia o mesmo payload) — nunca fecha silenciosamente uma
   submissão que falhou.

## Critérios de aceite (Given/When/Then, vinculante — substitui a lista em prosa da proposal.md)

- **CA1 — Modal completo:** GIVEN o atleta abre o `QuickCheckInModal` WHEN o modal renderiza THEN
  aparecem os 5 sliders (`qualidadeSono`/`humor`/`doresMusculares`/`nivelEnergia`/`estresse`, com
  os ranges corretos do contrato) mais observações opcional.
- **CA2 — Persistência real:** GIVEN o atleta preenche os 5 campos e confirma WHEN submete THEN o
  frontend chama `POST /api/v1/checkins` de verdade (network real, não mais `console.log`).
- **CA3 — Readiness reflete o check-in de hoje:** GIVEN existe um `CheckinProntidao` com
  `data == hoje` para o atleta WHEN `GET /me/readiness` é chamado THEN retorna o `score`
  (`readinessScore · 100`, arredondado) e `classificacao` (`nivelProntidao.name()`) desse
  check-in, com `nota` indicando que é baseado no check-in do dia.
- **CA4 — Fallback objetivo preservado:** GIVEN não existe `CheckinProntidao` com `data == hoje`
  (nunca fez, ou fez em outro dia) WHEN `GET /me/readiness` é chamado THEN o comportamento atual
  (score só objetivo, TSB/CTL/ATL/RPE) é preservado — este continua sendo o fallback, não é
  removido; a `nota` deixa de negar a existência do check-in (D0.4).
- **CA5 — Sem dado inventado:** GIVEN qualquer um dos dois paths WHEN a nota é montada THEN
  reflete exatamente qual fonte gerou o score — nunca mistura os dois nem inventa texto genérico.
- **CA6 — Sem regressão:** `npm run lint && npm run build && npm run test:run` (front) + suíte
  backend verdes; `ReadinessDto` mantém a mesma estrutura de campos (sem breaking change de API).

## Non-goals (fora de escopo desta change)

- Histórico de check-ins na Home (só o check-in do dia é considerado; histórico completo já existe
  via `buscarHistorico`, consumido em outro lugar/change).
- Edição retroativa de check-in de dias anteriores (upsert é só para a data de hoje, conforme
  contrato já existente de `POST /api/v1/checkins`).
- Notificação/lembrete para o atleta fazer check-in (push/e-mail — fora do escopo, não é
  coach-in-the-loop).
- Mudar o algoritmo de cálculo de `readinessScore`/`nivelProntidao` (já existe em
  `CheckinProntidaoServiceImpl`/`ReadinessService` — esta change só consome).
- Mudar o motor de elegibilidade de intervalado ou o prompt do LLM — já consomem o check-in via
  `IntervaladoElegibilidadeService`/`PlanoTreinoPromptBuilder`, sem alteração necessária aqui.

## Riscos e mitigações (pré-mortem)

- **R1 — Dependência circular de bean** (achado do init, D0.2). *Mitigação:* injetar
  `CheckinProntidaoRepository`, não `CheckinProntidaoService`, em `AtletaProgressServiceImpl`.
- **R2 — `buscarAtual()` retornaria check-in desatualizado como se fosse de hoje** (achado do
  init, D0.1). *Mitigação:* usar `findByAtletaIdAndData(atletaId, LocalDate.now(clock), tenantId)`
  — filtro exato por data, sem ambiguidade.
- **R3 — Race entre fechar o modal e o refetch de readiness.** *Mitigação:* `await` o refetch
  antes de fechar o modal (D1.4) — usuário vê o spinner do botão de submit até o dado novo chegar.
- **R4 — Contrato incompatível durante a transição** (frontend manda 2 campos, backend valida 5).
  *Mitigação:* tasks 1.1/1.2 primeiro (expandir modal + mapear campos), só depois 2.x (wiring do
  submit) — nunca há um commit intermediário que envia payload parcial para o endpoint real.
- **R5 — Falha silenciosa no submit.** *Mitigação:* D1.5 — erro mantém o modal aberto com alerta
  inline, nunca fecha como se tivesse sucedido.

## Rollback

Aditivo e sem migration — reverter é direto:
- Backend: reverter o commit de `AtletaProgressServiceImpl.getReadinessAtual` (volta a ignorar o
  check-in, só o path objetivo).
- Frontend: reverter os commits do `QuickCheckInModal`/`AthleteHomePage` (volta a 2 campos +
  `console.log`). Nenhum dado é perdido — o `POST /api/v1/checkins` e a tabela
  `tb_checkin_prontidao` já existiam antes desta change.

## Métrica de sucesso

Proxy de validação imediata: registrar check-in completo (5 campos) como ATLETA de um tenant com
plano vigente → `GET /me/readiness` reflete o `readinessScore`/`nivelProntidao` do check-in →
gerar plano como coach para esse atleta → seção READINESS do prompt (log de debug) usa o sinal
subjetivo real, não o fallback objetivo.

Métrica de produto (exploratória, pós-deploy, não é gate de aceite): % de atletas ativos que
completam ao menos 1 check-in via Home em 7 dias corridos — sem baseline ainda (era 0% antes desta
change, já que a via de entrada não existia).
