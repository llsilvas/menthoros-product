# Tasks — add-waitlist-utm-attribution

> S · Fast. Backend (migration + entity + DTO + service + teste) e frontend (captura UTM + payload).
> Marcadores: `[x]` feito · `[~]` parcial · `[ ]` pendente.

## Backend — persistir UTM na waitlist

- [ ] **1.1** Migration `V91__Add_waitlist_utm_columns.sql`: adicionar `utm_source VARCHAR(255)`,
  `utm_medium VARCHAR(255)`, `utm_campaign VARCHAR(255)`, `utm_content VARCHAR(255)` — todas NULL,
  com `COMMENT ON COLUMN` no padrão da V43. Não editar a V43.
  - Validação: subida do app aplica V91 sem erro; `\d tb_waitlist` mostra as 4 colunas.

- [ ] **1.2** Entity `Waitlist.java`: adicionar os 4 campos mapeados às novas colunas (nullable, sem
  `@NotNull`), seguindo o padrão dos campos existentes (`origem`).
  - Validação: `./mvnw test` verde.

- [ ] **1.3** `WaitlistInputDto.java`: adicionar `utmSource`, `utmMedium`, `utmCampaign`,
  `utmContent` opcionais (`@Size(max = 255)` + `@Schema` opcional). Não são `@NotNull`.
  - Validação: `./mvnw test` verde; o OpenAPI gerado expõe os 4 campos como opcionais.

- [ ] **1.4** `WaitlistServiceImpl.registrar`: gravar os 4 campos no `Waitlist.builder()` de forma
  null-safe (direto de `dto.utmSource()` etc.). Manter `origem = ORIGEM_LANDING` intacto.
  - Validação: `./mvnw test` verde; `WaitlistServiceImplTest` cobre persistência com e sem UTM.

- [ ] **1.5** `WaitlistControllerIT`: cenário que envia `utmSource`/`utmCampaign` e asserta a linha
  gravada em `tb_waitlist` com os valores; e cenário sem UTM asserta as colunas `NULL`.
  - Validação: `./mvnw test -Dtest=WaitlistControllerIT` verde.

## Frontend — capturar UTM e incluir no payload

- [ ] **2.1** `src/types/Waitlist.ts`: adicionar `utmSource?`, `utmMedium?`, `utmCampaign?`,
  `utmContent?` a `WaitlistInput` (opcionais).
  - Validação: `npm run lint` + `npm run build` limpos.

- [ ] **2.2** Helper puro `src/landing/parseUtm.ts` (junto de `accessFormValidation.ts`, mesmo padrão):
  `parseUtmParams(search: string): Partial<UtmParams>` lendo `new URLSearchParams(search)` e
  devolvendo só os 4 campos. Teste irmão `parseUtm.test.ts`.
  - Validação: `npm run test -- parseUtm` verde (query com UTM, sem UTM e vazia).

- [ ] **2.3** `AccessForm.tsx`: no `handleSubmit`, incluir `...parseUtmParams(window.location.search)`
  no payload. Importante: `window.location.search` (query **antes** do `#`), NÃO `useSearchParams`
  (o app usa `createHashRouter`).
  - Validação: `npm run test -- AccessForm` verde; submeter com UTM na URL inclui os campos no payload.

- [ ] **2.4** Portão final do módulo: `npm run lint` + `npm run build` (conforme `CLAUDE.md` do front).
  - Validação: ambos limpos.
