**Tamanho:** M · **Trilha:** Full

> Full porque **toca dois repos** (`menthoros-backend` + `menthoros-front`) e **muda contrato de API** (campo novo no DTO) — qualquer um já força Full. Escopo deliberadamente **mínimo (Opção 1)**: decoupling derivado dos **segmentos já persistidos** (`EtapaRealizada`), **sem** novo endpoint, nova entidade ou migration. A ingestão de **streams crus** do Strava (Opção 2) é **non-goal** explícito (ver follow-up).

## Why

O decoupling aeróbico (Pa:HR) mede a **queda do fator de eficiência** — `velocidade/FC`, "quanto de velocidade por batimento" — entre a 1ª e a 2ª metade de um esforço aeróbico contínuo: quanto essa eficiência se deteriora à medida que a fadiga entra. *(Usamos `velocidade/FC`, não `pace/FC`: pace é o inverso e inverteria o sinal — padronizado em toda a spec.)* É um dos sinais mais diretos de **resistência aeróbica / durabilidade** — um decoupling baixo (<5%) indica boa base aeróbica para a distância; alto (>10%) indica que o atleta "desacopla" sob fadiga e ainda não sustenta o esforço.

Para o treinador (persona primária), esse é exatamente o tipo de leitura que hoje ele faria **a olho**, comparando o pace e a FC do início vs. fim de um rodízio longo. O dado para automatizar isso **já está no banco**: `TreinoRealizado` guarda `etapasRealizadas` (`EtapaRealizada`) com `ordem`, `duracao`, `distanciaKm`, `fcMedia` e `velocidadeMedia`/`paceMedia` por segmento — o suficiente para comparar metades. O que falta é o **cálculo** e a **exposição** do número, mais um indicador de leitura imediata no detalhe do treino.

Numerador "pace normalizado por FC" já existe no backend isolado (`PaceRegressionCalculator.java:74-76`), mas só no agregado do treino inteiro — nunca particionado em metades nem exposto ao treinador.

## What Changes

- **Backend — calcular o decoupling a partir dos segmentos** (`EtapaRealizada`, ordenados por `ordem`):
  - Novo helper `DecouplingCalculatorService` (ao lado de `TssCalculatorService`/`ZonaTreinoService`): parte os segmentos em 1ª/2ª metade por **tempo acumulado**, calcula o fator de eficiência `EF = velocidade/FC` (duration-weighted) de cada metade e retorna `decoupling% = (EF₁ − EF₂) / EF₁ × 100`. **Null-safe**: retorna `null` quando não computável.
  - **Gate de aplicabilidade — o ponto mais crítico da change** (ver "Princípio de confiança" abaixo). Decoupling só faz sentido em esforço *steady sustentado*; o cálculo retorna `null` se **qualquer** predicado falhar:
    1. **≥2 segmentos elegíveis** após descartar aquecimento/desaquecimento (`tipoEtapa` ∈ {AQUECIMENTO, DESAQUECIMENTO/VOLTA_CALMA} quando identificável) e segmentos sem `fcMedia > 0` ou sem velocidade válida.
    2. **Duração sustentada** — soma das durações elegíveis ≥ **20 min** (drift aeróbico é ruído em esforço curto). *[threshold calibrável]*
    3. **Ambas as metades** (por tempo acumulado) com ≥1 segmento elegível com FC e velocidade.
    4. **Esforço steady, por variabilidade** (robusto, independe da classificação manual): CV (desvio/média) da `fcMedia` por segmento ≤ **0.10** **e** CV da `velocidadeMedia` por segmento ≤ **0.15**, calculado **só sobre segmentos ≥ 60s** (ignora laps curtos/ruído que distorceriam o CV). Aquecimento/desaquecimento **não rotulados** (rampas) elevam o CV e caem aqui → `null` — o CV é a rede de segurança. Intervalado tem CV alto → reprovado.
    5. **Belt-and-suspenders (só se o tipo for conhecido):** se `TipoTreino ∈ {INTERVALADO, FARTLEK, TIRO}` → `null` mesmo que o CV passe. O tipo vem do `treinoPlanejado` vinculado (nullable — treino manual/Strava sem plano não tem tipo); quando ausente, o gate recai no CV (predicado 4), que é a defesa robusta e independente de classificação.
    - **Thresholds = heurística v1**, constantes nomeadas, calibráveis sem mudar contrato; critério de revisão pós-release (taxa de `null` real) documentado no design.
    - **Princípio de confiança:** na dúvida, `null`. **Falso-negativo** (esconder num treino que talvez fosse elegível) é aceitável; **falso-positivo** (número sobre intervalado ou distorcido) é **inaceitável** — mina a confiança no diagnóstico inteiro.
  - **Campo aditivo** `Double decouplingPercentual` em `TreinoRealizadoOutputDto` (`@JsonInclude(NON_NULL)`), preenchido on-the-fly no `TreinoMapper.toOutputDto` (ou no service). **Derivado, não persistido** — sem coluna, sem migration. Aparece em toda resposta que já retorna o DTO (`marcar-realizado`, `lancar-treino`, `PUT /realizados/{id}`, `enriquecer-strava`).
