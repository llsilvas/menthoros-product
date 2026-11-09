# Design — lgpd-trajeto-cards-compartilhamento

Decisões de produto em `proposal.md` ("Decisões"). Este documento cobre o como.

## D1 — Registro da confirmação (backend)

Tabela nova, append-only, no padrão de `tb_usuario_lgpd_consent` (V73):

```sql
CREATE TABLE tb_usuario_trajeto_share_consent (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID        NOT NULL REFERENCES tb_usuario(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    policy_version  VARCHAR(20) NOT NULL,
    consented_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uk_usuario_trajeto_share_consent UNIQUE (usuario_id, tenant_id, policy_version)
);
```

- **Tabela própria, não coluna em `tb_usuario_lgpd_consent`:** aquela registra o aceite da Política
  e dos Termos pelo coach, com `terms_version` obrigatório. Esta é o consentimento específico de uma
  finalidade, dado pelo atleta. Misturar as duas faria o `LgpdConsentInterceptor` precisar
  distinguir tipos de linha.
- **Versionada pela Política:** a confirmação vale para a `policy_version` vigente. Se a Política
  mudar de novo, o aviso reaparece. É o comportamento certo, porque o texto que o atleta confirmou
  mudou.
- `tenant_id` faz parte da chave pelo mesmo motivo da V73: atleta que troca de assessoria não pode
  ficar com o insert rejeitado e a consulta, que é por tenant, devolvendo falso.
- O insert é idempotente pela unique: aceite repetido não é erro.

## D2 — Contrato

Ambos com `@PreAuthorize("hasRole('ATLETA')")` e tenant do token:

- `GET /api/v1/atletas/me/consentimentos/trajeto-compartilhamento` → `{ granted: boolean,
  policyVersion: string, consentedAt?: string }`.
- `POST /api/v1/atletas/me/consentimentos/trajeto-compartilhamento` → 201 com o mesmo corpo. Sem
  payload: a versão é sempre a vigente no servidor (`app.lgpd.policy-version`). O cliente nunca diz
  qual versão aceitou, para não aceitar texto que não é o atual.

## D3 — Gate no front

- Hook `useTrajectoryShareConsent()`: `{ granted, loading, error, confirmar() }`, sobre o cliente
  curado (`src/api`).
- `TrajectoryShareConsentDialog`: texto simples ("Esta imagem mostra seu trajeto completo,
  incluindo onde você começou e terminou"), link para `#/privacidade` (§ 6.4) via `RouterLink`, botão
  "Entendi, compartilhar" e "Usar modelo sem mapa".
- **A imagem com mapa não pode ser gerada antes da confirmação** (CA3). Hoje o `useShareImage`
  pré-gera o blob ao montar o card. Para modelos com mapa, a pré-geração fica desligada enquanto
  `granted` for falso, e a prévia na tela continua visível, porque não sai do aparelho.
- Esta change entrega o hook e o diálogo, com teste de componente. A ligação nos modelos Rota e
  Stickers e o E2E do fluxo completo ficam em `athlete-share-cards-mapa`, que é onde existe modelo
  com mapa. Sem modelo com mapa, o gate não tem gatilho na UI.

## D4 — Texto da Política

Em `src/pages/waitlist/politicaPrivacidadeConteudo.ts`:

- **§ 3:** nova finalidade, "gerar, a pedido do atleta, imagens do treino para ele compartilhar
  fora da plataforma".
- **§ 4:** linha na tabela de bases legais, consentimento específico e destacado do titular (Art. 11,
  I), colhido no momento do compartilhamento.
- **§ 6.4 "Compartilhamento feito pelo próprio atleta":**
  - a imagem é gerada só a pedido do atleta, no aparelho dele;
  - pode conter o trajeto completo, **incluindo os pontos de início e fim**;
  - a publicação é ato do atleta, fora do controle da Menthoros;
  - há modelos sem mapa;
  - a confirmação é registrada com data e versão desta Política.
- **§ 6.3** ("não compartilhamos com terceiros"): ajustar para não contradizer a § 6.4. Quem
  compartilha é o titular, não a Menthoros.

## D5 — Versão vigente

- Nova vigência: data do merge em `develop`. `POLITICA_VERSAO`, `POLITICA_ATUALIZADA_EM` (front) e o
  default de `app.lgpd.policy-version` (backend) recebem a mesma data.
- **`LGPD_POLICY_VERSION` no Railway sobrescreve o default.** Se a variável existir nos ambientes, o
  bump no `application.yml` não tem efeito. Conferir e atualizar a variável é parte do deploy da
  change. Hoje já há divergência (front `2026-10-26`, default do backend `2026-08-03`).
- Efeito colateral aceito (Q3): todos os coaches veem o `CoachConsentDialog` de novo.

## Testes

- Backend: unit do service (idempotência, versão vigente, tenant) e `@WebMvcTest` do controller
  (ATLETA 200/201, TECNICO 403); IT com Testcontainers para a unique.
- Front: componente do diálogo (CA4 "sem mapa" chama o callback; CA5 `granted` não abre) e hook;
  teste da Política (§ 6.4 com "início e fim" renderizado).
- E2E do gate: em `athlete-share-cards-mapa`.
