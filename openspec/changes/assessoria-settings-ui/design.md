# Design — assessoria-settings-ui

> Revisado em 2026-08-14 para refletir as decisões D1 (logo em BLOB no Postgres), D2 (role
> `PROPRIETARIO`) e D3 (**cores fora do escopo por inteiro** — nem edição, nem aplicação).
> Ver `proposal.md`.

## Autorização — role `PROPRIETARIO` + flag `owner` (D2, revisado)

O enum atual (`enums/UserRole.java`) é `ADMIN, TECNICO, VISUALIZADOR, ATLETA`, e o `ADMIN` é usado
como administrador de plataforma em `POST /api/admin/assessorias`. Não há como distinguir o dono da
assessoria de um técnico contratado — e o coach criado pelo auto-cadastro nasce `TECNICO`
(`services/impl/CoachSignupServiceImpl.java:59,160`).

`PROPRIETARIO` entra como **role composite de realm que inclui `TECNICO`**. A escolha por composite
não é cosmética: existem 61 anotações `hasAnyRole('TECNICO','ADMIN')` no `src/main`, e sem a
composição o fundador perderia acesso a tudo que já fazia no dia em que ganhasse a role nova.

### Por que a role sozinha não basta — e por que existe uma flag no banco

`Usuario.role` é **single-valued**, e `UsuarioSyncServiceImpl.mapToUserRole` (`:160-173`) colapsa a
lista de roles do JWT numa cadeia `if/else` (`ADMIN` → `TECNICO` → `ATLETA` → `VISUALIZADOR`). Com a
composite, o token traz `PROPRIETARIO` **e** `TECNICO`, e o banco grava `TECNICO`. O
`@PreAuthorize` funciona (lê authorities do JWT), mas o espelho local nunca sabe quem é o dono.

Priorizar `PROPRIETARIO` na cadeia seria pior, porque o campo não comporta os dois papéis. O dono
sairia de:

| Consumidor | Efeito |
|---|---|
| `UsuarioRepository.java:83` `countByTenantIdAndRoleAndAtivoTrue` | dono some da contagem de técnicos — e é a query do `uso.tecnicos` **desta change**, com `maxTecnicos=1` no BASIC |
| `Usuario.java:167` `isTecnico()` | `false` para o dono |
| `Usuario.java:174` `podeEscrever()` | `false` para o dono |

**Decisão (2026-08-14, após DoR):** `role` permanece `TECNICO` e a propriedade vira uma coluna
booleana `owner` em `tb_usuario`. Nada que hoje lê `role` muda de comportamento.

O campo nasce em **inglês** por força do ADR-0007 (`CLAUDE.md` do backend: código novo — campos,
colunas, tipos — nasce em inglês), enquanto a constante do enum mantém `PROPRIETARIO` porque espelha
o nome da role no realm. O par `PROPRIETARIO` (contrato do IdP) → `owner` (campo local) é
deliberado, não descuido.

**O Keycloak continua sendo a fonte única.** A flag é espelho, não segunda verdade: o sync a
atualiza a cada requisição a partir das roles do JWT — exatamente a mecânica que já existe para
`role`. Se as duas divergirem, o token vence no próximo acesso.

```
Keycloak (fonte)          →  JWT roles  →  sync espelha
  PROPRIETARIO (composite)               usuario.role  = TECNICO   (inalterado)
  └─ TECNICO                             usuario.owner = true      (derivado)

@PreAuthorize("hasRole('PROPRIETARIO')")   ← autorização, via JWT
usuario.isOwner()                          ← lógica de domínio, via banco
```

- **Realm:** declarar em `menthoros-infra/keycloak/menthoros-realm.json` (bloco `roles.realm`, ao
  lado das quatro existentes) com `"composite": true` e `TECNICO` como associada. Aplicar por
  `sync-realm.sh` nos dois ambientes — **nunca pelo console**, que não deixa rastro e faz o arquivo
  divergir em silêncio.
- **Backend:** acrescentar `PROPRIETARIO` ao `UserRole` (necessário para o mapeamento de
  authorities; `config/core/CoreSecurityConfig.java:63-70` já cobre a role nova sem mudança) e **não
  incluí-la em `mapToUserRole`** — a cadeia continua devolvendo `TECNICO`.
- **Sync:** `UsuarioSyncServiceImpl` passa a espelhar `usuario.setOwner(roles.contains("PROPRIETARIO"))`.
- **Signup:** `CoachSignupServiceImpl` atribui `PROPRIETARIO` ao fundador no Keycloak. Como é
  composite, o token continua trazendo `TECNICO`, e o sync liga a flag no primeiro acesso.
