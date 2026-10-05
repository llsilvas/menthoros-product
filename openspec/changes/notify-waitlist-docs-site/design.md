# Design — notify-waitlist-docs-site

## Context

`Waitlist` (`tb_waitlist`, entidade global sem tenant) guarda os inscritos pré-signup, com
`perfil` (`TREINADOR`/`ATLETA`) e `email`. `WaitlistRepository` hoje só tem
`existsByEmailNormalized`.

O envio de e-mail é feito por `EmailSender.send(EmailMessage)` — `SmtpEmailSender` em
produção, `FileEmailSender` em dev/test (escolhido por `@Profile`). `EmailMessage` é um record
imutável `(to, subject, html, text)` com validação própria (sem CRLF, não-blank). Templates
vivem em `templates/email/*.{html,txt}` e são renderizados por
`EmailTemplateRenderer.render(nome, Map<String,Object>)` com placeholders `{{chave}}` — HTML
escapado, texto puro, falha alto (`IllegalArgumentException`) se faltar uma chave usada no
template.

O precedente direto é `FoundingInviteServiceImpl.invite(...)`: busca o inscrito, monta
`EmailMessage` com `Map.of(...)`, chama `emailSender.send(...)` **fora de transação**, e só
persiste o resultado (`sentAt`) depois do envio confirmado. O controller
(`FoundingInviteAdminController`) fica em `/api/admin/**`, tenant-less (isento no
`JwtTenantFilter`), `@PreAuthorize("hasRole('ADMIN')")`, chamado manualmente.

Esta change não reusa `FoundingInvite*` (token, convite, Keycloak) — é só um aviso informativo,
sem ação de conta.

## Goals / Non-Goals

**Goals:** um endpoint idempotente que avisa por e-mail todo TREINADOR da waitlist ainda não
avisado; falha isolada por inscrito; resposta com contagem.

**Non-Goals:** agendamento automático; descadastro; notificar ATLETA; qualquer UI.

## Decisões

### D1 — Coluna de idempotência, não tabela de log

`docs_notified_at TIMESTAMPTZ NULL` direto em `tb_waitlist`, igual ao padrão de
`aviso_previo_enviado_em`/`aviso_vencimento_enviado_em` em `tb_mensalidade`
(`add-aviso-mensalidade`). Alternativa descartada: tabela `tb_waitlist_notificacao` separada —
over-engineering para um disparo único por inscrito; se no futuro houver uma segunda campanha,
essa tabela pode nascer então.

### D2 — Query: `findAllByPerfilAndDocsNotifiedAtIsNull`

Derived query simples no `WaitlistRepository`, sem paginação — o volume de uma waitlist
pré-lançamento é pequeno (dezenas, não milhares). Se crescer, paginação é um ajuste isolado
nesta mesma query, sem mudar o contrato do endpoint.

### D3 — `WaitlistDocsNotificationService`, classe nova (não método em `WaitlistServiceImpl`)

`WaitlistServiceImpl` hoje só lida com `registrar` (signup público, honeypot). Misturar uma
operação administrativa de notificação em massa no mesmo service acopla dois públicos
diferentes (anônimo vs. admin). Mesma separação que `FoundingInviteService` já faz na prática
(serviço próprio por capability admin).

**Revisão pós pre-mortem (Codex, 2026-10-05) — claim atômico antes do envio, não depois.** O
desenho original gravava `docsNotifiedAt` só *depois* do `emailSender.send(...)` — igual ao
`FoundingInviteServiceImpl.invite`, que resolve a corrida com uma `UNIQUE` no insert do
`FoundingInvite`. Aqui não há insert novo por chamada (é um `UPDATE` em linha existente), então
esse padrão não protege: duas chamadas concorrentes carregam a mesma lista de elegíveis (nenhuma
viu a outra gravar ainda) e **as duas enviam para todo o lote**. A correção é reivindicar a linha
com um `UPDATE` condicional *antes* de enviar — atômico no Postgres, só uma chamada concorrente
ganha cada linha — e **reverter a reivindicação se o envio falhar**, para a linha continuar
elegível no próximo disparo:

