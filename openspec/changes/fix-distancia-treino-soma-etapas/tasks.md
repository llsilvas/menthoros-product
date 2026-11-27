# Tasks — fix-distancia-treino-soma-etapas

Repo: `apps/menthoros-backend`. Validação: `./mvnw clean verify`.

## 1. Pace de fallback na PRINCIPAL sem ritmo

- [x] 1.1 Teste (vermelho) em `TreinoNormalizadorDistanciaPrincipalPorPaceTest`: PRINCIPAL com duração e sem
      ritmo (etapa e cabeçalho) em REGENERATIVO/CONTINUO/LONGO → distância = `duracaoMin ÷ pace Z2` (sem
      limiar 7:00; com limiar 5:00 → 6:00) e `ritmoAlvo` continua nulo; TEMPO_RUN → intacta; ritmo declarado
      → vence o fallback; PRINCIPAL sem duração → intacta (a guarda de duração vem antes do fallback).
      verify: casos de fallback falham em develop; os demais passam.
- [x] 1.2 Teste (vermelho) de `encaixarPrincipalNoTotal` sem ritmo: com sobra → PRINCIPAL = sobra, duração =
      sobra × pace Z2, treino = soma das durações (CA7: 4,00 km → 13 min, `28:00`); PRINCIPAL encaixada
      menor que o aquecimento → bloco único (CA7b: 3,00 km → `21:00`); sem sobra → bloco único com duração =
      total × pace (CA8); TEMPO_RUN → comportamento atual.
      verify: CA7/CA7b/CA8 falham em develop.
- [x] 1.3 `TreinoNormalizador`: `paceDerivavel` ganha o fallback Z2 (mesmo cálculo de
      `corrigirDistanciasEtapasTemporais` — extrair, não duplicar) depois do ritmo da etapa e do cabeçalho,
      só para REGENERATIVO/CONTINUO/LONGO e só com duração > 0. `distanciaPrincipalPorPace`,
      `principaisComDistanciaPorPace` e `encaixarPrincipalNoTotal` recebem o `paceLimiar`;
      `NormalizacaoDeTreino` passa `c.atleta().getPaceLimiar()` nos passos `distancia-principal-por-pace` e
      `reconciliar-distancia` (`reconciliarContinuo`). Ajustar os testes diretos às assinaturas.
      verify: 1.1 e 1.2 verdes.
- [x] 1.4 Teste pela receita completa (`NormalizacaoDeTreino#normalizar`): CA1 (Carla: REGENERATIVO 1,00 km,
      10/10/5 min, sem limiar → ≈ 3,57 km, `25:00`), CA7/CA7b/CA8 com etapas sintetizadas pelo reparador, e CA3
      (TEMPO_RUN sem ritmo → total da LLM e contador `principal-sem-ritmo` incrementado).
      verify: CA1/CA7/CA8 falham sem a 1.3 (develop grava 1,00 km no CA1).

## 2. Matriz

- [x] 2.1 `NormalizacaoDeTreinoInvarianteTotalTest`: acrescentar limiar nulo à grade; `volumeEhASoma`
      (`:192`) passa a valer também com `ritmo == NENHUM` para REGENERATIVO/CONTINUO/LONGO em estrutura
      completa (sintetizada continua "total = prescrito"); a exceção `sem-pace` fica restrita a TEMPO_RUN.
      Atualizar `INVENTARIO` com o número medido e o Javadoc.
      verify: matriz verde (CA5).
- [x] 2.2 Validação: `./mvnw clean verify`; esperados alterados listados abaixo (CA6).

## Esperados alterados

Todos pela mesma causa: "sem ritmo" nos tipos leves deixou de ser "sem pace" (fallback Z2). Onde o teste
protegia o caminho sem pace, passou a usar TEMPO_RUN (que segue sem fallback); onde protegia o resultado,
afirma o novo.

- `TreinoNormalizadorDistanciaPrincipalPorPaceTest`
  - `ritmoNaoInterpretavelPreserva` (CA3 de `fix-etapas-continuos-pace`): REGENERATIVO → TEMPO_RUN; o caso
    REGENERATIVO virou `ritmoNaoInterpretavelUsaZ2` (30 min → 4,29 km, ritmo intacto).
  - `principaisMistas`: a PRINCIPAL sem ritmo deixa de ficar intacta (2,0 km) e recebe 10 ÷ 7,0 = 1,43 km.
  - `principaisComDistanciaPorPace` › `umaSemRitmo` e `ritmoNaoInterpretavel`: REGENERATIVO → TEMPO_RUN; o caso
    leve virou `semRitmoComFallback` (true).
- `TreinoNormalizadorCorrigirDistanciasTest` › `sobraNegativaSemPaceFicaVazio` (CA3 de
  `fix-etapas-sintetizadas-encaixe-total`): vazio → bloco único de 2,0 km / 14 min (`sobraNegativaSemRitmoUsaZ2`,
  CA8); o "vazio sem pace" segue em `tempoRunSemRitmoFicaVazio`.
- `NormalizacaoDeTreinoTest`
  - `telemetriaPrincipalSemRitmo`: REGENERATIVO → TEMPO_RUN (contador por tipo `TEMPO_RUN`); passa a afirmar
    também o total mantido (CA3).
  - `telemetriaEtapaSintetizada`: REGENERATIVO → TEMPO_RUN — no tipo leve o fallback faz bloco único e não há
    divergência a contar.
  - `semRitmoAlvoMantemRegraAtual` (CA6 de recalcular-duracao): REGENERATIVO → TEMPO_RUN; `25:00` mantido.
- `NormalizacaoDeTreinoInvarianteTotalTest`: grade com limiar nulo (5.045 → 6.725 cenários); `volumeEhASoma`
  vale sem ritmo fora de TEMPO_RUN; `sem-pace` restrita a TEMPO_RUN. `INVENTARIO`: `sem-pace` 504 → **165**;
  `tempo-run-sintetizado` 252 → **324** — o aumento é só a coluna nova de limiar nulo (TEMPO_RUN sintetizado sem
  limiar), não regressão.
- Caracterização (`NormalizacaoDeTreinoCaracterizacaoTest`) e goldens: nenhum esperado alterado.

Testes novos: `semRitmoUsaPaceZ2` (limiar nulo/5,0/4,0), `semRitmoSemDuracaoPreserva`, `semRitmoSemDuracao`,
`sobraPositivaSemRitmoUsaZ2` (CA7), `sobraCurtaSemRitmoViraBlocoUnico` (CA7b), e pela receita completa
`semLimiarEstruturaCompletaAdotaASoma` (CA1) e `semLimiarEtapaSintetizadaEncaixaNoTotal` (CA7/CA7b/CA8) —
4/4 vermelhos com o fallback removido, verdes com ele.

## Resultado

- `./mvnw clean verify` (2026-11-27): 13.803 testes (Surefire, 490 abortados — exceções catalogadas da matriz)
  e 367 `*IT` (Failsafe), 0 falhas.
- Exceção `sem-pace` da matriz: 504 → 165 cenários, só TEMPO_RUN (métrica de sucesso atingida).