- **Endpoints desta change:** `hasRole('PROPRIETARIO')` no PATCH, upload e DELETE; o GET aceita
  `hasAnyRole('TECNICO','PROPRIETARIO','ADMIN')` — consultar plano e uso não é privilégio de dono.
- **Coaches existentes:** backfill na task 0.4, em **duas pernas** — atribuir a role no Keycloak (a
  autoridade) e popular a flag por migration (para quem não logou ainda). A regra candidata é
  "primeiro `TECNICO` de cada assessoria, por `createdAt`", mas precisa ser conferida contra os
  dados reais: assessoria sem técnico, com empate, ou com vários não pode ficar sem dono nem ganhar
  dois. Caso ambíguo vira lista para atribuição manual, nunca escolha silenciosa.

## Contratos

Usar o plural consistente `assessorias`:

`GET /api/v1/assessorias/me`

```json
{
  "id": "...",
  "nome": "Corridas Serra",
  "temLogo": true,
  "logoUrl": "/api/v1/assessorias/me/logo",
  "plano": "BASIC",
  "uso": { "atletas": 7, "maxAtletas": 10, "tecnicos": 1, "maxTecnicos": 1 },
  "version": 3
}
```

Sem `corPrimaria`/`corSecundaria` (D3): expor um campo que nenhum cliente consome e nenhum endpoint
altera criaria contrato morto — e contrato morto é o que o `AssessoriaOutputDto` atual já demonstra
ser fácil de acumular.

`logoUrl` é sempre uma rota **do próprio produto**, nunca uma URL de terceiro. É o que permite trocar
BLOB por object storage depois sem quebrar o cliente. `temLogo: false` ⇒ `logoUrl: null`, e o front
cai no fallback de iniciais.

`PATCH /api/v1/assessorias/me`

```json
{
  "nome": "Corridas Serra Pro",
  "version": 3
}
```

`nome` é o único campo editável nesta change. `null` não apaga neste MVP. Respostas: `200`, `400`,
`403`, `409` por versão obsoleta. `tenantId`, plano, limites, slug/domínio, `logoUrl` **e as cores**
não são aceitos no patch — cor enviada é erro explícito, não campo ignorado.

**Isso não acontece sozinho.** O default do Spring Boot é `FAIL_ON_UNKNOWN_PROPERTIES = false`, e o
projeto não sobrescreve isso em lugar nenhum — um `corPrimaria` no payload seria descartado em
silêncio, que é precisamente o contrato fantasma que a regra existe para evitar. O DTO do PATCH
precisa de `@JsonIgnoreProperties(ignoreUnknown = false)` (ou validação equivalente) **e** um teste
que envie `corPrimaria` e espere `400`. Sem o teste, a garantia é uma frase.

O PATCH parece magro para uma change M, e é: o peso está no upload, na role e na concorrência. Ele
existe agora com um campo só porque é o contrato que o `coach-first-login-wizard` vai reutilizar, e
porque `@Version` + `409` precisam de um caminho de escrita para serem exercitados.

`POST /api/v1/assessorias/me/logo` — multipart `arquivo` + `version`; devolve o output atualizado.
PNG/JPEG/WebP, até **2 MiB**, dimensões máximas 2048×2048. SVG fica fora por risco de conteúdo
ativo. O backend **decodifica a imagem** para validar (assinatura real, não extensão nem
`Content-Type` do cliente), e nunca usa nome ou path vindos do cliente.

`GET /api/v1/assessorias/me/logo` — devolve os bytes com o `Content-Type` persistido e `ETag` (hash
do conteúdo) + `Cache-Control: private`. Responde `304` quando o `If-None-Match` bate, para que a
página não retrafegue a imagem a cada render.

`DELETE /api/v1/assessorias/me/logo` — remove a logo e volta ao fallback. Sem ele, a única forma de
desfazer um upload errado seria subir outra imagem.

**O DELETE carrega `version` como o PATCH e o upload** (`?version=3` ou corpo), com o mesmo
`hasRole('PROPRIETARIO')`, a mesma busca tenant-scoped, o mesmo bump de versão e o mesmo `409` em
versão obsoleta. A primeira redação desta seção omitiu isso, e a omissão era um defeito: uma aba
aberta antes de um upload apagaria a imagem nova sem conflito, que é exatamente o lost update que a
`@Version` existe para impedir — só que com perda de dado em vez de sobrescrita de texto.

## Persistência da logo (D1)