```java
public interface WaitlistRepository extends JpaRepository<Waitlist, UUID> {

    boolean existsByEmailNormalized(String emailNormalized);

    List<Waitlist> findAllByPerfilAndDocsNotifiedAtIsNull(PerfilWaitlist perfil);

    // Claim atômico: só a chamada que ganha a corrida recebe rowsUpdated == 1.
    @Modifying
    @Query("UPDATE Waitlist w SET w.docsNotifiedAt = :agora WHERE w.id = :id AND w.docsNotifiedAt IS NULL")
    int reivindicar(@Param("id") UUID id, @Param("agora") Instant agora);

    // Reverte a reivindicação se o envio falhar, liberando a linha para o próximo disparo.
    @Modifying
    @Query("UPDATE Waitlist w SET w.docsNotifiedAt = NULL WHERE w.id = :id AND w.docsNotifiedAt = :agora")
    void liberar(@Param("id") UUID id, @Param("agora") Instant agora);
}
```

```java
@Slf4j
@Service
public class WaitlistDocsNotificationServiceImpl implements WaitlistDocsNotificationService {

    private final WaitlistRepository waitlistRepository;
    private final EmailSender emailSender;
    private final EmailTemplateRenderer templates;
    private final Clock clock;
    private final String docsUrl; // @Value("${app.docs.url}")

    @Override
    public WaitlistDocsNotificationResultDto notificar() {
        List<Waitlist> elegiveis =
                waitlistRepository.findAllByPerfilAndDocsNotifiedAtIsNull(PerfilWaitlist.TREINADOR);

        int enviados = 0, falhas = 0;
        for (Waitlist inscrito : elegiveis) {
            Instant agora = Instant.now(clock);
            // Reivindicação atômica: se outra chamada concorrente já pegou esta linha
            // (rowsUpdated == 0), pula sem enviar de novo — resolve a corrida entre chamadas.
            if (waitlistRepository.reivindicar(inscrito.getId(), agora) == 0) {
                continue;
            }
            try {
                emailSender.send(mensagem(inscrito));
                enviados++;
            } catch (RuntimeException e) {
                // Captura RuntimeException, não só EmailDeliveryException: qualquer falha aqui
                // (SMTP ou um erro inesperado) não pode derrubar o lote nem perder a contagem.
                log.warn("Falha ao notificar inscrito da waitlist sobre a central de ajuda: waitlistId={}",
                        inscrito.getId(), e);
                waitlistRepository.liberar(inscrito.getId(), agora); // libera para o próximo disparo
                falhas++;
            }
        }
        return new WaitlistDocsNotificationResultDto(elegiveis.size(), enviados, falhas);
    }

    private EmailMessage mensagem(Waitlist inscrito) {
        Map<String, Object> valores = Map.of(
                "nome", inscrito.getNome(),
                "docsUrl", docsUrl,
                "assetsUrl", frontendUrl + "/email"); // mesmo host de assets do founding-invite
        return new EmailMessage(inscrito.getEmail(), SUBJECT,
                templates.render("waitlist-docs-site.html", valores),
                templates.render("waitlist-docs-site.txt", valores));
    }
}
```

**Deliberadamente sem `@Transactional`** no método `notificar()`: cada `reivindicar`/`liberar` é
um `UPDATE` atômico próprio (autocommit), não uma escrita que precise ser revertida junto com
outras. Um `@Transactional` envolvendo o loop inteiro arriscaria reverter reivindicações já
confirmadas de inscritos cujo e-mail já saiu, se uma exceção no meio do caminho subisse sem ser
capturada.

