# Design — lgpd-trajeto-cards-compartilhamento

Decisões de produto em `proposal.md` ("Decisões"). Este documento cobre o como.

## D1 — Registro da confirmação e da revogação (backend)

Tabela nova, **append-only de eventos**: concessão e revogação são linhas, nada é apagado ou
atualizado. Revisada após o pre-mortem do Codex, porque a primeira versão só registrava concessões
e não tinha como representar revogação (LGPD Art. 8º § 5º; a própria Política, § 4, promete
revogação a qualquer momento).

```sql
CREATE TABLE tb_usuario_trajeto_share_consent (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID        NOT NULL REFERENCES tb_usuario(id) ON DELETE CASCADE,
    tenant_id       UUID        NOT NULL,
    policy_version  VARCHAR(20) NOT NULL,
    evento          VARCHAR(10) NOT NULL CHECK (evento IN ('CONCEDIDO', 'REVOGADO')),
    registrado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trajeto_share_consent_usuario
    ON tb_usuario_trajeto_share_consent(tenant_id, usuario_id, registrado_em DESC);
```

- **Estado = último evento** do usuário no tenant. `granted` é verdadeiro só se o último evento for
  `CONCEDIDO` **e** a `policy_version` dele for a vigente. Revogar e conceder de novo, inclusive na
  mesma versão, são só linhas novas.
- **Sem unique:** a idempotência vem do service. Concessão com o estado já concedido na versão
  vigente não grava linha nova e devolve o estado atual; o mesmo vale para revogação já revogada. A
  corrida de dois cliques simultâneos pode gerar duas linhas iguais, o que é inofensivo porque o
  estado é o último evento.
- **Tabela própria, não `tb_usuario_lgpd_consent`:** aquela é o aceite da Política e dos Termos pelo
  coach, com `terms_version` obrigatório e unique por versão. Esta é consentimento específico de uma
  finalidade, revogável, dado pelo atleta.
- `tenant_id` no filtro pelo mesmo motivo da V73: o consentimento é por assessoria.
- **Resolução do usuário:** pelo `AuthenticatedAtletaResolver` (mesmo caminho dos demais
  `/atletas/me/*`), que resolve o `Usuario` pelo token. Usuário não sincronizado devolve 503 (fail-safe
  do `JwtTenantFilter`), nunca 403 nem registro órfão.

## D2 — Contrato

Todos com `@PreAuthorize("hasRole('ATLETA')")`, tenant do token. Base:
`/api/v1/atletas/me/consentimentos/trajeto-compartilhamento`.

- `GET` → `200 { granted: boolean, policyVersion: string /* vigente */, registradoEm?: string }`.
- `POST` com `{ policyVersion }` → concede. **O cliente envia a versão que apresentou ao atleta**
  (`POLITICA_VERSAO` do bundle). Se não for a vigente no servidor: `409 CONSENT_VERSION_STALE`,
  reaproveitando `ConsentVersionStaleException` e o handler existente. Achado do Codex: gravar
  sempre a vigente registraria aceite de um texto que o atleta não viu, quando há deploy entre abrir
  o aviso e confirmar, ou quando o front está em cache. `201` com o estado.
- `DELETE` → revoga. `200` com o estado (`granted: false`). Idempotente.
- Erros: `401` sem token, `403` para outra role, `503` usuário não sincronizado, `409` versão defasada.
- O front porta o contrato à mão no cliente curado (`src/api`), conforme o `CLAUDE.md` do front.

## D3 — Gate no front

- Hook `useTrajectoryShareConsent()`: `{ granted, loading, error, confirmar(), revogar() }`, sobre o
  cliente curado (`src/api`). `confirmar()` envia `POLITICA_VERSAO`; no `409` o hook expõe
  `desatualizado: true` e o diálogo pede para recarregar a página antes de aceitar.
- `TrajectoryShareConsentDialog`: texto simples ("Esta imagem mostra seu trajeto completo,
  incluindo onde você começou e terminou"), link para `#/privacidade` (§ 6.4) via `RouterLink`, botão
  "Entendi, compartilhar" e "Usar modelo sem mapa".
- **A imagem com mapa não pode ser gerada antes da confirmação** (CA3). Hoje o `useShareImage`
  pré-gera o blob ao montar o card. Para modelos com mapa, a pré-geração fica desligada enquanto
  `granted` for falso, e a prévia na tela continua visível, porque não sai do aparelho.
- Esta change entrega o hook e o diálogo, com teste de componente. A ligação nos modelos Rota e
  Stickers e o E2E do fluxo completo ficam em `athlete-share-cards-mapa`, que é onde existe modelo
  com mapa. Sem modelo com mapa, o gate não tem gatilho na UI.

## D6 — Revogação na UI

- Seção "Privacidade" na `AthleteProfilePage` com uma chave "Mostrar meu trajeto nos cards de
  compartilhamento", refletindo `granted`. Desligar chama `revogar()`. Ligar abre o mesmo diálogo do
  aviso, para não haver concessão sem o texto.
- A § 4 da Política já promete revogação "em Configurações > Privacidade"; esta seção é o primeiro
  lugar onde isso existe para o atleta.
- Depois de revogar, o próximo card com mapa mostra o aviso de novo (estado lido do servidor, sem
  cache local), o que cobre a troca de aparelho.

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

- Nova vigência fixa: **`2026-11-09`**. `POLITICA_VERSAO`, `POLITICA_ATUALIZADA_EM` (front) e o
  default de `app.lgpd.policy-version` (backend) recebem essa data. Se o merge escorregar, o PR
  ajusta as três antes de mesclar.
- O bump também muda a `policyVersion` gravada em inscrições novas da waitlist
  (`WaitlistServiceImpl:90`). É o comportamento certo, porque a página pública passa a mostrar o
  texto novo.
- **`LGPD_POLICY_VERSION` no Railway sobrescreve o default.** Se a variável existir nos ambientes, o
  bump no `application.yml` não tem efeito. Conferir e atualizar a variável é parte do deploy da
  change. Hoje já há divergência (front `2026-10-26`, default do backend `2026-08-03`).
- Efeito colateral aceito (Q3): todos os coaches veem o `CoachConsentDialog` de novo.

## Rollback

- A migração é aditiva: a tabela pode ser descartada sem afetar nada existente.
- O bump de versão **não reverte limpo**: coaches que já re-aceitaram ficam com o aceite da versão
  nova registrado. Voltar a versão anterior exigiria novo re-aceite deles. Por isso o bump vai junto
  com o texto, nunca antes.

## Testes

- Backend: unit do service (estado = último evento, idempotência, versão defasada → 409, revogar e
  conceder de novo, tenant) e `@WebMvcTest` do controller (ATLETA 200/201/200, TECNICO 403); IT com
  Testcontainers do ciclo conceder → revogar → conceder.
- Front: componente do diálogo (CA4 "sem mapa" chama o callback; CA5 `granted` não abre) e hook;
  teste da Política (§ 6.4 com "início e fim" renderizado).
- E2E do gate: em `athlete-share-cards-mapa`.
