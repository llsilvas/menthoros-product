## ADDED Requirements

### Requirement: Inbox de sugestões do coach

O sistema SHALL persistir sugestões de IA como `SugestaoCoach` (`tipo`, `confidence`, `status`,
`summary`, `reasoning`, `atletaId`, `createdAt`, `reviewedAt`) e SHALL expor
`GET /api/v1/coach/sugestoes?status=` e `GET /api/v1/coach/sugestoes/{id}` (restrito a `TECNICO`/
`ADMIN`, tenant-aware, somente-leitura). A leitura NÃO SHALL disparar geração por IA.

#### Scenario: Listagem filtrada por status
- **WHEN** um `TECNICO` chama `GET /api/v1/coach/sugestoes?status=pending`
- **THEN** o sistema retorna apenas as sugestões `pending` do seu tenant

#### Scenario: Detalhe com rationale
- **WHEN** o coach abre `GET /api/v1/coach/sugestoes/{id}` de uma sugestão do seu tenant
- **THEN** o sistema retorna `200 OK` com `summary` e `reasoning`

#### Scenario: Sugestão de outro tenant
- **WHEN** o `{id}` pertence a outro tenant
- **THEN** o sistema retorna `404 Not Found`

#### Scenario: Leitura não dispara IA
- **WHEN** qualquer `GET` do inbox é chamado
- **THEN** nenhuma geração de sugestão por IA é iniciada

---

### Requirement: Geração de sugestões a partir de gatilhos

O sistema SHALL gerar `SugestaoCoach` com `status=pending` a partir de sinais elegíveis da
`add-coach-attention-queue`, de forma assíncrona, preenchendo `reasoning` via
`add-recommendation-explainability`. A geração SHALL manter no máximo uma sugestão `pending` por
`(atletaId, tipo)` ativo.

#### Scenario: Sinal vira sugestão pendente
- **WHEN** um sinal elegível é detectado para um atleta sem `pending` do mesmo tipo
- **THEN** o sistema cria uma `SugestaoCoach` `pending` com `tipo`, `confidence`, `summary` e
  `reasoning`

#### Scenario: Geração idempotente
- **WHEN** o mesmo sinal é reprocessado e já existe `pending` para `(atletaId, tipo)`
- **THEN** o sistema não cria uma sugestão duplicada

---

### Requirement: Aprovação e rejeição de sugestão

O sistema SHALL expor `POST /api/v1/coach/sugestoes/{id}/aprovar` e
`POST /api/v1/coach/sugestoes/{id}/rejeitar` (restrito a `TECNICO`/`ADMIN`, tenant-aware). Aprovar
SHALL transicionar `pending → approved` e disparar o efeito conforme o `tipo`; rejeitar SHALL
transicionar `pending → rejected` sem efeito de plano. Ambas SHALL ser idempotentes no estado-alvo e
SHALL rejeitar transições ilegais.

#### Scenario: Aprovar dispara o efeito do tipo
- **WHEN** o coach aprova uma sugestão `pending` do tipo `plan_adjust`
- **THEN** o status vira `approved`, `reviewedAt` é gravado e o ajuste de plano é acionado após o
  commit

#### Scenario: Aprovação idempotente
- **WHEN** o coach aprova uma sugestão já `approved`
- **THEN** o sistema responde sem erro e não dispara o efeito novamente

#### Scenario: Rejeitar não produz efeito de plano
- **WHEN** o coach rejeita uma sugestão `pending`
- **THEN** o status vira `rejected`, `reviewedAt` é gravado e nenhum efeito de plano é acionado

#### Scenario: Transição ilegal
- **WHEN** o coach tenta rejeitar uma sugestão já `approved` (ou vice-versa)
- **THEN** o sistema retorna erro de regra de domínio (`409 Conflict`) e o status não muda
