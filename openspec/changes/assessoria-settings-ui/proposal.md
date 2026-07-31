# assessoria-settings-ui — Configuração da Assessoria

**Tamanho:** M · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-07-31

## Problema

O coach não consegue manter o nome e a identidade visual da própria assessoria nem consultar os limites do plano sem intervenção manual. Salvar apenas uma URL digitada pelo usuário não atende ao requisito de upload seguro de logo.

## Escopo

1. Página `/coach/settings/assessoria` para editar nome, cor primária, cor secundária e logo.
2. Leitura da assessoria atual com plano e uso (atletas/técnicos) em modo somente leitura.
3. `PATCH /api/v1/assessorias/me` para atualização parcial e concorrência otimista.
4. Upload autenticado de uma imagem de logo para storage controlado pelo produto, com validação e substituição segura.
5. Aplicar a identidade atualizada no shell/header após salvar, sem exigir novo login.

## Fora do escopo

- Alteração de slug/domínio, plano, limites, cobrança ou gestão de técnicos.
- Editor/crop avançado, biblioteca de imagens, histórico de logos ou CDN customizada.
- URL externa arbitrária fornecida pelo cliente.
- Personalização de componentes além dos tokens de marca já suportados; acessibilidade sempre prevalece sobre a cor escolhida.
- Configuração de perfil pessoal (`add-coach-lgpd-consent`).

## Dependências e ordem

Não depende do signup: funciona para qualquer assessoria existente. A etapa de assessoria do `coach-first-login-wizard` depende destes clients/contratos e deve reutilizá-los. A infraestrutura de object storage e a regra de permissão precisam ser confirmadas antes de implementar upload.

## Critérios de aceite

- **Quando** o coach abre a página, **então** vê dados da assessoria do principal autenticado, plano e contagens atuais, sem enviar `tenantId` como autoridade pelo cliente.
- **Quando** nome/cores válidos são salvos, **então** apenas os campos presentes são alterados e a resposta atualiza formulário e shell.
- **Quando** uma cor não é hexadecimal válida ou gera contraste abaixo da política definida, **então** o frontend alerta e o backend rejeita valores inválidos; o shell mantém fallback acessível.
- **Quando** uma imagem válida dentro dos limites é enviada, **então** o backend valida conteúdo real, armazena sob chave gerada e associa a URL controlada à assessoria.
- **Quando** upload/update falha, **então** a logo anterior permanece utilizável e objetos órfãos são limpos.
- **Dado** coach A, **quando** acessa os endpoints, **então** nunca lê/altera a assessoria B, mesmo manipulando headers/payloads.
- **Dado** edição concorrente, **quando** a versão está obsoleta, **então** retorna `409` e a UI oferece recarregar sem sobrescrever silenciosamente.

## Métrica de sucesso

90% dos coaches que iniciam uma edição conseguem publicar nome/identidade em menos de 3 minutos, com menos de 2% de falhas de upload não recuperadas.

## Open Questions & Assumptions

- **Bloqueante:** escolher/reusar object storage, URL pública/assinada, retenção e limpeza. Se não houver storage, retirar logo do MVP; não aceitar URL arbitrária como atalho.
- **Bloqueante:** definir quem pode editar quando múltiplos técnicos existirem. Premissa do MVP: somente role de proprietário/administrador da assessoria, não qualquer `TECNICO`.
- **Premissa:** `Assessoria` possui versionamento (`@Version`) ou ele será adicionado para evitar lost update.
- **Premissa:** contagens podem ser obtidas por queries agregadas tenant-scoped sem carregar coleções completas.