- **Contrato** — portar o campo novo ao cliente curado (`src/api`) e ao tipo `TreinoRealizado` em `src/types`.
- **Frontend — indicador de decoupling no detalhe do treino realizado**:
  - Badge/mini-indicador com o valor `%` e cor por faixa (verde `<5%` · âmbar `5–10%` · vermelho `>10%`), via tokens `semantic.*`.
  - **Linha de interpretação junto do número** (não só o `%` cru — número passivo é fácil de ignorar), **descritiva e não-causal** (Opção 1 não separa fadiga de terreno/vento): `<5%` (inclui negativos) "eficiência bem sustentada" · `[5–10%]` "eficiência caindo na 2ª metade" · `>10%` "queda acentuada". Mapeada de forma centralizada (`decouplingLeitura(value)`); tooltip marca que é **estimativa** (pode refletir terreno/vento/calor, não só fadiga).
  - Estado **"não aplicável"** quando `decouplingPercentual` é `null` (intervalado, dados insuficientes) — não exibe número, exibe hint curto ("disponível só em treinos contínuos").

## Capabilities

### New Capabilities

- `aerobic-decoupling`: para um treino realizado contínuo/aeróbico com segmentos, o sistema deriva o decoupling Pa:HR (1ª vs. 2ª metade) a partir dos dados já persistidos e o expõe ao treinador como número + leitura colorida no detalhe do treino, degradando para "não aplicável" quando o esforço não é steady ou os dados são insuficientes.

### Modified Capabilities

<!-- Nenhuma capability canônica tem requisitos alterados; o campo é aditivo e derivado. -->

## Critérios de aceite

> **Prioridade:** AC1 (gate) é o critério de aceite de **maior prioridade** — acima da exatidão do número (AC2). Confiança > cobertura: melhor mudo que errado. Nenhum outro AC é aprovado se o gate deixar passar um número sobre esforço não-steady.

