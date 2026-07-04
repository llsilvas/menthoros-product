# Spec: athlete-readiness-checkin-wiring

**Mudança vs versão anterior:** o check-in diário de prontidão (Sprint 9k, backend-only) ganha
via de entrada real pelo atleta — a Home passa a coletar os 5 campos do contrato e persistir de
verdade, e `GET /me/readiness` passa a consumir esse check-in quando disponível em vez de sempre
degradar para o score objetivo.

## Requirement: Home coleta o check-in completo

- **WHEN** um `ATLETA` abre o modal de check-in na Home
- **THEN** o sistema coleta os 5 campos do contrato do backend (`qualidadeSono`, `humor`,
  `doresMusculares`, `nivelEnergia`, `estresse`) mais observações opcionais, e submete via
  `POST /api/v1/checkins`.

#### Scenario: Segundo check-in no mesmo dia

- **WHEN** o atleta já registrou um check-in hoje e registra outro
- **THEN** o backend atualiza o check-in existente (idempotente por data), e a UI reflete "já fez
  check-in hoje" antes do segundo envio.

## Requirement: Readiness usa o check-in real quando disponível

- **WHEN** um `ATLETA` chama `GET /api/v1/atletas/me/readiness` e existe um check-in registrado
  para o dia
- **THEN** o sistema retorna o `readinessScore`/`nivelProntidao` calculados a partir do check-in
  (via `CheckinProntidaoService`), não o score apenas objetivo.

#### Scenario: Sem check-in do dia

- **WHEN** o atleta não registrou check-in hoje
- **THEN** o sistema mantém o fallback objetivo atual (TSB/CTL/ATL/RPE), com nota explícita de
  que o check-in está disponível mas não foi preenchido — não nega a existência da feature.

## Status: proposto — aguardando implementação (Sprint 9.8, após 9.7)
