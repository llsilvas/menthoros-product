## ADDED Requirements

### Requirement: Capturar interessados via endpoint público
O sistema SHALL expor `POST /api/v1/waitlist` que registra um interessado no beta do Menthoros
**sem exigir autenticação** e **sem contexto de tenant**.

#### Scenario: Cadastro válido sem autenticação
- **WHEN** um cliente envia `POST /api/v1/waitlist` com `nome`, `email` válido e `perfil`
- **THEN** o sistema MUST persistir uma linha em `tb_waitlist` com `created_at` preenchido
- **AND** MUST responder `201 Created`
- **AND** MUST NOT exigir cabeçalho `Authorization`

#### Scenario: Requisição pública anônima não popula tenant
- **WHEN** a requisição chega sem JWT
- **THEN** o `JwtTenantFilter` MUST NOT popular o `TenantContext`
- **AND** a operação MUST concluir sem erro relacionado a tenant

#### Scenario: Caminho público com token de usuário autenticado
- **WHEN** uma requisição a `/api/v1/waitlist` chega **com** header `Authorization`
- **THEN** o `JwtTenantFilter` MUST ignorar o caminho (`shouldNotFilter` cobre `/api/v1/waitlist`)
- **AND** a operação MUST concluir sem exigir `tenant_id`

---

### Requirement: Validar campos obrigatórios
O sistema SHALL validar os campos do cadastro e rejeitar requisições inválidas.

#### Scenario: Campos obrigatórios ausentes ou inválidos
- **WHEN** o corpo não tem `nome`, tem `email` em formato inválido, ou não tem `perfil`
- **THEN** o sistema MUST responder `400 Bad Request` com os erros de validação
- **AND** MUST NOT persistir nenhuma linha

---

### Requirement: Tratar e-mail duplicado de forma idempotente
O sistema SHALL garantir unicidade de e-mail (case-insensitive) sem expor erro ao cliente.

#### Scenario: E-mail já cadastrado
- **WHEN** chega um cadastro cujo e-mail normalizado (`trim` + minúsculas) já existe
- **THEN** o sistema MUST responder `200 OK` indicando que já está na lista
- **AND** MUST NOT criar uma segunda linha para o mesmo e-mail

#### Scenario: Corrida entre requisições com o mesmo e-mail
- **WHEN** duas requisições concorrentes com o mesmo e-mail passam pela verificação de existência
- **THEN** o índice único MUST impedir a duplicata
- **AND** o sistema MUST capturar a `DataIntegrityViolationException` e responder `200 OK`
- **AND** MUST NOT vazar `409`/`500` para o cliente

---

### Requirement: Mitigar abuso com honeypot e rate-limit por IP
O sistema SHALL incluir um campo honeypot oculto e um limite de taxa por IP no endpoint público.

#### Scenario: Honeypot preenchido
- **WHEN** o corpo traz o campo honeypot `website` preenchido
- **THEN** o sistema MUST tratar a submissão como bot e NÃO persistir
- **AND** MUST responder de forma indistinguível de um sucesso (`200`/`201`)

#### Scenario: Rate-limit por IP excedido
- **WHEN** um mesmo IP excede **5 submissões por minuto** (valor padrão configurável em
  `app.waitlist.rate-limit.per-minute`)
- **THEN** o sistema MUST responder `429 Too Many Requests`
- **AND** MUST NOT persistir a submissão excedente

---

### Requirement: Exigir consentimento LGPD na captura
O sistema SHALL coletar consentimento explícito de uso de dados antes de registrar o interessado.

#### Scenario: Aceite ausente é rejeitado
- **WHEN** o corpo não traz `aceiteLgpd = true`
- **THEN** o sistema MUST responder `400 Bad Request`
- **AND** MUST NOT persistir

#### Scenario: Formulário bloqueia envio sem aceite
- **WHEN** o checkbox de aceite LGPD não está marcado
- **THEN** o formulário MUST bloquear o envio
- **AND** MUST exibir o aviso de finalidade do uso de dados (texto fixado no design D7)
- **AND** MUST conter um link para a Política de Privacidade na rota `/privacidade`

---

### Requirement: Segmentar perfil e porte do interessado
O sistema SHALL registrar o perfil (treinador/atleta) e, para treinadores, a faixa de atletas atendidos.

#### Scenario: Treinador informa faixa de atletas
- **WHEN** o cadastro tem `perfil = TREINADOR`
- **THEN** o sistema MUST aceitar e persistir `qtdAtletas` quando informado
  (`ATE_10`, `DE_11_A_30`, `DE_31_A_100`, `MAIS_DE_100`)

#### Scenario: Atleta não exige faixa de atletas
- **WHEN** o cadastro tem `perfil = ATLETA`
- **THEN** `qtdAtletas` MUST ser opcional e MAY ser nulo

---

### Requirement: Página pública de waitlist no frontend
O sistema SHALL prover a rota pública `/waitlist` com o formulário de inscrição, acessível sem login.

#### Scenario: Acesso não autenticado à rota
- **WHEN** um visitante não autenticado abre `/waitlist`
- **THEN** o frontend MUST renderizar o formulário
- **AND** MUST NOT redirecionar para a tela de login

#### Scenario: Campo de atletas condicional ao perfil
- **WHEN** o usuário seleciona o perfil "Treinador"
- **THEN** o formulário MUST exibir o campo "quantos atletas você atende"
- **WHEN** o usuário seleciona o perfil "Atleta"
- **THEN** o formulário MUST ocultar esse campo

#### Scenario: Confirmação após envio
- **WHEN** o formulário é preenchido validamente e enviado com sucesso
- **THEN** o frontend MUST exibir uma tela de confirmação ("Você está na lista")
- **AND** MUST NOT manter o usuário no formulário em branco

---

### Requirement: Direcionar os CTAs da landing para a waitlist
O sistema SHALL fazer os CTAs de conversão da landing levarem à waitlist, preservando o acesso de login.

#### Scenario: CTA de conversão leva à waitlist
- **WHEN** o usuário clica em um CTA de conversão da landing ("Começar grátis"/"Começar agora")
- **THEN** o frontend MUST navegar para `/waitlist`

#### Scenario: Botão Entrar leva ao login
- **WHEN** o usuário clica em "Entrar"
- **THEN** o frontend MUST navegar para `/auth/login`
