# fix-fartlek-etapas-estruturadas — FARTLEK é gerado sem as séries expandidas e passa sem validação

**Tamanho:** S · **Trilha:** Fast
**Status:** em implementação
**Criado:** 2026-09-21

> Origem: plano semanal do atleta Leandro (`d83c4c31`), gerado em 2026-09-21 22:57. O FARTLEK de
> 24/09 foi persistido com 3 etapas — AQUECIMENTO, PRINCIPAL "Fartlek livre 20-30 min com
> acelerações curtas Z2-Z3.", DESAQUECIMENTO — em vez de `3 + 2×N` etapas. No histórico do atleta,
> só 1 de 6 FARTLEKs (2026-02-23) saiu expandido.

## Why

O treinador revisa o plano procurando as séries: quantas acelerações, de quanto tempo, em qual
zona. Um FARTLEK com uma única etapa "livre" não diz nada disso — o treinador precisa reescrever o
treino à mão, e o atleta não tem o que seguir no relógio. É o tipo de treino em que a estrutura
**é** a prescrição.

Três falhas se somam:

1. **O próprio sistema pede "fartlek livre".** Quando o intervalado é degradado para a Categoria D
   (TSB abaixo do limiar, recuperação insuficiente desde o último intensivo, ou CTL abaixo do
   mínimo — `IntervaladoElegibilidadeService`), o user prompt recebe a instrução de
   `CategoriaIntervalado.D`: *"Prescreva fartlek livre de 20-30 min em Z2-Z3 com acelerações
   espontâneas curtas."* Isso contradiz o system prompt (`plano-treino-system.txt:325`, "SEMPRE
   criar etapas individuais — não agrupar série em uma única etapa"), e a LLM segue a instrução
   mais específica. No caso do Leandro, TSB = −18 contra limiar −15 (Intermediário).
2. **O expansor não tem o que expandir.** `TreinoNormalizador.expandirEtapasAgregadas` só reconhece
   séries comprimidas no formato `N x (Xmin + Ymin)`. Texto livre ("acelerações espontâneas") não
   casa, e a etapa fica intacta.
3. **Nada barra o resultado.** A receita da família FARTLEK (`NormalizacaoDeTreino.montarReceitas`)
   tem só passos de correção aritmética — nenhum gate estrutural. Um FARTLEK de 3 etapas é
   persistido sem aviso e sem turno de reparo.

## What Changes

Backend, sem contrato de API nem schema:

- **`CategoriaIntervalado.D.instrucaoPadrao`** passa a pedir fartlek leve **estruturado**, no
  formato que o expansor entende e com a instrução explícita de expandir. O exemplo é **concreto**
  — `5× (1min Z3 + 2min Z2)` — porque o regex do expansor exige um único `N` e durações inteiras
  (`4-6× (1-2 min ...)` não casaria; achado do Codex na DoR). Cada aceleração e cada recuperação é
  etapa individual, entre aquecimento e desaquecimento.
  A intensidade continua a de uma versão segura (Z3, não Z4-Z5) — a degradação não muda de sentido.
- **Gates estruturais na receita FARTLEK**, depois de `expandir` (para que uma série comprimida
  reconhecível seja expandida antes de ser julgada) e antes de `reconciliar-distancia`:
  - existência de etapas; aquecimento na primeira posição e desaquecimento na última;
  - **no mínimo 2 acelerações** (etapas `INTERVALADO`) — é o que distingue um fartlek de uma
    corrida contínua;
  - **pelo menos 1 recuperação**, e toda recuperação vem depois de uma aceleração.
  Violação lança `LLMException` com mensagem que nomeia a regra — o `PlanoResilienceService` já
  reenvia a violação no turno de reparo, então a LLM recebe o motivo.
  Os gates reusam os de INTERVALADO/TIRO (`gateExistencia`, `gatePresencaAquecDesaq`,
  `gateOrdemAquecDesaq`, `gateSequencia`); o novo é o mínimo de acelerações e de recuperação.
  **Não** entram:
  - `gateBalanceamento` (acelerações × recuperações com diferença ≤ 1) e alternância estrita: o
    fartlek "Misto" que o próprio system prompt prescreve na Categoria D —
    `6× (3min Z4 + 1min Z5 + 2min Z2)` — tem duas acelerações seguidas por bloco, 12 contra 6
    recuperações. Os dois gates o reprovariam.
  - `gateContagem` (mínimo 6 etapas): 2 acelerações + 1 recuperação + aquecimento + desaquecimento
    já é o piso estrutural; contar etapas é redundante.
  - `validarDuracaoTiros` (teto de 10 min por tiro): regra de intervalado, não de fartlek.

