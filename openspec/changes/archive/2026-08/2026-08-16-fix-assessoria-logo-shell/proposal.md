**Tamanho:** XS · **Trilha:** Fast

```yaml
id: fix-assessoria-logo-shell
motivation: >
  Depois de enviar o logo da assessoria em /coach/settings/assessoria, ele nao aparece na shell do
  coach — nem no avatar do tenant (sidebar) nem no topo esquerdo do dashboard. O upload funciona e
  salva (o preview da propria pagina de settings mostra o logo). Causa raiz em dois gaps: (1) o
  endpoint que alimenta a sidebar (GET /users/me) nao expoe o logo — o summary `Assessoria` traz so
  id/nome/dominio, e o logo vive em GET /assessorias/me, que so a pagina de settings consome;
  (2) a sidebar nao renderiza logo — o TenantSwitcher mostra iniciais e o header mostra a marca
  Menthoros fixa.
scope:
  repos: [menthoros-backend, menthoros-front]
  inclui:
    - Expor logoUrl (e flag de presenca) no summary de assessoria do GET /users/me
    - Propagar o logo pelo CurrentTenant (useCurrentUser)
    - Renderizar o logo da assessoria na sidebar (TenantSwitcher + header), com fallback
  exclui:
    - Upload/remocao/validacao de logo (ja existe e funciona)
    - Cores da assessoria aplicadas ao tema (fora de escopo; contrato morto)
acceptance_criteria:
  - Com logo enviado, o avatar do tenant e o header da sidebar exibem o logo apos o upload
  - Sem logo, a sidebar mantem as iniciais (TenantSwitcher) e a marca Menthoros (header)
  - Usuario sem assessoria (null) continua recebendo assessoria: null sem quebrar o cliente
  - Nenhuma quebra de contrato: campos novos sao aditivos/opcionais
risks:
  - id: cache-stale
    descricao: sem cache-bust o navegador pode manter o logo antigo apos troca.
    mitigacao: reusar a convencao da settings (URL + ?v=version).
  - id: null-assessoria
    descricao: mapper do me pode quebrar para usuario sem assessoria.
    mitigacao: assessoria null segue retornando null; teste de contrato do me.
```

## Why

O coach configura a assessoria (nome, logo) em `/coach/settings/assessoria` e o upload **funciona e
persiste** — o preview da propria pagina mostra o logo. Mas a shell ignora: o `TenantSwitcher` da
sidebar desenha as **iniciais** do nome (`name.slice(0,2)`) e o header desenha a **marca Menthoros
fixa**. Nenhum dos dois le a `logoUrl`.

Diagnostico confirmado no codigo:
- `UsuarioMeOutputDto.Assessoria` (backend) so tem `id`, `nome`, `dominio` — sem logo.
- `useCurrentUser` constroi `CurrentTenant = { id, name, athleteCount }` — sem logo.
- `CoachSidebar` (TenantSwitcher + header) nao referencia logo algum.

**CORRECAO DE PREMISSA (2026-08-16, verificada no codigo — a versao anterior desta proposal levaria
a uma correcao que nao corrige nada).** A spec dizia que bastava mapear `assessoria.getLogoUrl()`.
Nao basta, porque essa **nao e a fonte do logo**:

1. O logo do fluxo atual e **BLOB**, na tabela `tb_assessoria_logo` (entidade `AssessoriaLogo`),
   como decidido em `assessoria-settings-ui`. A presenca vem de
   `logoRepository.existsByAssessoriaId(tenantId)` (`AssessoriaSettingsServiceImpl:92`).
2. O `logoUrl` do `AssessoriaMeOutputDto` **nao e o campo da entidade**: e a constante
   `LOGO_PATH = "/api/v1/assessorias/me/logo"` (`AssessoriaSettingsServiceImpl:31`), devolvida
   apenas quando `temLogo` (`:104`).
