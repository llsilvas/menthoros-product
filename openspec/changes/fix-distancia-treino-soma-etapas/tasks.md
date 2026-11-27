# Tasks — fix-distancia-treino-soma-etapas

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean verify`.

## 1. Pace de fallback na PRINCIPAL sem ritmo

- [ ] 1.1 Teste (vermelho) em `TreinoNormalizadorDistanciaPrincipalPorPaceTest`: PRINCIPAL com duração e sem
      ritmo (etapa e cabeçalho) em REGENERATIVO/CONTINUO/LONGO → distância = `duracaoMin ÷ pace Z2` (sem
      limiar 7:00; com limiar 5:00 → 6:00) e `ritmoAlvo` continua nulo; TEMPO_RUN → intacta; ritmo declarado
      → vence o fallback; PRINCIPAL sem duração → intacta (a guarda de duração vem antes do fallback).
      verify: casos de fallback falham em develop; os demais passam.
- [ ] 1.2 Teste (vermelho) de `encaixarPrincipalNoTotal` sem ritmo: com sobra → PRINCIPAL = sobra, duração =
      sobra × pace Z2, treino = soma das durações (CA7: 4,00 km → 13 min, `28:00`); PRINCIPAL encaixada
      menor que o aquecimento → bloco único (CA7b: 3,00 km → `21:00`); sem sobra → bloco único com duração =
      total × pace (CA8); TEMPO_RUN → comportamento atual.
      verify: CA7/CA7b/CA8 falham em develop.
- [ ] 1.3 `TreinoNormalizador`: `paceDerivavel` ganha o fallback Z2 (mesmo cálculo de
      `corrigirDistanciasEtapasTemporais` — extrair, não duplicar) depois do ritmo da etapa e do cabeçalho,
      só para REGENERATIVO/CONTINUO/LONGO e só com duração > 0. `distanciaPrincipalPorPace`,
      `principaisComDistanciaPorPace` e `encaixarPrincipalNoTotal` recebem o `paceLimiar`;
      `NormalizacaoDeTreino` passa `c.atleta().getPaceLimiar()` nos passos `distancia-principal-por-pace` e
      `reconciliar-distancia` (`reconciliarContinuo`). Ajustar os testes diretos às assinaturas.
      verify: 1.1 e 1.2 verdes.
- [ ] 1.4 Teste pela receita completa (`NormalizacaoDeTreino#normalizar`): CA1 (Carla: REGENERATIVO 1,00 km,
      10/10/5 min, sem limiar → ≈ 3,57 km, `25:00`), CA7/CA7b/CA8 com etapas sintetizadas pelo reparador, e CA3
      (TEMPO_RUN sem ritmo → total da LLM e contador `principal-sem-ritmo` incrementado).
      verify: CA1/CA7/CA8 falham sem a 1.3 (develop grava 1,00 km no CA1).

## 2. Matriz

- [ ] 2.1 `NormalizacaoDeTreinoInvarianteTotalTest`: acrescentar limiar nulo à grade; `volumeEhASoma`
      (`:192`) passa a valer também com `ritmo == NENHUM` para REGENERATIVO/CONTINUO/LONGO em estrutura
      completa (sintetizada continua "total = prescrito"); a exceção `sem-pace` fica restrita a TEMPO_RUN.
      Atualizar `INVENTARIO` com o número medido e o Javadoc.
      verify: matriz verde (CA5).
- [ ] 2.2 Validação: `./mvnw clean verify`; esperados alterados listados abaixo (CA6).

## Esperados alterados

- (preencher na implementação, com o inventário final de `sem-pace`)
