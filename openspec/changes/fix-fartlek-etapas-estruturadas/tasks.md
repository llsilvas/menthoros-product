# Tasks — fix-fartlek-etapas-estruturadas

## 1. Gates estruturais na receita FARTLEK (TDD)

- [ ] 1.1 RED — testes em `NormalizacaoDeTreino` para a família FARTLEK: CA2 (caso do Leandro,
      "Fartlek livre" em 3 etapas reprova), CA3 (série comprimida `4x (1min + 2min)` é expandida e
      passa), CA4 (já expandido passa), CA5 (1 aceleração reprova, 2 passa), CA6 (sem aquecimento /
      sem desaquecimento no fim reprova), CA7 (desbalanceado / recuperação sem aceleração reprova)
- [ ] 1.2 GREEN — `gateMinimoAceleracoes` + gates reusados de INTERVALADO/TIRO na receita FARTLEK,
      depois de `expandir` e antes de `reconciliar-distancia`
- [ ] 1.3 Atualizar o golden de ordem da receita FARTLEK no teste de caracterização (CA8)
- [ ] 1.4 Validar: `./mvnw clean test`

## 2. Instrução da Categoria D (TDD)

- [ ] 2.1 RED — teste de `CategoriaIntervalado.D`: sem "livre"/"espontâneas", exemplo reconhecido
      por `detectarFartlekNaDescricao` (CA1)
- [ ] 2.2 GREEN — reescrever `instrucaoPadrao` da Categoria D
- [ ] 2.3 Atualizar `golden/plano-prompt/avancado-tsb-baixo.user.txt`
- [ ] 2.4 Validar: `./mvnw clean test`

## 3. Entrega

- [ ] 3.1 `./mvnw clean verify`
- [ ] 3.2 Geração real para atleta degradado para Categoria D; conferir FARTLEK em `tb_etapa_treino`
