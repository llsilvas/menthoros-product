**Tamanho:** M · **Trilha:** Full

> Origem: dívida técnica **BUG-TEC-002**.
>
> **Baseline desta change: `develop`** (`9bd32ff`). Rebaselinada em 2026-07-28 — ver "Estado da
> baseline".

## Estado da baseline

**Baseline = `develop`.** `recalcularHistoricoCompleto` (`:349`) é `@Transactional` (`:348`): uma
transação única cobrindo 400+ dias, exatamente o que o ticket BUG-TEC-002 descreve. O delete
antecipado está em `:361`, o `backup` em `:355`, e `recalcularPeriodoComProgresso` (`:445`) é um laço
`while` dia a dia — sem bloco, sem `flush`, sem `clear`.

### Por que não baselinamos em `f9e754b`

Uma versão anterior desta spec adotava como baseline a branch `feature/testes-carga-referencia` e o
commit `f9e754b`, que removeu o `@Transactional` de `recalcularHistoricoCompleto`, sob a tese de que
esta change "terminaria o que aquele commit começou".

**Descartado com evidência (2026-07-28).** O teste de equivalência do CA5
(`TsbRecalculoEquivalenciaIT`) foi rodado contra as duas branches:

| Branch | Resultado |
|---|---|
| `f9e754b` | **5 erros de 5** |
| `develop` | **5 passam de 5** |

Sem transação envolvente, o método lança para **todo** atleta, com ou sem histórico — duas
`LazyInitializationException` distintas, por não haver sessão Hibernate: `TreinoRealizado.etapasRealizadas`
(via `TssCalculatorService:482`) no caminho com treinos, e o proxy de `Atleta` no caminho sem treinos.
Não é fragilidade sob falha: o método **não funciona**, nunca.

Agravante: o `deleteByAtletaId` + `flush` roda **antes** do trecho que lança, e `SimpleJpaRepository`
traz `@Transactional` próprio — o delete comita sozinho e só então a reconstrução falha. `f9e754b`
não deixou meio caminho andado; deixou um método que apaga e aborta.

Como aquele commit não está mergeado, não existe em nenhum remote e não tem nada aproveitável, a
change passa a partir de `develop`. O alvo técnico é idêntico: chunking explícito substitui a
transação única.

## Why

**1. Uma transação de 400+ dias é o problema do ticket.** Em `develop`, `recalcularHistoricoCompleto`
é `@Transactional`: um recálculo longo segura uma conexão do pool (Hikari default de 10) do começo ao
fim, e uma falha no dia 300 reverte os 299 dias já reconstruídos. É o que o ticket descreve.

**2. O javadoc e o log prometem o que o chunking não poderá cumprir.** O javadoc diz "Faz backup
automático e rollback em caso de erro" (`:342`) e "dados são restaurados do backup" (`:346`); o log de
erro diz "a transação será revertida e o banco voltará ao estado anterior" (`:388`). Hoje a reversão
de fato acontece — mas ela vem da transação única, que é justamente o que sai. Com chunking, essas
três frases viram mentira se não forem reescritas junto.

Para o treinador, um atleta com CTL/ATL truncado gera recomendação de carga errada até alguém
perceber e mandar recalcular de novo. É perda silenciosa de dado, não fragilidade de performance.

**3. Os dois caminhos de entrada sofrem igual — e é o pior caso dos dois.** Com `@Transactional` em
`develop`, o recálculo abre transação própria quando vem do controller e **participa da transação do
chamador** quando vem do onboarding. Nos dois casos são 400+ dias numa transação só.

| Entrada | Contexto transacional na baseline (`develop`) | Efeito |
|---|---|---|
| `AtletaController` → `AtletaServiceImpl.recalcularMetricasAtleta` (`:237`) | transação própria (`REQUIRED`) | 400+ dias numa transação; falha reverte tudo |
| `OnboardingServiceImpl.montarContexto` (`:99`, `@Transactional`) → `BaselineCalculator.calcular` | **transação do chamador** | 400+ dias dentro de uma transação ainda maior |

