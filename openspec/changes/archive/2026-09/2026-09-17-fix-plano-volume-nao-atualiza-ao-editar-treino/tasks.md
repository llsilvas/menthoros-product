# tasks — fix-plano-volume-nao-atualiza-ao-editar-treino

Repositório único: `apps/menthoros-backend`, branch `feature/fix-plano-volume-nao-atualiza-ao-editar-treino`.

## 1. Fix

- [x] 1.1 **Feito.** Teste RED confirmado antes do fix (CA1): `aumentarDistanciaSomaDeltaNoVolumeDoPlano`
      — plano `volumePlanejadoKm=20`, treino `distanciaKm=10` → `18`, resultado esperado `28`,
      `verify(planoSemanalRepository).save(plano)`.
- [x] 1.2 **Feito.** Teste RED confirmado (CA2): `reduzirDistanciaSubtraiDeltaNoVolumeDoPlano` —
      `distanciaKm=10` → `3` num plano com `volumePlanejadoKm=20`, resultado `13`.
- [x] 1.3 **Feito.** Teste (CA3): `patchSemDistanciaNaoMexeNoVolumeDoPlano` — patch só com
      `descricao`, volume inalterado e `planoSemanalRepository` nunca salvo. Já passava antes do
      fix (hoje nunca mexe no plano); serve de regressão daqui pra frente.
- [x] 1.4 **Feito.** Teste RED confirmado (CA4): `distanciaAnteriorNulaNaoLancaNpe` —
      `distanciaKm` nulo → `4.0`, sem NPE, volume ajustado.
- [x] 1.5 **Feito.** `TreinoPlanejadoServiceImpl.editarTreino` — depois de salvar o treino, compara
      `distanciaAnterior` (`:127`) com `treino.getDistanciaKm()` pós-patch (tratando nulo como
      ausência de mudança/zero); se mudou, chama `ajustarVolumePlano(plano, distanciaAnterior, false)`
      seguido de `ajustarVolumePlano(plano, distanciaNova, true)` e
      `planoSemanalRepository.save(plano)`. Sem mudar a assinatura de `ajustarVolumePlano`.
      *verify:* os 4 testes (1.1–1.4) passam — `./mvnw test -Dtest='TreinoPlanejadoServiceTest$EditarTreino'`
      → 51/51 verdes (suíte completa da classe, sem regressão).
- [x] 1.6 **Feito.** JavaDoc de `editarTreino` atualizado — `Side Effects` cita o ajuste do volume
      do plano quando a distância muda.

## 2. Validação e fechamento

- [x] 2.1 **Feito.** `./mvnw clean verify` verde — 190 testes de integração (`*IT`), 0 falhas.
- [x] 2.2 **Feito.** PR **#131** `feature/fix-plano-volume-nao-atualiza-ao-editar-treino` → `develop`,
      mergeado em 2026-09-17.
