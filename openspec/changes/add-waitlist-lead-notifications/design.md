# Design — add-waitlist-lead-notifications

## D1 — Evento, não chamada direta

`WaitlistServiceImpl.registrar` publica `WaitlistLeadCreatedEvent(UUID waitlistId)` em vez de
chamar um `WaitlistNotificationService` direto. Dois motivos:

1. **Separação de responsabilidade:** `registrar` já faz honeypot, validação, dedup e persistência —
   acoplar envio de e-mail ali misturaria "salvar o lead" com "avisar gente", e um erro de template
   (`IllegalArgumentException` do `EmailTemplateRenderer`) não pode virar 500 numa rota que já
   persistiu com sucesso.
2. **Consistência com o resto do repo:** outros fluxos "algo aconteceu, reage quem quiser"
   (`PlanoAprovadoEvent`, `SemanaEncerradaEvent`, `TreinoRegistradoEvent`) já usam
   `ApplicationEventPublisher` + listener assíncrono. Seguir o padrão em vez de inventar um novo.

O evento carrega só o `waitlistId` — o listener recarrega a entidade. Não o objeto completo: o
evento atravessa uma fronteira assíncrona (thread diferente), e passar uma entidade JPA detached
por `@Async` é a classe de bug de "lazy loading fora da sessão" que o resto do repo evita.

## D2 — `AFTER_COMMIT` com `fallbackExecution = true`

`WaitlistServiceImpl.registrar` **não tem `@Transactional`** (comentário já existente na classe:
"cada chamada ao repositório roda na própria transação", de propósito, para capturar a corrida do
índice único sem marcar uma transação externa como rollback-only). Isso importa para o listener:
`@TransactionalEventListener` só adia a execução quando existe uma sincronização de transação
*ativa* no momento da publicação do evento — sem transação ambiente (o caso de hoje), o listener
**nunca dispara**, silenciosamente, a menos que `fallbackExecution = true` esteja setado.

Decisão: `@TransactionalEventListener(phase = AFTER_COMMIT, fallbackExecution = true)`. Hoje, sem
transação ambiente, o evento publicado logo após `saveAndFlush()` já encontra a linha persistida
(flush síncrono, retorno só depois de gravado) — o fallback roda imediato, como um `@EventListener`
comum, e isso já é "depois que a linha existe", que é a garantia que importa. Se `registrar` um dia
ganhar `@Transactional` (fora de escopo desta change), o mesmo listener passa a esperar o commit de
verdade, sem precisar mudar uma linha — é por isso que `fallbackExecution = true` fica explícito em
vez de usar `@EventListener` simples, que seria suficiente só para a realidade de hoje.

## D3 — Executor dedicado, sem `@Transactional` no listener

`@Async("waitlistNotificationExecutor")`, executor próprio (`ThreadPoolTaskExecutor` pequeno,
mesmo padrão de `StravaWebhookAsyncConfig`/`WorkoutAnalysisAsyncConfig`) — nunca o pool `@Async`
default compartilhado.

**Sem `@Transactional(REQUIRES_NEW)` no listener**, ao contrário de `WorkoutAnalysisListener`: o
backlog do produto já registra `refactor-async-llm-listeners-outside-transaction` como achado — a
combinação `@Async` + `@Transactional(REQUIRES_NEW)` segura conexões do pool Hikari durante
chamada externa lenta (lá, LLM; aqui, SMTP). O listener só faz uma leitura simples
(`WaitlistRepository.findById`, fora de transação explícita — leitura solta não precisa) e duas
chamadas de rede (e-mail ao lead, e-mail ao founder). Não precisa de transação nenhuma.

## D4 — Retry isolado em bean próprio

`@Retryable` no mesmo método que também captura a exceção não funciona — o proxy do Spring não
intercepta chamada interna (`this.metodo()`), e o retry vira código morto. Mesmo problema já
documentado em `WeeklyFocusModelClient`. Por isso o envio com retry vive num bean dedicado
(`WaitlistEmailSender`), chamado pelo listener — nunca um método privado do próprio listener.

```java
@Component
class WaitlistEmailSender {
    @Retryable(retryFor = EmailDeliveryException.class, maxAttempts = 3,
               backoff = @Backoff(delay = 2000, multiplier = 2))
    void enviar(EmailMessage mensagem) {
        emailSender.send(mensagem);
    }
}
```

O listener chama `waitlistEmailSender.enviar(...)` dentro de um `try/catch` por e-mail — se o de
confirmação ao lead falhar (retry esgotado), a notificação ao founder ainda tenta (são dois
`try/catch` independentes, não um bloco só).

## D5 — Segmento hoje é só `PerfilWaitlist`, não o segmento completo da spec

A spec original (BE-01/BE-05) descreve 3 segmentos (`QUALIFIED`/`OTHER_BRAND`/`ATLETA`), derivados
de perfil **e** marca de relógio. O campo de marca (`watchBrand`) não existe — `BE-01` não foi
implementado. Esta change usa o único discriminador real hoje, `PerfilWaitlist` (`TREINADOR`/
`ATLETA`), e trata todo `TREINADOR` como "qualificado" (hoje só há Garmin na primeira turma, então
a aproximação é razoável até `BE-01` chegar). Quando `watchBrand` existir, o listener ganha um
`switch` a mais — a estrutura de evento + listener não muda, só a lógica de qual template escolher.

## D6 — Templates clonam `waitlist-docs-site.html`, não `founding-invite.html`

`founding-invite.html` tem CTA com fallback VML para Outlook (`<v:roundrect>`) e layout mais denso —
apropriado para um e-mail com ação crítica (ativar convite). Os três novos e-mails são informativos,
sem CTA obrigatório (exceto o de atleta, que tem um link de indicação, mais simples que o convite).
`waitlist-docs-site.html` já é a estrutura mínima certa: cabeçalho, eyebrow, título, corpo, rodapé.
