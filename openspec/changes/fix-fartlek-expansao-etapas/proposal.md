# fix-fartlek-expansao-etapas — fartlek chega ao relógio como bloco único, sem os intervalos

**Tamanho:** S · **Trilha:** Fast
**Status:** proposta
**Criado:** 2026-08-17

> Origem: bug relatado em 2026-08-17 — na tela de revisão de treinos, um fartlek com
> `4x (1min forte + 2min leve)` aparece como um único bloco PRINCIPAL de 12 min, e chega ao
> intervals.icu/Garmin sem os intervalos.

## Why

O treinador prescreve um fartlek estruturado; o atleta recebe no relógio uma corrida contínua. As
mudanças de ritmo — que **são** o treino — não existem em lugar nenhum a não ser como texto solto
dentro da descrição da etapa.

### O que acontece hoje

O LLM gera o fartlek comprimido numa etapa só:

```
tipoEtapa: PRINCIPAL
descricaoEtapa: "Fartlek leve Z2-Z3, 4x (1min forte + 2min leve)"
duracaoMin: 12
```

`IaServiceImpl.expandirEtapasAgregadas()` existe justamente para descomprimir isso, e o roteamento
está correto — `FARTLEK` é enviado para lá em `IaServiceImpl:405-414`. O detector também está
correto: `FARTLEK_TEMPO_PATTERN` casa a descrição acima com `n=4, accel=1min, recov=2min`.

O que impede é o guard de entrada, em `IaServiceImpl:902`:

```java
if (!"INTERVALADO".equalsIgnoreCase(etapa.tipoEtapa())) {
    resultado.add(etapa);   // passa direto, sem sequer tentar os detectores
    i++;
    continue;
}
```

A expansão só é tentada quando o LLM tipa a etapa como `INTERVALADO`. Quando ele tipa como
`PRINCIPAL` — que é um valor legítimo do schema (`IaServiceImpl:217`) e o observado na prática — a
etapa é copiada intacta e o detector **nunca é chamado**. Falha silenciosa: nenhum log, nenhuma
validação reclama.

### A segunda metade do problema

Corrigir só o guard resolve pela metade. As etapas expandidas em `IaServiceImpl:961-968` nascem com
`repeticoes=1` e **sem `blocoId`**. `blocoId` só é atribuído em
`TreinoPlanejadoServiceImpl:444-452`, no caminho em que o treinador adiciona um treino com
`tipoEtapa=BLOCO` — o caminho da IA nunca passa por ali.

`IntervalsIcuWorkoutConverter.desExpandir()` (`:125-152`) agrupa por `blocoId`; sem ele, cada etapa
vira um step independente, e `IntervalsIcuAdapter.montarStep()` (`:220-244`) só emite
`{"reps": N, "steps":[...]}` para bloco. O fartlek chegaria como 8 steps sequenciais em vez de
`4x [1min forte, 2min leve]` — tecnicamente executável, mas não é como o relógio e os apps
apresentam uma série, e o treinador perde a leitura da estrutura.

### Custo para a rotina do treinador

O treinador não tem como perceber o defeito na revisão: a tela mostra um bloco PRINCIPAL coerente,
com duração e FC plausíveis. A perda só aparece no relógio do atleta, depois do plano aprovado —
ou seja, fora do circuito de revisão. Cada fartlek gerado pela IA precisa ser reconstruído à mão no
`TreinoEditDialog`, que por sua vez colapsa a série em um único par esforço/recuperação.

## What Changes

1. **`IaServiceImpl:902`** — deixar etapas `PRINCIPAL` entrarem nos detectores de compressão, mas
   apenas quando a descrição casar um dos padrões (`REPETICOES_PATTERN` ou `FARTLEK_TEMPO_PATTERN`).
   Uma etapa `PRINCIPAL` de rodagem contínua, sem padrão na descrição, continua passando intacta.
2. **`IntervalsIcuWorkoutConverter.desExpandir()`** — quando `blocoId` é `null`, detectar séries
   consecutivas repetidas e reconstruir o bloco `reps=N`, reusando `dividirEmJanelas`,
   `janelasIdenticas` e `etapasEquivalentes`, que já existem no arquivo.

   **Revisão da abordagem (2026-08-17, durante a implementação).** A versão original desta change
   atribuía `blocoId`/`blocoRepeticoes` na expansão em `IaServiceImpl:961-968`. Isso não é viável:
   `EtapaTreinoLlmDto` alimenta o JSON schema enviado ao modelo — `IaServiceImpl:146` deriva o
   schema com `BeanOutputConverter<>(PlanoSemanalLlmDto.class)` e `enforceAllRequired` (`:120-125`)
   marca **todas** as propriedades como obrigatórias. Adicionar os campos ao record obrigaria o LLM
   a emitir um UUID de bloco por etapa — alucinação garantida, e tokens gastos nela. Esconder os
   campos do schema seria remendo sobre o contrato do modelo.

   Ganho adicional da via escolhida: corrige também os treinos **já persistidos**, que estão todos
   sem `blocoId`, sem migration. Custo aceito: o agrupamento passa a ser inferido por padrão em vez
   de declarado — mitigado por `janelasIdenticas`, que só agrupa quando as janelas são de fato
   idênticas, e pelo fallback já existente para steps individuais.

