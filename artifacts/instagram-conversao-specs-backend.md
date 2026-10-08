# Menthoros — Specs de Backend (captura de leads e fonte de fatos)

Origem: análise do Instagram, da landing e de `/waitlist` em 07/10/2026.
Objetivo: todo lead chega com origem e qualificação, o número de vagas vem de um lugar só, e o agente de marketing só afirma o que o produto faz.
Escrito sem acesso ao código. Cada spec tem um bloco "Verificar no código" para o Claude Code resolver antes de implementar.

Premissas (ajustar ao que existir): Java 21, Spring Boot, Flyway, API em `api.menthoros.com` sob `/api/v1`.

Ordem sugerida: BE-01 → BE-02 → BE-03 → BE-04 → BE-05 → BE-06 → BE-07.

---

## BE-01 — Endpoint único de solicitação de acesso

**Problema:** home e `/waitlist` têm formulários com campos diferentes. É provável que existam dois contratos ou dois destinos para o mesmo dado.

**Proposta:**

- `POST /api/v1/waitlist`, público, usado pelos dois formulários (FE-02).
- Payload:
  - `name` (obrigatório)
  - `email` (obrigatório, normalizado em minúsculas)
  - `phone` (opcional, formato E.164)
  - `role` (obrigatório): `OWNER`, `COACH`, `ATHLETE`
  - `athleteCount` (obrigatório para `OWNER` e `COACH`)
  - `watchBrand` (obrigatório para `OWNER` e `COACH`): `GARMIN`, `COROS`, `POLAR`, `APPLE`, `OTHER`, `UNKNOWN`
  - `consent` (obrigatório, `true`) e `privacyPolicyVersion`
  - `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `landingPath`, `referrer` (opcionais)
- Idempotência por e-mail: reenvio atualiza os campos e retorna 200, sem criar duplicata e sem revelar que o e-mail já existia.
- Resposta: `status` do lead e `segment` (`QUALIFIED`, `OTHER_BRAND`, `ATHLETE`), para o frontend escolher a tela de sucesso (FE-05).
- Validação com mensagens por campo.

**Verificar no código:**

- Endpoints e tabelas de waitlist existentes e quais campos já são gravados.
- Migração dos leads atuais para o novo modelo, sem perda.

**Critérios de aceite:**

- Os dois formulários gravam na mesma tabela com o mesmo contrato.
- Dois envios com o mesmo e-mail resultam em um registro.

---

## BE-02 — Modelo de lead com origem, consentimento e status

**Problema:** não há como medir de onde vem cada lead nem em que etapa ele está.

**Proposta:**

- Tabela `waitlist_lead` (migration Flyway) com os campos do BE-01 mais:
  - `status`: `NEW`, `QUALIFIED`, `INVITED`, `ACTIVE`, `DISCARDED`
  - `segment`: `QUALIFIED`, `OTHER_BRAND`, `ATHLETE`
  - `consent_at`, `privacy_policy_version`
  - `created_at`, `updated_at`, `invited_at`, `activated_at`
  - `assessoria_id` (preenchido quando o lead vira conta)
- Índice único em `email`.
- Regra de qualificação na criação:
  - `OWNER` ou `COACH` com `GARMIN` → `QUALIFIED`
  - `OWNER` ou `COACH` com outra marca → `OTHER_BRAND`
  - `ATHLETE` → `ATHLETE`
- Transição para `INVITED` ligada ao envio do convite da turma fundadora, que já existe, e para `ACTIVE` na criação da assessoria.
- LGPD: endpoint ou rotina para excluir um lead a pedido.

**Verificar no código:**

- Como o convite "Criar minha assessoria" é gerado hoje e onde ligar a transição de status.

**Critérios de aceite:**

- Um lead percorre `NEW/QUALIFIED → INVITED → ACTIVE` sem atualização manual no banco.

---

## BE-03 — Proteção contra spam e abuso

**Problema:** endpoint público de formulário, divulgado em rede social.

**Proposta:**

- Rate limit por IP no `POST /api/v1/waitlist` (sugestão: 5 por hora).
- Campo honeypot no payload: se vier preenchido, responder 200 e descartar.
- CORS restrito aos domínios do site.
- Limites de tamanho por campo.
- Log estruturado de rejeições, sem dados pessoais.

**Verificar no código:**

- Se já há rate limiting na aplicação ou na borda (Railway, Vercel), para reutilizar.

**Critérios de aceite:**

- A sexta requisição do mesmo IP na janela retorna 429.
- Envio com honeypot preenchido não cria lead.

---

## BE-04 — Vagas da turma fundadora como fonte única

**Problema:** o número de vagas diverge entre bio (4), post fixado (10), site (10) e post de 02/10 ("todas convidadas"). Hoje é texto digitado à mão em cada lugar.

**Proposta:**

- Configuração persistida da turma: `totalSlots` (10) e regra de ocupação.
- Vagas ocupadas calculadas a partir de leads `INVITED` + `ACTIVE`, com opção de ajuste manual.
- `GET /api/v1/founders/slots`, público e com cache curto:
  ```json
  { "total": 10, "taken": 6, "remaining": 4, "open": true }
  ```
- `open: false` quando `remaining` chega a zero. O frontend troca para lista da próxima turma (FE-04).
- Mesmo endpoint consumido pelo agente de marketing antes de qualquer post sobre vagas.

**Verificar no código:**

- Se já existe o conceito de turma ou coorte fundadora no modelo de dados.
- Qual critério define uma vaga ocupada: convite enviado ou conta criada.

**Critérios de aceite:**

- Enviar um convite reduz `remaining` sem deploy.
- Home, `/waitlist` e agente leem o mesmo número.

---

## BE-05 — E-mails transacionais e notificação ao fundador

**Problema:** o lead não recebe confirmação e o fundador não é avisado. Resposta lenta desperdiça o lead que veio do Instagram.

**Proposta:**

- E-mail de confirmação imediato ao lead, por segmento:
  - `QUALIFIED`: o que acontece agora, prazo de resposta, resumo da oferta (60 dias grátis, sem cartão, depois R$ 99/mês).
  - `OTHER_BRAND`: limitação assumida (hoje só Garmin) e promessa de aviso quando a marca entrar.
  - `ATHLETE`: o produto é para assessorias, com link para indicar ao treinador.
- Notificação ao fundador a cada lead `QUALIFIED`, com nome, número de atletas, WhatsApp e origem (UTM).
- Envio assíncrono com nova tentativa. Falha de e-mail não derruba a criação do lead.
- Reaproveitar a infraestrutura do e-mail de convite existente.

**Verificar no código:**

- Provedor de e-mail e mecanismo de templates em uso.
- Canal de notificação preferido: e-mail ou WhatsApp.

**Critérios de aceite:**

- Cada segmento recebe o e-mail correto em um envio de teste.
- Lead `QUALIFIED` gera uma notificação ao fundador com a origem preenchida.

---

## BE-06 — Funil por origem

**Problema:** sem medição, não há como saber quais posts geram solicitações qualificadas.

**Proposta:**

- Endpoint administrativo autenticado, `GET /api/v1/admin/waitlist/funnel`, com filtro por período.
- Agrupamento por `utmSource` e `utmContent`: total de leads, qualificados, convidados, ativos.
- Lista de leads com filtro por status e segmento, para a operação diária.
- Export CSV da lista.

**Verificar no código:**

- Se há área administrativa e papel de admin no Keycloak para proteger a rota.

**Critérios de aceite:**

- É possível responder "quantas solicitações qualificadas o post X gerou" com uma consulta.

---

## BE-07 — Fonte de fatos do produto para o agente de marketing

**Problema:** o agente de marketing publicou integrações que não existem (Strava, WhatsApp, planilhas) e um resultado sem fonte ("12h → 2h"). Falta uma fonte versionada do que pode ser afirmado.

**Proposta:**

- Arquivo versionado no repositório, por exemplo `product-facts.yaml`, com:
  - `integrations`: ativas (`garmin`) e planejadas, com status.
  - `features`: funcionalidades em produção, com descrição de uma linha.
  - `metrics`: métricas calculadas (TSS, CTL/ATL/TSB, ACWR, decoupling).
  - `plans`: nome, preço, limite de atletas e de técnicos, disponibilidade.
  - `offer`: 60 dias grátis, sem cartão, plano de continuidade.
  - `sport`: modalidades atendidas (`running`).
  - `claims_allowed` e `claims_forbidden`: afirmações de resultado permitidas e proibidas.
- Exposição somente leitura, `GET /api/v1/public/product-facts`, ou leitura direta do arquivo pelo agente.
- Planos e preços da home passam a ler da mesma fonte, para não haver dois lugares com o valor.
- Regra de processo: mudança de preço, integração ou funcionalidade atualiza o arquivo no mesmo PR.

**Uso futuro (não implementar agora):** agregados anônimos de uso da turma fundadora (tempo de revisão semanal, proporção de sugestões aceitas e ajustadas) como única fonte de números de resultado para marketing.

**Verificar no código:**

- Onde planos e preços estão definidos hoje (billing com Asaas) e se podem ser a origem da seção `plans`.
- Como o agente de marketing lê contexto: arquivo, HTTP ou MCP.

**Critérios de aceite:**

- O agente consegue listar integrações ativas e preços a partir da fonte, sem texto fixo no prompt.
- Preços da home e do arquivo de fatos nunca divergem.
