# assessoria-settings-ui — Configuração da Assessoria

**Tamanho:** M · **Trilha:** Full
**Status:** proposta — bloqueantes resolvidos em 2026-08-14 (ver "Decisões")
**Criado:** 2026-07-31

## Problema

O coach não consegue manter o nome nem a logo da própria assessoria, nem consultar os limites do plano, sem intervenção manual. Salvar apenas uma URL digitada pelo usuário não atende ao requisito de upload seguro de logo.

## Escopo

1. Página `/coach/settings/assessoria` para editar **nome e logo**.
2. Leitura da assessoria atual com plano e uso (atletas/técnicos) em modo somente leitura.
3. `PATCH /api/v1/assessorias/me` para atualização parcial e concorrência otimista.
4. Upload autenticado de uma imagem de logo **persistida como BLOB no Postgres**, com validação de conteúdo real e substituição transacional, servida por endpoint próprio do produto.

## Decisões (2026-08-14)

As perguntas que bloqueavam a implementação foram decididas pelo founder após levantamento do código:

- **D1 — Logo em BLOB no Postgres, sem object storage.** Não existe nenhuma infraestrutura de arquivos no projeto (nenhuma dependência S3/MinIO, nenhum `MultipartFile` em `src/main`, nenhum volume). Em vez de provisionar storage, os bytes ficam no banco, isolados em tabela 1:1 (ver `design.md`). É explicitamente uma decisão de MVP: migrar para storage externo depois é uma change própria, e o contrato de leitura (`GET .../logo`) foi desenhado para não mudar quando isso acontecer.
- **D2 — Role `PROPRIETARIO` no Keycloak + flag `owner` no banco.** A premissa original da spec (`ASSESSORIA_OWNER`) não existia, e o `UserRole` atual (`ADMIN, TECNICO, VISUALIZADOR, ATLETA`) não distingue o dono da assessoria de um técnico contratado — o coach criado pelo signup nasce `TECNICO`, e o padrão dominante `hasAnyRole('TECNICO','ADMIN')` deixaria qualquer técnico reescrever a marca. `PROPRIETARIO` entra como **role composite que inclui `TECNICO`**, para que o fundador mantenha acesso a tudo que já tinha sem tocar nas 61 anotações existentes.

  **Revisado no DoR (2026-08-14):** a role sozinha não fecha o problema, porque `Usuario.role` é single-valued e `mapToUserRole` (`UsuarioSyncServiceImpl:160-173`) colapsa a lista de roles do token — o banco gravaria `TECNICO` e o espelho local nunca saberia quem é o dono; priorizar `PROPRIETARIO` na cadeia tiraria o dono da contagem de técnicos (`UsuarioRepository:83`, usada pelo `uso.tecnicos` desta própria change, com `maxTecnicos=1` no BASIC), de `isTecnico()` e de `podeEscrever()`. Por isso `role` permanece `TECNICO` e a propriedade vira **coluna booleana `owner`**, espelhada do JWT a cada sync — o Keycloak segue como fonte única, a flag é derivada, e nenhum consumidor atual de `role` muda de comportamento.
- **D3 — Cores fora do escopo por inteiro.** Revisada pelo founder: não é só que as cores não pintam o shell — **a assessoria não edita cores nesta change**. O formulário não tem seletor de cor, o PATCH não aceita `corPrimaria`/`corSecundaria` e o output não as devolve. As colunas `cor_primaria`/`cor_secundaria` de `tb_assessoria` continuam existindo com seus defaults e simplesmente não são tocadas. Consequência prática: some daqui toda a validação de contraste WCAG, o preview de tema e o risco de acessibilidade em runtime. O tema segue estático (`src/theme/tokens.ts`) e o header segue lendo o nome do claim `organization` do JWT.

## Fora do escopo

- Alteração de slug/domínio, plano, limites, cobrança ou gestão de técnicos.
- Editor/crop avançado, biblioteca de imagens, histórico de logos ou CDN customizada.
- URL externa arbitrária fornecida pelo cliente.
- **Cores da assessoria, em qualquer forma** (D3) — nem edição, nem persistência nova, nem aplicação no shell. Editor de cores e provider de branding dinâmico são change própria, e é lá que mora a política de contraste.
- **Object storage externo** (D1) — os bytes vivem no Postgres neste MVP.
- Configuração de perfil pessoal (`add-coach-settings-page`) — perfil do coach é escopo daquela change, não desta; `add-coach-lgpd-consent` cobre só o aceite e está entregue.

## Dependências e ordem

Não depende do signup: funciona para qualquer assessoria existente. A etapa de assessoria do `coach-first-login-wizard` depende destes clients/contratos e deve reutilizá-los.

