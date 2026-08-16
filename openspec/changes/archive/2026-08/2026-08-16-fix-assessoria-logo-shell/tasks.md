# Tasks — fix-assessoria-logo-shell

Repos: `menthoros-backend` (1.x) e `menthoros-front` (2.x). Tamanho XS.

> **Reescrita em 2026-08-16, no `/implement init`.** A versão anterior mandava popular o logo a
> partir de `assessoria.getLogoUrl()` — campo **legado**, `NULL` para quem usou o fluxo atual, que
> guarda o logo em BLOB (`tb_assessoria_logo`). Implementada como estava, a sidebar continuaria sem
> logo e a change seria fechada como concluída. Ver "Correção de premissa" no `proposal.md`.

## Backend — expor o logo no `me`

- [x] 1.1 Adicionar ao record interno `UsuarioMeOutputDto.Assessoria`
      (`dto/output/UsuarioMeOutputDto.java`), com `@Schema`: `temLogo` (boolean), `logoUrl` (String,
      nullable) e `version` (Long). Espelha o `AssessoriaMeOutputDto` de propósito — dois endpoints
      descrevendo o mesmo recurso com contratos diferentes é convite a divergência.
- [x] 1.2 **`UsuarioServiceImpl` resolve, `UsuarioMapper` converte.** O service injeta
      `AssessoriaLogoRepository`, consulta `existsByAssessoriaId` e passa o resultado ao mapper; o
      mapper devolve `LOGO_PATH` quando presente, `null` quando não. Mapper **não** ganha
      repositório: o `CLAUDE.md` do módulo põe acesso a persistência na service, e mapper com query
      dentro não se testa isolado. `assessoria == null` segue retornando `null`.
      `LOGO_PATH` deixa de ser `static final` package-private em `AssessoriaSettingsServiceImpl` e
      passa a ser compartilhada — uma constante, não duas cópias da mesma string.
- [x] 1.3 Testes: (a) unitário do mapper — com logo, sem logo, e `assessoria == null`;
      (b) contrato do `GET /users/me` — payload traz os campos novos e não quebra para usuário sem
      assessoria. Validação: `./mvnw clean verify`.

## Frontend — propagar e renderizar

- [x] 2.1 `src/types/Usuario.ts` — `temLogo?: boolean`, `logoUrl?: string | null`,
      `version?: number` em `UsuarioAssessoria`.
- [x] 2.2 `src/hooks/useCurrentUser.ts` — propagar os três para `CurrentTenant` e popular no
      `setTenant`.
- [x] 2.3 `CoachSidebar.tsx` — `TenantSwitcher` renderiza `<img>` no lugar das iniciais quando há
      logo; header renderiza o logo no lugar da marca Menthoros, com fallback para a marca.
      `src = ${OpenAPI.BASE}${logoUrl}?v=${version}` — mesma convenção de
      `CoachAssessoriaSettingsPage.tsx:169`. **Fallback obrigatório no `onError`**: logo que falha ao
      carregar volta para iniciais/marca em vez de deixar um quadrado quebrado na navegação.
- [x] 2.4 **Revalidar o `me` após upload e remoção do logo.** Sem isto o CA1 ("aparece sem reload
      manual") é falso: a sidebar lê o `useCurrentUser`, que busca o `me` uma vez, e o upload
      acontece noutra tela. Validação: teste cobrindo que a revalidação é disparada.
- [x] 2.5 Testes: componente da sidebar (com logo → `<img>` com cache-bust; sem logo → iniciais e
      marca; erro de carga → fallback) + E2E "enviar logo na settings → aparece na sidebar".
      Validação: `npm run lint && npm run test:run && npm run build` + E2E.

## Entrega

**3 PRs mergeados em 2026-08-16:** `menthoros-backend#70` (campos no `me`), `menthoros-front#75`
(propagação + revalidação) e `menthoros-front#76` (**a causa raiz**). Validado na tela pelo founder.

**Validação:** backend `./mvnw clean verify` — 2542 unitários + 102 de integração, 0 falhas.
Front — lint limpo, 976/976, build ok, E2E 46/46.

### A causa raiz não estava na spec — nem no meu diagnóstico do `init`

Depois dos dois primeiros PRs, a logo **continuava sem carregar**. O motivo:

`GET /api/v1/assessorias/me/logo` tem `@PreAuthorize` e exige JWT, e **uma tag `<img src>` não envia
o header `Authorization`** — o token é injetado pelo cliente HTTP, não pelo navegador em requisição
de imagem. O `<img>` saía sem credencial e recebia **403**.

Levar a URL até a shell, que era o escopo inteiro da change, **não bastava: a URL sozinha não é
carregável**.

**Alcance maior que o relatado:** a tela de configurações usa a mesma `<img src>`, então o preview de
lá também nunca exibiu a imagem — o que se via era o fallback de iniciais, invisível como defeito
porque logo após um upload ninguém questiona um placeholder. A logo nunca apareceu em lugar nenhum
do produto desde que o upload existe.

`useLogoAssessoria` busca os bytes com o token, devolve object URL e o revoga no cleanup.

**Por que nenhum teste pegou antes:** os testes de componente injetavam a URL e afirmavam que ela
chegava ao `src` — todos verdes, com a imagem quebrada no navegador. Só o uso real encontrou. O E2E
agora responde 403 sem `Authorization`, como o backend, então a regressão volta a falhar.

## Achados da implementação (2026-08-16)

- **O spinner do `CoachLayout` desmontava a página filha em toda revalidação.** Ele subia sempre que
  `loading` era verdadeiro, sem distinguir primeira carga de recarga — então revalidar o `me` após o
  upload trocava a tela por um spinner, remontava a página e **levava junto o estado local dela**: o
  aviso "Logo atualizada" sumia. Um E2E que passava quebrou e expôs isso. Corrigido para
  `loading && !coach.id`; o defeito existia antes desta change e valia para qualquer revalidação.
- **`removerLogo` devolve `void`**, não a assessoria. O mock que escrevi assumia o contrário — o
  `vitest` passou e o `tsc` pegou. Lembrete de que `test:run` sozinho não é validação.
- **A rota da logo é a mesma constante nos dois endpoints** (`LOGO_PATH`), agora compartilhada em
  vez de duplicada em string.

## Fora de escopo (confirmado no init)

- Upload, remoção e validação de logo — já existem e funcionam.
- Migrar ou remover a coluna legada `Assessoria.logo_url`. Ela ficou órfã quando o logo virou BLOB,
  mas mexer nela é change própria, com migration e verificação de quem ainda lê o campo.
- Cores da assessoria no tema (contrato morto).