- **AC1 — gate de aplicabilidade (prioridade máxima)** · Given cada um dos casos: (a) treino **intervalado**/fartlek/tiro por `TipoTreino` (belt-and-suspenders, exige o `TipoTreino` no contrato do helper); (b) CV de FC > 0.10 **ou** CV de velocidade > 0.15 sobre os segmentos ≥ 60s (esforço não homogêneo — inclui aquecimento/desaquecimento não rotulado, que eleva o CV); (c) `<2` segmentos elegíveis (ou `<2` após o filtro de 60s do CV); (d) duração elegível total `< 20 min`; (e) alguma metade sem FC/velocidade válida; (f) FC/velocidade/duração ausente ou implausível (=0), When o DTO é montado, Then `decouplingPercentual` é `null` — **nunca** um número calculado. E: na presença de qualquer incerteza, o resultado é `null`. Thresholds são **heurística v1** (calibráveis); falso-negativo é aceitável, falso-positivo não.
- **AC2 — cálculo correto (quando aplicável)** · Given um treino que **passa o gate** (steady, ≥2 segmentos, ambas as metades com FC e velocidade, ≥20 min, aquecimento/desaquecimento descartados), When o DTO é montado, Then `decouplingPercentual == (EF₁ − EF₂)/EF₁ × 100` com `EF = velocidade/FC` ponderado por duração em cada metade, particionado por **tempo acumulado** (segmento que cruza o meio dividido proporcionalmente), arredondado a 1 casa; valor negativo (coupling/melhora) é permitido.
- **AC3 — campo aditivo / compatível** · Given clientes existentes, When o campo é adicionado ao `TreinoRealizadoOutputDto`, Then é opcional (`NON_NULL`) e não quebra desserialização; And é **derivado**, sem alteração de schema/migration.
- **AC4 — exibição no front (número + interpretação)** · Given um treino com `decouplingPercentual` presente, When o detalhe do treino realizado é exibido, Then mostra o `%` com cor por faixa — **fronteiras fechadas:** `< 5` (inclui negativos) verde · `[5, 10]` (5.0 e 10.0 inclusive) âmbar · `> 10` vermelho — **a linha de interpretação** descritiva (não-causal) e tooltip marcando que é estimativa; When o campo é `null`/ausente (`undefined`), Then exibe estado "não aplicável" sem número (o front trata `null` e `undefined` de forma idêntica).
- **AC5 — sem streams** · Given o escopo desta change, When o decoupling é computado, Then usa **apenas** `etapasRealizadas` já persistidas — nenhuma chamada nova a `/activities/{id}/streams` nem nova tabela.

## Métrica de sucesso

**Cobertura (disponibilidade, não adoção):** em treinos longos/contínuos sincronizados (com laps), o indicador aparece em ≥X% dos casos — taxa de `decouplingPercentual != null` sobre treinos que passam o gate. Mede que o número *existe* onde deveria.

> ⚠️ **Cobertura ≠ adoção.** Um badge é passivo: existir não é ser usado. Esta change **não** tem métrica direta de valor (o coach agiu sobre o sinal?) — buraco típico de feature de analytics, reconhecido no product-lens. Mitigação leve opcional (ver Open Questions): logar render/hover do badge para, depois, decidir se vale a Opção 2 (streams/tendência). Sem esse sinal, a decisão de aprofundar seria por vibe.

**Contra-métrica (guardrail):** **zero** falsos-positivos — nenhum decoupling exibido sobre treino intervalado (o gate, AC1). Um único número enganoso custa mais confiança do que muitos "não aplicável" custam cobertura.

## Open Questions & Assumptions

- **(Fechado — gate de aplicabilidade)** Definido como conjunção de predicados testáveis (ver "Gate de aplicabilidade" em What Changes + AC1): CV de FC ≤ 0.10 **e** CV de velocidade ≤ 0.15 entre segmentos (variabilidade, robusto e independente da classificação) + belt-and-suspenders por `TipoTreino` intervalado + ≥2 segmentos elegíveis + ≥20 min + ambas as metades válidas. Thresholds calibráveis; princípio "na dúvida, null".
- **(Fechado — partição das metades)** Por **tempo acumulado**; o segmento que cruza o ponto médio é **dividido proporcionalmente** por tempo (sem alocação arbitrária); aquecimento/desaquecimento (`tipoEtapa`) descartados antes da partição.
- **(Aberto — opcional, não bloqueia)** **Sinal de adoção:** logar/emitir métrica leve quando o `DecouplingBadge` renderiza com valor (e, se viável, no hover). Fecha o buraco da métrica de valor sem custo de produto — permite decidir, com dado, se a Opção 2 (streams/tendência) tem demanda. Deferível; não bloqueia a v1.
- **(Premissa)** `velocidade/FC` como fator de eficiência (corrida sem potência). Onde houver `potenciaMedia` confiável, Pw:HR seria preferível — fora do escopo v1 (corrida é o foco; potência de corrida é esparsa).
- **(Premissa)** Reusar a partição por segmentos já é suficiente para um sinal útil; a granularidade fina (drift minuto-a-minuto) **não** é objetivo aqui.
- **(Aberto — UX, bloqueia 4.x)** Superfície exata do indicador no front: confirmar o componente de detalhe do treino **realizado** (`TreinoRealizadoDialog` vs. card de treino realizado vs. um painel no perfil) — a base de código tem `DetalheTreinoDialog` (foco em planejado) e `TreinoRealizadoDialog`. Confirmar no 0.x.
- **(Fora de escopo — follow-up, Opção 2)** Ingestão e persistência de **streams crus** do Strava (`/activities/{id}/streams`: FC/pace/potência 1–4 Hz) numa entidade time-series nova (`TreinoAmostra`) — habilitaria a **curva** de decoupling, drift intra-segmento e outros gráficos intra-treino (FC/pace over time, hoje inexistentes). Custo alto (nova entidade + migration + volume de dados + backfill); change separada, condicionada a demanda por análise intra-treino fina.

