# Tasks: harden-backend-db-resilience

Repo: `apps/menthoros-backend` · Branch: `feature/harden-backend-db-resilience`

## 1. Sync de usuário condicional + throttle

- [ ] 1.1 Criar propriedade `app.security.user-sync.access-throttle` (Duration, default `PT5M`) com
      `@ConfigurationProperties` ou `@Value`, documentada no `application.yml`.
- [ ] 1.2 Em `UsuarioSyncServiceImpl.syncUsuarioFromJwt`: calcular diff dos campos espelhados do JWT
      (email, nome, sobrenome, emailVerificado, role, owner) contra a entidade carregada; chamar
      `registrarAcesso()`/`registrarSincronizacao()` apenas quando o último acesso for mais antigo
      que o throttle; só executar `save()` quando houver diff ou acesso a registrar. Usuário novo
      (`createNewUsuario`) continua salvando sempre.
- [ ] 1.3 Rebaixar `log.info("Usuário sincronizado...")` para `debug`.
- [ ] 1.4 Testes de unidade (`UsuarioSyncServiceImplTest`): sem diff + dentro da janela → `verify(repo, never()).save(...)`;
      cada campo espelhado alterado → salva (parameterizado); acesso fora da janela → salva uma vez;
      usuário novo → salva; `vincularAtletaSeNecessario` continua invocado para ATLETA.
- [ ] 1.5 Validação: `./mvnw clean test`.

## 2. Pool Hikari

- [ ] 2.1 Confirmar limite do Postgres de produção: `SHOW max_connections;` (registrar o valor aqui).
- [ ] 2.2 `application-cloud.yml`: `maximum-pool-size: ${HIKARI_MAX_POOL_SIZE:10}`; atualizar o
      comentário desatualizado sobre "free tier". Aplicar o mesmo em `application-dev.yml` se fizer
      sentido para paridade.
- [ ] 2.3 Validação: `./mvnw clean verify` (sobe contexto com a config nova nos `*IT`).

## 3. Logging de produção

- [ ] 3.1 `logback-spring.xml`: loggers `br.com.menthoros.backend.security` e
      `br.com.menthoros.backend.multitenancy` para `INFO` no default; movê-los para `DEBUG` apenas
      dentro de `<springProfile name="dev">`.
- [ ] 3.2 Corrigir/remover o bloco `<springProfile name="prod">` (profile real de produção é `cloud`).
- [ ] 3.3 Validação: subir localmente com `SPRING_PROFILES_ACTIVE=cloud` (ou teste de contexto) e
      confirmar ausência de linhas DEBUG por requisição; `./mvnw clean verify`.

## 4. Entrega

- [ ] 4.1 `/qa` (review + testes) e PR `feature/harden-backend-db-resilience → develop`.
- [ ] 4.2 Após merge + deploy em develop, smoke: carregar painel do atleta e conferir volume de logs
      e `hikaricp.connections.active` no Prometheus.
