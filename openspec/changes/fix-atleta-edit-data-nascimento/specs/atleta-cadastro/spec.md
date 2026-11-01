## ADDED Requirements

### Requirement: Resposta de atleta expõe a data de nascimento
O sistema SHALL incluir `dataNascimento` (formato `yyyy-MM-dd`) no `AtletaOutputDto` retornado por
`GET /api/v1/atletas/{id}`, quando o atleta tiver a data cadastrada, mantendo o campo `idade`. Para
atleta sem data cadastrada, o campo SHALL ser omitido. O acesso SHALL continuar restrito ao tenant
do usuário autenticado e, para o papel de atleta, ao próprio registro.

#### Scenario: Atleta com data de nascimento
- **WHEN** o treinador faz GET em `/api/v1/atletas/{id}` de um atleta com data de nascimento 1993-05-15
- **THEN** o corpo SHALL conter `"dataNascimento": "1993-05-15"` e o campo `idade`

#### Scenario: Atleta legado sem data de nascimento
- **WHEN** o treinador faz GET de um atleta sem data de nascimento cadastrada
- **THEN** o corpo SHALL omitir `dataNascimento` e SHALL manter os demais campos

#### Scenario: Atleta de outro tenant
- **WHEN** o `id` pertence a outro tenant
- **THEN** o sistema SHALL retornar HTTP 404 sem revelar a existência do registro

### Requirement: Edição de atleta abre com os dados cadastrados
O formulário de edição de atleta SHALL abrir com todos os campos obrigatórios preenchidos a partir
do cadastro, incluindo a data de nascimento, sem exigir que o treinador os digite de novo. Ao salvar
sem alterar a data, a requisição de atualização SHALL levar a data original.

#### Scenario: Data pré-carregada
- **WHEN** o treinador abre a edição de um atleta com data de nascimento cadastrada
- **THEN** o campo "Data de Nascimento" SHALL vir preenchido com essa data

#### Scenario: Salvar sem redigitar a data
- **WHEN** o treinador altera apenas o objetivo e salva
- **THEN** o `PUT` SHALL conter a data de nascimento original e o salvamento SHALL ser concluído

#### Scenario: Atleta sem data cadastrada
- **WHEN** o treinador abre a edição de um atleta sem data de nascimento
- **THEN** o campo SHALL vir vazio e o formulário SHALL exigir o preenchimento antes de salvar