## Riscos e mitigações

- **Número enganoso em intervalado** → gate de aplicabilidade (AC2) retorna `null`; nunca calcular sobre esforço não-steady; testes cobrindo intervalado/aquecimento.
- **Segmentos inconsistentes** (treino manual sem laps, 1 segmento) → `null` + estado "não aplicável" no front; não quebra a tela.
- **Drift do cliente curado na regen** → portar o campo à mão e revisar diff; não commitar saída crua.
- **Ordem cross-repo** → backend mergeia primeiro (contrato), depois o front consome.
- **Faixas de cor arbitrárias** → ancorar `<5 / 5–10 / >10%` na literatura (limiar clássico de 5%), documentado no design; ajustável sem mudar contrato.

## Revisões (Full track)

- **Product-review (lente do coach):** sinal de durabilidade aeróbica que o treinador hoje infere a olho; coach-in-the-loop preservado (número determinístico derivado de dado objetivo, não saída de IA). Refinamento aplicado: escopo na **Opção 1** (segmentos persistidos), com streams (Opção 2) fatiados para follow-up — evita acoplar análise útil a uma mudança pesada de ingestão.
- **Pre-mortem (the-fool):** principal modo de falha — exibir decoupling calculado sobre treino intervalado, minando a confiança no diagnóstico — **endereçado pelo gate de aplicabilidade (AC1)** como critério de aceite de prioridade máxima. Segundo modo — assumir streams que não existem — eliminado pela restrição AC5 (só segmentos).
- **Product-lens (diagnóstico, 2026-07-07):** GO com 3 apertos, todos incorporados: (1) **gate como AC de prioridade máxima**, preferindo falso-negativo (predicados concretos + testes de fronteira — antes era open question); (2) **linha de interpretação** junto do número (número passivo é ignorável); (3) **sinal de adoção** opcional registrado (buraco "cobertura ≠ adoção"). Contra-métrica adicionada: zero falsos-positivos.
- **DoR cross-model (Codex, 2026-07-07):** NOT READY inicial → **corrigido**. Critical: o helper precisava do `TipoTreino` (não presente em `EtapaRealizada`) — assinatura passou a `calcular(etapas, TipoTreino)`, com o tipo vindo do `treinoPlanejado` (nullable/LAZY; degrada para CV-only quando ausente). Important: thresholds explicitados como **heurística v1** (constantes nomeadas + critério de revisão); **CV robusto a laps curtos** (filtro ≥60s) + warmup/cooldown não rotulado coberto pelo CV; copy tornada **descritiva/não-causal** ("estimativa", terreno/vento); padronização **velocidade/FC** (fim do "pace/FC" que invertia o sinal). Minor: `null`≡`undefined` no front; fronteiras `[5,10]` fechadas + negativos → verde.
