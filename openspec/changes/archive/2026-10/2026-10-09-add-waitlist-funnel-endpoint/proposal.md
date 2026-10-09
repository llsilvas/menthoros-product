**Tamanho:** S · **Trilha:** Fast

## Why

Sem medição, não há como saber quais posts do Instagram geram solicitações qualificadas — a única
forma de responder "quantas pessoas o post X trouxe" hoje é abrir o banco direto. UTM já é
capturado desde a inscrição (`WaitlistInputDto.utmSource/utmMedium/utmCampaign/utmContent`), mas
nada agrega esse dado.

Origem: BE-06 da análise de conversão do Instagram
(`menthoros-product/artifacts/instagram-conversao-specs-backend.md`).

## What Changes

Somente `apps/menthoros-backend`. Sem migration.

- `GET /api/admin/waitlist/funnel`, protegido por `@PreAuthorize("hasRole('ADMIN')")` (mesmo padrão
  de `FoundingInviteAdminController`, rota `/api/admin/**` já isenta do `JwtTenantFilter`).
- Agrupa por `(utmSource, utmContent)` — a dupla que identifica um post/anúncio específico, mais
  granular que só `utmSource`. Para cada grupo: `total` (inscrições), `qualified` (perfil
  `TREINADOR` — aproximação até `BE-01` existir e trazer `watchBrand`, mesma premissa de
  `add-waitlist-lead-notifications`), `invited` (tem convite de turma fundadora, aberto ou
  convertido) e `active` (convite convertido em assessoria).
- Correlação feita em memória: `WaitlistRepository.findAll()` + `FoundingInviteRepository.findAll()`
  — volume da waitlist é pequeno (dezenas a centenas de linhas), e uma `JOIN`/subquery SQL
  complexa não paga o custo de manutenção nesta escala. Mesma filosofia de
  `FoundersSlotsServiceImpl` (contagem simples em vez de SQL agregado).
- Filtro opcional de período (`desde`/`ate`, `ISO LocalDate`) sobre `Waitlist.createdAt`.

## Non-Goals

- Lista de leads individuais com filtro por status/segmento, e export CSV — a spec original pede os
  dois, mas o critério de aceite ("responder quantas solicitações qualificadas o post X gerou com
  uma consulta") já é satisfeito pela agregação sozinha. Lista+CSV é follow-up se a operação diária
  precisar.
- Não implementa papel `ADMIN` novo nem fluxo de atribuição — reaproveita o mesmo check
  (`hasRole('ADMIN')`) já usado por `FoundingInviteAdminController`.
- Não muda o contrato de `POST /api/v1/waitlist` nem a captura de UTM, já entregues.

## Critérios de aceite

1. **Agregação por UTM** — Given 3 inscrições com `utmSource=instagram, utmContent=bio-link` (2
   `TREINADOR`, 1 `ATLETA`) e 2 com `utmSource=instagram, utmContent=post-fixado` (ambas
   `TREINADOR`), When `GET /api/admin/waitlist/funnel`, Then a resposta tem dois grupos com
   `total`/`qualified` corretos por grupo.
2. **Convite conta como `invited`** — Given um inscrito `TREINADOR` com convite emitido (não
   convertido), Then esse grupo mostra `invited >= 1`.
3. **Convite convertido conta como `active`** — Given um convite com `convertedAt` preenchido, Then
   esse grupo mostra `active >= 1` e `invited >= 1` (convertido ainda é "convidado").
4. **Sem UTM agrupa à parte** — Given inscrições sem `utmSource`, Then aparecem num grupo próprio
   (`utmSource: null`), não descartadas nem misturadas com as com UTM.
5. **Acesso negado sem `ADMIN`** — Given um JWT sem o role `ADMIN` (ou sem JWT), Then `403`/`401`.
6. **Filtro de período** — Given `desde`/`ate` informados, Then só inscrições com `createdAt` dentro
   da janela entram na agregação.

## Métrica de sucesso

Proxy mecânico: os 6 critérios acima, cobertos por teste de integração. Métrica de produto real
("conseguimos responder qual post converteu mais") só se materializa quando o founder usar o
endpoint depois do próximo post no Instagram.

## Open Questions & Assumptions

- **Premissa:** `qualified` usa a mesma aproximação (perfil `TREINADOR`) já aceita em
  `add-waitlist-lead-notifications` — não é o `QUALIFIED`/`OTHER_BRAND` de três segmentos da spec
  original, que depende de `BE-01` (não implementado).
- **Premissa:** correlação em memória (sem SQL agregado) é aceitável no volume atual. Se a waitlist
  crescer para milhares de linhas, revisitar com uma query agregada de verdade — não é o caso hoje.
- **Aberto:** classifiquei Fast apesar de ser rota `/api/admin/**` — não é superfície pública nova
  (mesmo padrão de autorização já existente), não muda schema, e o `code-reviewer` já teve três
  rodadas recentes validando o padrão de agregação em memória nesta mesma feature. Reclassificar
  para Full se o founder preferir todo endpoint admin novo sob essa trilha por padrão.