### Ampliação (2026-09-22) — distâncias da série expandida

A validação real (plano do Leandro de 2026-09-22 06:47) confirmou a estrutura: a LLM escreveu
`"Fartlek 5× (1min Z3 + 2min Z2)"` e o expansor gerou 5 pares. Mas o treino foi persistido com
**6,98 km em 30 min** (pace implícito 4:18/km) para um ritmo de 6:20-6:45/km. A LLM mandou o
treino com 40:00 / 5,0 km e a PRINCIPAL com 25 min / **5,0 km** (a distância do treino inteiro).
Três passos se encadearam:

1. **Distância repartida sem pace** (`TreinoNormalizador.expandirEtapasAgregadas`, caminho por
   tempo): `distanciaKm` da PRINCIPAL ÷ N, e depois proporcional ao tempo — 1 km a cada 3 min.
   Aceleração de 1 min com 0,33 km, recuperação "trote" de 2 min com 0,67 km (3:00/km).
2. **Duração sobrescrita pelo expansor** (`recalcularDuracaoTreino` ao fim da expansão): o
   `40:00` da LLM virou a soma `30:00` antes de `recalcular-duracao`, então o desempate pelo
   triângulo (PR #138) nunca viu o valor original.
3. **Reconciliação** adotou a soma 6,98 km: nenhuma etapa com distância zero, então a soma parecia
   completa.

O defeito existia antes desta change; ficava escondido porque o fartlek nunca era expandido.
Corrigir aqui evita trocar um defeito por outro: sem isso o PR entrega fartlek estruturado com pace
impossível — o sintoma que abriu a investigação ("tempos não condizem com os kms").

- **Distância da aceleração expandida = duração ÷ pace médio do `ritmoAlvo`** da etapa de origem.
  Sem `ritmoAlvo` interpretável, a distância fica `0.0` (desconhecida), e a guarda de etapa
  incompleta de `reconciliar-distancia` mantém a distância da LLM.
- **Recuperação expandida sem distância própria**: nasce com `0.0` e recebe `duração ÷ pace Z1`
  de `corrigir-temporais`, que na receita FARTLEK passa a rodar **depois** de `expandir` (antes
  rodava antes e não alcançava as recuperações criadas pela expansão).
- **O expansor não sobrescreve mais a duração do treino** — só troca as etapas.
  `recalcular-duracao` (cauda comum) decide com o desempate pelo triângulo.

## Fora de escopo

- **Schema v2** (`validarEstruturaV2`, `plano-treino-system-v2.txt`): lá o FARTLEK é resolvido a
  partir de blocos pelo `SessionResolver` e o prompt declara "sem estrutura obrigatória". É outro
  caminho de geração; o plano do Leandro saiu pelo v1. Fica como está.
- Expandir texto livre deterministicamente (inventar séries a partir de "acelerações espontâneas"):
  o número e a duração das acelerações são decisão de prescrição, não de normalização.
- O caminho `NxDist` do expansor ("6x400m") e a distância da PRINCIPAL dos contínuos
  (REGENERATIVO/LONGO também chegam com a distância do treino inteiro na PRINCIPAL — o total do
  treino fica coerente e não há expansão ali).
- O `atletaId` aleatório no log de `IntervaladoElegibilidadeSkill` e o preço ausente de
  `gpt-4o-2024-08-06` em `llm-pricing.yml` — achados da mesma investigação, sem relação com o bug.

## Critérios de aceite

- **CA1** — Given a instrução padrão da Categoria D, then ela não contém "livre" nem
  "espontâneas"; e given uma etapa PRINCIPAL cuja descrição é o exemplo contido na instrução, when
  `TreinoNormalizador.expandirEtapasAgregadas` roda, then a etapa é expandida em pares
  INTERVALADO/RECUPERACAO (teste pelo método público — `detectarFartlekNaDescricao` é privado).
- **CA2** — Given um FARTLEK com AQUECIMENTO, PRINCIPAL "Fartlek livre 20-30 min..." e
  DESAQUECIMENTO (o caso do Leandro), when a receita FARTLEK roda, then lança `LLMException` cuja
  mensagem menciona as acelerações individuais.
- **CA3** — Given um FARTLEK cuja PRINCIPAL é "4x (1min forte + 2min leve)", when a receita roda,
  then o treino é expandido em 4 pares INTERVALADO/RECUPERACAO e passa nos gates (nenhuma exceção).
- **CA4** — Given um FARTLEK já expandido pela LLM (aquecimento, ≥2 pares alternados,
  desaquecimento), when a receita roda, then passa sem exceção.
- **CA5** — Given um FARTLEK com 1 única aceleração, then lança `LLMException` (limite: 2 passa, 1
  reprova).
- **CA6** — Given um FARTLEK sem aquecimento, ou sem desaquecimento na última posição, then lança
  `LLMException`.
- **CA7** — Given um FARTLEK com acelerações e nenhuma recuperação, ou com recuperação sem
  aceleração anterior, then lança `LLMException`.
- **CA7b** — Given um FARTLEK "Misto" (blocos de duas acelerações seguidas + uma recuperação),
  then passa sem exceção.
- **CA8** — O golden do teste de caracterização da receita (ordem dos passos da família FARTLEK)
  reflete os gates novos; as receitas das outras famílias não mudam.

- **CA9** — Given o FARTLEK real de 2026-09-22 (treino 40:00 / 5,0 km / 6:20-6:45; PRINCIPAL
  25 min / 5,0 km "Fartlek 5× (1min Z3 + 2min Z2)"), when a receita roda, then nenhuma etapa com
  distância > 0 tem pace implícito mais rápido que o limite rápido do `ritmoAlvo` (6:20/km), e o
  pace médio do treino (duração ÷ distância) também não.
- **CA10** — Given uma série por tempo cuja etapa de origem tem `ritmoAlvo`, then cada aceleração
  tem `distanciaKm = round2(duração ÷ pace médio)`; given sem `ritmoAlvo`, then `0.0`.
- **CA11** — Given uma expansão, then `expandirEtapasAgregadas` preserva `duracaoMin` do treino.
- **CA12** — As recuperações criadas pela expansão recebem `duração ÷ pace Z1` (corrigir-temporais
  depois de expandir); o golden de ordem da receita FARTLEK reflete a troca.

## Métrica de sucesso

Percentual de FARTLEKs persistidos com ≥ 2 acelerações individuais, **nos planos gerados pelo
schema v1** (o v2 está fora de escopo e declara FARTLEK sem estrutura obrigatória): hoje 1 em 6 no
histórico do Leandro; alvo 100% dos gerados em v1 após o merge (verificável por consulta em
`tb_etapa_treino`). Para o
treinador, é a diferença entre revisar o fartlek e reescrevê-lo.

## Riscos e mitigações

- **Plano inteiro falhando.** O teto é 1 turno de reparo; se a LLM insistir num fartlek sem séries,
  a geração do plano falha, o que é pior para o treinador do que um fartlek mal estruturado.
  Mitigação: a correção principal é na origem (instrução D); o gate é a rede. A mensagem da violação
  diz exatamente o que fazer, e ela vai para o turno de reparo. A métrica de violação estrutural
  (`contarViolacaoEstrutural`) passa a contar FARTLEK — acompanhar nas primeiras gerações.
- **Instrução de prompt mudando saída da LLM.** A instrução D está em código Java, não em
  `resources/prompts/**`, então o gate de eval do CLAUDE.md não dispara formalmente; mesmo assim
  rodar a geração real para um atleta degradado para D e conferir o FARTLEK antes do merge.
- **Golden do prompt** (`golden/plano-prompt/avancado-tsb-baixo.user.txt`) carrega o texto da
  instrução D e precisa ser atualizado junto.

## Open Questions & Assumptions

- **Assumido:** a Categoria D pode continuar produzindo TEMPO_RUN em vez de FARTLEK (a descrição da
  categoria é "Tempo Run / Fartlek suave"); TEMPO_RUN é validado pela família TRES_ETAPAS e não é
  afetado.
- **Assumido:** a LLM tipa as acelerações como `INTERVALADO` (é o que o expansor produz e o que o
  prompt de fartlek pede). Se ela usar `PRINCIPAL` para cada aceleração, o gate reprova e o turno de
  reparo corrige — aceitável, e observável pela métrica.
- **Descartado na DoR:** tipo de treino com casing/espaço diferente cair em `PADRAO` e escapar
  dos gates — o structured output restringe `tipoTreino` a um enum exato
  (`LlmJsonSchemaBuilder.java:126`).
- **Em aberto:** se a taxa de reprovação de FARTLEK ficar alta mesmo com a instrução corrigida,
  avaliar tratar `PRINCIPAL` alternada com `RECUPERACAO` como aceleração.
