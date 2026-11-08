# Tasks — lgpd-trajeto-cards-compartilhamento

## 0. Antes de implementar (gates do Full track)

- [ ] 0.1 Rodar `product-reviewer` sobre o `proposal.md` e incorporar o veredito
- [ ] 0.2 Rodar o pre-mortem (`/codex:adversarial-review`) e incorporar em "Riscos e mitigações"
- [ ] 0.3 Resolver Q1 (onde guardar a confirmação), Q2 (base legal, com DPO/jurídico), Q3 (re-aceite dos coaches) e Q4 (controladora)
- [ ] 0.4 Escrever o `design.md` com as decisões de 0.3
- [x] 0.5 Confirmar que a change dos cards com mapa (`athlete-share-cards-mapa`) declara esta como dependência bloqueante

## 1. Política de Privacidade (frontend)

- [ ] 1.1 Em `src/pages/waitlist/politicaPrivacidadeConteudo.ts`, adicionar ao § 3 a finalidade "gerar, a pedido do atleta, imagens do treino para compartilhamento"
- [ ] 1.2 Adicionar a § 6.4 "Compartilhamento feito pelo próprio atleta", com trajeto completo incluindo início e fim, ato do atleta e opção sem mapa
- [ ] 1.3 Adicionar a linha correspondente na tabela de bases legais (§ 4), conforme Q2
- [ ] 1.4 Atualizar a data de vigência exibida na página
- [ ] 1.5 Teste de componente garantindo que a § 6.4 e a menção a "início e fim" estão renderizadas
- [ ] 1.6 Validação: `npm run lint && npm run build && npm run test:run`

## 2. Versão vigente (backend)

- [ ] 2.1 Atualizar `app.lgpd.policy-version` nos `application*.yml` para a mesma data da 1.4
- [ ] 2.2 Aplicar a decisão de Q3 sobre o re-aceite dos coaches
- [ ] 2.3 Validação: `./mvnw clean test`

## 3. Aviso no compartilhamento (frontend, depende da change dos cards)

- [ ] 3.1 Aviso antes do primeiro card com mapa: texto simples, link para a § 6.4, "Entendi, compartilhar" e "Usar modelo sem mapa"
- [ ] 3.2 Guardar a confirmação conforme Q1. Se for backend, criar endpoint e migração append-only aqui, e a change sobe para M
- [ ] 3.3 Testes de componente para CA3, CA4 e CA5
- [ ] 3.4 E2E (fluxo crítico: consentimento): primeiro compartilhamento mostra o aviso, o segundo não; "sem mapa" troca o modelo
- [ ] 3.5 Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`
