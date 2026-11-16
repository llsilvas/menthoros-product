# Tasks — add-etapa-pace-validator (S · Fast · backend)

Reescrito em 2026-11-16 depois da medição. Branch: `fix/add-etapa-pace-validator`, em worktree, a partir
de `develop`. Validação: `./mvnw clean test`; final `./mvnw clean verify`.

## 1. Etapas temporais pelo ritmo declarado

- [ ] 1.1 Teste: AQUECIMENTO 10 min, `ritmoAlvo` 6:00–6:30/km → 1,60 km (CA1); sem ritmo legível →
      fallback atual (CA2). Vermelho antes.
- [ ] 1.2 `corrigirEtapaTemporal` usa `paceValidator.calcularPaceMedia(ritmoAlvo)` quando presente.
- [ ] 1.3 Atualizar só os esperados afetados em `NormalizacaoDeTreinoCaracterizacaoTest` (CA6).

## 2. Eval sobre o plano normalizado

- [ ] 2.1 `EvalCandidateRunner` normaliza cada treino com `NormalizacaoDeTreino` antes de gradar e
      devolver o JSON (CA4). Contexto como `PlanoLlmValidator#contexto`, sem banco: zonas pelo atleta
      da fixture, teto/piso vazios.
- [ ] 2.2 Violação de pace implícito / 0 km no `EvalDeterministicGrader` (CA5), reusando a regra de
      `RevisaoCegaNormalizacaoMedicaoTest.avaliar`.
- [ ] 2.3 Fixture `avancado-tsb-baixo`: `paceLimiar` 3.50 → 3.83 (bate com 15,65 km/h).

## 3. Verificação

- [ ] 3.1 `RevisaoCegaNormalizacaoMedicaoTest` sobre os 30 planos salvos: 0 fora e 0 zero (CA3).
- [ ] 3.2 `./mvnw clean verify`; PR → `develop`.
- [ ] 3.3 Regerar a revisão cega (`RevisaoCegaPlanosRealTest`, 5 arquétipos × 3) já normalizada e
      entregar ao coach — fecha a 3.5 de `migrate-openai-retired-models`.