**Dependência nova, introduzida por D2:** a role `PROPRIETARIO` precisa existir no realm antes de o endpoint poder exigi-la. Isso toca o `menthoros-infra` (`keycloak/menthoros-realm.json` + `sync-realm.sh`, nunca o console) e o backend (`UserRole`, atribuição no `CoachSignupServiceImpl`, backfill dos coaches existentes). É a primeira seção das tasks e bloqueia o PATCH.

## Critérios de aceite

- **Quando** o coach abre a página, **então** vê dados da assessoria do principal autenticado, plano e contagens atuais, sem enviar `tenantId` como autoridade pelo cliente.
- **Quando** um nome válido é salvo, **então** apenas os campos presentes são alterados e a resposta atualiza o formulário.
- **Quando** o payload do PATCH traz `corPrimaria` ou `corSecundaria`, **então** o backend rejeita — campo não editável nesta change, e aceitar em silêncio criaria um contrato que ninguém implementou.
- **Quando** uma imagem válida dentro dos limites é enviada, **então** o backend valida conteúdo real (decode, não extensão), persiste os bytes e o content-type, e `GET /api/v1/assessorias/me/logo` passa a servi-la.
- **Quando** o upload falha em qualquer etapa, **então** a transação inteira reverte e a logo anterior permanece servível — não há objeto órfão a limpar, porque bytes e ponteiro commitam juntos.
- **Dado** um coach com role `TECNICO` e sem `PROPRIETARIO`, **quando** tenta o PATCH, o upload ou o DELETE, **então** recebe `403` e nada muda.
- **Dado** um principal cujo `usuario.assessoria` diverge do tenant resolvido no JWT, **quando** tenta qualquer escrita, **então** recebe `403` — o gate de coerência precede a operação (ver `design.md`).
- **Dado** que uma aba enviou uma logo nova, **quando** outra aba com versão obsoleta tenta remover a logo, **então** recebe `409` e a imagem nova permanece.
- **Dado** coach A, **quando** acessa os endpoints, **então** nunca lê/altera a assessoria B, mesmo manipulando headers/payloads.
- **Dado** edição concorrente, **quando** a versão está obsoleta, **então** retorna `409` e a UI oferece recarregar sem sobrescrever silenciosamente.

## Métrica de sucesso

90% dos coaches que iniciam uma edição conseguem publicar nome e logo em menos de 3 minutos, com menos de 2% de falhas de upload não recuperadas.

**Como será medida:** contador de falhas de upload no backend (já previsto) **mais** duração entre abrir a página e concluir o PATCH/upload, instrumentada no frontend. Sem a segunda, os "3 minutos" não são auferíveis e a métrica vira julgamento — o mesmo defeito que travou o arquivamento de `migrate-login-to-authorization-code-pkce`.

## Open Questions & Assumptions

- ~~**Bloqueante:** escolher/reusar object storage~~ → **resolvido por D1** (BLOB no Postgres).
- ~~**Bloqueante:** definir quem pode editar quando múltiplos técnicos existirem~~ → **resolvido por D2** (role `PROPRIETARIO` composite).
- **Confirmado:** `Assessoria` **não** tem `@Version` (`entity/Assessoria.java`) — a migration é obrigatória, não condicional.
- **Confirmado:** `/api/v1/assessorias` não existe; só `POST /api/admin/assessorias` (`AssessoriaController.java:23`, `hasRole('ADMIN')`). GET e PATCH são construção nova, e o `AssessoriaOutputDto` atual não expõe `logoUrl` nem cores.
- **Aberto (gate de deploy):** o que fazer com os coaches já existentes — backfill de `PROPRIETARIO` para o primeiro `TECNICO` de cada assessoria, ou atribuição manual nos casos ambíguos? Decidir na task 0.4. O backend não sobe exigindo a role antes disso.
- **Achado adjacente, fora do escopo desta change:** a resolução de tenant é ambígua com múltiplas organizations no JWT (`JwtTenantFilter.java:192-214` devolve a primeira do `Map`), e `UsuarioSyncServiceImpl.java:60-61` nunca atualiza `usuario.assessoria`, permitindo divergência silenciosa com o `TenantContext`. Esta change se protege com um gate de coerência nas escritas, mas **não conserta a causa** — vale abrir item de segurança próprio.
- **Premissa:** contagens podem ser obtidas por queries agregadas tenant-scoped sem carregar coleções completas.
- **Premissa:** o teto de 2 MiB por logo e a escala de assessorias mantêm o custo de BLOB no banco irrelevante para dump/backup. Se a escala mudar, a migração para storage externo não altera o contrato de leitura.