3. `Assessoria.logoUrl` (coluna `logo_url`, 500 chars) e **legado do fluxo antigo** e esta `NULL`
   para todo mundo que enviou logo pelo caminho atual.

Mapear o campo legado devolveria `null` para todos, a sidebar continuaria sem logo — e a change
seria fechada como concluida.

O logo so aparece hoje em `GET /assessorias/me` (→ `temLogo` + `logoUrl`), que **so a pagina de
settings chama**.

## What Changes

- **Backend** (`menthoros-backend`): adicionar ao record interno `UsuarioMeOutputDto.Assessoria` os
  campos `temLogo` (boolean), `logoUrl` (String, nullable) e `version` (Long) — espelhando o
  `AssessoriaMeOutputDto` para os dois endpoints nao divergirem.
  **Quem resolve a presenca e o `UsuarioServiceImpl`**, que ja orquestra o `me` e pode injetar o
  `AssessoriaLogoRepository`; o `UsuarioMapper` continua so convertendo. Mapper com acesso a
  repositorio contraria o `CLAUDE.md` do modulo ("repository: persistence access only" e mappers
  como conversao pura), e e o tipo de atalho que depois ninguem consegue testar isolado.
  A rota devolvida e a mesma constante ja usada (`/api/v1/assessorias/me/logo`) — sem duplicar
  streaming nem inventar segunda URL para o mesmo recurso.
- **Frontend** (`menthoros-front`):
  - `src/types/Usuario.ts` — adicionar `logoUrl?` (e `temLogo?`) em `UsuarioAssessoria`.
  - `src/hooks/useCurrentUser.ts` — adicionar `logoUrl?` em `CurrentTenant` e popular de
    `me.assessoria.logoUrl`.
  - `src/features/coach/layout/CoachSidebar.tsx` — no `TenantSwitcher`, trocar as iniciais por `<img>`
    quando houver logo; no header, trocar a marca Menthoros pelo logo da assessoria (fallback: marca).
    Cache-bust com `?v={version}` — **a mesma convencao da settings**, que usa
    `${OpenAPI.BASE}${logoUrl}?v=${assessoria.version}` (`CoachAssessoriaSettingsPage.tsx:169`). Sem
    a `version` no `me`, o CA4 nao teria como funcionar: o navegador serviria o logo antigo do cache.
  - **Revalidar o `me` apos upload/remocao do logo** — sem isso o CA1 ("sem reload manual") e falso:
    a sidebar le o `useCurrentUser`, que busca o `me` uma vez; o upload acontece na settings e nada
    avisa o shell.

## Impact

**Backend:** `dto/output/UsuarioMeOutputDto.java`, `mapper/UsuarioMapper.java` (+ teste de contrato).
**Frontend:** `types/Usuario.ts`, `hooks/useCurrentUser.ts`, `features/coach/layout/CoachSidebar.tsx`
(+ teste de componente + E2E). Nenhuma mudanca de banco/API alem de campos aditivos.

## Criterios de aceite

- **CA1** — apos enviar o logo em settings, ele aparece na sidebar (avatar do tenant + header) sem
  reload manual.
- **CA2** — sem logo, a sidebar mantem iniciais + marca Menthoros (fallback).
- **CA3** — `assessoria: null` (usuario sem tenant) nao quebra o `me` nem o render.
- **CA4** — trocar o logo reflete na sidebar (cache-bust funciona).

## Open Questions & Assumptions

- **Assumption:** `Assessoria.logoUrl` (entidade) e o roteamento do logo ja sao resolvidos pelo
  endpoint `GET /assessorias/me`; o `me` do usuario reusa essa resolucao, sem duplicar streaming.
- **Assumption:** `temLogo` e derivavel de `logoUrl != null`; adicionar o campo explicito so se o
  backend ja o computa no `AssessoriaMeOutputDto` (evitar contrato divergente entre os dois endpoints).

## Metrica de sucesso

- 0 relatos de "logo nao aparece" apos o merge; logo visivel na sidebar em <=1 reload pos-upload.
