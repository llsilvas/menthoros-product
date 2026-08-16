# Tasks — fix-assessoria-logo-shell

Repos: `menthoros-backend` (1.x) e `menthoros-front` (2.x). Tamanho XS.

> **Reescrita em 2026-08-16, no `/implement init`.** A versão anterior mandava popular o logo a
> partir de `assessoria.getLogoUrl()` — campo **legado**, `NULL` para quem usou o fluxo atual, que
> guarda o logo em BLOB (`tb_assessoria_logo`). Implementada como estava, a sidebar continuaria sem
> logo e a change seria fechada como concluída. Ver "Correção de premissa" no `proposal.md`.

## Backend — expor o logo no `me`

- [ ] 1.1 Adicionar ao record interno `UsuarioMeOutputDto.Assessoria`
      (`dto/output/UsuarioMeOutputDto.java`), com `@Schema`: `temLogo` (boolean), `logoUrl` (String,
      nullable) e `version` (Long). Espelha o `AssessoriaMeOutputDto` de propósito — dois endpoints
      descrevendo o mesmo recurso com contratos diferentes é convite a divergência.
- [ ] 1.2 **`UsuarioServiceImpl` resolve, `UsuarioMapper` converte.** O service injeta
      `AssessoriaLogoRepository`, consulta `existsByAssessoriaId` e passa o resultado ao mapper; o
      mapper devolve `LOGO_PATH` quando presente, `null` quando não. Mapper **não** ganha
      repositório: o `CLAUDE.md` do módulo põe acesso a persistência na service, e mapper com query
      dentro não se testa isolado. `assessoria == null` segue retornando `null`.
      `LOGO_PATH` deixa de ser `static final` package-private em `AssessoriaSettingsServiceImpl` e
      passa a ser compartilhada — uma constante, não duas cópias da mesma string.
- [ ] 1.3 Testes: (a) unitário do mapper — com logo, sem logo, e `assessoria == null`;
      (b) contrato do `GET /users/me` — payload traz os campos novos e não quebra para usuário sem
      assessoria. Validação: `./mvnw clean verify`.

## Frontend — propagar e renderizar

- [ ] 2.1 `src/types/Usuario.ts` — `temLogo?: boolean`, `logoUrl?: string | null`,
      `version?: number` em `UsuarioAssessoria`.
- [ ] 2.2 `src/hooks/useCurrentUser.ts` — propagar os três para `CurrentTenant` e popular no
      `setTenant`.
- [ ] 2.3 `CoachSidebar.tsx` — `TenantSwitcher` renderiza `<img>` no lugar das iniciais quando há
      logo; header renderiza o logo no lugar da marca Menthoros, com fallback para a marca.
      `src = ${OpenAPI.BASE}${logoUrl}?v=${version}` — mesma convenção de
      `CoachAssessoriaSettingsPage.tsx:169`. **Fallback obrigatório no `onError`**: logo que falha ao
      carregar volta para iniciais/marca em vez de deixar um quadrado quebrado na navegação.
- [ ] 2.4 **Revalidar o `me` após upload e remoção do logo.** Sem isto o CA1 ("aparece sem reload
      manual") é falso: a sidebar lê o `useCurrentUser`, que busca o `me` uma vez, e o upload
      acontece noutra tela. Validação: teste cobrindo que a revalidação é disparada.
- [ ] 2.5 Testes: componente da sidebar (com logo → `<img>` com cache-bust; sem logo → iniciais e
      marca; erro de carga → fallback) + E2E "enviar logo na settings → aparece na sidebar".
      Validação: `npm run lint && npm run test:run && npm run build` + E2E.

## Fora de escopo (confirmado no init)

- Upload, remoção e validação de logo — já existem e funcionam.
- Migrar ou remover a coluna legada `Assessoria.logo_url`. Ela ficou órfã quando o logo virou BLOB,
  mas mexer nela é change própria, com migration e verificação de quem ainda lê o campo.
- Cores da assessoria no tema (contrato morto).
