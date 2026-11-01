# Tasks: fix-index-html-cache-control

Repositório único: `apps/menthoros-front` (`docker/nginx.conf.template`). Sem migration, sem contrato.
Branch `fix/index-html-cache-control` (tipo dominante `fix`); worktree se houver outra sessão no repo.

## 1. Cabeçalho

- [x] 1.1 Em `docker/nginx.conf.template`, `location /`: `add_header Cache-Control "no-cache";` com
      comentário de uma linha dizendo o porquê (HTML aponta para o bundle com hash; sem isso o deploy
      não chega a quem já visitou).
      verify: `docker build -f docker/Dockerfile.cloud` e `nginx -t` na imagem passam.
      Feito: template renderizado e carregado em `nginx:1.27-alpine` (o config sobe); o `docker build` completo não rodou, o `npm run build` não muda.

## 2. Verificação

- [x] 2.1 Subir a imagem localmente e conferir os cabeçalhos:
      `curl -sI /` , `/index.html` e uma rota inexistente (fallback SPA) → `cache-control: no-cache`;
      `/assets/<arquivo>.js` → `public, max-age=31536000, immutable`; `/env-config.js` → `no-store`.
      verify: as quatro respostas conferem; segunda requisição com `If-None-Match` devolve 304.
      Feito: `/`, `/index.html` e rota inexistente → `no-cache`; `/assets/*` → `immutable`; `/env-config.js` →
      `no-store`; `If-None-Match` → 304. Nota: `/env-config.js` saiu com `no-cache` **e** `no-store` (o `expires -1`
      do bloco existente emite um `Cache-Control` a mais); efeito é o mesmo, não é regressão desta change.
- [ ] 2.2 Depois do deploy em `develop` e em `main`: `curl -sI https://app.menthoros.com/` mostra
      `cache-control: no-cache` pela borda (resolve a A2 do proposal).
      verify: cabeçalho presente na resposta pública.

## 3. Entrega

- [ ] 3.1 Marcar as tasks, PR `fix/index-html-cache-control` para `develop` (via `/pr`), promoção
      `develop → main`, depois `/done`.
