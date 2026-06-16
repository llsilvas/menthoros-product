# Design: add-assessoria-onboarding

## Contexto

A multi-tenancy hoje resolve `tenant_id` a partir do JWT. Há dois caminhos já implementados em
`security/JwtTenantFilter.java`:

1. claim direta `tenant_id`;
2. estrutura `organization.<chave>.tenant_id` (mapa por grupo/organização).

O caminho (2) **já é compatível com o shape de claim do Keycloak Organizations**. Hoje o vínculo
lógico assessoria↔Keycloak é feito por `Assessoria.keycloakGroupId` (modelo de Groups).

## Decisão 1 — Padronizar Keycloak Organizations

Adotar o recurso nativo **Organizations** (Keycloak 26.x) como modelo de tenant, uma Organization por
assessoria. Motivos: membership e convites nativos, atributos por organização e claim mapper de
organização que injeta `tenant_id` no token — exatamente o shape que o filtro já lê.

### O que muda
- `Assessoria` ganha `keycloakOrganizationId` (mantém `keycloakGroupId` temporariamente durante a
  transição, depois deprecia).
- O realm `menthoros-app` habilita Organizations e configura um **attribute mapper** na Organization
  que projeta `tenant_id` no token no formato `organization.<org>.tenant_id` (ou claim direta
  `tenant_id`, ambos já suportados pelo filtro).
- `JwtTenantFilter`: mudança mínima ou nenhuma. Se o claim de Organizations vier como
  `organization` (lista de orgs) com `tenant_id` por org, a iteração atual já cobre; validar apenas o
  formato real emitido pelo KC 26 e ajustar o parsing se necessário.

### Plano de migração (Groups → Organizations)
1. Habilitar Organizations no realm `menthoros-app`.
2. Para cada `Assessoria` com `keycloakGroupId`: criar a Organization equivalente, migrar membros do
   Group para a Organization, configurar o atributo `tenant_id` na Organization e gravar
   `keycloakOrganizationId`.
3. Tenant `default`: criar a Organization `default` com o mesmo `tenant_id` já usado, garantindo que
   tokens existentes continuem resolvendo durante a janela de transição (claim direta `tenant_id`
   permanece válida).
4. Após validação, desabilitar a emissão do claim baseada em Group e depreciar `keycloakGroupId`.

> Compatibilidade: enquanto ambos os mappers (Group e Organization) emitirem `tenant_id`, o filtro
> resolve qualquer um — a migração é incremental e sem downtime.

## Decisão 2 — Role `ATLETA`

Adicionar `ATLETA` ao enum `UserRole` e como client role no Keycloak. Atletas têm acesso somente aos
recursos do próprio `Atleta` (escopo reforçado por tenant + vínculo). `podeEscrever()` permanece
`false` para `ATLETA` (atleta não gerencia usuários/configurações; ações próprias do atleta usam
autorização específica de endpoint).

## Decisão 3 — Vínculo `Usuario`↔`Atleta`

**Lado escolhido:** coluna `usuario_id UUID NULL REFERENCES tb_usuario(id) ON DELETE SET NULL` em
`tb_atleta` (um `Atleta` referencia, no máximo, uma conta `Usuario`).

Justificativa: `Atleta` já é o agregado central e pode existir **antes** da conta (cadastrado pelo
coach, conta criada só no aceite do convite) — daí a nulidade. Manter o FK no lado `Atleta` evita
poluir `Usuario` (que é cache do Keycloak) com semântica de domínio e mantém `Usuario` reutilizável
para `TECNICO`/`ADMIN` sem `Atleta`.

Resolução em runtime: dado o `sub` do JWT (= `Usuario.id`), buscar `Atleta` por `usuario_id` dentro
do tenant. Exposto pela change `add-current-user-endpoint` (#1) como `atletaId` em `GET /me`.

## Decisão 4 — Onboarding do atleta por convite

Fluxo:
1. Coach cadastra o `Atleta` (sem conta) — `Atleta.email` já existe e é único.
2. `POST /api/v1/atletas/{id}/convite` gera (ou reenvia) um convite. Reusa o convite nativo de
   Organization do Keycloak quando possível; caso contrário, token de convite próprio + envio de email.
3. No primeiro acesso, a conta `ATLETA` é provisionada no Keycloak, adicionada como membro da
   Organization da assessoria e o `Atleta.usuario_id` é preenchido (vínculo efetivado).
4. Reenvio é **idempotente** em relação ao estado de vínculo: não duplica `Atleta` nem `Usuario`.

## Alternativas consideradas

- **Manter Groups:** rejeitado — convites/membership nativos das Organizations reduzem código custom
  e o filtro já suporta o claim.
- **FK em `tb_usuario`:** rejeitado — acopla o cache do Keycloak ao domínio e complica contas sem
  atleta (coach/admin).
- **Auto-signup do atleta (sem convite):** rejeitado — o coach é o dono do cadastro; convite garante
  controle de quem entra no tenant.