Os bytes vivem em **tabela 1:1 separada**, `tb_assessoria_logo`, não em coluna de `tb_assessoria`:

```
tb_assessoria_logo
  assessoria_id  PK/FK -> tb_assessoria(id), ON DELETE CASCADE
  conteudo       bytea       NOT NULL
  content_type   varchar(40) NOT NULL
  tamanho_bytes  integer     NOT NULL
  etag           varchar(64) NOT NULL   -- hash do conteúdo
  atualizado_em  timestamptz NOT NULL
```

O motivo da tabela separada é mecânico: `Assessoria` é carregada em caminhos quentes, e um `@Lob` na
própria entidade viaja junto em qualquer `SELECT *` que o Hibernate gere — `@Basic(fetch = LAZY)` em
LOB é notoriamente frágil sem instrumentação de bytecode. Tabela separada torna o carregamento
acidental impossível por construção, em vez de depender de um hint respeitado.

A coluna `logo_url` existente em `tb_assessoria` (varchar 500, hoje nunca escrita por nenhum
endpoint) **não é usada** por esta change; a URL é derivada de `temLogo`. Não removê-la aqui — a
limpeza pertence a quem migrar para storage externo.

Fluxo do upload: validar → gravar/atualizar `tb_assessoria_logo` → bump da `@Version` da assessoria,
**tudo numa transação**. Não existe compensação nem job de limpeza de órfãos: bytes e ponteiro
commitam ou revertem juntos. Essa é a principal simplificação que D1 compra sobre object storage, e
vale registrar porque os critérios de aceite originais previam órfãos.

## Serviço, autorização e consistência

Controller obtém usuário/tenant do principal — o cliente **nunca** envia `tenantId` como autoridade.
Repository/query também é tenant-scoped, como defesa em profundidade.

### Gate de coerência tenant × usuário (obrigatório nas escritas)

Antes de aplicar PATCH, upload ou DELETE, o serviço verifica que
`usuario.assessoria.id == TenantContext.getRequiredTenantId()`; divergência ⇒ `403`, sem escrita.

O motivo não é redundância defensiva — é uma ambiguidade real do modelo atual, levantada por revisão
adversarial em 2026-08-14:

- `Usuario.assessoria` é `@ManyToOne(optional = false)` com FK `tenant_id NOT NULL`
  (`entity/Usuario.java:49-51`) e `keycloak_id` é `unique` (`:59`). **O banco proíbe um usuário em
  dois tenants.**
- **O Keycloak não.** Adicionar o mesmo usuário a duas Organizations é permitido, e nesse caso
  `JwtTenantFilter.java:192-214` itera um `Map` e devolve **a primeira** organization com `tenant_id`
  válido — ordem de iteração de JSON desserializado, portanto arbitrária. Não há detecção de
  ambiguidade nem erro, e nenhum teste cobre multi-org
  (`JwtTenantFilterTenantResolutionTest` testa apenas uma).
- `UsuarioSyncServiceImpl.java:60-61` busca por `findByKeycloakId` **sem filtrar tenant** e **nunca
  atualiza `assessoria`**. Se o mesmo `sub` chegar com outro `tenant_id`, o `TenantContext` aponta
  para B enquanto `usuario.assessoria` permanece A, em silêncio.

Hoje isso é latente porque não existe escrita de identidade de assessoria. Esta change cria a
primeira — daí o gate. Note que ele **não** conserta a resolução ambígua de tenant, apenas impede
que ela produza escrita no tenant errado; a correção da resolução é maior que esta change e deve
virar item de segurança próprio.

**Precisão sobre o alcance do gate:** ele roda no serviço, e o `JwtTenantFilter:120` já chamou o
sync antes disso — ou seja, um JWT ambíguo ainda grava email/nome/role/último acesso no `Usuario`
antes de tomar `403`. Isso é pré-existente e **não** é escrita cross-tenant (`assessoria` nunca é
reatribuída, `UsuarioSyncServiceImpl:60-61`), mas convém não descrever o gate como se impedisse toda
escrita: ele protege a assessoria, não a linha do usuário.

Uma role tenant-scoped (client role por organization) resolveria isso na origem, mas exigiria
reestruturar o modelo de roles no Keycloak — desproporcional enquanto o banco garante 1:1.


`@Version` **não existe** em `Assessoria` hoje (confirmado em `entity/Assessoria.java`; o padrão já
está em `TreinoPlanejado.java:29` e `PlanoSemanal.java:110`). A migration Flyway que adiciona a coluna
é obrigatória e precisa popular as linhas existentes com `0` — sem `DROP` nem perda de dado.

