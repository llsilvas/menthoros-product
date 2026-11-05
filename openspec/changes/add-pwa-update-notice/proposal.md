**Tamanho:** S · **Trilha:** Fast (só front, sem contrato de API nem schema; o risco do PKCE é coberto por reload só com clique)

## Why

O front é um PWA (`vite-plugin-pwa`, `registerType: 'prompt'`, `registerSW({ immediate: true })` em
`src/main.tsx`) sem `onNeedRefresh`. Depois de um deploy, o service worker novo fica **em espera** e
o antigo continua servindo o bundle precacheado; a versão nova só ativa quando todas as abas do app
são fechadas. Reload comum não resolve.

Aconteceu em 2026-11-05: o PR #194 (`coach-editar-treino-aprovado`) estava em `develop` e publicado,
mas o treinador não via o lápis nem o chip "Aprovado" na aba Plano da Caixa de entrada. Foram
necessários diagnóstico no banco e no bundle publicado para concluir que era cache do service
worker. Treinador costuma deixar a aba aberta o dia todo, então toda entrega de front fica
invisível até um cold start que ele não sabe que precisa fazer.

O `prompt` foi escolhido de propósito (`vite.config.ts`): um reload automático no meio do fluxo
PKCE perderia o `state`. Esta change mantém essa garantia: o reload só acontece quando a pessoa
clica.

## What Changes

- Registrar `onNeedRefresh` no `registerSW` e expor o estado "versão nova disponível" para a UI.
- Aviso discreto (Snackbar MUI, sem bloquear a tela): "Nova versão disponível" com ação
  **Atualizar**. O clique chama `updateSW(true)` (skipWaiting + reload).
- O aviso **não aparece** em rotas do fluxo de autenticação (`#/auth/*`) nem antes do callback OIDC
  terminar; aparece na primeira rota autenticada.
- "Agora não" fecha o aviso nesta sessão da aba; a versão nova continua ativando no próximo cold
  start, como hoje.
- Checagem periódica de atualização (`registration.update()` a cada 60 min) para abas que ficam
  abertas o dia todo, já que o navegador só reconsulta o `sw.js` em navegação.
- Vale para treinador e atleta (mesmo app, mesmo service worker).
- **Fora de escopo:** `autoUpdate`; reload forçado; changelog/"o que mudou"; mudar o precache,
  `navigateFallbackDenylist` ou `runtimeCaching`; aviso em dev (o SW só registra em `PROD`).

## Capabilities

### New Capabilities
<!-- Nenhuma spec canônica de PWA; comportamento coberto por testes e pelo E2E de service worker. -->

### Modified Capabilities
<!-- Nenhuma. -->

## Critérios de aceite

- Dado um service worker novo em espera, quando o usuário está numa rota autenticada, então aparece
  o aviso "Nova versão disponível" com o botão "Atualizar".
- Dado o aviso visível, quando o usuário clica em "Atualizar", então `updateSW(true)` é chamado uma
  vez e nenhum outro reload acontece sem clique.
- Dado um service worker novo em espera, quando a rota atual é `#/auth/*`, então o aviso não aparece;
  ao chegar numa rota autenticada, ele aparece.
- Dado o aviso visível, quando o usuário clica em "Agora não", então o aviso some e não volta na
  mesma aba até um novo `onNeedRefresh`.
- Dado o app em produção aberto por mais de 60 min, então `registration.update()` foi chamado pelo
  menos uma vez.
- Dado o build de dev (`import.meta.env.PROD === false`), então nenhum service worker é registrado
  e o aviso nunca aparece.
- O E2E existente `tests/e2e/pwa/service-worker.spec.ts` segue verde (nada de `/api`, `/auth` ou
  `env-config.js` passa pelo SW).

## Métrica de sucesso

Tempo entre o merge de um PR de front em `develop` e o treinador ver a mudança: hoje depende de ele
fechar todas as abas (horas a dias); alvo, no máximo um clique depois da próxima checagem (até
60 min). Verificação: no próximo deploy de front, a aba aberta mostra o aviso sem fechar o app.

## Open Questions & Assumptions

- **Premissa:** a rota de auth é identificada pelo hash `#/auth/` (hash router; `start_url` é
  `./#/auth/login`). Se o callback OIDC cair na raiz sem hash, o aviso só aparece depois do
  redirecionamento para a rota do role, o que também é seguro.
- **Premissa:** 60 min de intervalo é suficiente; `registration.update()` é uma requisição pequena
  ao `sw.js` (servido com `no-cache`).
- **Em aberto:** posição do aviso no mobile do atleta (acima da barra inferior de navegação). Decidir
  na implementação olhando o shell do atleta; não pode cobrir a barra.
