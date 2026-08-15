# Tasks — assessoria-settings-ui

> Revisado em 2026-08-14 após as decisões D1/D2/D3 (ver `proposal.md`). A seção 0 é nova e
> bloqueia o resto; as tasks de object storage saíram.

## 0. Propriedade da assessoria — role + flag (bloqueia 1.5 em diante)

- [x] 0.1 Declarar `PROPRIETARIO` em `menthoros-infra/keycloak/menthoros-realm.json` como role de realm **composite** incluindo `TECNICO`; PR no `menthoros-infra`.
  `verify:` ✅ JSON válido, `composite: true` com `composites.realm = ["TECNICO"]`, description em 132/255 chars. Commit `35d882d`.
- [ ] 0.2 Aplicar por `sync-realm.sh` no HomeLab e no Railway `develop`; conferir **no token emitido** que o composite traz `TECNICO` junto. Nunca pelo console.
  `verify:` decodificar um JWT real e ver `realm_access.roles` com as duas.
- [x] 0.3 Adicionar `PROPRIETARIO` ao enum `UserRole` **sem incluí-la em `mapToUserRole`** — a cadeia continua devolvendo `TECNICO`.
  `verify:` ✅ `UsuarioSyncServiceImplRoleTest` 7/7 — JWT com `PROPRIETARIO`+`TECNICO` resolve `TECNICO`, e `isTecnico()`/`podeEscrever()` seguem `true`. Commit `422b378`.
- [x] 0.3b Migration: coluna booleana `owner` em `tb_usuario`, `NOT NULL DEFAULT false`.
  `verify:` ✅ `./mvnw clean verify` com Docker no ar: **2511 unitários + 68 IT, 0 falhas, 0 erros**. Como o perfil de teste usa `ddl-auto: validate` sobre o schema do Flyway, os ITs só passam se a coluna existir — a V77 subiu contra Postgres real. Commit `9e5c8e3`.
- [x] 0.3c `UsuarioSyncServiceImpl` espelha `usuario.setOwner(roles.contains("PROPRIETARIO"))` a cada sync.
  `verify:` ✅ `UsuarioSyncServiceImplRoleTest` 10/10 — liga com a role, não liga sem ela, e **desliga** quando a role some do token. Commit `9e5c8e3`.
- [x] 0.3d `CoachSignupServiceImpl` atribui `PROPRIETARIO` ao fundador no Keycloak.
  `verify:` ✅ `CoachSignupServiceImplTest` 35/35 — a role atribuída é `PROPRIETARIO` e o `Usuario` local nasce `TECNICO` + `owner=true`. **Desvio deliberado do plano:** a flag liga já no signup, não só no primeiro acesso, para fechar a janela entre cadastro e login na qual o dono não seria dono no banco. O sync reespelha a cada acesso de qualquer forma. Commit `3263208`.
- [x] 0.3e Confirmar por teste que nenhum consumidor de `role` mudou: `countByTenantIdAndRoleAndAtivoTrue` ainda conta o dono como técnico, `isTecnico()` e `podeEscrever()` seguem `true`.
  `verify:` ✅ `UsuarioOwnerRepositoryTest` 5/5 contra Postgres real. **Seção validada:** `./mvnw clean verify` → 2518 unitários + 68 IT, 0 falhas, 0 erros. Commit `c4306e0`.
- [ ] 0.4 **Decidir e executar o backfill dos coaches existentes — gate de deploy, não de merge.** Rodar a consulta de diagnóstico primeiro e classificar cada assessoria: com um único `TECNICO`, com vários, sem nenhum, com empate de `createdAt`. Só o primeiro caso é automático; os demais viram **lista para atribuição manual**, nunca escolha silenciosa. O backfill tem **duas pernas**: atribuir a role no Keycloak (autoridade) e popular a flag por migration (para quem ainda não logou). **O backend não sobe exigindo `PROPRIETARIO` antes disso** — o coach existente não perde nada que já tinha (nenhum `@PreAuthorize` atual muda), mas ficaria sem acesso ao recurso novo da própria assessoria.
  `verify:` toda assessoria ativa tem exatamente um dono, ou está na lista de exceções registrada no PR.
- [ ] 0.5 Verificar que as 61 anotações `hasAnyRole('TECNICO','ADMIN')` seguem alcançáveis pelo fundador — teste de integração com token real de `PROPRIETARIO` batendo num endpoint existente.
  `verify:` `200`, não `403`.

## 1. Backend

- [x] 1.1 Migration Flyway: coluna `@Version` em `tb_assessoria` populada com `0` nas linhas existentes. Sem `DROP`, sem perda de dado.
  `verify:` migration sobe limpa; um segundo `PATCH` com versão antiga dá `409`.
