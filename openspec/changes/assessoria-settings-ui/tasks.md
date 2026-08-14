# Tasks — assessoria-settings-ui

> Revisado em 2026-08-14 após as decisões D1/D2/D3 (ver `proposal.md`). A seção 0 é nova e
> bloqueia o resto; as tasks de object storage saíram.

## 0. Role `PROPRIETARIO` (bloqueia 1.5 em diante)

- [ ] 0.1 Declarar `PROPRIETARIO` em `menthoros-infra/keycloak/menthoros-realm.json` como role de realm **composite** incluindo `TECNICO`; PR no `menthoros-infra`.
- [ ] 0.2 Aplicar por `sync-realm.sh` no HomeLab e no Railway `develop`; conferir no token que o composite traz `TECNICO` junto. Nunca pelo console.
- [ ] 0.3 Adicionar `PROPRIETARIO` ao enum `UserRole` e fazer o `CoachSignupServiceImpl` atribuí-la ao fundador; teste cobrindo que o signup passa a produzir as duas roles.
- [ ] 0.4 **Decidir e executar o backfill dos coaches existentes — gate de deploy, não de merge.** Conferir contra os dados reais antes de escrever a migration e definir o comportamento de cada caso ambíguo: assessoria sem técnico, com empate de `createdAt`, com vários técnicos. Nenhuma assessoria pode ficar sem dono nem com dois. Ambíguo não vira escolha silenciosa: fica listado para atribuição manual. **O backend não sobe exigindo `PROPRIETARIO` antes do backfill rodar** — o coach existente não perde nada que já tinha (nenhum `@PreAuthorize` atual muda), mas ficaria sem acesso ao recurso novo da própria assessoria.
- [ ] 0.5 Verificar que as 61 anotações `hasAnyRole('TECNICO','ADMIN')` seguem alcançáveis pelo fundador após a troca — um teste de integração com token real de `PROPRIETARIO` batendo num endpoint existente.

## 1. Backend

- [ ] 1.1 Migration Flyway: coluna `@Version` em `tb_assessoria` populada com `0` nas linhas existentes. Sem `DROP`, sem perda de dado.
- [ ] 1.2 Migration Flyway: tabela `tb_assessoria_logo` (PK/FK `assessoria_id` com `ON DELETE CASCADE`, `conteudo bytea`, `content_type`, `tamanho_bytes`, `etag`, `atualizado_em`).
- [ ] 1.3 Mapear a entidade da logo em tabela separada e confirmar, por teste, que carregar `Assessoria` **não** traz os bytes.
- [ ] 1.4 `GET /api/v1/assessorias/me` com identidade, `temLogo`/`logoUrl` derivada, plano, uso por queries agregadas tenant-scoped e `version`. Autorização `hasAnyRole('TECNICO','PROPRIETARIO','ADMIN')`.
- [ ] 1.5 `PATCH /api/v1/assessorias/me`: apenas `nome` editável (normalizado), `hasRole('PROPRIETARIO')`, `409` em versão obsoleta, e **rejeição explícita** de `corPrimaria`/`corSecundaria` no payload.
- [ ] 1.6 `POST /api/v1/assessorias/me/logo`: multipart, limite de 2 MiB, decode real da imagem (não confiar em extensão nem `Content-Type`), dimensões máximas, gravação transacional com bump de versão.
- [ ] 1.7 `GET /api/v1/assessorias/me/logo` com `Content-Type` persistido, `ETag`, `Cache-Control: private` e `304` em `If-None-Match`; e `DELETE` com **`version` obrigatória, `hasRole('PROPRIETARIO')`, bump de versão e `409` em versão obsoleta** — mesmo contrato do PATCH.
- [ ] 1.8 Implementar o **gate de coerência** `usuario.assessoria.id == TenantContext.getRequiredTenantId()` nas três escritas (PATCH, upload, DELETE), com `403` em divergência.
- [ ] 1.9 Testes: campos omitidos/null, cor no payload rejeitada, concorrência (`409`), **upload-vs-delete e delete-vs-upload com versão obsoleta**, `TECNICO` sem `PROPRIETARIO` recebendo `403`, **JWT cujo tenant diverge de `usuario.assessoria` recebendo `403`**, tenant A não lendo/alterando B, arquivo falso/grande/corrompido, e reversão completa da transação em falha no meio do upload.
- [ ] 1.10 Executar `./mvnw clean verify`; registrar resultados.

## 2. Frontend

- [ ] 2.1 Criar client/tipos compartilhados de leitura, patch, upload e remoção — o wizard do `coach-first-login-wizard` reutiliza estes contratos.
- [ ] 2.2 Criar `/coach/settings/assessoria` e a navegação do grupo "Configurações", com loading/erro/empty states.
- [ ] 2.3 Formulário de nome com dirty-state, confirmação ao sair e tratamento de `409`. **Sem seletor de cor e sem cálculo de contraste** (D3).
- [ ] 2.4 Upload de logo acessível: limites, progresso, retry, remoção e fallback de iniciais. Prévia apenas da imagem, na própria página. Não aceitar URL digitada.
- [ ] 2.5 Cards read-only de plano e uso.
- [ ] 2.6 Testes: PATCH do nome, concorrência, upload e falha, remoção, saída com alterações pendentes, viewport móvel.
- [ ] 2.7 Executar `npm run lint && npm run build` e os testes configurados; registrar resultados.

## 3. Entrega

- [ ] 3.1 E2E com duas assessorias e roles diferentes, comprovando isolamento de tenant e o gate de `PROPRIETARIO`.
- [ ] 3.2 Verificar fallback de logo, `304` do `ETag` e reversão em falha injetada no upload.
- [ ] 3.3 Validar em staging: role sincronizada antes do deploy do backend, métricas de update/upload/falha e feature flag do upload.

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
