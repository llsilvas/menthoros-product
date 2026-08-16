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
- `UsuarioMapper.toAssessoria` nao mapeia `logoUrl` (a entidade `Assessoria.logoUrl` existe).
- `useCurrentUser` constroi `CurrentTenant = { id, name, athleteCount }` — sem logo.
- `CoachSidebar` (TenantSwitcher + header) nao referencia `logoUrl`.

O logo so existe em `GET /assessorias/me` (→ `AssessoriaMe.logoUrl` + `temLogo`), que **so a pagina
de settings chama**.

## What Changes

- **Backend** (`menthoros-backend`): adicionar `logoUrl` (String, nullable) — e a flag de presenca, se
  o `AssessoriaMeOutputDto` ja a computa — ao record interno `UsuarioMeOutputDto.Assessoria`, e
  popular no `UsuarioMapper.toAssessoria` reusando a mesma resolucao do endpoint `GET /assessorias/me`
  (rota `/api/v1/assessorias/me/logo`), sem duplicar a logica de streaming.
- **Frontend** (`menthoros-front`):
  - `src/types/Usuario.ts` — adicionar `logoUrl?` (e `temLogo?`) em `UsuarioAssessoria`.
  - `src/hooks/useCurrentUser.ts` — adicionar `logoUrl?` em `CurrentTenant` e popular de
    `me.assessoria.logoUrl`.
  - `src/features/coach/layout/CoachSidebar.tsx` — no `TenantSwitcher`, trocar as iniciais por `<img>`
    quando houver logo; no header, trocar a marca Menthoros pelo logo da assessoria (fallback: marca).
    Cache-bust com `?v=` (mesma convencao da settings); `referrerPolicy` se a URL for externa.

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
