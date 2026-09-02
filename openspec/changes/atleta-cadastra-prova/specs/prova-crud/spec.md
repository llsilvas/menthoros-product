# Capability — prova-crud (delta)

## MODIFIED Requirements

### Requirement: Criar prova de atleta
O sistema SHALL permitir o cadastro de uma nova prova vinculada a um atleta existente do tenant do
usuário autenticado. Usuários com papel de atleta SHALL poder criar provas apenas para o próprio
`atletaId`; treinadores e administradores SHALL poder criar para qualquer atleta do tenant. A data
da prova MUST ser posterior à data corrente. Quando a prova é criada com `provaAlvo = true`, o
sistema SHALL desmarcar qualquer outra prova-alvo não cancelada do mesmo atleta.

#### Scenario: Cadastro com dados válidos
- **WHEN** uma requisição POST é feita para `/api/v1/atletas/{atletaId}/provas` com body válido e token JWT com tenant_id
- **THEN** o sistema SHALL criar a prova, associá-la ao atleta e retornar HTTP 201 com o `ProvaOutputDto`

#### Scenario: Atleta cadastra a própria prova
- **WHEN** um usuário com papel de atleta faz POST em `/api/v1/atletas/{seuAtletaId}/provas`
- **THEN** o sistema SHALL criar a prova e retornar HTTP 201

#### Scenario: Atleta tenta cadastrar prova para outro atleta
- **WHEN** um usuário com papel de atleta faz POST em `/api/v1/atletas/{outroAtletaId}/provas`, mesmo do mesmo tenant
- **THEN** o sistema SHALL retornar HTTP 404 e nada é criado

#### Scenario: Atleta não encontrado
- **WHEN** uma requisição POST é feita com `atletaId` inexistente no tenant
- **THEN** o sistema SHALL retornar HTTP 404 com mensagem de erro

#### Scenario: Atleta de outro tenant
- **WHEN** o `atletaId` existe mas pertence a outro tenant
- **THEN** o sistema SHALL retornar HTTP 404 (não revelar existência de dados de outro tenant)

#### Scenario: Body inválido
- **WHEN** campos obrigatórios estão ausentes ou inválidos (ex: `nomeProva` em branco, `dataProva` nula)
- **THEN** o sistema SHALL retornar HTTP 400 com detalhes de validação

#### Scenario: Data de hoje ou passada
- **WHEN** `dataProva` é igual ou anterior à data corrente
- **THEN** o sistema SHALL retornar HTTP 400 com detalhe de validação no campo `dataProva`

#### Scenario: Distância customizada sem quilometragem
- **WHEN** `distancia = CUSTOMIZADA` (valor novo do enum, último na ordem) e `distanciaKm` está ausente ou não é positivo
- **THEN** o sistema SHALL retornar HTTP 400

#### Scenario: Distâncias existentes preservadas
- **WHEN** o valor `CUSTOMIZADA` é adicionado ao enum
- **THEN** provas já gravadas com 5, 10, 21 ou 42 km continuam lendo a mesma distância

#### Scenario: Nova prova-alvo substitui a anterior
- **WHEN** o atleta já possui prova-alvo A e cria B com `provaAlvo = true`
- **THEN** B é criada como alvo e A passa a `provaAlvo = false`

### Requirement: Listar provas de atleta
O sistema SHALL retornar todas as provas não canceladas de um atleta, ordenadas por data
ascendente. Usuários com papel de atleta SHALL poder listar apenas as próprias provas.

#### Scenario: Listagem com sucesso
- **WHEN** uma requisição GET é feita para `/api/v1/atletas/{atletaId}/provas` por treinador ou administrador do tenant
- **THEN** o sistema SHALL retornar HTTP 200 com lista de `ProvaOutputDto` ordenada por `dataProva` ascendente

#### Scenario: Atleta lista as próprias provas
- **WHEN** um usuário com papel de atleta faz GET em `/api/v1/atletas/{seuAtletaId}/provas`
- **THEN** o sistema SHALL retornar HTTP 200 com as provas dele

#### Scenario: Atleta tenta listar provas de outro atleta
- **WHEN** um usuário com papel de atleta faz GET em `/api/v1/atletas/{outroAtletaId}/provas` do mesmo tenant
- **THEN** o sistema SHALL retornar HTTP 404

#### Scenario: Atleta sem provas
- **WHEN** o atleta existe mas não possui provas cadastradas
- **THEN** o sistema SHALL retornar HTTP 200 com lista vazia

#### Scenario: Atleta de outro tenant
- **WHEN** o `atletaId` existe mas pertence a outro tenant
- **THEN** o sistema SHALL retornar HTTP 404

### Requirement: Buscar prova por ID
O sistema SHALL retornar os dados de uma prova específica de um atleta. Usuários com papel de
atleta SHALL poder buscar apenas provas do próprio `atletaId`.

#### Scenario: Prova encontrada
- **WHEN** uma requisição GET é feita para `/api/v1/atletas/{atletaId}/provas/{provaId}` com token válido e posse ou papel de treinador/administrador
- **THEN** o sistema SHALL retornar HTTP 200 com o `ProvaOutputDto`

