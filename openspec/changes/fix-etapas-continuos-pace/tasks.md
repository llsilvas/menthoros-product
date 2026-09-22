# Tasks — fix-etapas-continuos-pace

## 1. Distância das etapas dos contínuos pelo pace (TDD)

- [ ] 1.1 RED — `TreinoNormalizador.distanciaPrincipalPorPace` (CA2, CA3, CA6) e receita
      TRES_ETAPAS pelo `NormalizacaoDeTreino` (CA1 caso real, CA4, CA5)
      verify: falham com a receita atual (PRINCIPAL 5,5 km em 30 min)
- [ ] 1.2 GREEN — novo passo + `corrigir-temporais` + `reconciliar-distancia` na receita TRES_ETAPAS
      verify: testes da 1.1 verdes
- [ ] 1.3 Golden da ordem (CA7) e baselines de caracterização dos contínuos
- [ ] 1.4 Validar: `./mvnw clean test` e `./mvnw clean verify`

## 2. Entrega

- [ ] 2.1 Geração real para o Leandro; conferir pace das etapas contínuas em `tb_etapa_treino`
