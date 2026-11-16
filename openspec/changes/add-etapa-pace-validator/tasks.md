# Tasks — add-etapa-pace-validator (S · Fast · backend)

Reescrito em 2026-11-16 depois da medição. Branch: `fix/add-etapa-pace-validator`, em worktree, a partir
de `develop`. Validação: `./mvnw clean test`; final `./mvnw clean verify`.

## 1. Etapas temporais pelo ritmo declarado

- [x] 1.1 Teste: AQUECIMENTO 10 min, `ritmoAlvo` 6:00–6:30/km → 1,60 km (CA1); sem ritmo legível →
      fallback atual (CA2). Vermelho antes.
- [x] 1.2 `corrigirEtapaTemporal` usa `paceValidator.calcularPaceMedia(ritmoAlvo)` quando presente.
- [x] 1.3 Atualizar só os esperados afetados em `NormalizacaoDeTreinoCaracterizacaoTest` (CA6).

## 2. Eval sobre o plano normalizado

- [x] 2.1 `EvalCandidateRunner` normaliza cada treino com `NormalizacaoDeTreino` antes de gradar e
      devolver o JSON (CA4). Contexto como `PlanoLlmValidator#contexto`, sem banco: zonas pelo atleta
      da fixture, teto/piso vazios.
- [x] 2.2 Violação de pace implícito / 0 km no `EvalDeterministicGrader` (CA5), reusando a regra de
      `RevisaoCegaNormalizacaoMedicaoTest.avaliar`.
- [x] 2.3 Fixture `avancado-tsb-baixo`: `paceLimiar` 3.50 → 3.83 (bate com 15,65 km/h).

## 3. Verificação

- [x] 3.1 `RevisaoCegaNormalizacaoMedicaoTest` sobre os 30 planos salvos: 0 fora e 0 zero (CA3).
- [ ] 3.2 `./mvnw clean verify`; PR → `develop`.
      `verify` verde em 2026-11-16 (6637 unitários, 331 integração); PR ainda não aberto.
- [ ] 3.3 Regerar a revisão cega (`RevisaoCegaPlanosRealTest`, 5 arquétipos × 3) já normalizada e
      entregar ao coach — fecha a 3.5 de `migrate-openai-retired-models`.

## Notas de entrega (2026-11-16)

- 1.3: `NormalizacaoDeTreinoCaracterizacaoTest` não mudou — as etapas temporais do baseline não têm `ritmoAlvo`.
- 2.1: a normalização ficou dentro do `EvalDeterministicGrader` (um só parse); o `EvalCandidateRunner` devolve
  o JSON normalizado. Contexto sem zonas de FC nem teto/piso históricos (comentário `shortcut:` no código).
- 3.1: com o código novo, os 30 planos salvos dão **0 etapas com pace fora e 0 com 0 km** depois da
  normalização (antes: 50 e 0). CA3 atendido.
- Limite: o check só lê ritmo em faixa (`M:SS-M:SS/km`); ritmo único não é avaliado.
