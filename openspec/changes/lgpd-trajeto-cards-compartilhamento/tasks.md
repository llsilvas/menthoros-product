# Tasks — lgpd-trajeto-cards-compartilhamento

## 0. Antes de implementar (gates do Full track)

- [x] 0.1 `product-reviewer`: Refine, sem bloqueio. Incorporado: bump só junto com o texto (rollback em D5)
- [x] 0.2 Codex: NOT READY com 2 bloqueios, ambos incorporados — versão apresentada enviada no POST com `409` (D2, CA6) e revogação como evento (D1, D6, CA7). spec-reviewer: READY COM AJUSTES — CA6–CA9, rollback, data fixa, resolução do usuário, efeito na waitlist incorporados
- [x] 0.3 Q1–Q4 decididas pelo founder em 2026-11-08 (ver "Decisões" no `proposal.md`). Validação jurídica da base legal (Q2) segue pendente e bloqueia só a promoção para `main`
- [x] 0.4 `design.md` escrito (D1–D5)
- [x] 0.5 Confirmar que a change dos cards com mapa (`athlete-share-cards-mapa`) declara esta como dependência bloqueante

## 1. Política de Privacidade (frontend)

- [x] 1.1 Em `src/pages/waitlist/politicaPrivacidadeConteudo.ts`, adicionar ao § 3 a finalidade "gerar, a pedido do atleta, imagens do treino para compartilhamento"
- [x] 1.2 Adicionar a § 6.4 "Compartilhamento feito pelo próprio atleta", com trajeto completo incluindo início e fim, ato do atleta e opção sem mapa
- [x] 1.3 Adicionar a linha correspondente na tabela de bases legais (§ 4), conforme Q2
- [x] 1.4 Vigência 2026-11-09 (`POLITICA_VERSAO`, `POLITICA_ATUALIZADA_EM`). A § 6.3 fala só de marketing/publicidade e não contradiz a § 6.4 — mantida
- [x] 1.5 Teste de componente garantindo que a § 6.4 e a menção a "início e fim" estão renderizadas
- [x] 1.6 Validação verde (front `094d56d`)

## 2. Versão vigente (backend)

- [x] 2.1 Atualizar `app.lgpd.policy-version` nos `application*.yml` para a mesma data da 1.4
- [x] 2.2 Railway conferido em 2026-11-08: **nenhuma `LGPD_*` definida** em `production` nem `develop`, então vale o default. Achado: até aqui o front exibia 2026-10-26 e o backend considerava 2026-08-03 — o bump alinha os dois. Re-aceite dos coaches aceito (Q3)
- [x] 2.3 Migração V114 `tb_usuario_trajeto_share_consent` como eventos `CONCEDIDO`/`REVOGADO` (D1), entidade, repositório sem update/delete
- [x] 2.4 `GET`/`POST`/`DELETE /api/v1/atletas/me/consentimentos/trajeto-compartilhamento` (D2): só `ATLETA`, `POST` recebe a versão apresentada e devolve `409 CONSENT_VERSION_STALE` se defasada
- [x] 2.5 Testes: unit do service (último evento, idempotência, 409, revogar e conceder de novo, tenant), `@WebMvcTest` (ATLETA, TECNICO 403), IT do ciclo conceder → revogar → conceder; teste do default de `app.lgpd.policy-version` = `2026-11-09`
- [x] 2.6 `./mvnw clean verify` verde após atualizar a data fixada em `WaitlistControllerIT.policyVersionVemDoServidor` (efeito previsto no D5). Desvio do design: usuário não encontrado no tenant responde 404 (`DomainNotFoundException`, mesmo caminho dos demais `/atletas/me/*`), não 503. Backend `a695970`

## 3. Aviso no compartilhamento (frontend, depende da change dos cards)

- [x] 3.1 Cliente curado + `useTrajectoryShareConsent` (D3)
- [x] 3.2 `TrajectoryShareConsentDialog`: texto simples, link `RouterLink` para a § 6.4, "Entendi, compartilhar" e "Usar modelo sem mapa"
- [x] 3.3 Seção "Privacidade" na `AthleteProfilePage` com a chave de revogação (D6, CA7)
- [x] 3.3a Testes de componente para CA4, CA5, CA6 (409 pede recarregar) e CA7, e do hook
- [ ] 3.4 E2E do fluxo (CA3–CA5): **movido para `athlete-share-cards-mapa`**, que é onde existe modelo com mapa para disparar o gate
- [x] 3.5 Validação: lint, build e `test:run` verdes (301 arquivos / 2952 testes). Front `0784223`

## 4. Promoção

- [ ] 4.1 QA (code-reviewer, security-reviewer, frontend-reviewer)
- [ ] 4.2 PRs para `develop` (front e backend)
- [ ] 4.3 Promoção `develop → main` — **decisão do founder em 2026-11-08 de promover sem esperar a validação jurídica da base legal (Q2)**; a validação continua pendente
