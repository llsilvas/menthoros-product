# Design — add-coach-lgpd-consent

## Contrato e configuração

Adicionar configurações obrigatórias por ambiente: `TERMS_URL`, `TERMS_VERSION`, `PRIVACY_URL`, `PRIVACY_VERSION` e `DPO_EMAIL`. A aplicação deve falhar no startup de produção se URLs, versões ou e-mail estiverem ausentes; links `#` não são aceitos.

Migração Flyway (usar o próximo número livre no backend no momento da implementação):

```sql
ALTER TABLE tb_usuario
  ADD COLUMN aceite_lgpd_em TIMESTAMPTZ,
  ADD COLUMN versao_termos_aceita VARCHAR(50),
  ADD COLUMN versao_privacidade_aceita VARCHAR(50);
```

Não é necessário um boolean persistido: `consentimentoPendente` é derivado comparando as versões aceitas com as versões vigentes. Isso evita um estado inconsistente após publicação de documento novo. Linhas existentes começam pendentes.

### API

`GET /api/v1/me` acrescenta, sem remover campos existentes:

```json
{
  "consentimentoPendente": true,
  "aceiteLgpdEm": null,
  "versaoTermosAceita": null,
  "versaoPrivacidadeAceita": null,
  "documentosLegais": {
    "termosUrl": "https://...",
    "termosVersao": "2026-07-31",
    "privacidadeUrl": "https://...",
    "privacidadeVersao": "2026-07-31",
    "dpoEmail": "privacidade@example.com"
  }
}
```

`POST /api/v1/me/consentimento`

```json
{
  "aceiteTermos": true,
  "aceitePrivacidade": true,
  "versaoTermos": "2026-07-31",
  "versaoPrivacidade": "2026-07-31"
}
```

- `204`: aceite registrado ou repetição idempotente das mesmas versões.
- `400`: algum aceite não é `true`.
- `409`: versões enviadas não são as vigentes; a resposta informa o cliente para recarregar `me`.
- O usuário é sempre obtido do principal autenticado. Não aceitar `usuarioId` ou `tenantId` no payload/header como fonte de autorização.
- Usar relógio injetável no serviço para testes. Não registrar payload completo nem dados pessoais desnecessários em logs.

Se auditoria histórica de múltiplas versões for requisito jurídico, substituir essas colunas por uma tabela append-only antes da implementação; isso está registrado como decisão aberta, pois muda o tamanho.

## Frontend

`CoachLayout` é o único gate. Enquanto `me` carrega, mostra estado de carregamento; em erro, mostra uma tela recuperável; se `consentimentoPendente`, monta apenas `CoachConsentDialog`; depois avalia `onboardingConcluido` (quando a change do wizard estiver presente).

O diálogo usa URLs e versões retornadas por `me`, dois checkboxes independentes, não fecha por Escape/backdrop e refaz a consulta de `me` após `204`. Erro `409` refaz `me` e mantém o modal aberto.

`CoachProfileSettingsPage`, em `/coach/settings/perfil`, exibe dados pessoais e a seção de privacidade. Nome/e-mail/avatar são read-only por padrão. A sidebar usa “Configurações” como grupo; “Meu perfil” e “Assessoria” são rotas distintas.

## Segurança, acessibilidade e falhas

- Backend continua autorizando cada endpoint protegido; o gate frontend não é controle de autorização.
- Modal tem foco preso, labels acessíveis e mensagem de erro anunciada.
- Uma falha de refetch após aceite não libera conteúdo com estado local presumido; permite tentar novamente.
- Testes de controller devem usar dois usuários e provar que o principal define o registro alterado.

## Estratégia de rollout

1. Publicar migração e API compatível.
2. Configurar e validar documentos em staging.
3. Publicar frontend.
4. Habilitar o gate por feature flag; monitorar taxa de aceite e erros.

Rollback do frontend desabilita o gate. As colunas permanecem, pois são aditivas.
