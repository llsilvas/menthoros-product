# Tasks: wire-readiness-checkin-to-athlete

> **Refinado contra o código real (init 2026-07-04) — ver `design.md` para o detalhamento completo.**
> Achados que mudam a implementação da proposta original:
> - **Não usar `CheckinProntidaoService.buscarAtual()`** (retorna o check-in **mais recente**, não
>   necessariamente o de hoje). Usar `CheckinProntidaoRepository.findByAtletaIdAndData(atletaId,
>   LocalDate.now(clock), tenantId)` diretamente (D0.1).
> - **Injetar `CheckinProntidaoRepository`, não `CheckinProntidaoService`**, em
>   `AtletaProgressServiceImpl` — o service já injeta `AtletaProgressService` de volta
>   (`resolverAtletaIdAtual()`), então injetar o service criaria dependência circular de bean (D0.2).
> - `readinessScore` da entity é `BigDecimal` 0–1 (`score = round(readinessScore * 100)`);
>   `classificacao` usa `nivelProntidao.name()` direto (PRONTO/CAUTELOSO/DESCANSAR), não
>   recalcular via `classificar()` (D0.3) — confirmado sem risco de contrato (`classificacao` não é
>   consumido hoje pelo frontend).
> - `GET /api/v1/checkins/{atletaId}/atual` **não é self-resolving** (recebe `atletaId` no path) e
>   tem a mesma ambiguidade "mais recente vs. hoje" do D0.1 — frontend resolve `atletaId` via
>   `UsuarioService.getMe()` (mesmo padrão de `useAthletePlan.ts`) e filtra `data === hoje`
>   client-side (D0.5).
> - `QuickCheckInModal` atual: `mood` é 1–5 (não 1–10, precisa expandir a escala), `energyLevel` já
>   é 1–10.

## 0. Backend — GET /me/readiness consome check-in de hoje

- [x] 0.1 `AtletaProgressServiceImpl`: injetar `CheckinProntidaoRepository` (novo field
  `@RequiredArgsConstructor`); em `getReadinessAtual(atletaId)`, chamar
  `checkinProntidaoRepository.findByAtletaIdAndData(atletaId, LocalDate.now(clock), tenantId)`
  antes de calcular o score objetivo. Se existir: `score = round(checkin.getReadinessScore() *
  100)`, `classificacao = checkin.getNivelProntidao().name()`, `nota` = "Baseado no seu check-in
  de hoje." Se não existir: mantém o path objetivo atual.
  - verify: teste unitário — com check-in de hoje, retorna score/classificação dele; com check-in
    de outro dia (não hoje), mantém fallback objetivo (não usa o check-in antigo); sem nenhum
    check-in, mantém fallback objetivo.
- [x] 0.2 Ajustar a nota do path objetivo (sem check-in de hoje) para: "Baseado em TSB de
  prontidão e carga — faça seu check-in de hoje para um sinal mais preciso." (D0.4 — não nega
  mais a existência da feature).
  - verify: nota muda conforme presença/ausência do check-in de hoje (3 cenários do teste 0.1).
- [x] 0.3 `./mvnw clean test` verde; nenhuma mudança de contrato do `ReadinessDto` (apenas
  preenchimento condicional); confirmar que a suíte sobe sem erro de dependência circular de bean.

## 1. Frontend — QuickCheckInModal completo

- [x] 1.1 Expandir `QuickCheckInModal` para os 5 campos do contrato:
  `qualidadeSono` (1–10, novo), `humor` (1–10 — hoje é `mood` 1–5, **expandir a escala**),
  `doresMusculares` (0–10, novo), `nivelEnergia` (1–10 — já existe como `energyLevel`, só renomear),
  `estresse` (0–10, novo). Observações (já existe).
  - verify: `npm run build` (tsc) verde; todos os 5 sliders renderizam com os limites corretos do
    contrato (dores/estresse começam em 0, não 1); teste de componente cobre os 5 campos.
- [x] 1.2 Mapear os campos do form 1:1 para `CheckinProntidaoInputDto` no submit (evita confundir
  `mood`/`humor`, `energyLevel`/`nivelEnergia`).

## 2. Frontend — wiring real do submit

- [ ] 2.1 `useRegistrarCheckin` — hook `{ registrar, loading, error }` chamando `POST
  /api/v1/checkins` via `src/api/services/CheckinService.ts` (arquivo novo — confirmado que não
  existe serviço de checkin no frontend ainda; `registrarCheckin`/`buscarAtual` em um só arquivo).
- [ ] 2.2 `AthleteHomePage.handleCheckInSubmit`: trocar `console.log` por `await
  registrar(data)`; em sucesso, `await fetchReadiness()` (refetch aguardado) antes de fechar o
  modal — evita mostrar score desatualizado por race entre fechar e recarregar (R3).
  - verify: submeter o modal grava via network; card de readiness atualiza no mesmo carregamento,
    sem reload de página.
- [ ] 2.3 Erro no submit: modal permanece aberto, alerta inline com "Tentar novamente" (R5) — nunca
  fecha silenciosamente uma submissão que falhou.

## 3. Frontend — estado "já fez check-in hoje"

- [ ] 3.1 `useCheckinAtual` — resolve `atletaId` via `UsuarioService.getMe()` (D0.5), chama
  `GET /api/v1/checkins/{atletaId}/atual`, e filtra client-side `data === hoje` (não confia
  ingenuamente no "mais recente" do endpoint — mesma ambiguidade do D0.1).
  - verify: teste cobre check-in de hoje (retorna dado), check-in de outro dia (trata como "sem
    check-in hoje"), 204/sem check-in algum.
- [ ] 3.2 Botão da Home mostra "Editado hoje" quando `useCheckinAtual` confirma check-in de hoje;
  modal pré-preenche com os valores desse check-in ao reabrir (D1.3 — edição, não recomeça do
  zero, já que o backend é upsert por data).

## 4. Fechamento

- [ ] 4.1 Nenhum valor fabricado: `classificacao`/`score` do check-in nunca aparecem quando o
  check-in não é de hoje; nota sempre reflete a fonte real (CA5).
- [ ] 4.2 Suíte completa front (`npm run lint && npm run build && npm run test:run`) + backend
  (`./mvnw clean test`) verde.
- [ ] 4.3 Smoke manual: registrar check-in completo (5 campos) como ATLETA de um tenant com plano
  vigente → `GET /me/readiness` reflete `readinessScore`/`nivelProntidao` do check-in; botão da
  Home mostra "Editado hoje" ao reabrir.
- [ ] 4.4 Smoke manual: gerar plano como coach para esse atleta → seção READINESS do prompt
  (verificar via log de debug) usa o sinal subjetivo real, não o fallback objetivo.
