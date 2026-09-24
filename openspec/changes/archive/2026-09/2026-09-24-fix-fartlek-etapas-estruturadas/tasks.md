# Tasks — fix-fartlek-etapas-estruturadas

## 1. Gates estruturais na receita FARTLEK (TDD)

- [x] 1.1 RED — testes em `NormalizacaoDeTreino` para a família FARTLEK: CA2 (caso do Leandro,
      "Fartlek livre" em 3 etapas reprova), CA3 (série comprimida `4x (1min + 2min)` é expandida e
      passa), CA4 (já expandido passa), CA5 (1 aceleração reprova, 2 passa), CA6 (sem aquecimento /
      sem desaquecimento no fim reprova), CA7 (sem recuperação / recuperação sem aceleração
      reprova), CA7b (fartlek "Misto" com acelerações consecutivas passa)
      verify: os novos testes falham pelo motivo esperado (receita FARTLEK sem gates)
- [x] 1.2 GREEN — gate de mínimo (≥2 acelerações, ≥1 recuperação) + `gateExistencia`,
      `gatePresencaAquecDesaq`, `gateOrdemAquecDesaq`, `gateSequencia` na receita FARTLEK, depois de
      `expandir` e antes de `reconciliar-distancia` (sem `gateBalanceamento`)
      verify: testes da 1.1 verdes
- [x] 1.3 Atualizar o golden de ordem da receita FARTLEK no teste de caracterização (CA8)
- [x] 1.4 Validar: `./mvnw clean test`

## 2. Instrução da Categoria D (TDD)

- [x] 2.1 RED — teste de `CategoriaIntervalado.D`: sem "livre"/"espontâneas"; o exemplo da
      instrução, como descrição de PRINCIPAL, é expandido por `expandirEtapasAgregadas` (CA1)
      verify: falha com a instrução atual
- [x] 2.2 GREEN — reescrever `instrucaoPadrao` da Categoria D
- [x] 2.3 Atualizar `golden/plano-prompt/avancado-tsb-baixo.user.txt`
- [x] 2.4 Validar: `./mvnw clean test`

## 4. Distâncias da série expandida (ampliação 2026-09-22, TDD)

- [x] 4.1 RED — CA9 (caso real pela receita), CA10/CA11 (`expandirEtapasAgregadas`), CA12
      (recuperação expandida recebe pace Z1; golden da ordem)
      verify: falham com o expansor atual (6,98 km / 30 min)
- [x] 4.2 GREEN — aceleração por `ritmoAlvo`, recuperação `0.0`, expansor sem sobrescrever
      duração, `corrigir-temporais` depois de `expandir` na receita FARTLEK
      verify: testes da 4.1 verdes; atualizar baselines de caracterização só onde a mudança é a
      intencional
- [x] 4.3 Validar: `./mvnw clean test` e `./mvnw clean verify`

## 3. Entrega

- [x] 3.1 `./mvnw clean verify`
- [x] 3.2 Geração real para atleta degradado para Categoria D; conferir FARTLEK em `tb_etapa_treino` — 2026-09-22 07:24: FARTLEK 3,88 km / 30:00, 12 etapas; acelerações 6:40/km, recuperações 8:42/km, aquec/desaq 7:35/km
