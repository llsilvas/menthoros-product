# fix-normalizador-etapas-incompletas — normalizador sobrescreve totais corretos da LLM com a soma de etapas incompletas

**Tamanho:** XS · **Trilha:** Fast
**Status:** em implementação
**Criado:** 2026-09-21

> Origem: bug observado em 2026-09-21 no plano semanal do atleta Leandro (`d83c4c31`,
> request de geração `c70b34f4`). Os treinos persistidos têm tempo e distância incompatíveis:
> REGENERATIVO de 7 km em 25 min (pace implícito 3:34/km, ritmo alvo 7:28-7:55/km) e FARTLEK
> de 2,64 km em 50 min (pace implícito 18:56/km, ritmo alvo 6:20-6:45/km).

## Why

A resposta bruta da LLM (`tb_llm_call.response_json`) estava coerente no nível do treino:
REGENERATIVO 7 km / 45:00, FARTLEK 8 km / 50:00, LONGO 10 km / 60:00. O que veio incompleto
foram as **etapas**: todas as 8 com `distanciaKm: 0.0` (o prompt permite — linha 397 de
`plano-treino-system.txt`: "se distanciaKm não puder ser calculado, usar 0.0") e, no
REGENERATIVO, etapas somando 15 min (PRINCIPAL 10 + DESAQUECIMENTO 5) para um treino de 45 min.

Dois passos da receita de normalização (`NormalizacaoDeTreino.montarReceitas`) tratam a soma das
etapas como verdade absoluta e sobrescrevem o total do treino, mesmo quando a soma é
visivelmente parcial:

- **`recalcular-duracao`** (`NormalizacaoDeTreino.java:578`, cauda comum a todas as famílias):
  soma `duracaoMin` das etapas e substitui `treino.duracaoMin` sempre que a soma é > 0. No
  REGENERATIVO, o reparador estrutural acrescentou um AQUECIMENTO de 10 min, a soma ficou
  10+10+5 = 25 e o `45:00` da LLM virou `25:00`. A distância de 7 km ficou intacta.
- **`reconciliar-distancia`** (`TreinoNormalizador.reconciliarDistanciaComEtapas`, `:447`,
  famílias FARTLEK e INTERVALADO_TIRO): substitui `treino.distanciaKm` pela soma das etapas
  quando o desvio passa de 10%. No FARTLEK, `corrigir-temporais` atribuiu 1,32 km ao aquecimento
  e ao desaquecimento, mas a PRINCIPAL "Fartlek livre" não é expandida (sem padrão `Nx(...)`) e
  ficou com 0 km. Soma 2,64 km contra 8 km declarados → desvio 67% → `8.0` virou `2.64`. A
  duração de 50 min ficou intacta.

O LONGO escapou por coincidência: as etapas somavam exatamente 60 min e a distância já era válida.

O gate **`validar-triangulo`** (`NormalizacaoDeTreino.java:596`) detectou os dois casos (desvio de
54% e 190%) mas só emite WARN. O comentário justifica: "os três são prescrições da LLM e nenhum tem
precedência clara". A premissa deixou de valer — a essa altura duração e distância já não são as
prescrições da LLM, foram alteradas pelos passos anteriores a partir de dados parciais.

**Causa raiz:** uma etapa com `distanciaKm = 0` é "desconhecido", não "zero"; uma lista de etapas
cuja duração não cobre o treino é "incompleta", não "a duração real". Os dois passos leem esses
valores como totais. É o mesmo mecanismo do FARTLEK 6,64 km investigado em 2026-09-14 (change
`add-etapa-pace-validator`), agora aparecendo pelo lado oposto.

## What Changes

Backend, dois helpers puros, sem contrato de API nem schema:

1. **`TreinoNormalizador.reconciliarDistanciaComEtapas`** só substitui `distanciaKm` quando
   **todas** as etapas têm `distanciaKm > 0`. Se alguma está em 0/null, a soma é um piso, não um
   total: mantém a distância da LLM e loga WARN `RECONCILIAÇÃO ... etapas sem distância, mantendo
   distanciaKm da LLM`. O ramo `distanciaAtual <= 0` (LLM não deu distância) continua usando a soma
   — não há valor melhor.
2. **`NormalizacaoDeTreino.recalcularDuracao`** deixa de sobrescrever a duração da LLM quando a
   soma das etapas é inconsistente com `ritmoAlvo × distanciaKm` **e** a duração da LLM é
   consistente (mesma tolerância de 20% do triângulo). Aplica-se às famílias em que `ritmoAlvo` é o
   pace médio do treino (TRES_ETAPAS, FARTLEK, PADRAO); em INTERVALADO_TIRO o `ritmoAlvo` é o pace
   do tiro e a soma das etapas continua autoritativa (comportamento atual, coberto por
   `TreinoNormalizadorIntervaladoTest`). Sem `ritmoAlvo` ou `distanciaKm` válidos, mantém o
   comportamento atual (soma das etapas). Loga WARN `DURAÇÃO MANTIDA` quando decide não sobrescrever.
3. Extrair de `validarTrianguloPaceDuracaoDistancia` um helper privado `duracaoEsperadaMin(treino)`
   (`OptionalDouble`) reutilizado pelos dois pontos, sem mudar o gate.

### Non-goals

