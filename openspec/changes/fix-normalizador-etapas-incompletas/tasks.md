# tasks — fix-normalizador-etapas-incompletas

Repositório único: `apps/menthoros-backend`, branch `feature/fix-normalizador-etapas-incompletas`.

## 1. Distância — `TreinoNormalizador.reconciliarDistanciaComEtapas`

- [x] 1.1 **Feito.** Teste RED confirmado (CA1) em `TreinoNormalizadorCorrigirDistanciasTest`: FARTLEK 8,0 km com
      PRINCIPAL em 0 km → `distanciaKm` permanece 8,0.
- [x] 1.2 **Feito.** Testes (CA2, CA3) + etapa `null`: todas as etapas com distância → reconcilia para a soma; treino sem
      distância → usa a soma mesmo com etapa em 0.
- [x] 1.3 **Feito.** Fix: só reconciliar quando todas as etapas têm `distanciaKm > 0`; WARN quando mantém a
      distância da LLM. JavaDoc atualizado.
      *verify:* `./mvnw test -Dtest=TreinoNormalizadorCorrigirDistanciasTest`

## 2. Duração — `NormalizacaoDeTreino.recalcularDuracao`

- [x] 2.1 **Feito.** Teste RED confirmado (CA4) em `NormalizacaoDeTreinoTest`: REGENERATIVO 45:00 / 7 km / 7:28-7:55
      com etapas 10 + 5 min → `duracaoMin` permanece `45:00` após `normalizar`.
- [x] 2.2 **Feito.** Testes (CA5 ×2, CA6, ambos-inconsistentes): soma consistente prevalece sobre duração da LLM fora da tolerância;
      sem `ritmoAlvo` mantém a regra atual (soma das etapas).
- [x] 2.3 **Feito.** Fix: extrair `duracaoEsperadaMin(treino)` do triângulo; em `recalcularDuracao`, fora de
      INTERVALADO_TIRO, manter a duração da LLM quando ela está dentro de 20% e a soma das etapas
      não. WARN `DURAÇÃO MANTIDA`.
      *verify:* `./mvnw test -Dtest='NormalizacaoDeTreinoTest,TreinoNormalizadorIntervaladoTest,FamiliaTreinoTest'`

## 3. Validação e fechamento

- [x] 3.1 **Feito.** `./mvnw clean verify`: unidade 3916/0 falhas (1 skip); integração 186 casos —
      os 5 de `PlanoMetadadosCacheIT` caíram por colisão com o hook `qa-gate` (`mvnw test`
      concorrente reescreveu `target/classes` durante a carga do contexto: "Unable to obtain
      inputstream ... V2__Add_multi_tenancy_support.sql") e passaram 5/5 reexecutados isolados.
- [x] 3.2 **Feito.** PR **#138** `feature/fix-normalizador-etapas-incompletas` → `develop`, aberto em 2026-09-21 (merge do founder; `/done` após o merge).

## Notas de implementação

- `NormalizacaoDeTreinoCaracterizacaoTest.regenerativoSoPrincipal`: baseline atualizado de `45:00`
  para `30:00` — era exatamente o bug (LLM deu 30:00 coerente com 4 km a 6:30-7:00; a soma das
  etapas sintetizadas pelo reparo sobrescrevia). Decisão registrada no próprio teste.
- 155 testes das suítes `*Normaliza*`, `TreinoNormalizador*`, `FamiliaTreinoTest`,
  `PlanoLlmValidator*`, `IaServiceImpl*` verdes após o fix.
