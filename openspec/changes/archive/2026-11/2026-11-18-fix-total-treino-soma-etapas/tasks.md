# Tasks — fix-total-treino-soma-etapas (S · Fast · backend)

Branch: `fix/fix-total-treino-soma-etapas`, em worktree, a partir de `develop`.
Validação: `./mvnw clean test`; final `./mvnw clean verify`.

- [x] 1.1 Teste CA1 (vermelho) → fallback do ritmo do treino no pace da PRINCIPAL.
- [x] 1.2 Teste CA2/CA3 (vermelho) → encaixe da PRINCIPAL no total com etapa sintetizada.
- [x] 1.3 Caracterização: atualizar esperados afetados, um a um (CA5).
- [x] 2.1 Medição sobre os 30 planos salvos (CA4); `./mvnw clean verify`; PR → `develop`.
      `verify` verde em 2026-11-16 (6640 unitários, 331 integração); PR menthoros-backend#241. CA4 mede-se
      na rodada regerada (2.2).
- [x] 2.2 Depois do merge: rebase da branch da migração e rodada 2 da revisão cega regerada.

Entregue: menthoros-backend#241. CA4 na rodada regerada: 101/103 treinos com total = soma (2 com total da LLM
menor que as etapas geradas); na rodada 3, depois de fix-etapas-sintetizadas-sessao-curta, 96/96.