- Não mexer no prompt (`plano-treino-system.txt`) nem no schema da LLM — permitir `0.0` nas etapas
  é decisão anterior e corrigir no normalizador cobre qualquer resposta futura com o mesmo defeito.
- Não expandir "Fartlek livre" em etapas nem inventar distância para a PRINCIPAL do FARTLEK —
  segue em 0 km; o total do treino é que passa a prevalecer.
- Não redistribuir a duração das etapas para fechar com o total do treino (no REGENERATIVO as
  etapas persistidas continuam somando 25 min contra 45 min do treino). Ver Open Questions.
- Não promover `validar-triangulo` de WARN para correção automática.
- Não corrigir os planos já persistidos (o de 21/09 pode ser regenerado pelo coach).

## Critérios de aceite

**CA1 — distância da LLM prevalece quando alguma etapa não tem distância**
Given um FARTLEK com `distanciaKm=8.0` e etapas AQUECIMENTO 1,32 km, PRINCIPAL 0 km, DESAQUECIMENTO 1,32 km
When `reconciliarDistanciaComEtapas` roda
Then `distanciaKm` permanece `8.0`.

**CA2 — reconciliação continua quando todas as etapas têm distância**
Given um treino com `distanciaKm=6.0` e etapas 1,32 + 4,0 + 1,32 km (soma 6,64, desvio 11%)
When `reconciliarDistanciaComEtapas` roda
Then `distanciaKm` passa a `6.64` (comportamento atual preservado).

**CA3 — treino sem distância continua usando a soma das etapas**
Given `distanciaKm=null` e etapas com soma 2,64 km (uma delas em 0)
When `reconciliarDistanciaComEtapas` roda
Then `distanciaKm` passa a `2.64` (ramo atual preservado).

**CA4 — duração da LLM prevalece quando as etapas não cobrem o treino**
Given um REGENERATIVO `45:00`, 7,0 km, ritmo `7:28-7:55/km`, etapas PRINCIPAL 10 min + DESAQUECIMENTO 5 min (sem AQUECIMENTO)
When `normalizar` roda a receita TRES_ETAPAS
Then `duracaoMin` permanece `45:00` (esperado ≈ 53,8 min: 45 desvia 16%, a soma 25 desvia 54%).

**CA5 — soma das etapas continua autoritativa quando é consistente**
Given um LONGO `60:00`, 10 km, ritmo `6:45-7:00/km`, etapas 10 + 45 + 5 min
When `normalizar` roda
Then `duracaoMin` é `60:00`. E dado o mesmo LONGO com `duracaoMin="90:00"` da LLM (desvio 31%),
Then `duracaoMin` passa a `60:00` (a soma está dentro dos 20%, a LLM não).

**CA6 — sem ritmo alvo, comportamento atual**
Given um REGENERATIVO `45:00` sem `ritmoAlvo`, etapas somando 25 min
When `normalizar` roda
Then `duracaoMin` passa a `25:00` (sem triângulo não há tie-break; mantém a regra vigente).

**CA7 — INTERVALADO não é afetado**
`TreinoNormalizadorIntervaladoTest` e `NormalizacaoDeTreinoTest` continuam verdes sem alteração.

## Métrica de sucesso

Zero treinos gerados cujo pace implícito (`duracaoMin / distanciaKm`) desvie mais de 20% do
`ritmoAlvo` quando a LLM devolveu os três valores coerentes — verificável pelo WARN
`TRIÂNGULO` deixar de aparecer em gerações com etapas em 0 km. Para o treinador: o treino chega
à revisão com tempo e distância que ele não precisa corrigir à mão (hoje precisa reescrever dois
de três treinos da semana do Leandro).

## Impact

- **Repositórios:** só `apps/menthoros-backend`.
- **Classes tocadas:** `services/helper/TreinoNormalizador` (`reconciliarDistanciaComEtapas`),
  `services/helper/NormalizacaoDeTreino` (`recalcularDuracao`, helper extraído do triângulo).
- **Testes:** `TreinoNormalizadorCorrigirDistanciasTest`, `NormalizacaoDeTreinoTest`.
- **API / banco:** nenhuma mudança.

## Open Questions & Assumptions

**Premissas assumidas:**
- O total do treino vindo da LLM é mais confiável que a soma de etapas parciais. A evidência do
  ledger confirma (os totais batiam com o `ritmoAlvo`); as etapas são o ponto fraco do modelo.
- A tolerância de 20% já usada pelo triângulo serve como tie-break entre duração da LLM e soma
  das etapas — não introduzir um segundo limiar.
- `ritmoAlvo` é pace médio do treino inteiro fora de INTERVALADO/TIRO. Se algum tipo em PADRAO
  usar `ritmoAlvo` como pace de bloco, o guard cai no caso "ambos inconsistentes" e mantém a soma
  das etapas — não piora o comportamento atual.

**Em aberto:**
- Quando a duração da LLM prevalece, as etapas persistidas ficam somando menos que o treino
  (25 min de etapas para 45 min de treino). Esticar a PRINCIPAL para fechar o total é melhoria
  adjacente; fica para follow-up se o coach reclamar da tela de etapas.
- O prompt poderia exigir `distanciaKm` por etapa em vez de permitir `0.0`. É mudança de prompt
  (gate de eval), fora deste fix.
