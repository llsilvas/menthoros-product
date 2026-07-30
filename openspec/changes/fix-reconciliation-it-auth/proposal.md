**Tamanho:** S · **Trilha:** Fast

> Origem: 14 testes vermelhos em `Task5p1ControllerIT`, descobertos ao rodar `./mvnw verify` durante a
> validação de `fix-tsb-recalculo-resiliente` (2026-07-29). **Nenhuma mudança de código de produção** —
> a produção está correta; o teste é que ficou para trás.

## Why

`Task5p1ControllerIT` — a única cobertura de contrato HTTP dos 3 endpoints de reconciliação manual —
está vermelho desde **2026-05-14**, com 14 dos 20 testes retornando 403. Dois defeitos empilhados, os
dois no teste:

1. **Role inexistente.** O teste autentica com `@WithMockUser(roles = {"USER"})`, mas `ROLE_USER` não
   existe no domínio — as roles reais são `TECNICO`, `ATLETA` e `ADMIN` (60 usos de
   `hasAnyRole('TECNICO', 'ADMIN')` no `src/main`). O `@PreAuthorize` do
   `ManualReconciliationController` nega, e `@EnableMethodSecurity` (`CoreSecurityConfig:25`) garante
   que a negação é real.

2. **Sem JWT não há tenant.** Corrigir a role não basta. `JwtTenantFilter:67` só popula o
   `TenantContext` quando `authentication.getPrincipal() instanceof Jwt`; `@WithMockUser` produz um
   principal `User`, então o filtro é no-op e `TenantContext.getRequiredTenantId()` — chamado no
   controller em `:200`, `:266` e `:319` — lança `IllegalStateException`, que o
   `GlobalExceptionHandler` mapeia para **403**.

