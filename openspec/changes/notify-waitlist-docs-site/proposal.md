# notify-waitlist-docs-site — Avisar os treinadores da waitlist que a central de ajuda está no ar

**Tamanho:** S · **Trilha:** Full

> Full porque adiciona coluna em `tb_waitlist` (schema) e um endpoint admin novo (contrato de
> API), mesmo com baixo risco e precedente direto em `FoundingInviteServiceImpl`.

## Status

Nasce do lançamento do site `menthoros-docs` (central de ajuda, manuais do treinador e do
atleta). Sem dependência de outra change aberta.

## Why

Os treinadores que se inscreveram na waitlist (`tb_waitlist`, perfil TREINADOR) hoje só recebem
e-mail quando são convidados individualmente para a turma fundadora
(`FoundingInviteServiceImpl`). Não existe nenhum canal para avisá-los de algo que já está no ar
hoje — a central de ajuda — antes mesmo de terem conta. Um e-mail avisando que o manual existe
reduz dúvida de pré-venda e reforça que o produto está ativo enquanto esperam o convite.

## What Changes

### Backend (`menthoros-backend`)

- **Migration `V99__add_docs_notified_at_to_tb_waitlist.sql`:** `tb_waitlist` ganha
  `docs_notified_at TIMESTAMPTZ NULL` (idempotência — mesmo padrão de `aviso_previo_enviado_em`
  em `tb_mensalidade`). *Número real confirmado no `/implement init` — outras changes podem
  consumir `V99` antes desta.*
- **`WaitlistRepository`** ganha `findAllByPerfilAndDocsNotifiedAtIsNull(PerfilWaitlist perfil)`.
- **`WaitlistDocsNotificationService`** (nova classe, mesmo pacote `services`/`services.impl` de
  `FoundingInviteService`): `notificarSobreDocsSite()` busca os inscritos TREINADOR com
  `docsNotifiedAt == null`, envia um e-mail por inscrito via `EmailSender` existente (template
  `waitlist-docs-site.{html,txt}` em `templates/email/`, renderizado por
  `EmailTemplateRenderer`) e só grava `docsNotifiedAt = Instant.now()` após o envio ter sucesso.
  Falha num envio não interrompe os demais (mesmo padrão do scheduler de aviso de mensalidade);
  loga o erro e deixa a linha elegível para a próxima chamada.
- **`WaitlistDocsNotificationAdminController`**: `POST /api/admin/waitlist/notificar-docs`,
  tenant-less, `@PreAuthorize("hasRole('ADMIN')")` — mesmo estilo de
  `FoundingInviteAdminController`. Sem corpo. Resposta `200` com contagem
  `{ elegiveis, enviados, falhas }`. Chamado manualmente por curl/Bruno, sem tela — e também serve
  para "pegar" treinadores que entrarem na waitlist depois do primeiro disparo, já que só processa
  quem ainda não foi notificado.

### Frontend / `menthoros-docs`

