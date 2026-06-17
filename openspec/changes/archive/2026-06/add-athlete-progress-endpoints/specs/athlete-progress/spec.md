## ADDED Requirements

### Requirement: Histórico PMC do atleta

O sistema SHALL expor `GET /api/v1/atletas/{id}/metricas/historico?from=&to=` (tenant-aware) que
retorna a série diária PMC (`data`, `ctl`, `atl`, `tsb`, `tss`) lida de `MetricasDiarias`, ordenada
por `data`. Quando `from`/`to` forem omitidos, o sistema SHALL usar os últimos 90 dias.

#### Scenario: Série retornada no intervalo
- **WHEN** existem `MetricasDiarias` do atleta entre `from` e `to`
- **THEN** o sistema retorna `200 OK` com a lista de `PmcPontoDto` ordenada por `data` crescente

#### Scenario: Intervalo padrão
- **WHEN** `from`/`to` não são informados
- **THEN** o sistema considera os últimos 90 dias

#### Scenario: Sem dados no intervalo
- **WHEN** não há `MetricasDiarias` no período
- **THEN** o sistema retorna `200 OK` com lista vazia

#### Scenario: Atleta de outro tenant
- **WHEN** o `id` pertence a um atleta de outro tenant
- **THEN** o sistema retorna `404 Not Found`

---

### Requirement: Distribuição de zonas

O sistema SHALL expor `GET /api/v1/atletas/{id}/metricas/zonas?from=&to=` (tenant-aware) que retorna
o tempo por zona (z1–z5) e a duração total no período, derivados dos treinos/etapas realizados.

#### Scenario: Distribuição consistente
- **WHEN** há treinos realizados no período
- **THEN** o sistema retorna a distribuição por zona e a soma das zonas é igual à `duracaoTotal`

#### Scenario: Período sem treinos
- **WHEN** não há treinos realizados no período
- **THEN** o sistema retorna zonas zeradas e `duracaoTotal = 0`

---

### Requirement: Recordes pessoais

O sistema SHALL expor `GET /api/v1/atletas/{id}/recordes` (tenant-aware) que retorna os PRs (5k/10k/
21k) derivados dos treinos realizados do atleta.

#### Scenario: PRs derivados
- **WHEN** o atleta tem treinos realizados cobrindo as distâncias
- **THEN** o sistema retorna, por distância, o melhor tempo e o treino de origem

#### Scenario: Sem histórico suficiente
- **WHEN** o atleta não possui treinos realizados para uma distância
- **THEN** o sistema omite essa distância (ou retorna lista vazia se nenhuma existir)

---

### Requirement: Readiness atual do atleta autenticado

O sistema SHALL expor `GET /api/v1/atletas/me/readiness` (autorizado para `ROLE_ATLETA`,
tenant-aware) que retorna o readiness atual (`score` + fatores), compondo o readiness subjetivo
(`add-daily-readiness-checkin`) e a carga objetiva (`add-continuous-daily-load-management` /
`MetricasDiarias`). Sinais ausentes SHALL degradar para defaults, sem erro.

#### Scenario: Readiness com sinais disponíveis
- **WHEN** existem check-in subjetivo e métricas de carga do dia
- **THEN** o sistema retorna `200 OK` com `score` e fatores compostos

#### Scenario: Readiness com sinais ausentes
- **WHEN** não há check-in subjetivo nem métricas do dia
- **THEN** o sistema retorna `200 OK` com defaults documentados, sem falhar

#### Scenario: me resolve o atleta do token
- **WHEN** um usuário `ATLETA` chama o endpoint
- **THEN** o sistema resolve o `Atleta` vinculado ao token e responde apenas com os dados desse atleta

---

### Requirement: Resumo "hoje" do atleta autenticado

O sistema SHALL expor `GET /api/v1/atletas/me/home` (autorizado para `ROLE_ATLETA`, tenant-aware) que
retorna o próximo treino planejado e as métricas-chave do dia.

#### Scenario: Home com treino planejado
- **WHEN** o atleta tem um próximo treino planejado
- **THEN** o sistema retorna o treino e as métricas-chave atuais

#### Scenario: Home sem treino planejado
- **WHEN** não há próximo treino planejado
- **THEN** o sistema retorna as métricas-chave e omite o próximo treino
