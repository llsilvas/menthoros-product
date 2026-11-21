# Tasks — validar-ritmo-etapa-contra-zona

- [x] 0.1 Ler `EtapaFcValidator` e a tabela de zona esperada por tipo; decidir a equivalente para pace (Open Questions).
- [x] 1.1 Validador de pace por tipo de etapa (TDD), CA1–CA3.
- [x] 1.2 Passo na receita de `NormalizacaoDeTreino` antes do reparo de distância; caracterização atualizada.
- [ ] 2.1 Eval candidato + leitura do coach (CA4). `./mvnw clean verify`; PR → `develop`.

## Entrega da fatia de sanidade (2026-11-18)

- [x] S.1 `PaceValidator.sanear` + passo `sanear-ritmos` no início de toda receita (S1–S4).
- [x] S.2 `./mvnw clean verify` verde (6732 unitários, 342 integração); PR menthoros-backend#248.

As tasks 0.1–2.1 acima (cruzamento com a zona) ficam para depois de `revalidar-fatores-pace-zonas`.

## Entrega do cruzamento com a zona (2026-11-21)

- 0.1: tabela do `EtapaFcValidator` (Z1 para aquecimento/desaquecimento/recuperação; principal por tipo de treino), com
  intervalado/tiro até Z6; tolerância de 50% e recorte, como a FC.
- 1.1–1.2: `PaceValidator.validarZonaEtapa` + passo `corrigir-pace-zona` logo após `sanear-ritmos`. Salvaguardas do eval:
  principal só desacelera; aquecimento não passa a principal; teto do histórico vence a zona. Corrigido junto o
  arredondamento do teto em `corrigir-pace-teto-piso` (5:23,4 virava 5:23). PR menthoros-backend#255; verify verde.
- 2.1: eval em 3 rodadas, nenhuma violação vinda do passo; falta a leitura do coach (CA4).
- Follow-ups achados no eval: (a) o prompt mostra o teto arredondado para baixo e o checker usa o valor exato;
  (b) a ativação em ritmo de prova de `ajustar-taper-pre-prova` colide com o teto de contínuo do histórico.
