# Proposal: fix-index-html-cache-control

**Tamanho:** XS · **Trilha:** Fast (um repositório, uma diretiva no `nginx.conf.template`; sem contrato
de API, sem schema, sem código de aplicação)

## Why

O nginx do front serve `index.html` sem `Cache-Control` — só `Last-Modified`. Sem diretiva, o navegador
aplica cache heurístico (um pedaço do tempo desde a última modificação) e reutiliza o HTML antigo
sem revalidar. O HTML é quem aponta para o bundle com hash (`/assets/index-<hash>.js`); com o HTML
preso, o navegador continua carregando o bundle velho e **o deploy fica invisível para quem já visitou**.

Aconteceu em 2026-11-01 com `landing-oferta-fundadora-v2`: o servidor já entregava o bundle novo
(`index-BbTOF1El.js` em 4 requisições seguidas, deploy às 19:25 GMT), mas o navegador do founder — e
um Chrome limpo da sessão — mostrou a landing antiga. Treinadores do programa fundador que já abriram
o site sofrem o mesmo em todo deploy, inclusive quando a mudança é correção de preço ou de promessa.

O arquivo já trata os dois extremos: `/assets/` é `immutable` por 1 ano e `/env-config.js` é
`no-store`. Só o `index.html` ficou no meio.

## What Changes

`apps/menthoros-front/docker/nginx.conf.template`: `add_header Cache-Control "no-cache"` no
`location /`. `no-cache` não proíbe guardar; obriga a **revalidar** (`If-None-Match`/`If-Modified-Since`)
a cada uso — uma resposta 304 curta quando nada mudou, HTML novo quando mudou.

O `location /` cobre `/`, `/index.html` e o fallback `try_files ... /index.html`, porque o redirecionamento
interno do nginx reentra no mesmo `location`. Os blocos `/assets/` e `= /env-config.js` já têm
`location` próprio e não mudam.

## Non-goals

- Não mexer em `/assets/` nem em `/env-config.js`.
- Não adicionar service worker, versionamento de HTML nem purge de CDN.
- Não alterar `railway.toml`: o Railway não injeta cabeçalho de cache para este serviço.

## Impact

- Nenhum para o usuário, exceto que um deploy passa a aparecer na próxima abertura do site.
- Custo: uma revalidação por carga de página (304, sem corpo); desprezível frente ao bundle.
- Arquivos não-HTML na raiz (`favicon`, `robots.txt`) também passam a revalidar; são pequenos.

## Rollback

Reverter o commit e redeployar o front. Sem estado, sem migration.

## Open Questions & Assumptions

- **A1 (verificada em 2026-11-01):** `curl -I https://app.menthoros.com/` devolve `last-modified` e
  nenhum `cache-control`; os assets devolvem `public, max-age=31536000, immutable`.
- **A2 (a verificar na implementação):** a borda (Cloudflare, `cf-cache-status: DYNAMIC`) repassa o
  `Cache-Control` da origem sem sobrescrever. `DYNAMIC` indica que não cacheia HTML, então o esperado é
  repassar; a task 2.1 confirma em produção.
- **Usuários já presos:** quem tem o HTML antigo em cache continua com ele até o cache expirar ou até
  um recarregamento forçado; a correção só vale a partir do próximo HTML baixado.
