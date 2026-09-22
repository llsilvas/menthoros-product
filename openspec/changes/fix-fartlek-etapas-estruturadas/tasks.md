# Tasks — fix-fartlek-etapas-estruturadas

## 1. Gates estruturais na receita FARTLEK (TDD)

- [ ] 1.1 RED — testes em `NormalizacaoDeTreino` para a família FARTLEK: CA2 (caso do Leandro,
      "Fartlek livre" em 3 etapas reprova), CA3 (série comprimida `4x (1min + 2min)` é expandida e
      passa), CA4 (já expandido passa), CA5 (1 aceleração reprova, 2 passa), CA6 (sem aquecimento /
      sem desaquecimento no fim reprova), CA7 (sem recuperação / recuperação sem aceleração
      reprova), CA7b (fartlek "Misto" com acelerações consecutivas passa)
      verify: os novos testes falham pelo motivo esperado (receita FARTLEK sem gates)
- [ ] 1.2 GREEN — gate de mínimo (≥2 acelerações, ≥1 recuperação) + `gateExistencia`,
      `gatePresencaAquecDesaq`, `gateOrdemAquecDesaq`, `gateSequencia` na receita FARTLEK, depois de
      `expandir` e antes de `reconciliar-distancia` (sem `gateBalanceamento`)
      verify: testes da 1.1 verdes
- [ ] 1.3 Atualizar o golden de ordem da receita FARTLEK no teste de caracterização (CA8)
- [ ] 1.4 Validar: `./mvnw clean test`

## 2. Instrução da Categoria D (TDD)

- [ ] 2.1 RED — teste de `CategoriaIntervalado.D`: sem "livre"/"espontâneas"; o exemplo da
      instrução, como descrição de PRINCIPAL, é expandido por `expandirEtapasAgregadas` (CA1)
      verify: falha com a instrução atual
- [ ] 2.2 GREEN — reescrever `instrucaoPadrao` da Categoria D
- [ ] 2.3 Atualizar `golden/plano-prompt/avancado-tsb-baixo.user.txt`
- [ ] 2.4 Validar: `./mvnw clean test`

## 3. Entrega

- [ ] 3.1 `./mvnw clean verify`
- [ ] 3.2 Geração real para atleta degradado para Categoria D; conferir FARTLEK em `tb_etapa_treino`
