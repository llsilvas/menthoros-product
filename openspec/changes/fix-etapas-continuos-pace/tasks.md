# Tasks — fix-etapas-continuos-pace

## 1. Distância das etapas dos contínuos pelo pace (TDD)

- [x] 1.1 RED — `TreinoNormalizador.distanciaPrincipalPorPace` (CA2, CA3, CA6) e receita
      TRES_ETAPAS pelo `NormalizacaoDeTreino` (CA1 caso real, CA4, CA5 com duração, CA8)
      verify: falham com a receita atual (PRINCIPAL 5,5 km em 30 min)
- [x] 1.2 GREEN — novo passo + `corrigir-temporais` + `reconciliar-distancia` na receita TRES_ETAPAS
      verify: testes da 1.1 verdes
- [x] 1.3 Golden da ordem (CA7) e baselines de caracterização dos contínuos
- [x] 1.4 Validar: `./mvnw clean test` e `./mvnw clean verify`

- [x] 1.5 Bateria de borda (pedido do founder, "é o nosso core"): +90 testes — fórmula com BVA de
      duração e pace, ritmo nulo/vazio/malformado/invertido, duração nula/zero/negativa, caixa do
      tipoEtapa, duas PRINCIPAL, preservação de campos, idempotência, grade de pace × duração;
      `foiSintetizada`; receita com os 3 casos reais, os 4 tipos, limites da reconciliação, reparo
      reordenado × sintetizado, total 0/null, sem limiar, família PADRAO intocada
      verify: `./mvnw clean verify` — 4035 unit + 193 IT, 0 falhas

## 2. Entrega

- [ ] 2.1 Geração real para o Leandro; conferir pace das etapas contínuas em `tb_etapa_treino`
