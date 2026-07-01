**Tamanho:** M · **Trilha:** Full

> Full porque **toca dois repos** (`menthoros-backend` + `menthoros-front`) e **muda contrato de API** (campo novo no DTO) — qualquer um já força Full. Escopo deliberadamente **mínimo (Opção 1)**: decoupling derivado dos **segmentos já persistidos** (`EtapaRealizada`), **sem** novo endpoint, nova entidade ou migration. A ingestão de **streams crus** do Strava (Opção 2) é **non-goal** explícito (ver follow-up).

## Why

O decoupling aeróbico (Pa:HR) mede a **queda de eficiência** entre a 1ª e a 2ª metade de um esforço aeróbico contínuo: quanto o pace por batimento se deteriora à medida que a fadiga entra. É um dos sinais mais diretos de **resistência aeróbica / durabilidade** — um decoupling baixo (<5%) indica boa base aeróbica para a distância; alto (>10%) indica que o atleta "desacopla" sob fadiga e ainda não sustenta o esforço.

Para o treinador (persona primária), esse é exatamente o tipo de leitura que hoje ele faria **a olho**, comparando o pace e a FC do início vs. fim de um rodízio longo. O dado para automatizar isso **já está no banco**: `TreinoRealizado` guarda `etapasRealizadas` (`EtapaRealizada`) com `ordem`, `duracao`, `distanciaKm`, `fcMedia` e `velocidadeMedia`/`paceMedia` por segmento — o suficiente para comparar metades. O que falta é o **cálculo** e a **exposição** do número, mais um indicador de leitura imediata no detalhe do treino.

Numerador "pace normalizado por FC" já existe no backend isolado (`PaceRegressionCalculator.java:74-76`), mas só no agregado do treino inteiro — nunca particionado em metades nem exposto ao treinador.

## What Changes

- **Backend — calcular o decoupling a partir dos segmentos** (`EtapaRealizada`, ordenados por `ordem`):
  - Novo helper `DecouplingCalculatorService` (ao lado de `TssCalculatorService`/`ZonaTreinoService`): parte os segmentos em 1ª/2ª metade por **tempo acumulado**, calcula o fator de eficiência `EF = velocidade/FC` (duration-weighted) de cada metade e retorna `decoupling% = (EF₁ − EF₂) / EF₁ × 100`. **Null-safe**: retorna `null` quando não computável.
  - **Gate de aplicabilidade** (decoupling só faz sentido em esforço steady): computa apenas quando o treino é contínuo/aeróbico (ex.: `TipoTreino` de rodagem/longo, ou baixa variância de zona entre segmentos) e há **≥2 segmentos** com FC e pace válidos. Caso contrário → `null` (não aplicável), nunca um número enganoso para intervalado.
  - **Campo aditivo** `Double decouplingPercentual` em `TreinoRealizadoOutputDto` (`@JsonInclude(NON_NULL)`), preenchido on-the-fly no `TreinoMapper.toOutputDto` (ou no service). **Derivado, não persistido** — sem coluna, sem migration. Aparece em toda resposta que já retorna o DTO (`marcar-realizado`, `lancar-treino`, `PUT /realizados/{id}`, `enriquecer-strava`).
- **Contrato** — portar o campo novo ao cliente curado (`src/api`) e ao tipo `TreinoRealizado` em `src/types`.
- **Frontend — indicador de decoupling no detalhe do treino realizado**:
  - Badge/mini-indicador com o valor `%` e cor por faixa (verde `<5%` · âmbar `5–10%` · vermelho `>10%`), via tokens `semantic.*`, com tooltip explicando a leitura.
  - Estado **"não aplicável"** quando `decouplingPercentual` é `null` (intervalado, dados insuficientes) — não exibe número, exibe hint curto.

## Capabilities

### New Capabilities

- `aerobic-decoupling`: para um treino realizado contínuo/aeróbico com segmentos, o sistema deriva o decoupling Pa:HR (1ª vs. 2ª metade) a partir dos dados já persistidos e o expõe ao treinador como número + leitura colorida no detalhe do treino, degradando para "não aplicável" quando o esforço não é steady ou os dados são insuficientes.

### Modified Capabilities

<!-- Nenhuma capability canônica tem requisitos alterados; o campo é aditivo e derivado. -->

## Critérios de aceite

- **AC1 — cálculo correto** · Given um treino contínuo com ≥2 segmentos com `fcMedia` e pace/velocidade válidos, When o DTO é montado, Then `decouplingPercentual == (EF₁ − EF₂)/EF₁ × 100` com `EF = velocidade/FC` ponderado por duração em cada metade, particionado por tempo acumulado.
- **AC2 — gate de aplicabilidade** · Given um treino **intervalado** (ou <2 segmentos, ou metade sem FC/pace), When o DTO é montado, Then `decouplingPercentual` é `null` (não aplicável) — nunca um valor calculado sobre esforço não-steady.
- **AC3 — campo aditivo / compatível** · Given clientes existentes, When o campo é adicionado ao `TreinoRealizadoOutputDto`, Then é opcional (`NON_NULL`) e não quebra desserialização; And é **derivado**, sem alteração de schema/migration.
- **AC4 — exibição no front** · Given um treino com `decouplingPercentual` não-nulo, When o detalhe do treino realizado é exibido, Then mostra o `%` com cor por faixa (`<5` verde · `5–10` âmbar · `>10` vermelho) e tooltip explicativo; When é `null`, Then exibe estado "não aplicável" sem número.
- **AC5 — sem streams** · Given o escopo desta change, When o decoupling é computado, Then usa **apenas** `etapasRealizadas` já persistidas — nenhuma chamada nova a `/activities/{id}/streams` nem nova tabela.

## Métrica de sucesso

**O treinador lê o decoupling sem cálculo manual**: em treinos longos/contínuos sincronizados (com laps), o indicador aparece em ≥X% dos casos (medível pela taxa de `decouplingPercentual != null` sobre treinos contínuos com ≥2 segmentos). Proxy de rotina: substitui a inspeção visual "comparar FC/pace do início vs. fim" por um número pronto, acelerando o diagnóstico de durabilidade aeróbica.

## Open Questions & Assumptions

- **(Aberto — domínio, bloqueia 1.x)** Critério exato do **gate de aplicabilidade**: por `TipoTreino` (lista de tipos contínuos) vs. por **baixa variância de zona** entre segmentos (mais robusto, independe da classificação). Recomendação: variância de zona/FC entre segmentos, com fallback por tipo. Definir antes de implementar o cálculo.
- **(Aberto — domínio)** Particionamento das metades: por **tempo acumulado** (recomendado, padrão da literatura) vs. por distância vs. por contagem de segmentos. Recomendação: tempo acumulado, descartando aquecimento/desaquecimento se identificáveis pela `tipoEtapa`.
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
- **Pre-mortem (the-fool):** principal modo de falha — exibir decoupling calculado sobre treino intervalado, minando a confiança no diagnóstico — **endereçado pelo gate de aplicabilidade (AC2)** como critério de aceite. Segundo modo — assumir streams que não existem — eliminado pela restrição AC5 (só segmentos).