**4. `@Transactional` morto.** A anotação em `atualizarTsbDia` (`:46`) nunca vale no recálculo: o laço
chama a sobrecarga **privada** de 3 argumentos (`:457` → `:51`), e auto-invocação não passa pelo proxy
do Spring. Quem lê o arquivo acredita numa garantia por dia que não existe.

## What Changes

**Chunking transacional explícito.** O recálculo passa a processar o período em blocos de 30 dias,
cada bloco numa transação própria (`Propagation.REQUIRES_NEW`), com `flush`/`clear` ao final para
liberar o contexto de persistência. O método deixa de depender do contexto do chamador: passa a se
comportar igual vindo do controller ou do onboarding.

**Semântica de falha honesta e explícita.** Como blocos comitados não podem ser desfeitos, a promessa
de rollback sai — do javadoc, do log e do contrato. No lugar entra um estado observável: o recálculo
registra até onde chegou, e a falha informa o intervalo reconstruído e o que ficou faltando, em vez de
alegar reversão.

**Delete deixa de ser antecipado.** Hoje o método apaga tudo antes de saber se consegue reconstruir.
Passa a apagar por bloco, dentro da transação que reconstrói aquele bloco — assim uma falha nunca deixa
um intervalo apagado e não reconstruído.

**Correção do `@Transactional` morto.** A anotação em `atualizarTsbDia` (linha 46) nunca vale no fluxo
de recálculo: o laço chama a sobrecarga **privada** de 3 argumentos, e auto-invocação não passa pelo
proxy do Spring. Fica documentado ou removido, para não sugerir garantia inexistente.

## Non-Goals

- **Mudar o algoritmo de CTL/ATL/TSB.** Esta change move dado de lugar; nenhum número muda. O valor
  final de um recálculo bem-sucedido tem de ser byte-idêntico ao de hoje.
- **Tornar o recálculo assíncrono.** É tentador (o endpoint é síncrono e lento), mas muda contrato de
  API e a experiência do treinador. Change própria, se a lentidão incomodar depois do chunking.
- **Backup/restore real do histórico.** Guardar cópia para restaurar seria a outra saída para o
  problema 1. Fica de fora: com delete por bloco não existe janela em que o dado sumiu, então
  restaurar deixa de ser necessário.
  - ⚠️ **Correção de uma versão anterior desta spec:** eu havia escrito que a lista `backup` (`:358`)
    "nunca é lida". **É falso** — ela é passada para `determinarIntervaloRecalculo(atletaId, backup)`
    (`:369`) e define `primeiraMetrica`/`ultimaMetrica` (`:421-425`), que entram no cálculo do
    intervalo. Ela não serve para *restaurar*, mas serve para *delimitar*. Remover a variável
    quebraria o recálculo de dias de descanso posteriores ao último treino. Achado do pre-mortem
    cross-model (Codex).
- **Revisar os demais usos de `@Transactional` do `TsbServiceImpl`.** Só o caminho de recálculo está no
  escopo.

## Critérios de aceite

- **CA1** — Dado um atleta com 400+ dias de histórico, quando o recálculo roda, então nenhuma
  transação individual abrange mais de 30 dias.
- **CA2** — Dado um recálculo disparado de dentro de uma transação existente (caminho do onboarding),
  quando ele roda, então os blocos comitam independentemente da transação do chamador.
- **CA3** — Dada uma falha no bloco N, quando o recálculo aborta, então os blocos 1..N-1 permanecem
  comitados e **nenhum intervalo fica apagado sem reconstrução**.
- **CA4** — Dada uma falha em qualquer bloco, quando o erro é propagado, então a mensagem informa o
  intervalo efetivamente reconstruído e **não** afirma que houve reversão.
- **CA5** — Dado o mesmo conjunto de treinos, quando o recálculo roda antes e depois desta change,
  então CTL, ATL, TSB **e `rampRate`** de cada dia são idênticos. O `rampRate` depende de **D-7**
  (`:225-236`), não só de D-1 — os blocos precisam ser exercitados cruzando as duas janelas, com dias
  sem treino e com atleta de constantes de tempo customizadas (`:517-568`).
- **CA6** — Dado um atleta sem histórico algum, quando o recálculo roda, então o comportamento atual é
  preservado (metadados zerados, sem exceção).
