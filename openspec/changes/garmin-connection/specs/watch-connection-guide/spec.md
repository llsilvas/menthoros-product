# Spec Delta — watch-connection-guide

## MODIFIED Requirements

### Requirement: Matriz de compatibilidade por marca
O front SHALL manter uma matriz de compatibilidade com uma entrada por marca, contendo
posicionamento, modo de push, modo de ingestão, passos de conexão em PT-BR, avisos, apps parceiros
(quando houver), resumo para o treinador, mês de verificação e fontes. A entrada GARMIN SHALL
descrever o canal Garmin direto (conexão na conta Garmin do atleta), com posicionamento
"Suportado", push e ingestão `NATIVO`, e SHALL NOT mencionar o intervals.icu. Marcas cujo circuito
só fecha com app de terceiro SHALL ter posicionamento "Compatível via app parceiro" e SHALL NOT usar
a palavra "suportado". Marcas sem push ao relógio SHALL ter posicionamento "Só treino realizado".
Marcas em que o push depende do modelo SHALL listar os modelos com push automático. Só marcas com
gate manual fechado com atleta real SHALL ter posicionamento "Suportado"; as demais com circuito
nativo SHALL ter "Em validação" com critério de promoção explícito. O resumo para o treinador
SHALL NOT afirmar que o treino chega ao relógio sem a condição que o sistema não verifica.

#### Scenario: Garmin
- **WHEN** a entrada de GARMIN é lida
- **THEN** o posicionamento é "Suportado", os passos descrevem autorizar o Menthoros na conta
  Garmin, e nenhum passo cita o intervals.icu

#### Scenario: Marca nativa sem gate
- **WHEN** a entrada de COROS é lida
- **THEN** o posicionamento é "Em validação" e há um critério de promoção a "Suportado"

#### Scenario: Marca fora do escopo
- **WHEN** a entrada de SUUNTO ou OUTRO é lida
- **THEN** o posicionamento é "Ainda não coberto", sem promessa de push ou ingestão

#### Scenario: Apple e Samsung
- **WHEN** a entrada de APPLE ou SAMSUNG é lida
- **THEN** o posicionamento é "Compatível via app parceiro" e há ao menos um app parceiro nomeado

#### Scenario: Polar
- **WHEN** a entrada de POLAR é lida
- **THEN** o modo de push é `SEM_PUSH` e o texto diz que o treino planejado não chega ao relógio

#### Scenario: Amazfit
- **WHEN** a entrada de AMAZFIT é lida
- **THEN** os avisos citam os modelos com push automático (T-Rex 3 Pro, Balance 2) e a importação
  manual de `.fit` para os demais

### Requirement: Guia de conexão no perfil do atleta
O card de conexão SHALL mostrar o guia da marca do atleta, lida do perfil de onboarding, antes e
depois de conectar, com a ação "Conectar" acima do guia. Para marca GARMIN a ação SHALL conectar o
canal Garmin direto; para as demais marcas SHALL conectar o intervals.icu. Os guias das demais
marcas SHALL ficar acessíveis sem alterar o perfil. Sem marca conhecida, o card SHALL mostrar todos
os guias fechados e orientar o atleta a informar o relógio no onboarding.

#### Scenario: Atleta COROS não conectado
- **WHEN** o atleta com `dispositivoMarca = COROS` abre o perfil sem ter conectado
- **THEN** vê o botão "Conectar com intervals.icu" e, abaixo, o guia COROS aberto com os passos de
  Connections e do calendário "Intervals.icu Training Plan" e o aviso da janela de 7 dias

#### Scenario: Atleta sem perfil de onboarding
- **WHEN** o atleta sem perfil (ou sem marca) abre o perfil
- **THEN** vê o botão "Conectar", todos os guias fechados e a dica para informar o relógio

#### Scenario: Garmin inalterado
- **WHEN** o atleta Garmin conecta e desconecta
- **THEN** o fluxo de conexão, callback e confirmação segue o mesmo desenho do intervals.icu, agora
  contra o canal Garmin direto; o guia Garmin aparece com o rótulo "Suportado"

#### Scenario: Atleta Garmin
- **WHEN** um atleta com marca GARMIN abre o perfil
- **THEN** o card oferece "Conectar Garmin" acima do guia GARMIN, sem citar o intervals.icu

## ADDED Requirements

### Requirement: Canal obrigatório pela marca
O onboarding SHALL aceitar `canalIntegracao = GARMIN` e SHALL exigir esse canal quando
`dispositivoMarca = GARMIN`; qualquer outra marca SHALL NOT poder escolher `GARMIN`.

#### Scenario: Garmin com intervals.icu
- **WHEN** um rascunho é salvo com `dispositivoMarca = GARMIN` e `canalIntegracao = INTERVALS_ICU`
- **THEN** o salvamento é rejeitado com erro de validação no campo do canal

#### Scenario: Garmin com canal Garmin
- **WHEN** um rascunho é salvo com `dispositivoMarca = GARMIN` e `canalIntegracao = GARMIN`
- **THEN** o salvamento é aceito

#### Scenario: COROS com canal Garmin
- **WHEN** um rascunho é salvo com `dispositivoMarca = COROS` e `canalIntegracao = GARMIN`
- **THEN** o salvamento é rejeitado com erro de validação no campo do canal

#### Scenario: Garmin com canal manual
- **WHEN** um rascunho é salvo com `dispositivoMarca = GARMIN` e `canalIntegracao = MANUAL`
- **THEN** o salvamento é aceito (o atleta pode optar por lançar à mão)