- [x] 1.2 Migration Flyway: tabela `tb_assessoria_logo` (PK/FK `assessoria_id` com `ON DELETE CASCADE`, `conteudo bytea`, `content_type`, `tamanho_bytes`, `etag`, `atualizado_em`).
  `verify:` apagar uma assessoria em teste leva a logo junto (cascade).
- [x] 1.3 Mapear a entidade da logo em tabela separada e confirmar, por teste, que carregar `Assessoria` **não** traz os bytes.
  `verify:` teste com contagem de SQL (ou log do Hibernate) provando que o `SELECT` da assessoria não toca `tb_assessoria_logo`.
- [x] 1.4 `GET /api/v1/assessorias/me` com identidade, `temLogo`/`logoUrl` derivada, plano, uso por queries agregadas tenant-scoped e `version`. Autorização `hasAnyRole('TECNICO','PROPRIETARIO','ADMIN')`.
  `verify:` resposta bate com o JSON do `design.md`; `uso.tecnicos` conta o dono (ele continua `TECNICO`).
- [x] 1.5 `PATCH /api/v1/assessorias/me`: apenas `nome` editável (normalizado), `hasRole('PROPRIETARIO')`, `409` em versão obsoleta, e **rejeição explícita de campo desconhecido** — `@JsonIgnoreProperties(ignoreUnknown = false)` no DTO ou validação equivalente, já que o default do Spring Boot descartaria `corPrimaria` em silêncio.
  `verify:` teste enviando `corPrimaria` e esperando `400`.
- [x] 1.6 `POST /api/v1/assessorias/me/logo`: multipart (habilitar `spring.servlet.multipart`, hoje ausente), limite de 2 MiB, decode real da imagem (não confiar em extensão nem `Content-Type`), dimensões máximas, gravação transacional com bump de versão.
  `verify:` um `.png` renomeado a partir de um texto é rejeitado; um PNG válido de 2,1 MiB também.
- [x] 1.7 `GET /api/v1/assessorias/me/logo` com `Content-Type` persistido, `ETag`, `Cache-Control: private` e `304` em `If-None-Match`; e `DELETE` com **`version` obrigatória, `hasRole('PROPRIETARIO')`, bump de versão e `409` em versão obsoleta** — mesmo contrato do PATCH.
  `verify:` segunda requisição com o `ETag` devolve `304` sem corpo; `DELETE` com versão velha devolve `409` e a imagem continua servível.
- [x] 1.8 Implementar o **gate de coerência** `usuario.assessoria.id == TenantContext.getRequiredTenantId()` nas três escritas (PATCH, upload, DELETE), com `403` em divergência.
  `verify:` teste que monta o cenário divergente e espera `403` sem escrita na assessoria.
- [x] 1.9 Testes: campos omitidos/null, cor no payload rejeitada, concorrência (`409`), **upload-vs-delete e delete-vs-upload com versão obsoleta**, `TECNICO` sem `PROPRIETARIO` recebendo `403`, **JWT cujo tenant diverge de `usuario.assessoria` recebendo `403`**, tenant A não lendo/alterando B, arquivo falso/grande/corrompido, e reversão completa da transação em falha no meio do upload.
- [x] 1.10 Executar `./mvnw clean verify`; registrar resultados.
  `verify:` ✅ **2584 unitários + 83 IT, 0 falhas, 0 erros** (commits `c972e68`, `74703f1`, `e8f7606`, `6a55d91`, `9672298`, `48a1c94`).

### Divergências da spec registradas na seção 1

- **WebP cortado** (task 1.6): o `ImageIO` do JDK não traz reader para WebP e suportá-lo exigiria dependência nova (TwelveMonkeys). Aceitos: PNG e JPEG. SVG segue fora por poder carregar script.
- **`spring.servlet.multipart` já existia** (10MB) — a task dizia "hoje ausente" e estava errada. O limite de 2 MiB é da aplicação, não do servlet.
- **Rejeição de campo desconhecido não veio de `@JsonIgnoreProperties`**: a anotação apenas deixa de ignorar, e quem decide é `FAIL_ON_UNKNOWN_PROPERTIES` (false por default, sem override no projeto). Provado por teste — com a anotação, `corPrimaria` respondia `200`. A validação ficou no `@JsonCreator` do DTO, sem afetar outros endpoints.
- **`@Lob` trocado por `byte[]` puro** (task 1.3): no Postgres, `@Lob` mapeia para `oid`, e large objects sobrevivem ao `DELETE` da linha — o `ON DELETE CASCADE` deixaria bytes órfãos em `pg_largeobject`. Descoberto pelo schema-validation.
- **Counterfactual do gate de coerência** (task 1.8): sem o guard, o PATCH com `sub` de A e `tenant_id` de B responde `200`. A brecha era real e explorável.

