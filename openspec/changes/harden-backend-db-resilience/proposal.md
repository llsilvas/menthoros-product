# Proposal: harden-backend-db-resilience

**Tamanho:** S · **Trilha:** Fast (um repo — backend; sem mudança de contrato de API nem de schema;
três correções pequenas de configuração/comportamento. Toca o `JwtTenantFilter`, que é superfície de
segurança, mas a mudança é só em **quando** o sync escreve, não em resolução de tenant nem em
decisão de acesso — por isso não sobe para Full.)

## Status

- Proposta inicial (2026-09-04) — derivada do incidente de produção do mesmo dia.
- **DoR gate (2026-09-04): NOT READY na 1ª passada, corrigido na mesma revisão.** `spec-reviewer`:
  2 gaps (sem seção de Rollback; critérios 4/5 dependiam de smoke manual → viraram teste de
  contexto automatizado). Pre-mortem Codex: 2 críticos + 3 moderados, todos incorporados — diff
  **antes** dos setters (dirty checking em método `@Transactional` flusharia UPDATE mesmo sem
  `save()`); `vincularAtletaSeNecessario` fora da condição de escrita; reconciliação de role nos
  dois sentidos; orçamento total de conexões (achado convergente com o spec-reviewer); no-op
  continua retornando `Usuario` resolvido (contrato do `LgpdConsentInterceptor` via
  `USUARIO_ATTR`).

## Why

Incidente em produção (2026-09-04, ~20h): uma transação aberta e esquecida numa ferramenta de banco
(GUI, `idle in transaction` por 11+ minutos) segurou um lock de linha em `tb_usuario`. Isso bastou
para derrubar a API inteira, porque o sistema amplificou o problema em três estágios:

1. **`UPDATE tb_usuario` a cada requisição.** O `JwtTenantFilter` chama
   `UsuarioSyncServiceImpl.syncUsuarioFromJwt`, que executa `registrarAcesso()` +
   `usuarioRepository.save()` incondicionalmente — toda requisição autenticada escreve na linha do
   usuário. Com a linha lockada, cada requisição enfileirou um UPDATE bloqueado.
2. **Pool Hikari de 5 conexões.** Cada UPDATE bloqueado segura uma conexão. O painel do atleta faz
   ~6 chamadas paralelas por carga de página; em segundos as 5 conexões estavam presas
   (`active=5, waiting=17`), todo o resto — inclusive o health check do Actuator — passou a falhar
   com timeout de 30s, e o Railway respondeu 503 para tudo.
3. **DEBUG ativo em produção.** `logback-spring.xml` fixa `br.com.menthoros.backend.security` e
   `.multitenancy` em DEBUG para todos os profiles (4+ linhas por requisição), e cada falha de pool
   gera stack trace de ~100 linhas. A enxurrada estourou o rate limit de 500 logs/s do Railway, que
   **descartou logs** — apagando parte da evidência do próprio incidente.

O gatilho foi humano (transação esquecida), mas qualquer lock ou lentidão pontual em `tb_usuario`
reproduz a cascata. Com as assessorias fundadoras entrando, a janela de exposição só cresce.

## What Changes

Tudo em `apps/menthoros-backend`:

1. **Sync de usuário escreve só quando necessário** (`UsuarioSyncServiceImpl.syncUsuarioFromJwt`):
   - Persistir apenas quando algum campo espelhado do JWT mudou (email, nome, sobrenome,
     emailVerificado, role, owner) **ou** quando o último acesso registrado está mais velho que um
     intervalo de throttle (default 5 min, configurável em `app.security.user-sync.access-throttle`).
   - **O diff é calculado ANTES de qualquer setter** (pre-mortem Codex): a entidade é gerenciada e o
     método é `@Transactional` — mutar e "não chamar `save()`" ainda flusharia o `UPDATE` por dirty
     checking. Só mutar quando a decisão já é escrever.
   - Requisição sem nada a escrever não executa nenhum `UPDATE` — e **retorna o `Usuario` resolvido
     normalmente**: o `LgpdConsentInterceptor` depende do atributo `USUARIO_ATTR` depositado pelo
     filtro; no-op de escrita nunca pode virar retorno vazio (503 em escrita de técnico).
   - Reconciliação de role/owner acontece em **toda** requisição, dentro ou fora da janela de
     throttle — inclusive **remoção** de `PROPRIETARIO`, não só concessão (o diff cobre os dois
     sentidos).
   - `vincularAtletaSeNecessario` roda **fora da condição de escrita** — em toda requisição de
     ATLETA sem vínculo, mesmo quando o sync não escreve nada (senão atleta órfão pré-existente
     nunca seria vinculado em acessos normais).
2. **Pool Hikari dimensionado para o padrão real de acesso** (`application-cloud.yml`):
   - `maximum-pool-size` de 5 → **10**, parametrizado por env var (`HIKARI_MAX_POOL_SIZE`) com
     default 10. O comentário atual ("Railway free tier limita conexões") está desatualizado — o
     Postgres do Railway atual suporta ~100 conexões; validar o limite efetivo antes do merge.
   - Manter `connection-timeout` de 30s (o problema não era ele).