#### Scenario: Atleta busca prova de outro atleta
- **WHEN** um usuário com papel de atleta faz GET com `atletaId` que não é o seu
- **THEN** o sistema SHALL retornar HTTP 404

#### Scenario: Prova não pertence ao atleta
- **WHEN** a `provaId` existe mas está vinculada a outro atleta
- **THEN** o sistema SHALL retornar HTTP 404

#### Scenario: Prova não encontrada
- **WHEN** a `provaId` não existe
- **THEN** o sistema SHALL retornar HTTP 404

### Requirement: Atualizar prova de atleta
O sistema SHALL permitir a atualização dos dados de uma prova existente do atleta. Usuários com
papel de atleta SHALL poder atualizar apenas as próprias provas e MUST NOT alterar uma prova com
`foiRealizada = true`; para o atleta, os campos de resultado (`foiRealizada`, `tempoRealizado`,
posições, `tssProva`, `percepcaoEsforcoProva`, `feedbackProva`, `tsbIdealProva`) e os campos
derivados de preparação MUST ser ignorados. As mesmas regras de data futura e de prova-alvo única
da criação SHALL valer na atualização.

#### Scenario: Atualização com dados válidos
- **WHEN** uma requisição PUT é feita para `/api/v1/atletas/{atletaId}/provas/{provaId}` com body válido
- **THEN** o sistema SHALL atualizar a prova e retornar HTTP 200 com o `ProvaOutputDto` atualizado

#### Scenario: Atleta atualiza a própria prova
- **WHEN** um usuário com papel de atleta faz PUT na própria prova planejada com body válido
- **THEN** o sistema SHALL atualizar nome, data, tipo, distância, tempo objetivo e prova-alvo e retornar HTTP 200

#### Scenario: Atleta envia campos de resultado
- **WHEN** um usuário com papel de atleta envia `tempoRealizado` ou `foiRealizada` no body
- **THEN** o sistema SHALL ignorar esses campos e atualizar os demais

#### Scenario: Atleta tenta alterar prova realizada
- **WHEN** um usuário com papel de atleta faz PUT em prova com `foiRealizada = true`
- **THEN** o sistema SHALL retornar HTTP 409

#### Scenario: Prova não encontrada ou de outro atleta
- **WHEN** a `provaId` não existe ou pertence a outro atleta do mesmo ou diferente tenant
- **THEN** o sistema SHALL retornar HTTP 404

#### Scenario: Body inválido
- **WHEN** campos obrigatórios estão ausentes
- **THEN** o sistema SHALL retornar HTTP 400

### Requirement: Deletar prova de atleta
O sistema SHALL permitir a remoção de uma prova de um atleta. Para administradores a remoção é
permanente. Para usuários com papel de atleta, a operação SHALL ser um cancelamento: a prova
recebe `statusProva = CANCELADA`, deixa de aparecer nas listagens e no planejamento, e MUST ser
preservada. O atleta MUST NOT cancelar prova com `foiRealizada = true`. Treinadores SHALL poder
cancelar (soft) provas de atletas do tenant.

#### Scenario: Deleção permanente por administrador
- **WHEN** um administrador faz DELETE em `/api/v1/atletas/{atletaId}/provas/{provaId}`
- **THEN** o sistema SHALL remover a prova e retornar HTTP 204

#### Scenario: Cancelamento pelo atleta
- **WHEN** um usuário com papel de atleta faz DELETE na própria prova planejada
- **THEN** o sistema SHALL marcar `statusProva = CANCELADA`, retornar HTTP 204, e a prova deixa de aparecer em `GET .../provas`

#### Scenario: Atleta tenta cancelar prova realizada
- **WHEN** um usuário com papel de atleta faz DELETE em prova com `foiRealizada = true`
- **THEN** o sistema SHALL retornar HTTP 409

#### Scenario: Prova não encontrada ou de outro atleta
- **WHEN** a `provaId` não existe ou pertence a outro atleta
- **THEN** o sistema SHALL retornar HTTP 404

### Requirement: Isolamento multi-tenancy
Todas as operações sobre provas SHALL respeitar o `tenant_id` extraído do JWT pelo `JwtTenantFilter`.
Adicionalmente, para usuários com papel de atleta, todas as operações SHALL exigir que o `atletaId`
da rota corresponda ao atleta do usuário autenticado; a violação SHALL responder HTTP 404, sem
distinguir do caso de atleta inexistente.

#### Scenario: Acesso a dados do próprio tenant
- **WHEN** o usuário autenticado opera sobre provas de atletas do seu tenant
- **THEN** o sistema SHALL processar a requisição normalmente

#### Scenario: Tentativa de acesso a dados de outro tenant
- **WHEN** o usuário tenta acessar ou modificar provas de um atleta de outro tenant
- **THEN** o sistema SHALL retornar HTTP 404 sem revelar a existência dos dados

#### Scenario: Atleta opera sobre outro atleta do mesmo tenant
- **WHEN** um usuário com papel de atleta usa um `atletaId` que não é o seu, em qualquer operação
- **THEN** o sistema SHALL retornar HTTP 404
