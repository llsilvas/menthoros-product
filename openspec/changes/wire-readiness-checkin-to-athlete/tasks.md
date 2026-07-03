# Tasks: wire-readiness-checkin-to-athlete

## 0. Backend — GET /me/readiness consome check-in real

- [ ] 0.1 `AtletaProgressServiceImpl.getReadinessAtual(atletaId)`: antes de calcular score
  objetivo, chamar `CheckinProntidaoService.buscarAtual(atletaId, ...)` para hoje.
  - verify: teste unitário — com check-in do dia, retorna `readinessScore`/`nivelProntidao` dele;
    sem check-in, mantém fallback objetivo atual.
- [ ] 0.2 Ajustar `ReadinessDto.nota` para refletir a realidade: "baseado no check-in de hoje" vs.
  "check-in disponível, mas não preenchido hoje — baseado em sinais objetivos" (não mais o texto
  antigo que nega a existência da feature).
  - verify: nota muda conforme presença/ausência do check-in do dia.
- [ ] 0.3 `./mvnw clean test` verde; nenhuma mudança de contrato do `ReadinessDto` (apenas
  preenchimento condicional).

## 1. Frontend — QuickCheckInModal completo

- [ ] 1.1 Expandir `QuickCheckInModal` para os 5 campos do contrato:
  `qualidadeSono` (1–10), `humor` (1–10, já existe como `mood`), `doresMusculares` (0–10),
  `nivelEnergia` (1–10, já existe como `energyLevel`), `estresse` (0–10). Observações (já existe).
  - verify: `npm run build` (tsc) verde; todos os 5 sliders renderizam com os limites corretos do
    contrato (dores/estresse começam em 0, não 1).
- [ ] 1.2 Renomear/mapear os campos do form para bater 1:1 com `CheckinProntidaoInputDto` no
  adapter de submit (evita confundir `mood`/`humor`, `energyLevel`/`nivelEnergia` no service).

## 2. Frontend — wiring real do submit

- [ ] 2.1 `useRegistrarCheckin` — hook `{ registrar, loading, error }` chamando
  `POST /api/v1/checkins` (cliente curado, padrão dos demais serviços do atleta).
- [ ] 2.2 `AthleteHomePage.handleCheckInSubmit`: trocar `console.log` por `registrar(data)`; em
  sucesso, refetch de `useAthleteReadiness` para atualizar o card sem reload.
  - verify: submeter o modal grava via network; card de readiness atualiza no mesmo carregamento.
- [ ] 2.3 Estados de erro no submit (toast/mensagem), sem crashar o modal.

## 3. Frontend — estado "já fez check-in hoje"

- [ ] 3.1 `GET /api/v1/checkins/{atletaId}/atual` (já existe) — hook `useCheckinAtual` para saber
  se há check-in de hoje.
- [ ] 3.2 Botão da Home mostra "Editado hoje" (ou similar) quando já existe check-in do dia,
  refletindo a idempotência do backend (POST no mesmo dia atualiza, não duplica).

## 4. Fechamento

- [ ] 4.1 Smoke manual: registrar check-in completo (5 campos) como ATLETA → `GET /me/readiness`
  reflete o `readinessScore`/`nivelProntidao` calculado a partir dele.
- [ ] 4.2 Smoke manual: gerar plano como coach para esse atleta → seção READINESS do prompt
  (verificar via log de debug) usa o sinal subjetivo real, não o fallback objetivo.
- [ ] 4.3 Suíte completa front + backend verde.
