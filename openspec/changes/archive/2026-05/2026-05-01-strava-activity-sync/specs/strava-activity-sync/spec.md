## ADDED Requirements

### Requirement: Sistema importa atividades do Strava para TreinoRealizado
O sistema SHALL buscar atividades do atleta na API do Strava e convertê-las em registros `TreinoRealizado`. A importação MUST respeitar deduplicação por `externalId` — atividades já importadas MUST ser atualizadas, não duplicadas.

#### Scenario: Importação manual de atividades
- **WHEN** `POST /api/strava/sync/{atletaId}` é chamado
- **THEN** o sistema busca atividades na API do Strava desde a última sincronização (`ultima_sincronizacao` em `IntegracaoExterna`), mapeia cada uma para `TreinoRealizado` com `fonte_dados = STRAVA`, salva ou atualiza por `external_id`, e atualiza `ultima_sincronizacao`

#### Scenario: Atividade já importada anteriormente
- **WHEN** a importação encontra uma atividade com `external_id` já existente em `tb_treino_realizado` para o atleta
- **THEN** o sistema atualiza os campos mapeáveis do registro existente sem criar duplicata

#### Scenario: Atleta sem conexão Strava ativa
- **WHEN** `POST /api/strava/sync/{atletaId}` é chamado e o atleta não tem `IntegracaoExterna` ativa com `plataforma = STRAVA`
- **THEN** o sistema retorna HTTP 422 com mensagem indicando que o atleta precisa conectar o Strava

---

### Requirement: Sistema mapeia campos da atividade Strava corretamente
O sistema SHALL converter todas as unidades e tipos de dados do Strava para o modelo do Menthoros durante a importação.

#### Scenario: Conversão de distância
- **WHEN** uma atividade Strava tem `distance` em metros
- **THEN** `TreinoRealizado.distanciaKm` é armazenado dividido por 1000, com precisão de 2 casas decimais

#### Scenario: Conversão de duração
- **WHEN** uma atividade Strava tem `moving_time` em segundos
- **THEN** `TreinoRealizado.duracaoMin` é armazenado convertido para `Duration`

#### Scenario: Inferência de TipoTreino por sport_type e workout_type
- **WHEN** uma atividade tem `sport_type = "Run"` e `workout_type = 1`
- **THEN** `TreinoRealizado.tipoTreino` é mapeado para `PROVA`

#### Scenario: Inferência de TipoTreino para corrida padrão
- **WHEN** uma atividade tem `sport_type = "Run"` e `workout_type = 0`
- **THEN** o sistema infere `TipoTreino` com base na duração e FC média em relação ao limiar do atleta

#### Scenario: Atividade manual do Strava
- **WHEN** uma atividade tem `manual = true`
- **THEN** `TreinoRealizado.fonteDados` é marcado como `STRAVA` e uma flag de origem manual é registrada em `metadados_sincronizacao`

---

### Requirement: Sistema importa laps da atividade para EtapaRealizada
O sistema SHALL buscar os laps de cada atividade via `GET /activities/{id}/laps` do Strava e criar registros `EtapaRealizada` associados ao `TreinoRealizado` importado.

#### Scenario: Atividade com laps disponíveis
- **WHEN** uma atividade é importada e possui laps retornados pela API Strava
- **THEN** cada lap gera um `EtapaRealizada` com `split_index`, `duracao`, `distanciaKm`, `fcMedia`, `fcMax`, `velocidadeMedia`, `cadenciaMedia`, `elevacaoGanhoMetros` e `elevacaoPerdaMetros` preenchidos

#### Scenario: Lap sem dados de FC
- **WHEN** um lap não tem `average_heartrate` (atleta não usa monitor cardíaco)
- **THEN** `EtapaRealizada.fcMedia` e `fcMax` ficam `null` sem causar erro

#### Scenario: Cadência do Strava
- **WHEN** o Strava retorna `average_cadence` (half-cadence: passos de um pé por minuto)
- **THEN** o sistema multiplica por 2 para obter cadência total antes de salvar em `EtapaRealizada.cadenciaMedia`

