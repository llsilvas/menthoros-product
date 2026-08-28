# Capability — convite-assessorias-fundadoras

## ADDED Requirements

### Requirement: ADMIN MUST poder convidar um inscrito da waitlist para se tornar assessoria fundadora

O sistema SHALL expor `POST /api/admin/waitlist/{id}/convite`, restrito ao role `ADMIN`, que gera
um token de uso único com validade de 7 dias, persiste apenas o hash do token, invalida qualquer
convite ativo anterior do mesmo inscrito e envia um e-mail com o link
`<FRONTEND_URL>/#/cadastro?convite=<token>` (token no fragmento).

O endpoint MUST NOT retornar o token. O token MUST existir em claro apenas no e-mail.

#### Scenario: Convite de treinador sem conta
- **WHEN** `ADMIN` convida um inscrito com `perfil = TREINADOR` cujo e-mail não possui usuário no Keycloak
- **THEN** responde `202` com `id`, `waitlistId` e `expiraEm`; um registro com `token_hash` e `expires_at = agora + 7 dias` é criado; um e-mail é enviado ao inscrito

#### Scenario: Inscrito com perfil ATLETA
- **WHEN** o inscrito tem `perfil = ATLETA`
- **THEN** responde `422` e nenhum registro nem e-mail é gerado

#### Scenario: E-mail já possui conta
- **WHEN** o e-mail do inscrito já corresponde a um usuário no Keycloak
- **THEN** responde `409` e nenhum e-mail é enviado

#### Scenario: E-mail maior que o limite do signup
- **WHEN** o e-mail do inscrito tem mais de 100 caracteres (limite de `CoachSignupInputDto` e `tb_usuario`)
- **THEN** responde `422` e nenhum e-mail é enviado

#### Scenario: Reenvio
- **WHEN** existe convite ativo e um novo é gerado para o mesmo inscrito
- **THEN** o anterior recebe `invalidated_at`, o novo é enviado, e o link antigo passa a responder `404`

#### Scenario: Reenvio após expiração ou falha de envio
- **WHEN** o convite anterior está expirado, ou ficou sem `sent_at` porque o SMTP falhou
- **THEN** ele também recebe `invalidated_at` antes do insert do novo — o índice parcial único não considera `expires_at`, e sem essa invalidação o reenvio violaria a UNIQUE

#### Scenario: Convite já convertido
- **WHEN** o inscrito já converteu um convite
- **THEN** responde `409`

#### Scenario: Falha no envio do e-mail
- **WHEN** o SMTP recusa o envio
- **THEN** o convite fica persistido sem `sent_at`, responde `502`, e nenhuma retentativa automática ocorre

#### Scenario: Chamador sem role ADMIN
- **WHEN** um `TECNICO` ou `PROPRIETARIO` chama o endpoint
- **THEN** responde `403`

### Requirement: Backend MUST expor consulta pública de convite sem revelar o estado

O sistema SHALL expor `GET /api/public/founding-invites/{token}`, sem autenticação e sob rate limit,
que devolve `nome` e `email` do inscrito apenas para convites ativos.

#### Scenario: Token ativo
- **WHEN** o token corresponde a um convite não expirado, não invalidado e não convertido
- **THEN** responde `200 { nome, email }`

#### Scenario: Token inválido em qualquer forma
- **WHEN** o token é inexistente, expirado, invalidado ou convertido
- **THEN** responde `404` com corpo idêntico em todos os casos

#### Scenario: Rate limit em GET
- **WHEN** o mesmo IP consulta o endpoint acima do limite por minuto
- **THEN** responde `429` — o filtro de rate limit público MUST tratar `GET`, não só `POST`

### Requirement: Cadastro por convite MUST funcionar com o auto-cadastro público desligado

`POST /api/public/coach-signups` SHALL aceitar o campo opcional `inviteToken`. Com token válido o
cadastro prossegue mesmo com `COACH_SIGNUP_ENABLED=false`; sem token, o comportamento da flag é o
atual.

#### Scenario: Flag desligada com token válido
- **WHEN** `COACH_SIGNUP_ENABLED=false` e o corpo traz `inviteToken` ativo
- **THEN** o cadastro é processado e responde `201`

#### Scenario: Flag desligada sem token ou com token inválido
- **WHEN** `COACH_SIGNUP_ENABLED=false` e não há token, ou o token não está ativo
- **THEN** responde `404`

#### Scenario: E-mail divergente do convite
- **WHEN** o e-mail do formulário difere do e-mail do convite
- **THEN** responde `422` e nada é provisionado