**Risco residual aceito (não resolvido por este design):** se o SMTP aceitar a mensagem mas a
confirmação se perder antes de `emailSender.send(...)` retornar (ex.: timeout de rede após o
aceite), o código entra no `catch`, libera a linha e o próximo disparo reenvia — duplicando um
e-mail já de fato entregue. Isso é inerente a "at-least-once" sem idempotency key no transporte
SMTP; o `FoundingInviteServiceImpl` tem a mesma exposição teórica e nunca foi endurecido contra
ela. Dado o volume (uma waitlist pequena, pré-lançamento) e o tipo de conteúdo (aviso informativo,
não cobrança), aceitar esse risco residual é proporcional — engenheirar uma garantia exactly-once
aqui pesaria mais que o problema que resolve.

### D4 — Endpoint: bulk, não per-id

Diferente de `FoundingInviteAdminController` (`/waitlist/{id}/convite`, um inscrito por
chamada), aqui o endpoint processa **todos os elegíveis de uma vez**:
`POST /api/admin/waitlist/notificar-docs`, sem `{id}` e sem corpo. Alternativa descartada: expor
`/waitlist/{id}/notificar-docs` per-inscrito, exigindo N chamadas do founder para N inscritos —
sem motivo, já que a notificação é idêntica para todos e não há necessidade de granularidade por
inscrito (ao contrário do convite de fundador, que é uma decisão individual do founder sobre
quem convidar).

```java
@RestController
@RequestMapping("/api/admin/waitlist/notificar-docs")
@RequiredArgsConstructor
@Tag(name = "waitlist-docs-notification-admin", description = "Aviso em massa aos treinadores da waitlist sobre a central de ajuda (staff)")
public class WaitlistDocsNotificationAdminController {

    private final WaitlistDocsNotificationService service;

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<WaitlistDocsNotificationResultDto> notificar() {
        return ResponseEntity.ok(service.notificar());
    }
}
```

### D5 — Template de e-mail

Novo `waitlist-docs-site.{html,txt}`, mesma estrutura de tabela/estilo de `founding-invite.html`
(cabeçalho navy `#0B1220` + faixa lime `#C6E24A`, mesmas imagens `{{assetsUrl}}/menthoros-*.png`,
CTA único). Placeholders: `nome`, `docsUrl`, `assetsUrl`. Corpo curto — isto é um aviso, não um
pitch: "a central de ajuda já está no ar, com o manual do treinador e do atleta" + botão "Ver a
central de ajuda" apontando para `{{docsUrl}}`.

### D7 — Gap de `ADMIN` inativo em `/api/admin/**`: herdado, fora de escopo

Pre-mortem (Codex, 2026-10-05) confirmado no código: `JwtTenantFilter.shouldNotFilter` isenta
todo prefixo `/api/admin/` (linha 76) **antes** da checagem `Usuario.ativo=false` (linha 145) —
que só roda para requisições que passam pelo filtro. Resultado: um `ADMIN` desativado
localmente, mas com JWT do Keycloak ainda válido, consegue chamar qualquer endpoint
`/api/admin/**`, inclusive este. Confirmado que `FoundingInviteAdminController` (já em produção)
tem exatamente a mesma exposição — não é um gap introduzido por esta change.

**Decisão: não corrigir aqui.** Corrigir no filtro compartilhado afeta todo `/api/admin/**` de
uma vez (comportamento certo), mas é uma mudança de segurança transversal que merece sua própria
change, com os dois endpoints admin existentes re-testados juntos — misturá-la numa change de
"avisar a waitlist" infla o escopo e o risco de revisão. Registrado como risco conhecido em
`proposal.md`; recomendação é abrir uma change de hardening separada
(`harden-admin-active-staff-check` ou similar) cobrindo os dois controllers.

### D6 — Config: `app.docs.url`

Nova property `@Value("${app.docs.url}")`, valor `https://docs.menthoros.com` em
`application.yml`/`application-cloud.yml` (mesmo padrão de `app.frontend.url` já usado por
`FoundingInviteServiceImpl`). Evita hardcode da URL no service.

## Riscos

Ver proposal.md. Nenhum risco novo além do já coberto pelo precedente de
`FoundingInviteServiceImpl`/`add-aviso-mensalidade`.
