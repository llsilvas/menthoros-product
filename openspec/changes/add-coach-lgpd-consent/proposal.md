# add-coach-lgpd-consent — Consentimento LGPD e Perfil do Coach

**Tamanho:** M · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-07-31

## Problema

O Menthoros processa dados pessoais de treinadores (nome, e-mail, avatar e registros de acesso), mas não guarda uma evidência versionada de que o coach recebeu e aceitou os documentos aplicáveis. O coach também não tem um lugar para consultar seus dados e os canais para exercer seus direitos.

## Escopo

1. Modal bloqueante para coaches autenticados que ainda não aceitaram a versão vigente dos Termos de Uso e da Política de Privacidade.
2. Evidência auditável no `Usuario`: instante do aceite e versões dos dois documentos.
3. Página `/coach/settings/perfil` para visualizar nome, e-mail e avatar e consultar aceite, documentos, contato do encarregado e canal de exclusão.
4. Alteração de nome de exibição e avatar somente se os endpoints correspondentes já existirem. Caso não existam, os campos permanecem somente leitura neste MVP; criar upload ou sincronização com Keycloak não faz parte desta change.

## Fora do escopo

- Cadastro e autenticação de coach (`keycloak-user-onboarding-auth`).
- Wizard de primeiro acesso (`coach-first-login-wizard`).
- Edição da assessoria (`assessoria-settings-ui`).
- Revogação automatizada, exclusão imediata ou portabilidade; o MVP abre uma solicitação ao canal do encarregado.
- Redação/aprovação jurídica dos documentos. URLs, versões vigentes e e-mail do encarregado são configuração obrigatória de implantação, não placeholders de UI.
- Definir consentimento como base legal para todo tratamento. A base legal e o texto devem ser validados por Jurídico/DPO.

## Dependências e ordem

Não há dependência técnica das demais changes. Para a jornada integrada, esta change deve estar implantada antes de habilitar o signup público e o wizard. O `CoachLayout` aplica a precedência: carregando sessão → consentimento pendente → onboarding pendente → conteúdo normal.

## Critérios de aceite

- **Dado** um coach sem aceite da versão vigente, **quando** abre qualquer rota protegida de coach, **então** vê o modal bloqueante e o conteúdo da aplicação não é montado.
- **Dado** o modal, **quando** um dos dois checkboxes não está marcado, **então** o envio permanece desabilitado.
- **Quando** o aceite válido é enviado, **então** o backend registra timestamp e as versões configuradas para o usuário autenticado e o `GET /api/v1/me` passa a indicar consentimento vigente.
- **Dado** um aceite repetido para as mesmas versões, **quando** o endpoint é chamado novamente, **então** responde com sucesso idempotente e não altera o primeiro timestamp.
- **Dado** que uma versão configurada mudou, **quando** o coach entra novamente, **então** o modal é reapresentado.
- **Quando** o coach abre `/coach/settings/perfil`, **então** visualiza seus dados, a data/versões aceitas e links configurados válidos para documentos e contato.

## Métrica de sucesso

100% dos coaches ativos possuem evidência de aceite das versões vigentes antes de acessar o dashboard, sem tickets de bloqueio atribuídos ao fluxo na primeira semana.

## Open Questions & Assumptions

- **Em aberto (bloqueante para produção):** Jurídico/DPO deve aprovar textos, base legal, versões iniciais, política de recusa/retirada e canal de contato.
- **Premissa:** `GET /api/v1/me` é o contrato canônico da sessão e identifica o `Usuario` pelo JWT, sem `tenantId` fornecido pelo cliente.
- **Premissa:** nome, e-mail e avatar vêm do contrato atual de `me`; edição só será habilitada se já houver serviço seguro de atualização.
