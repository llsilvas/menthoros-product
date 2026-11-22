**Tamanho:** S · **Trilha:** Fast

> **Ticket 4** do épico `add-season-plan-macrocycle`. Decisão Q9 do épico: atleta em calibração espera a
> graduação.

## Status

- ready-for-agent (2026-11-15): bloqueado por `add-season-plan-generate-tracer` (ticket 2).

## Why

Atleta em calibração não tem CTL confiável; um `tssAlvo` sobre esse número repetiria o problema que o
regime de cold-start (ADR-0012) existe para evitar. A temporada só nasce quando o atleta gradua.

## What Changes

Tasks do épico: **2.6 (caso de calibração, substituído por recusa), 2.10 (teste de calibração), 7.7
(estado de calibração)**. Substitui "marcar como estimado em calibração".

- **Definição de "em calibração"** (refinada no DoR de 2026-11-21): `AthleteBaselineState.calibracaoIniciadaEm
  != null` — a mesma regra de `OnboardingServiceImpl.obterStatusCalibracao` (`:334`). Não existe estado
  "graduado" no código; graduar é a ausência do status. **Elegível** = sem linha em
  `tb_athlete_baseline_state` ou com `calibracaoIniciadaEm` nula (tier A na entrada, legado, atleta que
  nunca passou pelo onboarding). Os estágios são OBSERVATION (semana 1), CALIBRATION (semana 2) e
  STABILIZATION (semana 3 em diante, **sem teto** — o atleta preso depois da semana 4 continua em
  STABILIZATION, `CalibrationServiceImpl.java:54`)
- **O gate só vale com a avaliação de calibração ativa** (`planner-engine.shadow`;
  confirmado pelo founder em 2026-11-21; refinado na implementação em 2026-11-22: o skeleton que dispara a
  avaliação vem só do shadow, `PlannerShadowService.java:125` — `enabled` sozinho não gradua). A graduação
  só é avaliada na geração semanal com skeleton do shadow (`PlanGenerationPersister.java:202-205`); com o
  shadow em `false` (default) ninguém gradua,
  e um gate incondicional bloquearia a temporada para sempre. Com o planner desligado, a geração segue
  como hoje
- O gate lê `calibracaoIniciadaEm` pelo `AthleteBaselineStateRepository`, já injetado no
  `SeasonPlanServiceImpl`; não chama `OnboardingService` (evita a validação de posse e a dependência
  entre serviços)
- **Geração** recusada com 422 e o motivo enquanto o atleta estiver em calibração. O gate vem **antes** do
  retorno idempotente da proposta existente: atleta em calibração recebe 422 mesmo que já haja proposta
- **Aprovação** recusada com 422 pelo mesmo gate: uma proposta gerada antes de a calibração começar (via
  PMC, sem linha de baseline) não vira `ACTIVE` enquanto o atleta calibra
- Na aba, "Gerar temporada" desabilitada com o motivo e a semana de calibração. A aba consulta o
  endpoint existente `GET /api/v1/atletas/{atletaId}/calibracao` (já aceita TECNICO/ADMIN; 204 =
  habilitado) pelo atleta selecionado — não pelo `useCalibracao`, que resolve o atleta autenticado
- Sem mudança de contrato além da descrição do 422 em `POST /season-plans` e `POST /season-plans/{id}/approve`

## Critérios de aceite

Pré-condição comum aos cenários da aba: atleta com prova-alvo e sem temporada (único estado em que
"Gerar temporada" aparece, `SeasonTabPanel.tsx:79`).

- **Dado** um atleta em calibração (OBSERVATION, CALIBRATION ou STABILIZATION, inclusive semana 5+),
  **quando** o treinador gera, **então** recebe 422 com o motivo e nenhuma linha é gravada em
  `tb_plano_treino` nem em `tb_season_week`.
- **Dado** um atleta em calibração com proposta já existente, **quando** o treinador gera, **então** recebe
  422 (não o 200 idempotente).
- **Dado** um atleta em calibração com proposta já existente, **quando** o treinador aprova, **então** recebe
  422 e a proposta continua `PROPOSED`.
- **Dado** um atleta sem linha de baseline, ou com `calibracaoIniciadaEm` nula, **quando** o treinador gera,
  **então** a geração segue o fluxo atual.
- **Dado** um atleta em calibração e `planner-engine.shadow` em `false`,
  **quando** o treinador gera, **então** a geração segue o fluxo atual.
- **Dado** um atleta em calibração, **quando** o treinador abre a aba, **então** a ação "Gerar temporada"
  está desabilitada e o motivo é visível, com a semana de calibração.
- **Dado** um atleta fora de calibração (204), **quando** o treinador abre a aba, **então** a ação está
  habilitada.
- **Dado** que a consulta de calibração falha, **quando** o treinador abre a aba, **então** a ação fica
  habilitada (o backend é a fonte de verdade e devolve 422 se for o caso).

## Métrica de sucesso

Zero temporadas `PROPOSED` ou `ACTIVE` para atleta com `calibracaoIniciadaEm` não nula — conferível por
consulta em `tb_plano_treino` × `tb_athlete_baseline_state` no tenant do Design Partner.

## Non-goals

- Saída manual da calibração pelo treinador (override) para o atleta preso — Q9 manda esperar a graduação;
  o atleta preso já dispara `AtletaPresoEmCalibracaoEvent`
- Mudar quando a graduação acontece: ela é avaliada na geração do plano semanal
  (`PlanGenerationPersister.java:204`); abrir a aba ou tentar gerar a temporada não gradua ninguém
- Arquivar propostas existentes de atletas em calibração — ficam `PROPOSED` e bloqueadas na aprovação

## Riscos e rollback

- **Corrida entre o gate e o início da calibração:** a calibração só começa no primeiro cálculo de baseline
  do atleta (`OnboardingServiceImpl.java:523`), e a geração exige baseline ou PMC. A janela é estreita e o
  gate da aprovação cobre o resultado; risco aceito, sem lock adicional.
- **Front e backend podem divergir com o planner desligado:** o front não conhece os flags do planner e
  desabilita a ação sempre que o status de calibração responde 200, enquanto o backend, com o planner
  desligado, aceitaria a geração. Limitação aceita: desabilitar é o lado conservador, e o atleta preso
  nesse estado é o mesmo que já não gradua.
- Rollback: revert do PR. Sem migration.

## Open Questions & Assumptions

- O texto do motivo fica a cargo do ticket; não há decisão de produto pendente.
- **Confirmado pelo founder no DoR (2026-11-21):** o gate vale também na aprovação, e o atleta preso
  fica bloqueado sem override.

## Bloqueado por

- `add-season-plan-generate-tracer` (ticket 2).
