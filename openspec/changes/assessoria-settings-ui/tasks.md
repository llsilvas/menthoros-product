# Tasks — assessoria-settings-ui

## 1. Discovery e backend

- [ ] 1.1 Mapear entidade/serviço/DTO de assessoria, `TenantContext`, roles, contagens, cache do frontend e infraestrutura de arquivos; registrar caminhos reais.
- [ ] 1.2 Decidir storage, URL/chave, formatos/limites, lifecycle/cleanup e role editora. Se storage não existir, aprovar retirada do logo antes de continuar.
- [ ] 1.3 Adicionar migração/versionamento otimista se ausente e chave interna da logo se necessária; validar com dados existentes.
- [ ] 1.4 Implementar/estender output de `GET /api/v1/assessorias/me` com identidade, plano, uso e versão usando queries tenant-scoped.
- [ ] 1.5 Implementar DTO e `PATCH /api/v1/assessorias/me` com campos permitidos, normalização, validação, role e conflito `409`.
- [ ] 1.6 Implementar serviço/storage e `POST /api/v1/assessorias/me/logo`: limite, assinatura real, decode, chave gerada, compensação e limpeza assíncrona.
- [ ] 1.7 Testar campos omitidos/null, cores/nome, concorrência, role, tenant A/B, arquivo falso/grande/corrompido e falhas em cada etapa do upload/cleanup.
- [ ] 1.8 Executar `./mvnw clean test`, migrações e teste de integração com storage; registrar resultados.

## 2. Frontend

- [ ] 2.1 Criar client/tipos compartilhados de leitura, patch e upload para reutilização pelo wizard.
- [ ] 2.2 Criar `/coach/settings/assessoria` e navegação no grupo “Configurações”, com loading/erro/empty states.
- [ ] 2.3 Implementar formulário de nome/cores, validação de contraste, preview isolado, dirty-state e tratamento de `409`.
- [ ] 2.4 Implementar seletor/upload de logo acessível com limites, progresso, retry e fallback; não aceitar URL digitada.
- [ ] 2.5 Implementar cards read-only de plano/uso e atualizar o cache do shell após cada sucesso.
- [ ] 2.6 Testar PATCH parcial, contraste, concorrência, upload/falha, saída com alterações, cache/header e viewport móvel.
- [ ] 2.7 Executar `npm run lint && npm run build` e testes configurados; registrar resultados.

## 3. Entrega

- [ ] 3.1 E2E com duas assessorias e roles diferentes, comprovando isolamento e permissão.
- [ ] 3.2 Verificar atualização imediata do shell, fallback de logo e limpeza de objetos em falhas injetadas.
- [ ] 3.3 Validar storage, CORS, lifecycle, métricas e feature flag no ambiente de staging.

## Estimativa

M (aprox. 10–15 dias com storage existente; adicionar infraestrutura pode elevar para L). O upload real, autorização e consistência tornam a estimativa S original insuficiente.
