# add-coach-settings-page — Página de Perfil e Privacidade do Coach

**Tamanho:** XS · **Trilha:** Fast

> Fast track: repo único (frontend) mais um campo adicional em DTO já existente. Sem mudança de
> schema, sem nova tabela, sem risco de multi-tenancy além do já coberto pelo `GET /users/me`.

**Status:** proposta
**Criado:** 2026-07-31
**Origem:** extraída de `add-coach-lgpd-consent` (decisão de decomposição em 2026-07-31)

## Problema

O coach não tem onde ver os próprios dados nem exercer direitos básicos de titular previstos na
LGPD: correção de dados, contato com o DPO e solicitação de exclusão. Hoje não existe nenhuma
tela de perfil ou configurações no shell do coach.

`add-coach-lgpd-consent` registra o consentimento, mas não dá ao coach nenhuma superfície para
consultar ou agir sobre ele depois.

## Escopo

1. **Página `CoachSettingsPage`** na rota `/coach/settings`
2. **Seção "Dados pessoais"** — nome, e-mail e avatar (somente leitura; fonte da verdade é o Keycloak)
3. **Seção "Privacidade"** — link para a Política de Privacidade, data do aceite LGPD, contato do
   DPO e ação de solicitar exclusão de conta (via `mailto:`)
4. **Item "Configurações"** no `CoachSidebar`
5. **Expor `lgpdConsentedAt`** no `UsuarioMeOutputDto` (backend), para exibir a data do aceite

## Fora do escopo

- **Edição** de nome/e-mail/avatar — a fonte da verdade é o Keycloak; edição exige fluxo de
  escrita no Admin API (change própria)
- Fluxo automatizado de exclusão de conta (o `mailto:` é o processo manual da v1)
- Preferências de notificação, tema ou qualquer outra configuração de produto
- Configurações da assessoria (ver `assessoria-settings-ui`)

## Critérios de aceite

**CA1 — Acesso pela sidebar**
> **Dado** um coach autenticado e com consentimento registrado
> **Quando** ele clica em "Configurações" no `CoachSidebar`
> **Então** navega para `/coach/settings` e a página renderiza as duas seções.

**CA2 — Dados pessoais em somente leitura**
> **Dado** a página aberta
> **Quando** ela carrega `GET /api/v1/users/me`
> **Então** exibe nome, e-mail e avatar do coach, todos não editáveis.

**CA3 — Data do aceite é exibida**
> **Dado** um coach com `lgpdConsentedAt` preenchido
> **Quando** ele abre a seção "Privacidade"
> **Então** vê a data do aceite formatada em pt-BR.

**CA4 — Ausência de aceite não quebra a página**
> **Dado** um coach com `lgpdConsentedAt` nulo
> **Quando** ele abre a seção "Privacidade"
> **Então** a seção renderiza sem erro, indicando que não há aceite registrado.

**CA5 — Ações de privacidade funcionam**
> **Dado** a seção "Privacidade"
> **Quando** o coach usa os links
> **Então** a Política aponta para `/privacidade` e as ações de DPO e exclusão abrem `mailto:`
> para o endereço do DPO, a de exclusão com assunto pré-preenchido.

**CA6 — Responsividade**
> **Dado** a página em viewport pequeno
> **Quando** ela renderiza
> **Então** as seções empilham sem overflow horizontal.

## Métrica de sucesso

- **Autonomia do coach:** solicitações de "quais dados vocês têm de mim?" e "como excluo minha
  conta?" passam a ser resolvidas na própria tela — meta de **zero** tickets desse tipo chegando
  ao suporte por canal informal após o release.
- **Conformidade:** o coach consegue, sem intermediário, (a) ler a Política, (b) ver quando
  consentiu e (c) iniciar a exclusão — os três direitos básicos cobertos em uma tela.

## Open Questions & Assumptions

**Premissas:**

- **A1.** `GET /api/v1/users/me` já retorna `nome`, `email` e a assessoria; o avatar vem de
  `Usuario.avatarUrl` e precisa ser adicionado ao DTO se ainda não estiver exposto — **conferir na
  implementação**.
- **A2.** O endereço do DPO é `contato@menthoros.com` — **confirmado e definitivo** (caixa criada;
  já é o endereço publicado na Política de Privacidade, `PrivacidadePage.tsx:7`). Não é
  placeholder.
- **A3.** Dados pessoais são somente leitura nesta v1 — o Keycloak é a fonte da verdade e
  escrever nele exige Admin API.
- **A4.** A rota `/privacidade` já existe (`PrivacidadePage`) e é pública.

**Em aberto:**

- **Q1.** O `mailto:` é aceitável como processo de exclusão para a v1, ou o jurídico exige um
  registro rastreável (ticket/tabela) desde o início?
- ~~**Q2.** O e-mail do DPO deve ser um endereço dedicado?~~ — **resolvida em 2026-07-31:**
  `contato@menthoros.com` é o canal oficial, caixa já criada. Sem pendência.

## Impacto

- **Backend:** `UsuarioMeOutputDto` (+`lgpdConsentedAt`, e `avatarUrl` se ausente) +
  mapeamento no `UsuarioServiceImpl`
- **Frontend:** `CoachSettingsPage` (nova), `CoachSidebar` (+1 item), `App.tsx` (+1 rota),
  cliente OpenAPI regenerado

## Dependências

- **Depende de:** `add-coach-lgpd-consent` — os campos `lgpdConsentGranted`/`lgpdConsentedAt` e a
  migração `V73` nascem lá. Esta change **não** pode entrar antes.
- **Destrava:** nenhuma.
