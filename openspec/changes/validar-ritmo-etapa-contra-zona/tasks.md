# Tasks — validar-ritmo-etapa-contra-zona

- [ ] 0.1 Ler `EtapaFcValidator` e a tabela de zona esperada por tipo; decidir a equivalente para pace (Open Questions).
- [ ] 1.1 Validador de pace por tipo de etapa (TDD), CA1–CA3.
- [ ] 1.2 Passo na receita de `NormalizacaoDeTreino` antes do reparo de distância; caracterização atualizada.
- [ ] 2.1 Eval candidato + leitura do coach (CA4). `./mvnw clean verify`; PR → `develop`.

## Entrega da fatia de sanidade (2026-11-18)

- [x] S.1 `PaceValidator.sanear` + passo `sanear-ritmos` no início de toda receita (S1–S4).
- [x] S.2 `./mvnw clean verify` verde (6732 unitários, 342 integração); PR menthoros-backend#248.

As tasks 0.1–2.1 acima (cruzamento com a zona) ficam para depois de `revalidar-fatores-pace-zonas`.