## 2. Frontend

- [x] 2.1 Criar client/tipos compartilhados de leitura, patch, upload e remoção — o wizard do `coach-first-login-wizard` reutiliza estes contratos.
  `verify:` tipos batem com o contrato do `design.md`; `npm run build` limpo.
- [x] 2.2 Criar `/coach/settings/assessoria` e a navegação do grupo "Configurações", com loading/erro/empty states.
  `verify:` rota alcançável a partir de `/coach/settings` e renderiza os três estados.
- [x] 2.3 Formulário de nome com dirty-state, confirmação ao sair e tratamento de `409`. **Sem seletor de cor e sem cálculo de contraste** (D3).
  `verify:` sair com alteração pendente pede confirmação; `409` mostra opção de recarregar sem perder o rascunho.
- [x] 2.4 Upload de logo acessível: limites, progresso, retry, remoção e fallback de iniciais. Prévia apenas da imagem, na própria página. Não aceitar URL digitada.
  `verify:` arquivo acima do limite é barrado antes do envio; falha do servidor mantém a logo anterior visível.
- [x] 2.5 Cards read-only de plano e uso.
  `verify:` nenhum controle editável nesses cards.
- [x] 2.6 Testes: PATCH do nome, concorrência, upload e falha, remoção, saída com alterações pendentes, viewport móvel.
  `verify:` `npm run test:run` verde.
- [x] 2.7 Instrumentar a duração "abrir a página → PATCH/upload concluído", sem a qual os "3 minutos" da métrica de sucesso não são auferíveis.
  `verify:` o evento aparece com a duração no canal de analytics já usado pelo front.
- [x] 2.8 Executar `npm run lint && npm run build` e os testes configurados; registrar resultados.
  `verify:` ✅ `npm run lint` limpo, `npm run build` ok, `npm run test:run` **867/867 em 112 arquivos**. Commits `e1042d0`, `5e8e0e0`.

### Notas da seção 2

- **Bug encontrado pelos próprios testes:** o campo de nome usava `''` para significar tanto "ainda não carregado" quanto "o coach apagou", então apagar o campo repunha o nome do servidor e o formulário voltava a "limpo" — o coach não conseguia trocar o nome. Corrigido com `null` vs `''`.
- **`CoachLayout` ajustado:** `activeRoute` era comparação exata de `pathname`; com a sub-rota nenhum item da sidebar ficaria aceso. Agora vence o prefixo mais longo.
- **Instrumentação da métrica (2.7):** a duração "abrir → salvar" é registrada via `console.info`, porque o front **não tem canal de analytics**. Suficiente para piloto; vira item próprio quando houver telemetria de verdade.
- **E2E (task 3.1) bloqueado pela 0.2:** o `CLAUDE.md` do front exige E2E em fluxos que cruzam Keycloak e contrato de API — este cruza os dois. Não é executável enquanto a role `PROPRIETARIO` não estiver sincronizada em nenhum ambiente.

## 3. Entrega

- [ ] 3.1 E2E com duas assessorias e roles diferentes, comprovando isolamento de tenant e o gate de `PROPRIETARIO`.
  `verify:` técnico não-dono vê a página e não consegue salvar; dono do tenant A não alcança o B.
- [ ] 3.2 Verificar fallback de logo, `304` do `ETag` e reversão em falha injetada no upload.
  `verify:` falha injetada deixa a logo anterior intacta e sem linha órfã em `tb_assessoria_logo`.
- [ ] 3.3 Validar em staging: **role sincronizada e backfill executado antes do deploy do backend** (0.2 e 0.4), métricas de update/upload/falha e feature flag do upload.
  `verify:` um coach existente de verdade abre a página e salva — se tomar `403`, o backfill não rodou.

## Fora desta change

**Edição de cores pela assessoria e aplicação de branding no shell** (D3) — inclusive levar a logo
ao header/sidebar, que depende do mesmo provider. **Migração da logo para object storage** (D1). O
contrato `GET /api/v1/assessorias/me/logo` foi desenhado para sobreviver à segunda sem mudança no
cliente.

## Estimativa

M, na borda inferior. A seção 0 acrescenta trabalho de infra (realm + backfill) que não existia na
versão anterior, mas D1 e D3 removem bem mais do que ela adiciona: sem bucket, sem CORS, sem
lifecycle, sem compensação de órfãos, sem seletor de cor, sem contraste WCAG e sem tema dinâmico. O
grosso do esforço restante é upload seguro e a role nova.
