# Tasks — lgpd-trajeto-cards-compartilhamento

## 0. Antes de implementar (gates do Full track)

- [x] 0.1 `product-reviewer`: Refine, sem bloqueio. Incorporado: bump só junto com o texto (rollback em D5)
- [x] 0.2 Codex: NOT READY com 2 bloqueios, ambos incorporados — versão apresentada enviada no POST com `409` (D2, CA6) e revogação como evento (D1, D6, CA7). spec-reviewer: READY COM AJUSTES — CA6–CA9, rollback, data fixa, resolução do usuário, efeito na waitlist incorporados
- [x] 0.3 Q1–Q4 decididas pelo founder em 2026-11-08 (ver "Decisões" no `proposal.md`). Validação jurídica da base legal (Q2) segue pendente e bloqueia só a promoção para `main`
- [x] 0.4 `design.md` escrito (D1–D5)
- [x] 0.5 Confirmar que a change dos cards com mapa (`athlete-share-cards-mapa`) declara esta como dependência bloqueante

## 1. Política de Privacidade (frontend)

- [ ] 1.1 Em `src/pages/waitlist/politicaPrivacidadeConteudo.ts`, adicionar ao § 3 a finalidade "gerar, a pedido do atleta, imagens do treino para compartilhamento"
- [ ] 1.2 Adicionar a § 6.4 "Compartilhamento feito pelo próprio atleta", com trajeto completo incluindo início e fim, ato do atleta e opção sem mapa
- [ ] 1.3 Adicionar a linha correspondente na tabela de bases legais (§ 4), conforme Q2
- [ ] 1.4 Atualizar a data de vigência exibida na página (`POLITICA_VERSAO` e `POLITICA_ATUALIZADA_EM`) e ajustar a § 6.3 para não contradizer a § 6.4
- [ ] 1.5 Teste de componente garantindo que a § 6.4 e a menção a "início e fim" estão renderizadas
- [ ] 1.6 Validação: `npm run lint && npm run build && npm run test:run`

## 2. Versão vigente (backend)

- [ ] 2.1 Atualizar `app.lgpd.policy-version` nos `application*.yml` para a mesma data da 1.4
- [ ] 2.2 Q3 decidida: re-aceite dos coaches aceito, sem código extra. Conferir `LGPD_POLICY_VERSION` no Railway (sobrescreve o default) e registrar o valor a aplicar no deploy
- [ ] 2.3 Migração V114 `tb_usuario_trajeto_share_consent` como eventos `CONCEDIDO`/`REVOGADO` (D1), entidade, repositório sem update/delete
- [ ] 2.4 `GET`/`POST`/`DELETE /api/v1/atletas/me/consentimentos/trajeto-compartilhamento` (D2): só `ATLETA`, `POST` recebe a versão apresentada e devolve `409 CONSENT_VERSION_STALE` se defasada
- [ ] 2.5 Testes: unit do service (último evento, idempotência, 409, revogar e conceder de novo, tenant), `@WebMvcTest` (ATLETA, TECNICO 403), IT do ciclo conceder → revogar → conceder; teste do default de `app.lgpd.policy-version` = `2026-11-09`
- [ ] 2.6 Validação: `./mvnw clean verify`

## 3. Aviso no compartilhamento (frontend, depende da change dos cards)

- [ ] 3.1 Cliente curado + `useTrajectoryShareConsent` (D3)
- [ ] 3.2 `TrajectoryShareConsentDialog`: texto simples, link `RouterLink` para a § 6.4, "Entendi, compartilhar" e "Usar modelo sem mapa"
- [ ] 3.3 Seção "Privacidade" na `AthleteProfilePage` com a chave de revogação (D6, CA7)
- [ ] 3.3a Testes de componente para CA4, CA5, CA6 (409 pede recarregar) e CA7, e do hook
- [ ] 3.4 E2E do fluxo (CA3–CA5): **movido para `athlete-share-cards-mapa`**, que é onde existe modelo com mapa para disparar o gate
- [ ] 3.5 Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`
