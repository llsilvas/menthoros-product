**Tamanho:** M · **Trilha:** Full

## Why

Hoje ninguém recebe nada quando se inscreve em `/waitlist` ou na home: `WaitlistServiceImpl.registrar`
só grava a linha e responde. O inscrito não sabe o que esperar, e o founder não é avisado — um lead
vindo do Instagram esfria enquanto ninguém olha a tabela manualmente. Resposta lenta desperdiça
exatamente o lead que a campanha de conversão (`add-waitlist-value-proposition`,
`add-founders-slots-endpoint`) está otimizando para capturar.

Origem: BE-05 da análise de conversão do Instagram
(`menthoros-product/artifacts/instagram-conversao-specs-backend.md`).

## What Changes

Somente `apps/menthoros-backend`. Sem migration.

- `WaitlistServiceImpl.registrar` publica `WaitlistLeadCreatedEvent(waitlistId)` só no caminho
  `Resultado.CRIADO` — nunca em `JA_INSCRITO` (reenvio não deve notificar de novo) nem em
  `IGNORADO` (honeypot).
- `WaitlistNotificationListener`: `@Async` + `@TransactionalEventListener(AFTER_COMMIT)` — só dispara
  depois que a transação que gravou o lead realmente commitou, e roda num executor dedicado e
  limitado (`waitlistNotificationExecutor`), seguindo o padrão já usado para os outros listeners
  assíncronos do repo (`StravaWebhookAsyncConfig`, `WorkoutAnalysisAsyncConfig` etc. — nunca um pool
  compartilhado sem teto).
- E-mail de confirmação ao inscrito, por perfil (`PerfilWaitlist` já existente — só dois valores
  hoje, `TREINADOR`/`ATLETA`; ver "Non-Goals" sobre o terceiro segmento da spec original):
  - `TREINADOR`: o que acontece agora, prazo de resposta, resumo da oferta (60 dias grátis, sem
    cartão, depois R$ 99/mês — mesmo texto de `founderOffer` no front).
  - `ATLETA`: produto é para assessorias, com um link para indicar ao treinador.
- Notificação ao founder (destinatário configurável, `app.founder.notification-email`) a cada lead
  `TREINADOR` criado — nome, faixa de atletas, telefone/WhatsApp (se informado) e origem (UTM).
  Atleta não gera notificação ao founder (não é quem o founder precisa responder rápido).
- Envio com retry (`@Retryable`, mesmo padrão de `WeeklyFocusModelClient` — método extraído para um
  bean próprio, porque `@Retryable` no mesmo método que captura a exceção não funciona, o proxy
  nunca intercepta). Falha de e-mail (esgotado o retry) é logada, nunca propaga — não derruba a
  criação do lead, que já aconteceu antes do evento.
- Três pares de template (`.html`/`.txt`) novos em `templates/email/`, clonando a estrutura de
  `waitlist-docs-site.html` (cabeçalho com logo, corpo, CTA, assinatura) — não a de
  `founding-invite.html`, mais pesada e não necessária aqui.

## Non-Goals

- **Terceiro segmento "outra marca" (`OTHER_BRAND`)**: a spec original pede 3 variantes de e-mail
  por segmento (`QUALIFIED`/`OTHER_BRAND`/`ATLETA`), mas `OTHER_BRAND` depende do campo
  `watchBrand`, que não existe no contrato hoje (`BE-01`, não implementado — ver nota em
  `add-waitlist-value-proposition`). Esta change entrega 2 variantes (`TREINADOR`/`ATLETA`); o
  terceiro e-mail é follow-up de `BE-01`.
- Não adiciona canal WhatsApp — só e-mail, reaproveitando a infra existente (`EmailSender`).
- Não muda `WaitlistController`/`WaitlistInputDto` — o evento nasce dentro do serviço, sem tocar o
  contrato HTTP.
- Não implementa `BE-06` (funil por origem) nem `BE-07` (fonte de fatos para o agente de
  marketing) — mudanças separadas.

## Critérios de aceite

1. **Confirmação por perfil** — Given um `POST /api/v1/waitlist` válido com `perfil=TREINADOR`,
   When a inscrição é criada, Then o e-mail de confirmação de treinador é enviado ao inscrito; o
   mesmo para `perfil=ATLETA` com o e-mail de atleta.
2. **Sem notificação em reenvio** — Given um e-mail já inscrito, When o mesmo formulário é reenviado
   (`Resultado.JA_INSCRITO`), Then nenhum e-mail novo é disparado.
3. **Sem notificação de bot** — Given o honeypot preenchido (`Resultado.IGNORADO`), Then nenhum
   e-mail é disparado.
4. **Founder avisado só para treinador** — Given um lead `TREINADOR` criado, Then uma notificação
   chega ao e-mail configurado em `app.founder.notification-email` com nome, faixa de atletas,
   telefone (se houver) e UTM; Given um lead `ATLETA`, Then nenhuma notificação ao founder é
   disparada.
5. **Falha de e-mail não derruba o cadastro** — Given o `EmailSender` lançando
   `EmailDeliveryException` em toda tentativa, When um lead é criado, Then o `POST` ainda responde
   201/200 normalmente (o lead já foi persistido antes do evento disparar) e o erro fica só no log.
6. **Depois do commit, nunca antes** — Given uma falha que force rollback da transação de
   `registrar` (ex.: violação de integridade não tratada), Then nenhum e-mail é enviado para um lead
   que não existe no banco.

## Métrica de sucesso

Proxy mecânico: os 6 critérios acima, cobertos por teste de unidade do listener (perfil → variante
certa, sem notificação em `JA_INSCRITO`/`IGNORADO`) e um teste de integração que sobe o contexto
real, cria um lead via `POST /api/v1/waitlist` e verifica os e-mails gravados pelo `FileEmailSender`
(ambiente de teste) — mesmo padrão de verificação usado para `founding-invite`, se existir um teste
equivalente a reaproveitar.

## Open Questions & Assumptions

- **Premissa:** o destinatário da notificação ao founder é uma única variável de ambiente
  (`app.founder.notification-email`), não uma lista nem uma tabela — o founder é uma pessoa só hoje.
  Se isso mudar (mais de um founder/operador), vira uma change própria.
- **Premissa:** o conteúdo dos e-mails de confirmação é adaptado, não idêntico, ao texto da spec
  original — a spec foi escrita sem acesso ao código; o tom segue `waitlist-docs-site.html`
  (primeira pessoa do Leandro) para consistência com os e-mails que já existem.
- **Aberto:** se o `FileEmailSender` (ambiente local/test) já expõe alguma forma de inspecionar
  e-mails enviados em teste (arquivo gravado em disco) — confirmar no início da implementação; se
  não, o IT precisa de uma forma de capturar o envio (mock do `EmailSender` via `@MockitoBean` no
  contexto de integração, por exemplo).
- **Aberto:** classifiquei M/Full por envolver um novo mecanismo assíncrono (evento +
  listener + executor dedicado + retry) e por tocar conteúdo de e-mail (decisão de produto/tom,
  não só código) — não por risco técnico alto isoladamente.
- **Pulado deliberadamente:** a revisão `product-reviewer` (lente do coach/North Star) não se
  aplica bem aqui — esta change é operação de crescimento pré-signup (resposta rápida ao lead do
  Instagram), não rotina do treinador já em produto. A métrica de sucesso própria (velocidade de
  resposta ao lead) substitui a lente do coach para este tipo de change, como as demais da série
  BE-0x/FE-0x desta mesma origem.
