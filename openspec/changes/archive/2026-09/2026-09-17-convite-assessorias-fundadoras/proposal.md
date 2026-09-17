# convite-assessorias-fundadoras — Converter a waitlist nas 10 assessorias fundadoras por convite

**Tamanho:** M · **Trilha:** Full
**Status:** em revisão — PRs [backend #87](https://github.com/llsilvas/menthoros-backend/pull/87) · [front #99](https://github.com/llsilvas/menthoros-front/pull/99) (2026-08-28)
**Criado:** 2026-08-28

## Problema

A landing do MVP promete "10 parceiras fundadoras · vagas limitadas" e captura interessados em
`tb_waitlist`. Hoje nada liga a waitlist a um tenant: a única porta de entrada é o auto-cadastro
público `/cadastro`, aberto a qualquer pessoa, que cria assessoria no plano BASIC sem distinguir
quem foi escolhido. Para converter as 10 fundadoras o founder teria de pedir que cada uma se
cadastrasse "por conta", torcendo para usarem o e-mail certo — sem rastro de quem foi convidada,
sem controle de plano e contradizendo a escassez anunciada.

## Escopo

1. **Endpoint admin de convite** — `POST /api/admin/waitlist/{id}/convite` (`ADMIN`, rota
   tenant-less como as demais de `/api/admin/**`). Aceita só inscritos `perfil = TREINADOR`, recusa
   e-mail que já tem conta no Keycloak, gera um token de uso único (hash persistido em
   `tb_founding_invite`, validade **7 dias**), invalida convites anteriores do mesmo inscrito e
   envia o e-mail de convite.
2. **Envio de e-mail pelo backend** — `spring-boot-starter-mail` sobre o SMTP do Resend (mesmas
   credenciais que o Keycloak já usa no Railway), template HTML em PT-BR versionado no repositório.
3. **Consulta pública do convite** — `GET /api/public/founding-invites/{token}` devolve nome e
   e-mail do inscrito quando o token é válido; `404` quando inexistente, expirado, invalidado ou já
   convertido (sem distinguir os casos no corpo).
4. **Modo convite no `/cadastro`** — `/#/cadastro?convite=<token>` (fragmento — hash router): a `CadastroPage` pré-preenche e
   bloqueia nome e e-mail; a fundadora informa nome da assessoria, slug (sugerido, editável) e
   senha. O `POST /api/public/coach-signups` aceita o token e **funciona mesmo com
   `COACH_SIGNUP_ENABLED=false`** — o gate passa a ser "flag ligada **ou** token válido".
5. **Provisionamento fundadora** — reaproveita a saga do `CoachSignupServiceImpl` com
   chave de idempotência por tentativa (`"<token_hash>:<n>"`, ver `design.md`): `Assessoria` em **GRATUITO, `maxAtletas = 10`,
   `maxTecnicos = 1`, `founding = true`, `founding_converted_at`**; usuário Keycloak com
   `emailVerified = true` e **sem `VERIFY_EMAIL`** (o token já provou posse do e-mail). O token só é
   marcado como consumido no sucesso da saga.
6. **Cadastro livre desligado em produção** durante a fase fundadora: `/cadastro` sem token mostra
   "cadastro por convite — entre na lista de espera".

## Fora do escopo

- Tela/painel admin de aprovação — o founder chama o endpoint por `curl`/Bruno com o próprio token.
- Badge, texto ou qualquer marca visível de "fundadora" na UI.
- Fluxo de upgrade de plano ao estourar 10 atletas — o erro de limite já existe e o upgrade é
  manual pelo `AssinaturaController`.
- Pricing, cobrança, `Assinatura`.
- Convite para inscritos `perfil = ATLETA`.
- Migrar os e-mails do Keycloak (verify-email, convite de atleta) para o backend.
- Trocar o hash router (`/#/`) por browser router — **no radar como change própria**
  (`migrate-hash-to-browser-router`, XS/S · Fast), para depois das fundadoras: o nginx já tem SPA
  fallback, mas o link de convite depende do fragmento para o token não chegar a servidor/CDN/
  `Referer`; a migração precisa levar o token para `#convite=` ou POST e reabrir a seção "Onde o
  token trafega" do `design.md`.

## Dependências e ordem

- **Pré-condição operacional 1:** usuário do founder com role `ADMIN` no Keycloak de produção,
  criado pelo `menthoros-infra` (seed/sync), nunca pelo console.
- **Pré-condição operacional 2:** vars `SMTP_*` no serviço `menthoros-backend` do Railway
  (`production` e `develop`), por referência às `KC_SMTP_*` do Keycloak.
- Reaproveita, sem alterar o contrato: `CoachSignupServiceImpl` (saga + compensação +
  `tb_signup_provisioning`), `KeycloakOrganizationGateway`, `CadastroPage`, `JwtTenantFilter`
  (isenção de `/api/public/**` e `/api/admin/**` já existem).
- `harden-keycloak-service-account` não é dependência: o gateway funciona com o admin atual.

## Critérios de aceite

- **Dado** um inscrito `TREINADOR` sem conta no Keycloak, **quando** `ADMIN` chama
  `POST /api/admin/waitlist/{id}/convite`, **então** responde `202`, grava um convite com
  `expires_at = agora + 7 dias` e hash do token (nunca o token), e um e-mail com o link
  `<FRONTEND_URL>/#/cadastro?convite=<token>` é enviado.
- **Dado** um inscrito `ATLETA`, **quando** convidado, **então** `422` e nada é gravado.
- **Dado** um e-mail que já possui usuário no Keycloak, **quando** convidado, **então** `409` e
  nenhum e-mail sai.
- **Dado** um convite ativo, **quando** um novo convite é gerado para o mesmo inscrito, **então**
  o anterior fica `invalidated_at` preenchido e só o novo token abre o cadastro.
- **Dado** um convite já convertido, **quando** se tenta reenviar, **então** `409`.
- **Quando** `GET /api/public/founding-invites/{token}` recebe token válido, **então** `200` com
  `nome` e `email`; expirado, invalidado, convertido ou inexistente → `404` idêntico.
- **Dado** `COACH_SIGNUP_ENABLED=false`, **quando** `POST /api/public/coach-signups` chega **com**
  token válido, **então** o cadastro prossegue; **sem** token → `404` como hoje.
- **Dado** token válido, **quando** o cadastro conclui, **então** a `Assessoria` nasce
  `GRATUITO / 10 / 1 / founding = true` com `founding_converted_at`, o usuário Keycloak nasce
  com `emailVerified = true` e sem `VERIFY_EMAIL`, o convite recebe `converted_at` e a linha de
  `tb_signup_provisioning` carrega `origin = FOUNDING_INVITE`.
- **Dado** token válido, **quando** a saga falha numa etapa externa, **então** a compensação
  existente roda, o convite **continua válido** e uma nova tentativa com o mesmo link **conclui o
  cadastro** (chave de idempotência por tentativa — a mesma chave num rastro `FAILED` seria
  rejeitada pelo `resolverReenvio` atual).
- **Dado** um rastro `RECONCILIATION_REQUIRED` para o convite, **quando** a fundadora tenta de novo,
  **então** `409` e nada é provisionado até reparo manual.
- **Dado** um inscrito com e-mail acima de 100 caracteres (limite do signup e de `tb_usuario`),
  **quando** convidado, **então** `422` e nenhum e-mail sai.
- **Quando** `GET /api/public/founding-invites/{token}` é chamado repetidamente do mesmo IP,
  **então** responde `429` após o limite — o filtro atual só limita `POST` e precisa ser
  method-aware.
- **Dado** a página aberta por `/#/cadastro?convite=<token>`, **quando** o primeiro render acontece,
  **então** o token já foi removido da URL (`replaceState`) e nunca é enviado a servidor, CDN ou
  `Referer` (fragmento + `meta referrer`).
- **Dado** profile `cloud`, **quando** as vars `SMTP_*` faltam, **então** o backend **não sobe** —
  não existe sender de arquivo/log fora de `local`/`test`.
- **Quando** o e-mail do token diverge do e-mail enviado no formulário, **então** `422`.
- Token, senha e credenciais SMTP nunca aparecem em logs, respostas de erro ou traces.
- **Dado** `/cadastro` sem token e flag desligada, **então** a página exibe o aviso de cadastro por
  convite com link para a waitlist, sem formulário.

## Métrica de sucesso

**Primária:** **% de fundadoras convidadas que cadastram o primeiro atleta em até 7 dias após o
aceite.** Meta: ≥ 8 de 10. É a única medida que diz se o convite virou uso — uma assessoria
convertida sem atleta é linha no banco, não parceira.

**Secundária (operacional):** 100% dos aceites concluem sem estado `RECONCILIATION_REQUIRED`; tempo
entre "convite enviado" e "convertido" mediano ≤ 48h (mede se o e-mail chega e o link funciona).

**Instrumentação:** medição **manual por SQL** (`tb_founding_invite` × `tb_atleta`), de propósito —
são 10 registros; dashboard ou evento de tracking não entram nesta change.

## Open Questions & Assumptions

**Decididas em 2026-08-28 (sessão de grilling com o founder):**

- Tenant nasce **no aceite**, não no convite — a fundadora escolhe nome da assessoria, slug e
  senha numa tela. Descartado provisionar tudo no convite (`execute-actions-email`) porque exigiria
  nome/slug inventados pelo founder.
- E-mail sai do **backend**, não do Keycloak: o Keycloak só envia e-mail para usuário/organização
  que já existem, e nesse momento não existem. Enviar à mão (Gmail) foi descartado por falta de
  rastro.
- Tabela própria `tb_founding_invite` (não colunas na waitlist) para preservar histórico de
  reenvios.
- Sem `VERIFY_EMAIL` no aceite: o token entregue por e-mail já prova posse; um segundo e-mail no
  caminho de quem foi escolhida a dedo é atrito sem ganho de segurança.
- Plano **GRATUITO 10/1** para todas as fundadoras; o founder faz upgrade manual conversando com
  cada uma.
- Cadastro livre **desligado** em produção durante a fase; sem tela nova de "convite" — o
  `/cadastro` ganha um modo.

**Premissas assumidas (validar no `/implement init`):**

- O SMTP do Resend aceita um segundo remetente autenticando com a mesma API key (o Keycloak já
  envia de `nao-responda@menthoros.com`); o domínio está verificado no Resend.
- `FRONTEND_URL` está definido nos dois ambientes do Railway (o `application.yml` já o lê).
- `KeycloakOrganizationGateway.buscarUsuarioIdPorEmail` basta para a checagem de "e-mail já tem
  conta" (busca `exact=true`).
- A cota diária de e-mail do Resend (~250/dia no plano atual) comporta 10 convites + reenvios sem
  competir com a verificação de e-mail dos demais fluxos.

**Aceites de risco (QA de segurança, 2026-08-28):**

- **`emailVerified = true` sem clique de verificação.** A posse do e-mail é provada pelo token de
  256 bits que só existe no e-mail do convite, mais a exigência de o formulário usar o mesmo
  endereço. Se o inscrito digitou o e-mail errado na waitlist (typo em domínio alheio), a conta
  nasce com e-mail de terceiro marcado como verificado — exige erro humano prévio **e** o terceiro
  abrir o link. Aceito para 10 fundadoras escolhidas a dedo; o founder confere o e-mail antes de
  convidar.
- **Rate limit do `GET` público é por IP.** Não mitiga distribuição por muitos IPs; a defesa real
  contra enumeração é a entropia do token, o limite só contém scraping/ruído.

**Em aberto (não bloqueantes — levantadas pelo product review em 2026-08-28):**

- **Gatilho de upgrade.** As fundadoras nascem GRATUITO sem `Assinatura` e sem prazo. Existe (ou
  deveria existir) um checkpoint — "após N semanas de uso, conversa de upgrade" — ou fica caso a
  caso, a critério do founder? Hoje o risco é virar 10 contas gratuitas perpétuas sem sinal de
  disposição a pagar. Decisão fora desta change, mas precisa de dono.
- **Fundadora que não ativa.** Se uma convidada não cadastra atleta em 7 dias (meta ≥ 8/10), a
  ação é reengajamento manual pelo founder ou aceita-se a perda? A change registra o dado; o que
  fazer com ele é decisão de operação.
- **E2E Playwright (task 4.5).** Para 10 usuárias, com validação manual em `develop` (5.1–5.2)
  cobrindo o caminho feliz, o E2E automatizado tem ROI baixo. Manter ou cortar é decisão de QA do
  founder no `/implement init`.

**Product review:** Go (2026-08-28). Coach-in-the-loop N/A — não há IA nesta change.

**Pré-mortem (Codex, 2026-08-28):** veredito inicial *needs-attention* com cinco achados — todos
incorporados no `design.md` ("Retentativa", "Onde o token trafega", rate limit GET, sender de dev,
tamanho do e-mail) e nos critérios de aceite acima. Nenhum ficou em aberto.

**DoR no `/implement init` (2026-08-28):** `spec-reviewer` e Codex devolveram NOT READY na primeira
passada, ambos pelo mesmo Critical — o link sem `/#/` no proposal e na primeira menção do spec, que
implementado à letra devolveria o vazamento do token na query. Corrigido nos quatro artefatos.
Codex ainda apontou: (a) o *verify* da task 3.4 contradizia a chave por tentativa — corrigido;
(b) o índice parcial único não olha `expires_at`, então reenvio após expiração violaria a UNIQUE —
o serviço agora invalida **qualquer** convite anterior não encerrado antes do insert
(`findOpenByWaitlistId`). Minor do spec-reviewer: `IN_PROGRESS` não é valor do enum —
trocado por "estado intermediário". Status: READY.

**QA (2026-08-28, `/qa`):** code-reviewer, security-reviewer, frontend-reviewer e clean-code-reviewer
em paralelo. Nenhum Critical. Corrigidos na mesma branch: corrida no índice parcial do convite →
`409` (era 500); CR/LF em destinatário/assunto recusados no `EmailMessage`; consumo do convite
movido para antes do `ACTIVE` com desfazer na compensação; `useInviteToken()` extraído com parsing
robusto; `ROUTES.TERMOS/PRIVACIDADE`; `role="status"` no spinner. Follow-ups registrados no
`tasks.md`.
