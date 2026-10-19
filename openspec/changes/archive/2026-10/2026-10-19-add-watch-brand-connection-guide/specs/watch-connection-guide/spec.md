# watch-connection-guide (delta — ADDED)

## ADDED Requirements

### Requirement: Marcas de relógio reconhecidas
O sistema SHALL reconhecer em `DispositivoMarca` as marcas GARMIN, COROS, POLAR, SUUNTO, APPLE,
AMAZFIT, SAMSUNG e OUTRO, aceitando qualquer uma delas no onboarding do atleta e rejeitando um
rascunho sem marca. Cada marca SHALL declarar a própria prioridade (`prior()`); não SHALL existir
default de marca desconhecida.

#### Scenario: Onboarding com marca nova
- **WHEN** um rascunho de onboarding é salvo com `dispositivoMarca = AMAZFIT`
- **THEN** o salvamento é aceito e a leitura subsequente devolve `AMAZFIT`

#### Scenario: Rascunho sem marca
- **WHEN** um rascunho de onboarding é salvo sem `dispositivoMarca`
- **THEN** o salvamento é rejeitado com erro de validação no campo

#### Scenario: Prior do scorer
- **WHEN** `prior()` é consultado para cada uma das oito marcas
- **THEN** devolve o valor da tabela de prioridade; uma constante sem prior não compila

#### Scenario: Marca nova não dispensa a calibração
- **WHEN** um atleta sem histórico, com onboarding completo, FC máxima e pace limiar, declara
  AMAZFIT ou SAMSUNG
- **THEN** o score de confiança não atinge o tier A só pela marca e a calibração é iniciada no
  primeiro snapshot

### Requirement: Matriz de compatibilidade por marca
O front SHALL manter uma matriz de compatibilidade com uma entrada por marca, contendo
posicionamento, modo de push, modo de ingestão, passos de conexão em PT-BR, avisos, apps parceiros
(quando houver), resumo para o treinador, mês de verificação e fontes. Marcas cujo circuito só
fecha com app de terceiro SHALL ter posicionamento "Compatível via app parceiro" e SHALL NOT usar a
palavra "suportado". Marcas sem push ao relógio SHALL ter posicionamento "Só treino realizado".
Marcas em que o push depende do modelo SHALL listar os modelos com push automático. Só marcas com
gate manual fechado com atleta real SHALL ter posicionamento "Suportado"; as demais com circuito
nativo SHALL ter "Em validação" com critério de promoção explícito. O resumo para o treinador
SHALL NOT afirmar que o treino chega ao relógio sem a condição que o sistema não verifica.

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
O card de conexão intervals.icu SHALL mostrar o guia da marca do atleta, lida do perfil de
onboarding, antes e depois de conectar, com a ação "Conectar" acima do guia. Os guias das demais
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
- **THEN** o comportamento de conexão, callback e confirmação é o mesmo de antes; o guia Garmin
  aparece com o rótulo "Suportado"

### Requirement: Treinador vê o relógio do atleta
O perfil agregado do atleta para o treinador (`GET /api/v1/coach/atletas/{id}/perfil`) SHALL
incluir `relogio { marca, modelo }`, lido do perfil de onboarding; nulo quando não há perfil, e
nulo com `"relogio"` em `avisos` quando a consulta falha. A página do atleta no contexto do
treinador SHALL exibir, a partir desse campo, a marca, o modelo (se informado) e o
resumo do canal em linguagem de treinador, condicional ao que o sistema não verifica ("chegam ao
relógio se o atleta ligou ..."; "não verificado automaticamente"), indicando que a marca é a
informada no onboarding e não confirmada, com o posicionamento e os avisos de formato da marca. Quando o push ao relógio não é
automático, SHALL exibir um aviso de uma linha com a consequência para a rotina. A página SHALL
dar acesso ao guia da marca em modo leitura ("O que pedir ao atleta"). Sem perfil, SHALL exibir
"Relógio não informado" junto ao atalho de preencher o onboarding.

#### Scenario: Atleta Garmin
- **WHEN** o treinador abre o perfil de um atleta com `dispositivoMarca = GARMIN`
- **THEN** vê que os treinos chegam ao relógio "se o atleta ligou a conexão Garmin e o upload de
  treinos planejados", e "O que pedir ao atleta" abre o guia Garmin sem botão de conectar

#### Scenario: Atleta Polar
- **WHEN** o treinador abre o perfil de um atleta com `dispositivoMarca = POLAR`
- **THEN** vê "Relógio: Polar" e o aviso de que os treinos aprovados não chegam ao relógio pelo
  intervals.icu

#### Scenario: Sem perfil
- **WHEN** o treinador abre o perfil de um atleta sem perfil de onboarding
- **THEN** vê "Relógio não informado" e o botão "Preencher onboarding"

#### Scenario: Consulta do relógio falhou
- **WHEN** a leitura do perfil de onboarding falha dentro do perfil agregado
- **THEN** o restante do perfil é devolvido, `relogio` é nulo e `avisos` contém "relogio"

### Requirement: Texto do chip de sincronização neutro de marca
O chip de sincronização, no sucesso, SHALL dizer "No intervals.icu" (rótulo) e "Enviado ao
intervals.icu" (tooltip), sem nomear marca nem afirmar chegada ao relógio.

#### Scenario: Status sincronizado
- **WHEN** o status é `SINCRONIZADO` ou `SINCRONIZADO_PARCIAL`
- **THEN** o rótulo é "No intervals.icu" e o tooltip é "Enviado ao intervals.icu"