3. **Logging de produção sem DEBUG** (`logback-spring.xml`):
   - Loggers `security` e `multitenancy` de DEBUG → **INFO** no default; DEBUG só dentro de
     `<springProfile name="dev">`.
   - Corrigir o bloco `springProfile name="prod"` — o profile de produção real é `cloud`; o bloco
     nunca ativa. Alinhar para `cloud` (ou remover, já que o default passa a ser correto).
   - Rebaixar o `log.info("Usuário sincronizado...")` do sync para `debug` — com o throttle ele fica
     raro, mas em INFO ainda é uma linha por escrita.

## Non-goals

- Não mexer na resolução de tenant, em `shouldNotFilter`, no fail-safe de sync nem na decisão de
  acesso (`ativo`/423) do `JwtTenantFilter`.
- Não implementar o `syncUsuariosPendentes` em background (TODO existente, fora de escopo).
- Não tratar os listeners `@Async` que seguram conexão durante chamada de LLM — já rastreado em
  `refactor-async-llm-listeners-outside-transaction`.
- Não adicionar alerta/observabilidade nova (métricas Hikari já existem via Micrometer).

## Critérios de aceite

1. **Given** uma requisição autenticada de um usuário cujos dados do JWT são idênticos aos de
   `tb_usuario` e cujo último acesso foi registrado há menos que o throttle, **when** o filtro
   processa a requisição, **then** nenhum `UPDATE` em `tb_usuario` é executado.
2. **Given** um JWT em que a role mudou — **tanto concessão quanto remoção** de `PROPRIETARIO` —
   **when** o filtro processa, **then** o usuário é persistido com a role/flag nova na mesma
   requisição, mesmo dentro da janela de throttle.
2b. **Given** uma requisição em que o sync não tem nada a escrever (no-op), **when** o filtro
   processa, **then** o `Usuario` resolvido é retornado e depositado em `USUARIO_ATTR`
   (o `LgpdConsentInterceptor` continua funcionando), e `vincularAtletaSeNecessario` ainda roda
   para ATLETA sem vínculo.
3. **Given** último acesso registrado há mais tempo que o throttle, **when** nova requisição chega,
   **then** o acesso é registrado (uma escrita), e requisições subsequentes dentro da janela não
   escrevem.
4. **Given** o profile `cloud`, **when** a aplicação sobe, **then** o pool Hikari tem 10 conexões
   (ou o valor de `HIKARI_MAX_POOL_SIZE`) e nenhum logger de `br.com.menthoros.backend.*` está em
   DEBUG — **verificado por teste de contexto automatizado** (`isDebugEnabled()` false com profile
   `cloud`), não por smoke manual, para a regressão não voltar sem o CI acusar.
5. **Given** o profile `dev`, **when** a aplicação sobe, **then** `security`/`multitenancy`
   continuam em DEBUG (comportamento de diagnóstico local preservado).

## Métrica de sucesso

- Zero `UPDATE tb_usuario` em requisições de leitura dentro da janela de throttle (verificável por
  log de SQL em dev e pela métrica `hikaricp.connections.usage` em produção).
- Em incidente análogo (lock em `tb_usuario`), a API degrada apenas nas rotas que escrevem no
  usuário — navegação de leitura do coach/atleta continua respondendo (pool não esgota).
- Volume de logs em produção abaixo do limite de 500 logs/s do Railway em operação normal e em
  cenário de erro repetido.

## Open Questions & Assumptions

- **Assumido:** 5 min é um throttle razoável para `ultimo_acesso` (o dado não alimenta decisão de
  acesso em tempo real). Ajustável por propriedade.
- **Assumido:** o limite de conexões do Postgres do Railway comporta o **orçamento total** de
  conexões — não só `SHOW max_connections`, mas `pool × réplicas do backend + Keycloak + sessões
  administrativas + demais serviços`. Validar o orçamento completo na task 2.1, **antes** de subir
  o pool (achado convergente dos dois reviewers do DoR).
- **Em aberto:** vale registrar `ultimo_acesso` de forma assíncrona (fila/evento) em vez de
  throttle? Decidido que não nesta change — throttle é suficiente e não adiciona infraestrutura.

## Riscos e mitigações

- **Risco:** a comparação de diff esquecer um campo espelhado e o banco divergir do Keycloak
  silenciosamente. **Mitigação:** teste de unidade cobrindo cada campo espelhado (mudou → escreve,
  nos dois sentidos — concessão e remoção).
- **Risco:** dirty checking do Hibernate flushar `UPDATE` mesmo sem `save()` (método
  `@Transactional`, entidade gerenciada). **Mitigação:** diff calculado antes de qualquer setter;
  teste afirmando zero interação de escrita no caminho no-op.
- **Risco:** subir o pool mascarar vazamentos futuros de conexão. **Mitigação:** manter
  `connection-timeout` 30s e as métricas Hikari; o sintoma continua visível, só não derruba tudo.
- **Risco residual (aceito):** o health check continua dependendo do banco — um lock suficientemente
  amplo ainda derruba o liveness. Esta change reduz a superfície (menos escritas por requisição),
  não elimina a dependência.

## Rollback

Cada mudança tem reversão independente:

1. **Sync condicional:** `app.security.user-sync.access-throttle=PT0S` desliga o throttle sem
   deploy de código (volta a registrar acesso sempre); se o próprio diff mascarar divergência,
   reverter o commit — o comportamento antigo (escrever sempre) é o estado anterior do arquivo.
2. **Pool:** `HIKARI_MAX_POOL_SIZE=5` na env do Railway restaura o valor atual sem mudança de
   código (restart do serviço aplica).
3. **Logback:** reverter o commit; configuração sem estado, sem migração.