- **CA7** — Dado um atleta cujas métricas existentes vão além do último treino (dias de descanso
  materializados), quando o recálculo roda, então esse intervalo continua sendo reconstruído — o
  limite superior vem das métricas, não só dos treinos.
- **CA8** — Dada uma falha em `atualizarMetaDados` ou `recalcularSemanasProgressao` **depois** de os
  blocos comitarem, quando o erro é propagado, então o estado de `PlanoMetaDados` é observável e não
  fica silenciosamente dessincronizado do histórico diário.
- **CA9** — Dado um recálculo concluído, quando a geração de plano lê os metadados em seguida, então
  ela **não** recebe valor de cache anterior ao recálculo.

## Janela de Teste para o CA5 (Dataset de Referência)

> **Recomendação: 90 dias com atleta AVANÇADO (τ_ctl=42) + constantes customizadas.**
> Dataset de referência com valores esperados calculados manualmente (EWMA, round-half-up)
> em `openspec/changes/fix-tsb-recalculo-resiliente/reference-dataset.md`.

### Fundamentação matemática

A fórmula de CTL/ATL é uma média móvel exponencial (EWMA). O peso de um treino com `d` dias de idade
decai por `e^(-d/τ)`. Isso define a janela mínima para que um teste capture o sinal real:

| Dias | Peso remanescente (τ=42) | Significado |
|---|---|---|
| 42 (1τ) | ~37% | Meia-vida ~29d; 63% do sinal é recente |
| 84 (2τ) | ~14% | 86% do CTL determinado pela janela |
| 126 (3τ) | ~5% | 95% do CTL — região onde o sinal praticamente estabiliza |
| 168 (4τ) | ~2% | 98% — gold standard |

**Fontes:** Coggan, A. (2003). *Training and Racing with a Power Meter*. VeloPress. — o τ=42 é
convenção de Coggan para ciclismo (Established). A extrapolação 2τ/3τ/4τ é propriedade matemática
padrão de EWMA (Established — Clarke & Skiba, 2013).

### Por que 90 dias (não 65, não 168)

| Janela | τ cobertos (avançado) | Blocos de 30d | rampRate cross-chunk | Verdict |
|---|---|---|---|---|
| 65d | 1.5τ (~78% do sinal) | 2 | Só 1ª fronteira | Insuficiente: CTL ainda responde ao dia 1 |
| **90d** | **2.1τ (~88%)** | **3** | **2 fronteiras** | **Ideal: sinal ≥86%, 3 blocos exercitam D-7** |
| 168d | 4τ (~98%) | 5 | 4 fronteiras | Overkill para teste de equivalência |

90 dias com τ=42 cobre ≥2τ (88% do sinal determinado pela janela). Com τ menor (INICIANTE=30,
INTERMEDIÁRIO=35), cobre 3τ e 2.6τ respectivamente — folga em vez de insuficiência.

O `rampRate` depende de D-7 (`TsbServiceImpl:226`). Com 3 blocos de 30 dias, as duas fronteiras
(dia 30→31 e dia 60→61) exercitam `data.minusDays(7)` cruzando o corte do chunk, validando que o
`flush`/`clear` não quebrou a leitura.

### Estrutura do dataset

- **90 dias** cobrindo 8 fases de periodização: construção, progressão, pico, recuperação, pausa
  completa, retorno, pico abrupto (TSS 180), taper
- **Valores esperados:** CTL, ATL, TSB calculados manualmente com `round(value, 2)` (round-half-up)
- **Casos especiais:** dia 1 sem histórico, 7 dias de pausa (TSS=0), pico abrupto isolado,
  duplicação de treino no mesmo dia, TSB negativo (overreaching), TSB cruzando zero
- **Constantes testadas:** τ_ctl=42 (padrão AVANÇADO) + dataset com τ_ctl=30 (INICIANTE) para
  validar constantes customizadas

### Nível de evidência da recomendação