### Non-goals

- Não alterar `aplicarEtapasPatch` (`TreinoPlanejadoServiceImpl:410-423`), que descarta `blocoId` ao
  editar na tela de revisão. É um defeito real e adjacente, mas independente deste — fica para
  change própria.
- Não mexer no `TreinoEditDialog`, que colapsa séries heterogêneas em um par esforço/recuperação.
- Não normalizar `FARTLEK` no caminho `NxDist` (`IaServiceImpl:909-937`) nem desambiguar o
  `(m|km)?` de `REPETICOES_PATTERN`, que casa o "m" de "min" — ver Open Questions.
- Sem migration, sem mudança de contrato de API, sem alteração no frontend.

## Critérios de aceite

**CA1 — expansão de fartlek tipado como PRINCIPAL**
Given uma etapa `tipoEtapa=PRINCIPAL`, `duracaoMin=12`, descrição `"Fartlek leve Z2-Z3, 4x (1min forte + 2min leve)"`
When o plano é normalizado
Then são geradas 8 etapas — 4 pares `INTERVALADO(1min)` + `RECUPERACAO(2min)` — no lugar da etapa original.

**CA2 — PRINCIPAL sem padrão permanece intacta**
Given uma etapa `tipoEtapa=PRINCIPAL` com descrição `"Corrida contínua em Z2"`
When o plano é normalizado
Then a etapa é preservada sem alteração, e nenhuma etapa nova é criada.

**CA3 — agrupamento inferido sem blocoId**
Given um treino com 8 etapas sem `blocoId`, formando 4 pares idênticos `INTERVALADO(1min)` + `RECUPERACAO(2min)`
When `IntervalsIcuWorkoutConverter.converter()` roda
Then o `StructuredWorkout` contém um `WorkoutStep.bloco(reps=4)` com 2 sub-steps, e não 8 steps planos.

**CA4 — não agrupar o que não se repete**
Given um treino com etapas heterogêneas sem `blocoId` (ex.: progressivo com durações diferentes)
When o converter roda
Then cada etapa vira um step individual — nenhum bloco falso é inventado.

**CA4b — blocoId explícito continua tendo precedência**
Given um treino cujas etapas têm `blocoId` e `blocoRepeticoes` (caminho do treinador via `BLOCO`)
When o converter roda
Then o agrupamento segue o `blocoId`, sem interferência da nova inferência.

**CA5 — comportamento de INTERVALADO preservado**
Given um treino `INTERVALADO` com descrição `"6x400m Z5"`
When o plano é normalizado
Then o resultado é idêntico ao anterior a esta change (12 etapas, caminho `NxDist`).

## Métrica de sucesso

Zero fartleks gerados pela IA chegando ao intervals.icu como step único. Verificação: em um plano de
teste com ao menos um fartlek, o `workout_doc` enviado contém `"reps"` — hoje contém zero
ocorrências.

Efeito na rotina do treinador: elimina a reconstrução manual da série no `TreinoEditDialog` a cada
fartlek revisado.

## Open Questions & Assumptions

**Premissas assumidas:**
- O LLM tipa a etapa de fartlek ora como `PRINCIPAL`, ora como `INTERVALADO` — não há determinismo
  no schema que force um dos dois. Por isso a correção é no consumidor (aceitar ambos), não no
  prompt. Endurecer o prompt reduziria a frequência, mas não fecha o caso.
- Ampliar o guard para `PRINCIPAL` é seguro porque a entrada nos detectores fica condicionada ao
  casamento do padrão na descrição — não é o tipo que decide, é o texto.

**Em aberto:**
- `REPETICOES_PATTERN` (`IaServiceImpl:871-872`) tem `(m|km)?` que casa o "m" de "min": a descrição
  `"5x 2min forte, 2min fraco"` (sem parênteses e sem `+`) é lida como 5 tiros de **2 metros**, e o
  caminho `NxDist` é avaliado **antes** do caminho fartlek (`:909` antes de `:940`). Não afetou o
  caso relatado — a descrição real usa parênteses e `+`, e não casa `REPETICOES_PATTERN` —, mas é um
  defeito latente que fica exposto assim que `PRINCIPAL` passar a entrar nos detectores. Decidir se
  entra aqui ou em change própria durante a implementação da task 1.2.
