## Why

Hoje o Menthoros decide elegibilidade de intervalado e risco de sobrecarga usando apenas sinais objetivos derivados de carga (TSB, CTL, ramp rate, dias consecutivos). Esses sinais são posteriores — quando disparam, o atleta já está em fadiga acumulada. Sinais subjetivos diários (sono, humor, dores, energia) antecedem a queda de prontidão em 24–48h e são reconhecidos na literatura como preditores de lesão e overtraining mais sensíveis que TSB isoladamente.

Adicionar um check-in diário estruturado transforma prontidão de uma variável inferida em uma variável observada, e permite que o motor determinístico de prescrição module intervalado, volume e intensidade antes do TSB reagir. É pré-requisito natural para `add-coach-attention-queue` (fila operacional) e enriquece o envelope de decisão de `progressao-treinos`.

## What Changes

- **Nova entidade `CheckinProntidao`**: registro diário por atleta com `qualidadeSono`, `humor`, `doresMusculares`, `nivelEnergia`, `estresse`, `observacoes`, `data`, `tenantId`
- **Novo enum `NivelProntidao`**: `PRONTO` / `CAUTELOSO` / `DESCANSAR`
- **Novo serviço `ReadinessService`**: cálculo do score (0–1) a partir dos sinais subjetivos + classificação em NivelProntidao
- **Nova coluna derivada em `MetricasDiarias`**: `readinessScore` e `nivelProntidao` (persistidos para compor análise histórica)
- **Integração com `IntervaladoElegibilidadeService`**: readinessScore vira um dos portões de decisão (bloqueio quando `DESCANSAR`, atenuação quando `CAUTELOSO`)
- **Integração com `PlanoTreinoPromptBuilder`**: readiness do dia entra no contexto enviado ao LLM para gerar o plano semanal
- **Endpoints REST**: `POST /api/v1/checkins`, `GET /api/v1/checkins/{atletaId}?dias=N`, `GET /api/v1/checkins/{atletaId}/atual`
- **Migration Flyway**: tabela `tb_checkin_prontidao` + colunas novas em `tb_metricas_diarias`

## Capabilities

### New Capabilities

- `daily-readiness-checkin`: captura, cálculo e exposição de prontidão subjetiva diária, com integração no motor de elegibilidade de intervalado e no contexto de prescrição.

### Modified Capabilities

<!-- Nenhuma capability existente tem requisitos alterados diretamente — a integração com elegibilidade de intervalado é aditiva aos portões existentes. -->

## Impact

**Entidades e banco:**
- Nova tabela: `tb_checkin_prontidao` (ID, atleta_id, data, sono, humor, dores, energia, estresse, observacoes, readiness_score, nivel_prontidao, tenant_id, created_at, updated_at)
- Colunas adicionadas em `tb_metricas_diarias`: `readiness_score`, `nivel_prontidao`
- Constraint: UNIQUE(atleta_id, data) em `tb_checkin_prontidao`

**APIs:**
- `POST /api/v1/checkins` — registrar checkin do dia
- `GET /api/v1/checkins/{atletaId}/atual` — checkin mais recente (ou nulo)
- `GET /api/v1/checkins/{atletaId}?dias=N` — histórico
- Sem breaking changes em endpoints existentes

**Motor determinístico:**
- `IntervaladoElegibilidadeService` ganha um sexto portão: readiness. `DESCANSAR` bloqueia intervalado; `CAUTELOSO` reduz volume da sessão em 20–30%.
- `PlanoTreinoPromptBuilder` injeta a sequência dos últimos 7 dias de checkin no contexto (array compacto).

**Dependências com outros changes:**
- `add-coach-attention-queue`: **✅ concluída e arquivada** (2026-06-18). É a consumidora natural do sinal — readiness baixo entra como um dos sinais de atenção; a integração dela com este readiness é aditiva e fica fora do escopo desta change (upgrade posterior da queue).
- `progressao-treinos`: **backlog pós-MVP** (não iniciada). A integração do envelope técnico com os subjetivos é futura e **não bloqueante** desta entrega.
- Independente de Strava (família `strava-*` deferida) — pode ser executado em paralelo.

## Success Metric

- **Cobertura de contexto:** readiness presente em **100%** dos planos gerados quando existe checkin do dia do atleta (verificável no contexto montado pelo `PlanoTreinoPromptBuilder`).
- **Adoção do sinal:** ≥ **60%** dos atletas ativos com pelo menos **4 de 7** dias de checkin registrados por semana, medido nas primeiras 4 semanas de uso.
- **Efetividade do portão:** casos `DESCANSAR` bloqueiam intervalado e casos `CAUTELOSO` sinalizam atenuação em **100%** das decisões do `IntervaladoElegibilidadeService` quando há checkin — verificável por contador Micrometer no motor.

North Star do coach: menos fadiga acumulada não detectada → decisões de prescrição antecipadas em 24–48h em relação ao TSB isolado.

## Non-Goals

- Não inclui **UI/frontend** de captura ou dashboard de readiness — esta change é backend-only; a tela do atleta/coach fica em change separada.
- Não inclui **validação de sono/subjetivos via wearables** (Strava, Health Connect, HealthKit) — os sinais são auto-reportados.
- Não inclui **alertas automáticos** (push/e-mail) ao coach por readiness baixo — o consumo pela fila de atenção já cobre a superfície de notificação existente.
- Não inclui **aprendizado/ajuste automático dos pesos** de ponderação — os pesos são configuráveis via `@ConfigurationProperties`, mas fixos nesta entrega.
- Não altera o cálculo de **TSB/CTL/ATL** nem a semântica das métricas de carga existentes.

## Risks & Rollback

**Riscos:**
- **Readiness ausente nos primeiros dias** (sem histórico): mitigado pelo fallback — o motor opera com o comportamento atual e registra `WARN` (task 5.4).
- **Escrita concorrente em `MetricasDiarias`** (readiness vs. atualização de TSB do mesmo dia): usar upsert idempotente por `(atleta, data)` e não introduzir lock cruzado; a persistência de readiness na `MetricasDiarias` é aditiva (colunas novas), sem alterar o fluxo de TsbService.
- **LLM ignorar readiness baixo** no plano: mitigado por instrução obrigatória na seção de readiness do prompt (instruction hardening).

**Rollback:**
- **Reversível sem perda:** feature flag em `ReadinessService`/portão de elegibilidade permite desabilitar a leitura de readiness sem tocar nos dados.
- **Reversão de schema** (se necessário): nova migration com `DROP TABLE IF EXISTS tb_checkin_prontidao;` e `ALTER TABLE tb_metricas_diarias DROP COLUMN IF EXISTS readiness_score, DROP COLUMN IF EXISTS nivel_prontidao;`. Como as migrations originais são apenas `ADD`, não há risco de dado existente ser corrompido no forward.

**Multi-tenancy:**
- `tb_checkin_prontidao` obrigatoriamente com `tenant_id` e filtro em todas as queries.
- Seguir padrão consolidado pela branch de `fix-multi-tenancy-enforcement`.
