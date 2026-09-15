# Tasks — add-etapa-pace-validator (M · Full · backend)

## 0. Discovery

- [ ] **0.1** Ler `EtapaFcValidator.java` e `EtapaFcValidatorTest.java` por completo (não só o trecho
  já citado no proposal/design) — confirmar todos os métodos package-private testados e o padrão de
  `@Nested`/`@DisplayName` usado, para reproduzir exatamente no `EtapaPaceValidatorTest`.
- [ ] **0.2** Confirmar em `NormalizacaoDeTreino.java` a lista exata de `Passo`s em `caudaComum`
  (linha ~94) e o ponto de inserção do novo passo (depois de `reconciliarDistancia`, junto do passo
  que já invoca `EtapaFcValidator`).
- [ ] **0.3** Levantar quantas etapas em produção (`tb_etapa_treino`) têm `ritmo_alvo` E
  `distancia_km` E `duracao_min` preenchidos simultaneamente — dimensiona quantas etapas o validador
  de fato vai examinar (contagem, sem alterar dados).

## 1. `EtapaPaceValidator` — parse e checagem (TDD)

- [ ] **1.1** Teste: `parsePaceRange("6:30-7:00/km")` retorna `[390, 420]` (segundos/km) — CA1/CA2
- [ ] **1.2** Teste: `parsePaceRange(null)` e `parsePaceRange("moderado")` retornam `null` sem exceção — CA4
- [ ] **1.3** Implementar `parsePaceRange` (regex `^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/km$`)
- [ ] **1.4** Teste: pace real dentro da faixa declarada (com folga de 5s/km) → etapa retorna
  inalterada, sem log de correção — CA2
- [ ] **1.5** Teste: pace real fora da faixa declarada → `ritmoAlvo` corrigido para o pace real
  formatado, `WARN` logado no formato especificado no CA1 — CA1
- [ ] **1.6** Teste (BVA): pace real exatamente no limite da faixa ± folga (limite-1, limite, limite+1
  segundos) — cobre a borda da tolerância de 5s/km
- [ ] **1.7** Teste: `ritmoAlvo=null` ou `distanciaKm=null` ou `duracaoMin=null` ou
  `distanciaKm<=0` → etapa retorna inalterada, sem exceção — CA3
- [ ] **1.8** Implementar `validarPaceEtapa` conforme esboço do design.md
- [ ] Validação: `./mvnw test -Dtest=EtapaPaceValidatorTest`

## 2. Integração na receita de normalização

- [ ] **2.1** Adicionar `EtapaPaceValidator` como `@Component` injetável em `NormalizacaoDeTreino`
  (mesmo padrão de injeção do `EtapaFcValidator` existente)
- [ ] **2.2** Inserir o novo passo na `caudaComum`, depois do passo de `EtapaFcValidator`
- [ ] **2.3** Teste de integração: um treino de cada família (`FARTLEK`, `INTERVALADO_TIRO`,
  `TRES_ETAPAS`) com uma etapa de pace inconsistente é corrigido ao passar pela receita completa — CA5
- [ ] **2.4** Rodar a suíte de caracterização existente (`NormalizacaoDeTreinoCaracterizacaoTest`,
  `PlanoTreinoPromptBuilderGoldenTest` se aplicável) para confirmar que nenhum treino existente sem
  inconsistência de pace muda de comportamento
- [ ] Validação: `./mvnw clean test`

## 3. Fechamento

- [ ] **3.1** Rodar `./mvnw clean verify` (gate completo, inclui `*IT`)
- [ ] **3.2** Revisar se algum `*IT` de geração de plano (`PlanGenerationContextLoaderIT` ou similar)
  precisa de asserção nova cobrindo o validador de pace end-to-end
- [ ] **3.3** Atualizar este `tasks.md` marcando o que foi entregue vs. adiado antes do `/done`
