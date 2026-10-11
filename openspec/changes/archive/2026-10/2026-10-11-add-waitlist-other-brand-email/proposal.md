**Tamanho:** XS · **Trilha:** Fast

## Why

`add-waitlist-lead-notifications` (BE-05, PR #174, já mergeado) entregou confirmação por e-mail
para os dois segmentos que existiam na época — `TREINADOR`/`PROPRIETARIO` (tratados como
"treinador") e `ATLETA` — e deixou `OTHER_BRAND` como Non-Goal explícito, porque o campo
`watchBrand` ainda não existia no contrato. `expand-waitlist-access-contract` (BE-01, PR #177, já
mergeado) adicionou `watchBrand` e `WaitlistSegment.derivar()` já deriva `OTHER_BRAND` quando o
relógio não é Garmin — mas `WaitlistNotificationListener.enviarConfirmacao` ainda não lê esse
segmento: hoje um lead treinador/proprietário com relógio concorrente recebe o e-mail genérico de
`QUALIFIED`, que promete os próximos passos como se o relógio dele já fosse suportado.

Origem: BE-05 da análise de conversão do Instagram
(`menthoros-product/artifacts/instagram-conversao-specs-backend.md`), item remanescente do
checklist de entrega.

## What Changes

Somente `apps/menthoros-backend`. Sem migration, sem mudança de contrato HTTP — `watchBrand` e o
segmento derivado já existem.

- `WaitlistNotificationListener.enviarConfirmacao`: para leads `isTreinadorOuProprietario()`,
  bifurca pelo segmento derivado (`WaitlistSegment.derivar(lead.getPerfil(), lead.getWatchBrand())`)
  — `QUALIFIED` continua no e-mail atual (`waitlist-confirmation-treinador`), `OTHER_BRAND` passa a
  usar um par de template novo (`waitlist-confirmation-other-brand.html`/`.txt`), reconhecendo a
  limitação (hoje só Garmin) e prometendo aviso quando a marca entrar. `ATLETA` não muda — o
  segmento `ATLETA` do enum não depende de `watchBrand`.
- Um novo par de template em `templates/email/`, clonando a estrutura dos já existentes
  (`waitlist-confirmation-treinador.html`/`.txt`), com o texto do segmento `OTHER_BRAND` da spec
  original (seção BE-05).
- `notificarFounder` não muda — a spec original só pede notificação ao founder para lead
  `QUALIFIED`; `OTHER_BRAND` já cai fora da notificação hoje, porque a decisão existente é baseada
  em `isTreinadorOuProprietario()`, não no segmento. **Risco aceito, documentado em "Open
  Questions"** abaixo, não resolvido nesta change — ver seção.

## Non-Goals

- Não muda o contrato HTTP (`WaitlistController`/`WaitlistInputDto`/`WaitlistOutputDto`) — segmento
  e `watchBrand` já existem desde BE-01.
- Não adiciona canal WhatsApp.
- Não implementa BE-06 (funil por origem) nem BE-07 (fonte de fatos) — mudanças separadas.
- Não revisita a decisão de quem recebe notificação ao founder além do que está em "Open
  Questions" — se precisar mudar, é follow-up.

## Critérios de aceite

1. **E-mail correto por segmento** — Given um lead `TREINADOR`/`PROPRIETARIO` com `watchBrand`
   diferente de `GARMIN`, When o evento `WaitlistLeadCreatedEvent` é processado, Then o e-mail
   enviado é o de `OTHER_BRAND` (não o de `QUALIFIED`).
2. **Sem regressão nos segmentos existentes** — Given um lead `TREINADOR`/`PROPRIETARIO` com
   `watchBrand=GARMIN`, Then o e-mail continua sendo o de `QUALIFIED`; Given um lead `ATLETA`
   (qualquer `watchBrand`), Then o e-mail continua sendo o de atleta, sem alteração de
   comportamento.
3. **Templates renderizam sem erro** — o novo par de template é processado por
   `EmailTemplateRenderer` com as mesmas variáveis (`nome`, `assetsUrl`) sem placeholder não
   resolvido.

## Métrica de sucesso

Proxy mecânico: os 3 critérios acima cobertos por teste de unidade do listener (segmento →
template certo) — mesmo padrão de `WaitlistNotificationListenerTest` já existente, adicionando o
caso `OTHER_BRAND`.

## Open Questions & Assumptions

- **Premissa:** o texto do e-mail `OTHER_BRAND` segue o tom dos templates existentes (primeira
  pessoa, mesmo cabeçalho/assinatura) — não é um novo estilo visual.
- **Aberto, aceito nesta change:** `notificarFounder` continua disparando para qualquer lead
  `isTreinadorOuProprietario()`, inclusive `OTHER_BRAND` — a spec original (BE-05) só pede
  notificação para `QUALIFIED`. Manter o comportamento atual (notificar sempre) é a opção mais
  segura operacionalmente (o founder prefere saber de um lead mesmo sem Garmin, para decidir se
  vale contato manual) e evita tocar em lógica já testada/em produção por uma distinção que a
  spec não justifica com um critério de aceite próprio. Revisitar como change própria se o founder
  achar o volume de notificação de `OTHER_BRAND` incômodo.
- **Pulado deliberadamente:** `product-reviewer` (lente do coach/North Star) não se aplica — esta
  é operação de crescimento pré-signup, mesmo tratamento dado a `add-waitlist-lead-notifications`.
