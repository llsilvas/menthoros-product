# Tasks — add-waitlist-lead-notifications

Repo: `apps/menthoros-backend`. Validação padrão de cada bloco: `./mvnw clean test`
(`./mvnw clean verify` no bloco final, para os ITs).

## Evento e configuração

- [ ] 1.1 `WaitlistLeadCreatedEvent(UUID waitlistId)` em `events/`. `WaitlistServiceImpl.registrar`
      publica via `ApplicationEventPublisher` só no ramo `Resultado.CRIADO` (nunca `JA_INSCRITO`
      nem `IGNORADO`). Validação: `./mvnw clean test` — `WaitlistServiceImplTest` ganha asserção de
      que o evento é publicado (ou não) conforme o resultado, com `ApplicationEventPublisher`
      mockado.
- [ ] 1.2 `WaitlistNotificationAsyncConfig`: `@EnableAsync` + bean `waitlistNotificationExecutor`
      (`ThreadPoolTaskExecutor` pequeno, mesmo molde de `StravaWebhookAsyncConfig`). Validação:
      lint/compile.
- [ ] 1.3 `app.founder.notification-email` em `application.yml` (env var
      `FOUNDER_NOTIFICATION_EMAIL`, sem default — se vazio, o listener loga e não tenta enviar ao
      founder, não quebra). Validação: `./mvnw clean test`.

## Templates

- [ ] 2.1 `waitlist-confirmation-treinador.html`/`.txt` — clona a estrutura de
      `waitlist-docs-site.html`; corpo: o que acontece agora, prazo de resposta, resumo da oferta
      (60 dias grátis, sem cartão, depois R$ 99/mês).
- [ ] 2.2 `waitlist-confirmation-atleta.html`/`.txt` — corpo: produto é para assessorias, link para
      indicar ao treinador.
- [ ] 2.3 `waitlist-founder-notification.html`/`.txt` — corpo: nome, faixa de atletas, telefone (se
      houver), origem (UTM). Sem CTA.

## Envio

- [ ] 3.1 `WaitlistEmailSender` (`@Component`, método `enviar(EmailMessage)` com `@Retryable`,
      `maxAttempts=3`, backoff 2s×2 — ver design.md D4, bean separado do chamador de propósito).
      Validação: `./mvnw clean test` com teste de que o retry de fato roda (ex.: `EmailSender` mock
      lançando `EmailDeliveryException` 2x e sucedendo na 3ª).
- [ ] 3.2 `WaitlistNotificationListener`: `@Async("waitlistNotificationExecutor")` +
      `@TransactionalEventListener(AFTER_COMMIT)`. Recarrega o `Waitlist` pelo `waitlistId` do
      evento; monta e envia a confirmação pelo perfil (`TREINADOR`/`ATLETA`); para `TREINADOR`,
      também monta e envia a notificação ao founder. Cada envio em `try/catch` independente — falha
      num não impede o outro, e nenhuma delas propaga. Validação: `./mvnw clean test` — testes de
      unidade cobrindo os critérios de aceite 1 e 4 (variante certa por perfil; founder só para
      treinador).

## Testes de ponta a ponta e validação

- [ ] 4.1 Teste de integração: `POST /api/v1/waitlist` com perfil treinador cria o lead e (via
      `@MockitoBean` do `EmailSender`, ou equivalente) confirma que `send()` foi chamado com os
      destinatários certos (inscrito + founder) depois do commit. Repetir para perfil atleta (só o
      inscrito, sem founder). Cobre os critérios 1 e 4.
- [ ] 4.2 Teste cobrindo os critérios 2 e 3: reenvio do mesmo e-mail (`JA_INSCRITO`) e honeypot
      preenchido (`IGNORADO`) não disparam `send()`.
- [ ] 4.3 Teste cobrindo o critério 5: `EmailSender` mockado para sempre lançar
      `EmailDeliveryException` — o `POST` ainda responde 201 normalmente.
- [ ] 4.4 Teste cobrindo o critério 6 (`AFTER_COMMIT`): não há como forçar rollback real de dentro
      de `registrar` sem um bug deliberado — validar por inspeção de código (a anotação
      `@TransactionalEventListener(phase = AFTER_COMMIT)` está presente) em vez de um teste de
      runtime; se não for viável um teste automatizado, documentar aqui como verificado por revisão.
- [ ] 4.5 `./mvnw clean verify` completo (suíte inteira) sem regressão. Validação: registrar o
      total de testes e falhas aqui.