### Requirement: Provisionamento por convite MUST criar a assessoria como fundadora no plano GRATUITO sem verificação de e-mail

No modo convite, a saga de provisionamento SHALL criar a `Assessoria` com `plano = GRATUITO`,
`maxAtletas = 10`, `maxTecnicos = 1`, `founding = true` e `founding_converted_at`; o usuário
Keycloak SHALL nascer com `emailVerified = true`, sem required action `VERIFY_EMAIL` e sem envio de
verificação. O rastro em `tb_signup_provisioning` SHALL registrar `origin = FOUNDING_INVITE`.

#### Scenario: Aceite concluído
- **WHEN** a saga conclui com sucesso
- **THEN** o convite recebe `converted_at` e `assessoria_id`, e o usuário consegue autenticar imediatamente pelo fluxo Authorization Code + PKCE, recebendo JWT com `tenant_id` da nova organização e role `PROPRIETARIO`

#### Scenario: Falha em etapa externa
- **WHEN** uma etapa no Keycloak falha e a compensação conclui (`FAILED`)
- **THEN** o convite permanece ativo e uma nova tentativa com o mesmo token abre um novo rastro de provisionamento (chave `"<token_hash>:<n+1>"`) e conclui o cadastro

#### Scenario: Resíduo que exige reparo manual
- **WHEN** existe rastro `RECONCILIATION_REQUIRED` para o convite
- **THEN** novas tentativas respondem `409` e nada é provisionado até reparo manual

#### Scenario: Duplo envio simultâneo
- **WHEN** uma segunda requisição chega enquanto a primeira tentativa está num estado intermediário (nem `ACTIVE`, `FAILED` nem `RECONCILIATION_REQUIRED`)
- **THEN** responde `409`

#### Scenario: Convite consumido só uma vez
- **WHEN** um convite já convertido é usado de novo no `POST /api/public/coach-signups`
- **THEN** responde `404` e nada é provisionado

### Requirement: A página `/cadastro` MUST operar em modo convite

O frontend SHALL, na presença de `?convite=<token>`, consultar o convite e renderizar o formulário
com nome e e-mail pré-preenchidos e bloqueados, coletando apenas nome da assessoria, slug e senha;
com convite inválido SHALL exibir aviso e link para a waitlist, sem formulário. Sem token e com o
cadastro público desligado, SHALL exibir "cadastro por convite" com link para a waitlist. O token
MUST NOT ser persistido em `localStorage` ou `sessionStorage`.

#### Scenario: Convite válido
- **WHEN** a página abre com token ativo
- **THEN** nome e e-mail aparecem desabilitados e o envio inclui `inviteToken`

#### Scenario: Convite inválido
- **WHEN** a consulta responde `404`
- **THEN** a página mostra "Convite inválido ou expirado" com CTA para `/waitlist` e não mostra o formulário

#### Scenario: Cadastro público desligado, sem token
- **WHEN** o `POST` responde `404` sem token
- **THEN** a página mostra "O cadastro é por convite" com CTA para `/waitlist`

### Requirement: Token e credenciais MUST NOT vazar

O token em claro MUST existir apenas no e-mail, no fragmento da URL até o primeiro render e na
memória da página. Ele MUST NOT aparecer em logs da aplicação, logs de servidor/CDN/proxy,
cabeçalho `Referer`, histórico persistido, `localStorage`/`sessionStorage`, respostas de erro,
traces ou analytics. A senha e as credenciais SMTP MUST NOT aparecer em logs, respostas ou traces.
O token MUST ser gerado com pelo menos 256 bits de entropia criptográfica e armazenado apenas como
SHA-256.

#### Scenario: Link do convite
- **WHEN** o e-mail é montado
- **THEN** o link usa o fragmento (`/#/cadastro?convite=<token>`), que o browser não envia ao servidor nem no `Referer`

#### Scenario: Página aberta pelo link
- **WHEN** a `CadastroPage` monta com `convite` no fragmento
- **THEN** o parâmetro é removido da URL via `history.replaceState` antes do primeiro render, e a página declara `Referrer-Policy` restritiva

#### Scenario: Logs da saga e do convite
- **WHEN** qualquer etapa do convite ou do aceite loga ou falha, em qualquer profile
- **THEN** nenhuma saída contém o token, a senha ou `spring.mail.password`; o sender de desenvolvimento grava em arquivo e MUST NOT logar o link

#### Scenario: Profile de nuvem sem SMTP
- **WHEN** o backend sobe no profile `cloud` sem as variáveis `SMTP_*`
- **THEN** o startup falha — não existe fallback para arquivo ou log fora de `local`/`test`