| Afirmação | Nível | Fonte |
|---|---|---|
| 2τ cobre ≥86% do sinal de CTL | Established | Matemática de EWMA; Clarke & Skiba (2013) |
| τ=42 para CTL | Established | Coggan (2003) — ciclismo, adotado como padrão |
| 90d como janela de teste | Heuristic | Engenharia de teste, não fisiologia — derivado de 2τ + 3 blocos |
| τ adaptativo por nível | Heuristic | Decisão de produto Menthoros, sem referência publicada |

## Métrica de sucesso

Zero atletas com histórico parcial silencioso após falha de recálculo — hoje esse estado é
indetectável, então a primeira entrega é conseguir distingui-lo.

**Sinal que torna a métrica mensurável (Decisão 8):** contador Micrometer de recálculos abortados,
tagueado com o bloco onde a execução parou, e log estruturado com o intervalo efetivamente
reconstruído. Sem esse sinal, "zero" seria uma afirmação que ninguém consegue verificar depois do
deploy. A leitura da métrica é o contador em zero **com** recálculos ocorrendo (o denominador
importa: zero abortos e zero recálculos não prova nada).

Efeito na rotina do treinador: o recálculo de um atleta com histórico longo deixa de ser uma operação
que pode corromper a base de carga em silêncio e passar recomendação errada até alguém notar.

## Impact

**Código alterado:** `TsbServiceImpl` (`recalcularHistoricoCompleto`, `recalcularPeriodoComProgresso`,
javadoc e comentário `BUG-TEC-002`), mais um colaborador novo para a fronteira transacional do bloco
(`REQUIRES_NEW` exige proxy — não pode ser método privado da mesma classe), um método de consulta de
limites (`min(data)`/`max(data)`) em `MetricasDiariasRepository`, e um contador Micrometer para a
instrumentação da Decisão 8.

**Nenhum dos cinco serviços leitores é alterado** — a Decisão 6 fecha o contrato da janela mista como
"servir o dado disponível", que já é o comportamento atual deles.

**Sem migration, sem mudança de contrato de API, sem mudança de schema.** Só muda quando o dado é
comitado.

**Rollback.** Reverter o código é seguro e não exige nada no banco: o recálculo é idempotente e os
valores produzidos por bloco são byte-idênticos aos da transação única (é o CA5). O único efeito
residual de um revert é histórico já reconstruído — que re-rodar corrige, com o mesmo resultado.

**Risco principal — pressão no pool de conexões.** `REQUIRES_NEW` chamado de dentro do caminho do
onboarding mantém **duas conexões abertas simultaneamente** (a do chamador, suspensa mas ainda
alocada, e a do bloco). Com o pool Hikari default de 10, e o onboarding rodando junto com geração de
plano, isso precisa ser dimensionado — é a mesma pressão de pool que a change
`add-external-call-resilience` acabou de limitar do lado do LLM.

**Risco — quebra de atomicidade do onboarding (achado do pre-mortem).** Com `REQUIRES_NEW`, se
`montarContexto` falhar **depois** do recálculo (no confidence score ou ao persistir o snapshot de
baseline, `OnboardingServiceImpl:116-121` e `:443-483`), a transação do onboarding reverte mas as
métricas TSB já ficaram comitadas — histórico novo sem baseline correspondente. Hoje esse estado não
existe. Precisa ser aceito explicitamente ou evitado.

**Risco — leitores concorrentes na janela de histórico misto (achado do pre-mortem).** Durante o
recálculo o histórico fica parte novo, parte antigo, e há leitores reais nesse intervalo: PMC
(`AtletaProgressServiceImpl:87-96`), home do atleta (`:222-225`), dashboard do coach
(`CoachDashboardServiceImpl:236-256`), fila de atenção (`CoachAttentionQueueServiceImpl:122-129`) e
agregados semanais (`MetricasAgregadasServiceImpl:71-80`). Não basta "aceitar o risco": a change
precisa fechar contrato para esse estado.

**Risco — cache servindo metadados velhos (achado do pre-mortem).** `PlanoMetadadosServiceImpl:58-65`
cacheia metadados; o recálculo escreve direto pelo repository (`TsbServiceImpl:242-272`, `:627-634`),
e a geração de plano lê pelo serviço cacheado (`PlanoServiceImpl:707-716`). Sem invalidação, o plano
sai com CTL/TSB anteriores ao recálculo.