Contagens (`uso.atletas`, `uso.tecnicos`) são calculadas no GET por queries agregadas tenant-scoped,
sem carregar a coleção `atletas` da entidade. Limites e plano são sempre read-only.

Nome normalizado (trim, colapso de espaços). As colunas `cor_primaria`/`cor_secundaria` de
`tb_assessoria` não são lidas nem escritas por esta change — mantêm os defaults do schema
(`#6366F1`/`#EC4899`, `V45__Reconcile_schema_readd_missing_columns.sql:24`).

## Frontend

A página vive sob o grupo "Configurações", ao lado da `/coach/settings` atual
(`features/coach/pages/CoachSettingsPage.tsx`, hoje com "Dados pessoais" e "Privacidade"). Carrega o
GET, mantém um único draft de nome, mostra dirty state e pede confirmação ao sair. O nome salva por
PATCH; o upload é ação separada, com progresso, e só troca o preview definitivo após a resposta.

**Sem nada de cor (D3):** nenhum seletor, nenhum cálculo de contraste, nenhum preview de tema. A
única prévia é a da própria imagem enviada. O shell, o header e a sidebar continuam com o tema
estático de `src/theme/tokens.ts`, e a logo **não** aparece neles nesta change — ela é exibida na
página de configuração, que é onde o coach confirma que subiu a imagem certa. Levar a logo ao shell
depende do mesmo provider de branding que ficou para a change de cores.

Não há cache compartilhado de assessoria para invalidar (`useCurrentUser` deriva um `tenant` que não
chega ao outlet context, e o header lê o nome do claim `organization` do JWT). Portanto o "atualizar
o cache do shell" da versão anterior deste design **não se aplica**: a página revalida o próprio
GET e nada mais precisa reagir.

## Falhas e operação

- `409`: preservar draft e oferecer comparar/recarregar, sem sobrescrever silenciosamente.
- Falha de imagem (formato, tamanho, decode): manter a logo anterior e permitir retry.
- Imagem ausente ou quebrada: fallback com iniciais/nome.
- Métricas de update/upload/falha, **sem** nome de arquivo ou tenant como label de alta cardinalidade.

## Rollout

Ordem: role `PROPRIETARIO` no realm (dois ambientes) → migrations (`@Version` + `tb_assessoria_logo`)
→ APIs → frontend. Feature flag pode ocultar o upload independentemente do campo de nome.

Sem storage externo, o rollout perde os passos de bucket, CORS e lifecycle que a versão anterior
previa — mas ganha um passo mais delicado: **a role no Keycloak precisa estar sincronizada antes de o
backend subir exigindo-a**, ou o dono da assessoria toma `403` na própria configuração.

## Rollback

Flyway não desfaz migration, então o caminho de volta é por comportamento, não por schema:

- **Desligar o recurso sem tocar no banco:** a feature flag oculta o upload; para neutralizar a
  exigência de dono, o gate volta a `hasAnyRole('TECNICO','ADMIN')` por deploy. As duas tabelas
  continuam de pé sem efeito — schema órfão não quebra nada.
- **Role no realm:** não remover `PROPRIETARIO` do Keycloak em rollback. Removê-la invalida tokens
  emitidos e derruba quem já a tinha; deixá-la inerte não causa dano, já que só esta change a
  consulta.
- **Backfill errado (task 0.4):** corrigir é `UPDATE` da flag + reatribuição da role no Keycloak.
  Por isso a lista de casos ambíguos precisa ser registrada no PR — sem ela não há como saber quem
  foi atribuído por regra e quem foi por engano.
- **Logo já persistida com a flag desligada:** os bytes permanecem em `tb_assessoria_logo` e param
  de ser servidos. Nada a limpar; religar a flag os traz de volta.

## Orçamento operacional do BLOB

Registrado porque D1 troca custo de infra por custo de banco, e o segundo é menos visível:

- Teto de 2 MiB por logo, **uma linha por assessoria** (PK = `assessoria_id`), sem histórico — o
  limite superior é `nº de assessorias × 2 MiB`. Substituição é `UPDATE`, não acúmulo.
- Cada troca gera WAL do tamanho da imagem e entra nos backups. Na escala atual é irrelevante; o
  gatilho para reavaliar é a tabela passar de ~1 GB ou o tempo de restore incomodar.
- Sem quota por tenant e sem rate limit de troca neste MVP — a superfície é limitada a usuários
  autenticados com `PROPRIETARIO`, um por assessoria. Se isso mudar, rate limit vem antes de storage
  externo.
