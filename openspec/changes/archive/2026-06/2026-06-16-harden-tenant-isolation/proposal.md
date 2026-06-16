**Tamanho:** M · **Trilha:** Full

# Proposal: harden-tenant-isolation

## Status

Proposed

## Why

Auditoria de segurança do QA de `add-current-user-endpoint` revelou dois pontos de risco de
isolamento de tenant (pré-existentes, não introduzidos por aquela change):

1. `TenantContext` usa `InheritableThreadLocal` (`TenantContext.java`). Threads filhas criadas
   durante uma requisição herdam o `tenantId` no momento da criação; em pools (executor `@Async`,
   jobs agendados) isso pode reter/propagar o tenant de uma requisição para trabalho de outro tenant.
   O `JwtTenantFilter` faz `clear()` apenas na thread HTTP, não nas filhas.
2. Vários métodos de repositório retornam entidades **sem filtro de tenant** —
   `UsuarioRepository.findByKeycloakId`, `UsuarioRepository.findByEmail`,
   `AtletaRepository.findByIdBasic`, `AtletaRepository.findByIdForUpdate`. São footguns: qualquer
   chamador (ou código gerado por IA) que os use sem validar tenant produz acesso cross-tenant sem
   erro de compilação.

## What Changes

- Trocar `InheritableThreadLocal` por `ThreadLocal` simples e introduzir um `TaskDecorator` (ou
  mecanismo equivalente) que propague e **limpe** o `tenantId` explicitamente em código assíncrono.
- Auditar os métodos de repositório sem filtro de tenant: tornar tenant-scoped, restringir
  visibilidade, ou documentar explicitamente o uso seguro (e cobrir com teste de isolamento
  negativo). Confirmar que `UsuarioSyncService` usa a variante correta.

## Impact

- **Arquivos de produção (trabalho futuro):** `TenantContext`, configuração de `TaskDecorator`/async,
  `UsuarioRepository`, `AtletaRepository` e chamadores. Sem migração nova.
- **Risco:** mudança no comportamento de propagação de contexto em código async — exige teste
  cuidadoso de regressão (jobs Strava, sync de atletas).
- Descoberto em: QA de `add-current-user-endpoint` (sec#1, sec#2/#3).
