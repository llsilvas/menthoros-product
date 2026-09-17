# tasks — fix-plano-volume-nao-atualiza-ao-editar-treino

Repositório único: `apps/menthoros-backend`, branch `feature/fix-plano-volume-nao-atualiza-ao-editar-treino`.

## 1. Fix

- [ ] 1.1 Teste que falha (CA1): `TreinoPlanejadoServiceTest` — novo teste dentro do nested
      `editarTreino` cobrindo que editar `distanciaKm` de `5` para `8` num plano com
      `volumePlanejadoKm=10` resulta em `plano.volumePlanejadoKm=13` e
      `volumeAlvoKm=13`, com `verify(planoSemanalRepository).save(plano)`.
      *verify:* `./mvnw test -Dtest=TreinoPlanejadoServiceTest` — falha (comportamento atual não
      ajusta o plano).
- [ ] 1.2 Teste que falha (CA2): reduzir `distanciaKm` de `8` para `3` num plano com
      `volumePlanejadoKm=10` resulta em `volumePlanejadoKm=5`.
- [ ] 1.3 Teste que falha (CA3): patch sem `distanciaKm` (só `descricao`/`percepcaoEsforcoEsperada`)
      não altera `volumePlanejadoKm` e **não** chama `planoSemanalRepository.save(plano)` — só
      `treinoPlanejadoRepository.save(treino)`.
- [ ] 1.4 Teste que falha (CA4): `distanciaKm` nulo → `4` (e o caminho inverso `4` → nulo) não lança
      `NullPointerException` e ajusta o volume corretamente (nulo tratado como zero).
- [ ] 1.5 Implementação em `TreinoPlanejadoServiceImpl.editarTreino`: depois de `aplicarPatch` e
      antes do `treinoPlanejadoRepository.save(treino)`, comparar `distanciaAnterior` (já capturada
      em `:127`) com `treino.getDistanciaKm()` pós-patch; se diferentes, chamar
      `ajustarVolumePlano(plano, distanciaAnterior, false)` seguido de
      `ajustarVolumePlano(plano, treino.getDistanciaKm(), true)` e `planoSemanalRepository.save(plano)`.
      Sem mudar a assinatura de `ajustarVolumePlano`.
      *verify:* os 4 testes (1.1–1.4) passam. `./mvnw clean test`.
- [ ] 1.6 JavaDoc de `editarTreino` atualizado — `Side Effects` passa a citar também o ajuste do
      volume do plano quando a distância muda (hoje só menciona "Database update (TreinoPlanejado)").

## 2. Validação e fechamento

- [ ] 2.1 `./mvnw clean verify` verde (inclui os `*IT`, não só `test`).
- [ ] 2.2 PR `feature/fix-plano-volume-nao-atualiza-ao-editar-treino` → `develop`.
