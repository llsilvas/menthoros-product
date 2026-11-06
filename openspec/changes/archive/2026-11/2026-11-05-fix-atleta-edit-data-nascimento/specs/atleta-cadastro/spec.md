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

### Requirement: Campos de escolha sem valor pré-selecionado
No cadastro de atleta novo, os campos sexo, nível de experiência e dia do treino longo SHALL começar
vazios e SHALL ser obrigatórios; o formulário SHALL NOT enviar o cadastro enquanto algum deles
estiver vazio. Na edição, esses campos SHALL vir com os valores cadastrados.

#### Scenario: Cadastro salvo sem escolher sexo
- **WHEN** o treinador preenche nome, data, peso, altura e objetivo e salva sem escolher sexo, nível
  ou dia do longão
- **THEN** o formulário SHALL mostrar erro nesses três campos e SHALL NOT chamar o salvamento

#### Scenario: Edição preserva as escolhas
- **WHEN** o treinador abre a edição de um atleta com sexo `FEMININO` e nível `AVANCADO`
- **THEN** os campos SHALL vir com "Feminino" e "Avançado" selecionados

### Requirement: Peso e altura aceitam vírgula e ponto
Os campos de peso e altura SHALL começar vazios, SHALL exibir a unidade ("kg", "cm") junto ao campo
e SHALL aceitar vírgula ou ponto como separador decimal. Valor vazio, não numérico ou menor ou igual
a zero SHALL ser erro de validação.

#### Scenario: Peso com vírgula
- **WHEN** o treinador digita `72,5` em peso e salva um formulário válido
- **THEN** o salvamento SHALL receber `pesoKg` igual a `72.5`

#### Scenario: Peso vazio
- **WHEN** o treinador salva sem preencher peso
- **THEN** o formulário SHALL mostrar erro em peso e SHALL NOT chamar o salvamento

### Requirement: Dias disponíveis como chips e dia do longão derivado
Os dias disponíveis SHALL ser escolhidos por chips, um por dia da semana, com rótulo acentuado
("Terça", "Sábado"). O dia do treino longo SHALL oferecer apenas os dias marcados como disponíveis
e SHALL ficar desabilitado quando nenhum estiver marcado. Desmarcar o dia escolhido como longão
SHALL limpar essa escolha. Na edição, um dia do longão cadastrado fora dos dias disponíveis SHALL
continuar visível como opção até o treinador trocá-lo.

#### Scenario: Longão só entre os dias marcados
- **WHEN** o treinador marca Terça e Sábado
- **THEN** o select do dia do longão SHALL listar apenas "Terça" e "Sábado"

#### Scenario: Nenhum dia marcado
- **WHEN** nenhum dia disponível está marcado
- **THEN** o select do dia do longão SHALL estar desabilitado

#### Scenario: Desmarcar o dia do longão
- **WHEN** o longão é Sábado e o treinador desmarca Sábado nos dias disponíveis
- **THEN** o dia do longão SHALL ficar vazio

### Requirement: Formulário em três grupos e legível no celular
O formulário SHALL agrupar os campos em "Identificação", "Perfil físico e objetivo" e
"Disponibilidade e saúde", SHALL usar largura `md` e, abaixo do breakpoint `sm`, SHALL dispor os
campos em uma coluna. O subtítulo e o rodapé SHALL NOT conter texto sobre padronização visual
interna.

#### Scenario: Viewport estreita
- **WHEN** o dialog abre em largura menor que o breakpoint `sm`
- **THEN** cada campo SHALL ocupar a largura inteira
