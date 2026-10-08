# Tasks — add-waitlist-lead-notifications

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`
(`./mvnw clean verify` no bloco final, para os ITs).

## Evento e configuração

- [x] 1.1 `WaitlistLeadCreatedEvent(UUID waitlistId)` em `events/`. `WaitlistServiceImpl.registrar`
      publica via `ApplicationEventPublisher` só no ramo `Resultado.CRIADO` (nunca `JA_INSCRITO`
      nem `IGNORADO`). A publicação ganhou um `try/catch` próprio
      (`publicarEventoDeNotificacao`) depois do QA gate: como `registrar` não é `@Transactional`,
      `fallbackExecution=true` do listener despacha o `@Async` *síncrono* nesta mesma chamada — se
      o executor dedicado estiver saturado, `publishEvent` pode lançar (`TaskRejectedException`)
      depois que a linha já foi gravada, e sem o catch o inscrito veria 500 numa inscrição que deu
      certo. Validação: `./mvnw clean test` — `WaitlistServiceImplTest` cobre publicação por
      resultado e o caso de `publishEvent` lançando.
- [x] 1.2 `WaitlistNotificationAsyncConfig`: `@EnableAsync` + bean `waitlistNotificationExecutor`
      (`ThreadPoolTaskExecutor`, core 2/max 4/fila 100, mesmo molde de `StravaWebhookAsyncConfig`).
      Validação: compile.
- [x] 1.3 `app.founder.notification-email` em `application.yml` (env var
      `FOUNDER_NOTIFICATION_EMAIL`, default vazio — se vazio, o listener loga e não tenta enviar ao
      founder, não quebra). Validação: `./mvnw clean test`.

## Templates

- [x] 2.1 `waitlist-confirmation-treinador.html`/`.txt` — clona a estrutura de
      `waitlist-docs-site.html`; corpo: prazo de resposta (24h), resumo da oferta (60 dias grátis,
      sem cartão, depois R$ 99/mês).
- [x] 2.2 `waitlist-confirmation-atleta.html`/`.txt` — corpo: produto é para assessorias, CTA
      "Indicar para o treinador" linkando para `{{linkWaitlist}}` (`app.frontend.url` + `/#/waitlist`,
      nunca dado do usuário).
- [x] 2.3 `waitlist-founder-notification.html`/`.txt` — corpo: nome, faixa de atletas, telefone (se
      houver), origem (UTM). Sem CTA, layout mais simples (e-mail interno, sem a moldura de marca).
- [x] (achado da revisão de segurança) `EmailTemplateRenderer` já escapa todo placeholder em
      template `.html` via `HtmlUtils.htmlEscape` — confirmado placeholder a placeholder nos 3
      templates novos: nenhum dado do lead cai em contexto de atributo/URL, só texto.

## Envio

- [x] 3.1 `WaitlistEmailSender` (`@Component` package-private, método `enviar(EmailMessage)` com
      `@Retryable(retryFor = EmailDeliveryException.class, maxAttempts = 3, backoff = 2s×2)` — ver
      design.md D4, bean separado do chamador de propósito, mesmo padrão de
      `WeeklyFocusModelClient`). JavaDoc de Idempotency/Side Effects/Tenant-aware adicionado após o
      QA gate (achado do `code-reviewer`). Validação: `WaitlistEmailSenderRetryTest` — prova o
      retry via `ApplicationContextRunner` + `@EnableRetry` (uma instância criada com `new` nunca
      retentaria; mesmo cuidado de `WeeklyFocusModelClientRetryTest`).
- [x] 3.2 `WaitlistNotificationListener`: `@Async("waitlistNotificationExecutor")` +
      `@TransactionalEventListener(phase = AFTER_COMMIT, fallbackExecution = true)` — o
      `fallbackExecution` é necessário porque `registrar` não tem transação ambiente (ver design.md
      D2, verificado linha a linha pelo `code-reviewer`). Recarrega o `Waitlist` pelo `waitlistId`
      do evento; monta e envia a confirmação pelo perfil (`TREINADOR`/`ATLETA`); para `TREINADOR`,
      também monta e envia a notificação ao founder. Cada envio em `try/catch` independente — falha
      num não impede o outro (confirmado por teste e por leitura de código no QA gate). JavaDoc de
      Idempotency/Side Effects/Tenant-aware adicionado após o QA gate. Validação:
      `WaitlistNotificationListenerTest` (5 testes) cobre variante por perfil, founder só para
      treinador, lead inexistente, founder-email não configurado, e falha de um envio não bloqueando
      o outro.

## Testes de ponta a ponta e validação

- [x] 4.1 `WaitlistNotificationIT`: `POST /api/v1/waitlist` com perfil treinador cria o lead e
      (`EmailSender` mockado via `@MockitoBean`) confirma `send()` com os destinatários certos
      (inscrito + founder); perfil atleta só envia ao inscrito. `Mockito.timeout(...)` contra o
      executor assíncrono real — **sem** substituir por um executor síncrono: achado do
      `code-reviewer` apontou que a troca (`SyncTaskExecutor` + `spring.main.allow-bean-definition-
      overriding=true`) era mais máquina do que a garantia valia, já que `timeout(...)` sozinho já
      cobre a janela assíncrona. Simplificado. Cobre os critérios 1 e 4.
- [x] 4.2 Critérios 2 e 3 no mesmo IT: reenvio do mesmo e-mail (`JA_INSCRITO`) não dispara chamada
      adicional a `send()`; honeypot coberto indiretamente pelo teste de unidade de
      `WaitlistServiceImplTest` (`Resultado.IGNORADO` não publica evento — a cadeia inteira depende
      disso, não precisa duplicar via HTTP).
- [x] 4.3 Critério 5 no IT: `EmailSender` mockado para sempre lançar `EmailDeliveryException` — o
      `POST` ainda responde 201 normalmente, lead persistido confirmado via repositório.
- [x] 4.4 Critério 6 (`AFTER_COMMIT`): verificado por revisão de código, não por teste de runtime —
      não há como forçar rollback real de dentro de `registrar` sem um bug deliberado. O
      `code-reviewer` confirmou a anotação e o raciocínio de design.md D2 traçando o código (não só
      a doc), incluindo o detalhe de que a publicação roda ANTES do `return`, dentro do mesmo `try`
      que envolve o `saveAndFlush` bem-sucedido.
- [x] 4.5 `./mvnw clean verify` completo: **4503 testes unitários/slice (0 falhas, 1 skip
      pré-existente) + 211 testes de integração (0 falhas)**. QA gate: `code-reviewer` (2 Important
      corrigidos — JavaDoc mandatório ausente, e risco de 500 pós-commit por saturação do executor;
      ambos corrigidos nesta rodada) + `security-reviewer` (0 Critical/High/Medium; 1 nota Low sobre
      base LGPD da notificação ao founder, endereçada no `proposal.md`).
