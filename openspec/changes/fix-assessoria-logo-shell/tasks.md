# Tasks — fix-assessoria-logo-shell

Repos: `menthoros-backend` (1.1-1.3) e `menthoros-front` (2.1-2.4). Tamanho XS.

## Backend — expor o logo no `me`

- [ ] 1.1 Adicionar `logoUrl` (String, nullable) ao record interno `UsuarioMeOutputDto.Assessoria`
      (`dto/output/UsuarioMeOutputDto.java`), com `@Schema`. Se `AssessoriaMeOutputDto` ja computa uma
      flag de presenca (ex.: `temLogo`), espelhar o mesmo campo para nao divergir o contrato.
- [ ] 1.2 Popular no `UsuarioMapper.toAssessoria` (`mapper/UsuarioMapper.java`) a partir de
      `assessoria.getLogoUrl()` — reusando a resolucao ja existente no endpoint da assessoria (rota
      `/api/v1/assessorias/me/logo`), sem duplicar a logica de streaming. `assessoria == null` segue
      retornando `null`.
- [ ] 1.3 Teste de contrato do `GET /users/me`: com logo definido retorna o campo; sem logo (ou sem
      assessoria) retorna `null` sem quebrar o payload. Validador: `./mvnw test` verde.

## Frontend — propagar e renderizar

- [ ] 2.1 Adicionar `logoUrl?: string | null` (e `temLogo?: boolean`, se o backend expuser) em
      `UsuarioAssessoria` (`src/types/Usuario.ts`).
- [ ] 2.2 Adicionar `logoUrl?: string | null` em `CurrentTenant` (`src/hooks/useCurrentUser.ts`) e
      popular de `me.assessoria.logoUrl` no `setTenant`.
- [ ] 2.3 `CoachSidebar.tsx` — no `TenantSwitcher`, renderizar
      `<img src={OpenAPI.BASE + logoUrl}?v=...>` no lugar das iniciais quando `logoUrl` presente; no
      header, renderizar o logo da assessoria no lugar da marca Menthoros, com fallback para a marca.
      Cache-bust com `?v=` (mesma convencao da settings). `referrerPolicy` se a URL for externa.
- [ ] 2.4 Teste de componente da sidebar (logo presente → `<img>`; ausente → iniciais/marca) + E2E
      cobrindo "enviar logo na settings → aparece na sidebar". Validador: lint+build+teste.
