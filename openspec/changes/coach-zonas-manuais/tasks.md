# Tasks — coach-zonas-manuais (L · Full · backend + front)

> **Bloqueada por `coach-cadastro-ancoras-zonas`.** Não iniciar antes do merge daquela em `develop`.
> Branch: `feat/coach-zonas-manuais` nos dois repos; backend primeiro.

## 0. Decisões e design

- [ ] **0.1** Fechar Q1–Q3 do proposal com o treinador
- [ ] **0.2** Escrever `design.md`: tabela das faixas manuais (por atleta, eixo, zona, tenant),
  campo de modo por eixo, precedência dentro de `ZonaTreinoService`, contrato (extensão do corpo de
  `PUT .../zonas/ancoras` ou endpoint próprio)
- [ ] **0.3** Mapear os 15 consumidores de `ZonaTreinoService` e marcar quais precisam de teste de contrato
- [ ] **0.4** Fechar os critérios de aceite e o delta de spec em `specs/coach-athlete-zones/`

## 1. Backend

- [ ] **1.1** Migration + entidade das faixas manuais e do modo por eixo
- [ ] **1.2** Validação das faixas (De < Até, sem sobreposição, limites) — [CA3]
- [ ] **1.3** Precedência em `ZonaTreinoService` + testes por consumidor crítico — [CA1, CA2, CA4]
- [ ] **1.4** Contrato de escrita e `modo` no GET — [CA5]
- [ ] **1.5** Eval gate da prescrição — [CA6]
  - Validação: `./mvnw clean verify` + `./mvnw -Peval test -Dtest=EvalRunnerTest -Dmodo=candidato`

## 2. Front

- [ ] **2.1** Seletor de modo por aba, tabela editável pré-preenchida, "Recalcular a partir do limiar",
  validação inline — [CA3]
- [ ] **2.2** Chip de modo no card — [CA5]
- [ ] **2.3** E2E: modo manual de ritmo refletido no card e no seletor de zona — [CA7]
  - Validação: `npm run lint && npm run build && npm run test:run && npm run test:e2e`