**Changes relacionadas:**
- `refactor-llm-call-outside-transaction` — mesma classe de problema (trabalho longo dentro de
  transação), outro fluxo. Não há dependência técnica entre as duas.
- `add-external-call-resilience` (entregue) — quem estabeleceu o teto de posse de conexão pelo lado
  das chamadas externas.

## Open Questions & Assumptions

- **Premissa:** 30 dias por bloco vem do comentário já existente no código, não de medição. Com ~400
  dias, são ~14 transações. Não há dado sobre a duração de um bloco.
- **Premissa:** com chunking passa a existir uma janela em que o histórico está parcialmente
  reconstruído e visível — antes (no caminho transacional) isso ficava invisível até o commit final.
  **Resolvido (Decisão 6):** os cinco leitores servem o dado disponível, sem bloqueio. Nenhum deles é
  alterado; o teste 3b.3a prova que a janela não gera erro.
- **Resolvido (Decisão 7):** um recálculo que falha no meio propaga exceção com o intervalo
  efetivamente reconstruído; os metadados ficam no estado anterior, explicitamente stale. Não há
  retentativa automática nem marcação de reprocessamento — o recálculo é idempotente, então
  re-disparar é o caminho de recuperação.
- **Resolvido (Decisão 8):** a falha deixa de ser silenciosa — contador Micrometer de recálculos
  abortados (tagueado pelo bloco de parada) + log estruturado do intervalo reconstruído.
- **Premissa aceita (Decisão 4):** duas conexões simultâneas por recálculo no caminho do onboarding,
  sob `REQUIRES_NEW`. Aceitar e medir. **Gatilho de reavaliação:** se o onboarding passar a rodar em
  lote, a saída é tirar o recálculo de dentro da transação do onboarding — o que aproxima esta change
  da `refactor-llm-call-outside-transaction`.

## Pre-mortem cross-model (Codex, 2026-07-28)

Rodado sobre a spec + o código real. Achados incorporados acima:

| # | Severidade | Achado | Onde entrou |
|---|---|---|---|
| 1 | Crítico | Baseline errada — em `develop` o método **é** `@Transactional` | "Estado da baseline"; resolvido definitivamente pela rebaseline em `develop` (2026-07-28) |
| 2 | Crítico | `REQUIRES_NEW` quebra a atomicidade do onboarding | Impact + CA8 |
| 3 | Importante | `PlanoMetaDados` fora do escopo transacional | CA8 |
| 4 | Importante | `backup` **é** usado para delimitar o intervalo | Non-Goals (correção) + CA7 |
| 5 | Importante | Leitores concorrentes reais na janela de histórico misto | Impact |
| 6 | Importante | Cache `metadados-atleta` serve valor velho | Impact + CA9 |
| 7 | Menor | CA5 subespecificado — `rampRate` depende de D-7 | CA5 |

**O que resistiu ao ataque:** a equivalência numérica por blocos sequenciais é defensável — o cálculo
lê D-1 pelo repositório (`:107-110`) e salva o dia antes de avançar (`:457-468`), sem cache interno de
métricas diárias que quebre o corte. E não há evidência de deadlock inevitável entre a transação do
onboarding e a do bloco; o risco comprovado é starvation de pool, não deadlock.

## Histórico do diagnóstico

O ticket dizia: *"recalcularHistoricoCompleto() roda em transação única. 400+ dias → timeout ou
rollback total."* Isso descreve `develop` — e continua valendo, na baseline, para o caminho do
onboarding.

O commit `f9e754b` tentou resolver removendo a anotação. Isso: (a) não implementou o chunking que o
próprio comentário afirma existir; e (b) quebrou o método por completo — sem sessão Hibernate, ele
lança `LazyInitializationException` para todo atleta, depois de já ter comitado o delete. O teste de
equivalência do CA5 confirmou: 5 erros de 5 naquele commit, 5 verdes em `develop`. Por isso a change
foi rebaselinada em `develop` e aquele commit descartado.

Esta change faz o trabalho: implementa o chunking, torna a semântica de falha honesta e elimina a
janela de "apagado e não reconstruído".
