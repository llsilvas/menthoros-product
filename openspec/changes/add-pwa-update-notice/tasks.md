## 1. Frontend (`apps/menthoros-front`, branch `feat/add-pwa-update-notice`)

- [ ] 1.1 Teste primeiro: com `onNeedRefresh` disparado e rota autenticada, o aviso "Nova versão disponível" aparece; clicar "Atualizar" chama `updateSW(true)` uma vez (mock de `virtual:pwa-register`)
- [ ] 1.2 Teste primeiro: em `#/auth/*` o aviso não aparece; ao navegar para rota autenticada, aparece
- [ ] 1.3 Teste primeiro: "Agora não" fecha o aviso e ele não volta na mesma aba sem novo `onNeedRefresh`
- [ ] 1.4 Implementar: `onNeedRefresh` + `onRegisteredSW` (intervalo de 60 min com `registration.update()`) no `registerSW` de `src/main.tsx`, só em `PROD`; estado "versão nova" exposto para a UI sem mudar `registerType: 'prompt'` nem a config do Workbox
- [ ] 1.5 Componente do aviso (Snackbar MUI, tokens do tema) montado no shell, fora das rotas de auth; no mobile do atleta, acima da barra inferior sem cobri-la
- [ ] 1.6 Teste: o intervalo chama `registration.update()` (fake timers) e é limpo se o registro falhar
- [ ] 1.7 Validação: `npm run lint && npm run build && npm run test:run`; `npx playwright test tests/e2e/pwa/service-worker.spec.ts` verde

## 2. Verificação pós-deploy

- [ ] 2.1 Em `app-develop.menthoros.com`, com uma aba aberta antes do deploy de outra mudança de front, confirmar que o aviso aparece e que "Atualizar" carrega o bundle novo