---

### Requirement: Sistema armazena dados extras do Strava em TreinoRealizado
O sistema SHALL persistir campos do Strava sem equivalente direto no modelo atual, para uso futuro em análises e validação cruzada.

#### Scenario: Suffer Score disponível
- **WHEN** uma atividade Strava tem `suffer_score` não nulo
- **THEN** o valor é armazenado em `TreinoRealizado.sufferScore` para cross-check com o TSS calculado pelo Menthoros

#### Scenario: Elapsed time disponível
- **WHEN** uma atividade Strava tem `elapsed_time` (inclui pausas)
- **THEN** o valor em segundos é armazenado em `TreinoRealizado.elapsedTimeSeg`

#### Scenario: Nome do dispositivo disponível
- **WHEN** a atividade retorna `device_name`
- **THEN** o valor é armazenado em `TreinoRealizado.deviceName`

---

### Requirement: Sistema respeita rate limit da API Strava
O sistema SHALL verificar o header `X-RateLimit-Remaining` nas respostas da API Strava e pausar requisições quando o limite estiver próximo de zero, retomando após o período de reset.

#### Scenario: Rate limit atingido durante sync
- **WHEN** a API Strava retorna HTTP 429 ou `X-RateLimit-Remaining = 0`
- **THEN** o sistema interrompe o processamento, registra log de aviso e agenda retry após o período de reset da janela de rate limit

#### Scenario: Sync parcial por rate limit
- **WHEN** a importação é interrompida por rate limit após processar N atividades
- **THEN** `ultima_sincronizacao` em `IntegracaoExterna` é atualizada apenas para o timestamp da última atividade processada com sucesso, permitindo retomar de onde parou

---

### Requirement: Isolamento multi-tenancy na sincronização
O sistema SHALL garantir que atividades importadas sejam associadas ao `tenant_id` do atleta. Um atleta de um tenant MUST NOT ter acesso a atividades de atletas de outros tenants.

#### Scenario: Sync de atleta do tenant autenticado
- **WHEN** `POST /api/strava/sync/{atletaId}` é chamado para atleta do tenant do usuário autenticado
- **THEN** o sistema processa normalmente e associa os registros ao `tenant_id` correto

#### Scenario: Sync de atleta de outro tenant
- **WHEN** `POST /api/strava/sync/{atletaId}` é chamado para atleta de outro tenant
- **THEN** o sistema retorna HTTP 404

---

### Requirement: API de revisão manual de reconciliação
O sistema SHALL expor endpoints de revisão manual para casos `AMBIGUO` e `NAO_PLANEJADO`, com isolamento por tenant e validação de contrato HTTP.

#### Scenario: Listar pendentes por atleta
- **WHEN** `GET /api/v1/reconciliation/atletas/{atletaId}/pendentes` é chamado com `X-Tenant-ID`
- **THEN** o sistema retorna lista paginada apenas com status `AMBIGUO` e `NAO_PLANEJADO` do atleta no tenant informado

#### Scenario: Listar candidatos de vínculo
- **WHEN** `GET /api/v1/reconciliation/{treinoRealizadoId}/candidatos` é chamado com `X-Tenant-ID`
- **THEN** o sistema retorna candidatos ordenados por score de compatibilidade para o mesmo tenant

#### Scenario: Executar ação manual
- **WHEN** `POST /api/v1/reconciliation/{treinoRealizadoId}/acao` é chamado com ação válida (`VINCULAR_MANUALMENTE`, `MARCAR_NAO_PLANEJADO`, `DESFAZER_VINCULO`)
- **THEN** o sistema aplica a transição de reconciliação, respeitando validações de domínio e tenant

#### Scenario: Header de tenant ausente
- **WHEN** qualquer endpoint de reconciliação manual é chamado sem `X-Tenant-ID`
- **THEN** o sistema retorna HTTP 400 com mensagem indicando header obrigatório ausente