O `X-Tenant-ID` que o teste envia em toda request **é ignorado pela produção**: o tenant vem do JWT
(claim `tenant_id`, ou `organization.<grupo>.tenant_id`, em `JwtTenantFilter.extractTenantId`) —
exatamente como o `CLAUDE.md` do backend exige. O teste foi escrito em **2026-05-03**, quando o
controller lia o header na mão; o commit `9cf6d20` (**2026-05-14**, "feat(controller): adicionar
controle de acesso") introduziu `@PreAuthorize` e a resolução via `TenantContext`, e não atualizou o
teste.

**Por que ninguém viu por 2,5 meses:** o Surefire só executa `*Test`; `*IT` roda apenas em
`mvn verify`. E o repo `menthoros-backend` **não tem CI** — `.github/workflows` não existe — então o
"CI verde + branch protection" descrito no `CLAUDE.md` da raiz não existe na prática. Um teste de
integração pode apodrecer indefinidamente sem sinal.

**O custo real não é o vermelho.** É que os 3 endpoints de reconciliação manual estão **sem cobertura
de contrato há 2,5 meses** — incluindo autorização e isolamento multi-tenant, que é justamente o que a
reconciliação manual mexe: o treinador vinculando atividade externa ao treino planejado do atleta dele.

## What Changes

- `Task5p1ControllerIT` passa a autenticar pelo **padrão canônico que já existe no repo**:
  `jwtDe(subject, tenantId, papel)` de `OnboardingSensitiveDataAccessIT:277-281` — post-processor
  `jwt()` por request, com claim `tenant_id` e authority `ROLE_<papel>` explícita. Não se inventa
  abordagem nova; replica-se a que funciona.
- O header `X-Tenant-ID` sai de todas as requests — não é lido pela produção.
- Os **2 testes que afirmam um contrato inexistente** (`shouldEnforceTenantHeaderRequirement` e
  `shouldHandleWhenTenantHeaderMissing`, ambos esperando 400 por falta do header) são reescritos como
  **JWT sem `tenant_id` → 403**, que é o comportamento real do `JwtTenantFilter`.
- **Novo caso de 403 por role sem permissão** — autenticado como `ATLETA` num endpoint que exige
  `TECNICO`/`ADMIN`. Hoje nada prova que o `@PreAuthorize` bloqueia quem não deve passar; os 2 testes
  de 401 só cobrem ausência de autenticação.
- A classe é renomeada para **`ManualReconciliationControllerIT`**. `Task5p1ControllerIT` nomeia um
  número de task, não o que testa; o arquivo já será reescrito por inteiro, então o custo marginal é
  nulo.

## Capabilities

Nenhuma capability nova. A change **restaura** cobertura de uma capability existente
(reconciliação manual) — não altera comportamento, contrato de API nem schema.

## Impact

- **Código de produção: zero diff.** Só `src/test`.
- Um único repo (`menthoros-backend`), um único arquivo.
- `./mvnw verify` volta a ser utilizável como gate. Hoje ele é vermelho por padrão, o que treina a
  equipe a ignorá-lo — e foi o que permitiu este defeito sobreviver.
- **Pré-requisito destravado:** habilitar CI no `menthoros-backend` fica viável, porque `verify` passa
  a ter chance de ficar verde. Habilitar o CI **não** é escopo desta change.

## Critérios de aceite

- **CA1** — Dado um JWT com `tenant_id` e authority `ROLE_TECNICO`, quando cada um dos 3 endpoints de
  reconciliação é chamado, então responde conforme o contrato documentado (200/400 por caso), e
  **nenhum** teste da classe retorna 403 por falta de contexto de tenant.
- **CA2** — Dado um JWT com authority `ROLE_ATLETA` (autenticado, sem permissão), quando um endpoint de
  reconciliação é chamado, então responde **403**. Prova que o `@PreAuthorize` bloqueia, não só que
  deixa passar.
- **CA3** — Dada uma request **sem** autenticação, quando um endpoint é chamado, então responde
  **401** — comportamento atual, preservado (é o único que já passava).
- **CA4** — Dado um JWT **sem** claim `tenant_id` e sem `organization`, quando um endpoint é chamado,
  então responde **403**, e a mensagem indica ausência de tenant. Substitui os 2 testes de
  `X-Tenant-ID`.
- **CA5** — Dado o subject do JWT, quando o `JwtTenantFilter` sincroniza o usuário, então o caminho
  exercitado é o de **sucesso**, não o fail-safe `syncFalhou`. O subject é um UUID e a linha de
  `Usuario` existe — senão o teste fica verde exercitando um caminho degradado.
- **CA6** — Quando `./mvnw verify` roda com Docker no ar, então `ManualReconciliationControllerIT`
  passa **integralmente**, e a contagem de testes da classe não diminui em relação aos 20 atuais.

## Métrica de sucesso

`./mvnw verify` sai de **14 falhas** para **0** no escopo de reconciliação, restaurando cobertura de
contrato dos 3 endpoints que o treinador usa para vincular atividade externa ao plano do atleta —
0 minutos de rotina do treinador afetados hoje, e a rede que impede uma regressão silenciosa nesse
fluxo amanhã.

Métrica secundária, verificável no PR: **zero linhas de diff em `src/main`**.

## Open Questions & Assumptions

**Premissas assumidas:**

- A produção está correta e nada nela muda. Sustentada por: `TECNICO`/`ADMIN` é coerente com 60 outros
  pontos do `src/main`, e a resolução de tenant via JWT é o que o `CLAUDE.md` do backend exige.
- O padrão `jwtDe(...)` de `OnboardingSensitiveDataAccessIT` é o alvo correto, por ser precedente
  funcionando no mesmo tipo de teste (`AbstractIntegrationTest` + `@AutoConfigureMockMvc`).
- Um helper **local à classe** basta. `Task5p1ControllerIT` é o único arquivo afetado — dos testes com
  `@WithMockUser`, o outro (`AuditConfigTest`) não usa MockMvc. Extrair helper compartilhado para dois
  chamadores seria infra prematura; se um terceiro IT precisar, aí promove.

**Em aberto:**

- **Quantos dos 20 testes falham por motivo legítimo depois da auth corrigida?** As asserções foram
  escritas em 2026-05-03 contra o contrato daquela data (`jsonPath` de campos de DTO, casos de 400 de
  validação). A sonda provou que o happy path do `pendentes` devolve 200, mas os outros 19 não foram
  verificados um a um. Se algum falhar por divergência real de contrato, **é achado de produção** e
  vira decisão explícita: corrigir a asserção ou abrir bug. Não se ajusta asserção para ficar verde.
- **Habilitar CI no `menthoros-backend`** é a correção estrutural — sem ela, o próximo IT apodrece do
  mesmo jeito. Fora do escopo desta change, mas deve virar change própria.