Nenhuma mudança — este site já está publicado (ver PR #1 em `menthoros-docs`); a change aqui é
só o aviso aos inscritos.

## Capabilities

### New Capabilities

- `waitlist-docs-notification`: endpoint admin que avisa por e-mail, uma única vez por inscrito,
  os treinadores da waitlist de que a central de ajuda está disponível.

## Alternativas consideradas

**Por que não um script avulso** (export CSV de `tb_waitlist` + envio manual, sem tocar o
backend de produção)? É a alternativa mais barata e foi levantada no review de produto. Decisão:
**endpoint reutilizável**, não script de uso único, por dois motivos que pesam mais que o custo
de engenharia (uma migration + repository + service + controller + 2 templates, todos pequenos e
seguindo precedente direto):

1. A waitlist continua recebendo inscritos TREINADOR depois do primeiro disparo — um script
   resolve hoje, mas cada novo inscrito futuro exigiria rodar o script nativo de novo (acesso a
   produção, rodar localmente contra o banco), enquanto o endpoint cobre isso de graça, do mesmo
   jeito que `FoundingInviteAdminController` já é chamado quando necessário, via Apidog.
2. A dívida de schema (`docs_notified_at`, uma coluna nullable) é mínima e aditiva — não é o tipo
   de dívida que se acumula de forma problemática; se um padrão de "múltiplas campanhas"
   aparecer no futuro, uma tabela genérica de notificação é um refactor isolado, não algo que
   precisa ser antecipado agora.

A disparidade "produto não toca a rotina do coach" (apontada no review) é real e aceita: esta
change é operacional/growth, não product capability — `New Capabilities` abaixo é nomeada assim
por convenção do OpenSpec (toda mudança de comportamento do sistema entra nesse formato), não
porque seja algo que o treinador use dentro do produto.

## Fora do escopo

- Notificar inscritos com `perfil = ATLETA`.
- Qualquer agendamento automático (scheduler) — disparo é manual, sob demanda do founder.
- Link de descadastro / preferências de e-mail (mesma decisão já tomada em
  `add-aviso-mensalidade` para volume baixo e remetente já estabelecido).
- Mudar o fluxo de convite de turma fundadora (`FoundingInvite*`) — classes distintas, sem reuso
  de token/convite.

## Critérios de aceite

1. **Given** um inscrito TREINADOR na waitlist nunca notificado, **when** o admin chama o
   endpoint, **then** ele recebe um e-mail avisando que a central de ajuda está no ar, com link
   para `https://docs.menthoros.com`, e `docs_notified_at` é gravado.
2. **Given** o endpoint é chamado de novo sem novos inscritos, **when** roda, **then** nenhum
   e-mail é reenviado (idempotência) e a resposta mostra `enviados: 0`.
3. **Given** um inscrito com `perfil = ATLETA`, **then** ele nunca é incluído na busca nem
   recebe e-mail.
4. **Given** falha do `EmailSender` para um inscrito (SMTP fora do ar), **then** os demais
   inscritos elegíveis ainda são processados, a coluna não é gravada para o que falhou, e a
   resposta reflete a falha em `falhas`.
5. **Given** nenhum inscrito TREINADOR pendente, **when** o endpoint é chamado, **then** retorna
   `200` com `elegiveis: 0, enviados: 0, falhas: 0`.
6. **Given** um usuário autenticado sem role ADMIN, **when** chama o endpoint, **then** recebe
   `403`.
7. **Given** um novo treinador se inscreve na waitlist depois do primeiro disparo, **when** o
   admin chama o endpoint de novo, **then** só esse novo inscrito recebe e-mail.
8. **Given** duas chamadas concorrentes ao endpoint (ex.: duplo clique no Apidog), **when** ambas
   processam o mesmo inscrito elegível, **then** só uma envia o e-mail — a outra encontra a linha
   já reivindicada e pula (claim atômico, design D3).

## Métrica de sucesso

Não há métrica de rotina do treinador aqui (é pré-signup, fora do produto) — a métrica é
operacional: **100% dos inscritos TREINADOR elegíveis notificados numa única chamada**, sem
duplicata em reenvios (checável direto em `tb_waitlist.docs_notified_at` após o disparo).

## Riscos e mitigações

Pre-mortem adversarial rodado (Codex, 2026-10-05) sobre a primeira versão deste design — 3
achados altos, dois corrigidos no design (D3), um documentado abaixo como herdado e fora de
escopo (D7).

- **Corrida entre chamadas concorrentes duplicando o lote inteiro** (achado Codex #1): a versão
  original gravava `docsNotifiedAt` só depois do envio, então duas chamadas simultâneas liam a
  mesma lista de elegíveis e ambas enviavam. **Corrigido:** claim atômico por `UPDATE`
  condicional antes do envio (design D3) — só uma chamada ganha cada linha.
- **SMTP aceita mas a confirmação se perde** (achado Codex #2, residual): se `send()` for aceito
  pelo transporte mas a exceção/sucesso não voltar de forma confiável, o retry pode duplicar um
  e-mail já entregue. **Aceito como risco residual** (ver design D3) — o mesmo tipo de exposição
  já existe em `FoundingInviteServiceImpl` sem endurecimento; não é proporcional resolver
  exactly-once para um aviso informativo de volume baixo.
- **`ADMIN` desativado localmente ainda consegue chamar o endpoint** (achado Codex #3, herdado):
  `JwtTenantFilter` isenta todo `/api/admin/**` da checagem de `Usuario.ativo=false`. Confirmado
  que `FoundingInviteAdminController` tem o mesmo gap hoje, em produção. **Não corrigido nesta
  change** (design D7) — é um gap sistêmico do filtro compartilhado, não desta feature; corrigir
  aqui sozinho deixaria o outro endpoint admin exposto do mesmo jeito. Recomenda-se uma change de
  hardening separada cobrindo os dois.
- **E-mail duplicado por reenvio manual do admin** (clique duplo humano, não concorrência de
  requisição): coberto pelo mesmo claim atômico acima.
- **Sender reputacional:** disparo único, volume = tamanho atual da waitlist de treinadores
  (baixo); mesmo remetente já usado em convites.
- **E-mail errado/desatualizado:** mesma fonte (`tb_waitlist.email`) já usada no convite de
  fundador — sem validação adicional nesta change.

## Open Questions & Assumptions

- **Premissa:** a URL da central de ajuda é `https://docs.menthoros.com` (confirmado em
  `astro.config.mjs` do `menthoros-docs`, `site: 'https://docs.menthoros.com'`). Confirmar que o
  domínio já está publicamente acessível antes de disparar o e-mail.
- **Premissa:** o `SmtpEmailSender` está ativo no ambiente onde o endpoint será chamado
  (produção) — confirmar em `/implement init`, mesma premissa de `add-aviso-mensalidade`.
- **Aberto:** o endpoint fica para sempre no código (reutilizável a cada novo inscrito) ou é
  removido após o disparo inicial? Assumido: **fica** — é barato de manter e cobre inscritos
  futuros até a waitlist fechar.
