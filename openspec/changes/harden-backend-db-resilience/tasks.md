# Tasks: harden-backend-db-resilience

Repo: `apps/menthoros-backend` · Branch: `feature/harden-backend-db-resilience`

## 1. Sync de usuário condicional + throttle

- [x] 1.1 Criar propriedade `app.security.user-sync.access-throttle` (Duration, default `PT5M`) com
      `@ConfigurationProperties` ou `@Value`, documentada no `application.yml`.
- [x] 1.2 Em `UsuarioSyncServiceImpl.syncUsuarioFromJwt`: calcular o diff dos campos espelhados do
      JWT (email, nome, sobrenome, emailVerificado, role, owner) **ANTES de qualquer setter** — a
      entidade é gerenciada e o método é `@Transactional`: setter + "não chamar save()" ainda
      flusharia o `UPDATE` por dirty checking. Só mutar quando a decisão já é escrever.
      `registrarAcesso()`/`registrarSincronizacao()` apenas quando o último acesso for mais antigo
      que o throttle. Usuário novo (`createNewUsuario`) continua salvando sempre.
      Invariantes que NÃO mudam: o método sempre retorna o `Usuario` resolvido (o
      `LgpdConsentInterceptor` depende do `USUARIO_ATTR`); `vincularAtletaSeNecessario` roda para
      todo ATLETA sem vínculo, **fora** da condição de escrita; role/owner reconciliam em toda
      requisição, nos dois sentidos (concessão E remoção de `PROPRIETARIO`).
      verify: teste 1.4 verde + zero `UPDATE` no caminho no-op (log de SQL em dev).
- [x] 1.3 Rebaixar `log.info("Usuário sincronizado...")` para `debug`.
      verify: nenhuma linha INFO do sync em requisição de leitura.
- [x] 1.4 Testes de unidade (`UsuarioSyncServiceImplTest`): sem diff + dentro da janela →
      `verify(repo, never()).save(...)` E retorno do `Usuario` resolvido não-nulo; cada campo
      espelhado alterado → salva (parameterizado, incluindo **remoção** de `PROPRIETARIO`); acesso
      fora da janela → salva uma vez; usuário novo → salva; ATLETA órfão + caminho no-op →
      `vincularAtletaSeNecessario` ainda vincula.
- [x] 1.5 Validação: `./mvnw clean test`.

## 2. Pool Hikari

- [ ] 2.1 Orçamento total de conexões (achado convergente do DoR): `SHOW max_connections;` no
      Postgres de produção E somar consumidores — pool × réplicas do backend + Keycloak + sessões
      administrativas + demais serviços. Registrar a conta aqui; só subir o pool se o orçamento
      fechar com folga.
- [ ] 2.2 `application-cloud.yml`: `maximum-pool-size: ${HIKARI_MAX_POOL_SIZE:10}`; atualizar o
      comentário desatualizado sobre "free tier". **Decidido:** aplicar a mesma parametrização em
      `application-dev.yml` (paridade entre ambientes; o default por env var permite divergir por
      ambiente sem tocar código).
- [ ] 2.3 Validação: `./mvnw clean verify` (sobe contexto com a config nova nos `*IT`).

## 3. Logging de produção

- [ ] 3.1 `logback-spring.xml`: loggers `br.com.menthoros.backend.security` e
      `br.com.menthoros.backend.multitenancy` para `INFO` no default; movê-los para `DEBUG` apenas
      dentro de `<springProfile name="dev">`.
- [ ] 3.2 Corrigir/remover o bloco `<springProfile name="prod">` (profile real de produção é `cloud`).
- [ ] 3.3 **Teste automatizado** (gap do DoR — smoke manual não impede regressão): teste de
      contexto com profile `cloud` afirmando
      `LoggerFactory.getLogger("br.com.menthoros.backend.security").isDebugEnabled() == false`
      (idem `multitenancy`); com profile `dev`, `true`. Validação: `./mvnw clean verify`.

## 4. Entrega

- [ ] 4.1 `/qa` (review + testes) e PR `feature/harden-backend-db-resilience → develop`.
- [ ] 4.2 Após merge + deploy em develop, smoke: carregar painel do atleta e conferir volume de logs
      e `hikaricp.connections.active` no Prometheus.
