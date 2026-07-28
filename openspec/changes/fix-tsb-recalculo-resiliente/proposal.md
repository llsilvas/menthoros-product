**Tamanho:** M · **Trilha:** Full

> Origem: dívida técnica **BUG-TEC-002**, já **parcialmente aplicada** na branch
> `feature/testes-carga-referencia` pelo commit `f9e754b` ("fix(BUG-TEC-002): remover @Transactional
> do recálculo histórico", autor `Hermes Agent`, 2026-07-28).
>
> **Baseline desta change: `feature/testes-carga-referencia`**, não `develop`. As duas divergem no
> ponto central — ver "Estado da baseline". Esta change termina o que aquele commit começou e desfaz
> o dano que ele introduziu.

## Estado da baseline

O commit `f9e754b` alterou **duas linhas** de comportamento em `TsbServiceImpl`: removeu
`@Transactional` de `recalcularHistoricoCompleto` e escreveu um comentário afirmando que existem
"chunks de 30 dias com flush/clear". **O chunking não foi implementado** — `recalcularPeriodoComProgresso`
segue um laço `while` dia a dia, sem bloco, sem `flush`, sem `clear`.

Em `develop` o método ainda é `@Transactional` e o comentário não existe. E, no momento da escrita
desta spec, há uma alteração **não commitada** na branch re-adicionando `@Transactional` — alguém está
revertendo aquele fix. A change vale para os dois estados: o alvo (chunking explícito) substitui tanto
"uma transação gigante" quanto "nenhuma transação".

## Why

**1. Meia correção é pior que nenhuma.** Tirar a transação sem implementar chunking não resolveu o
problema do ticket e criou um novo. Sem transação envolvente:

- `deleteByAtletaId` + `flush` (`:364-365`) **comita de verdade**, antes de qualquer reconstrução;
- cada dia comita sozinho no laço;
- uma falha no meio deixa o atleta com histórico **parcial**, sem volta.

Enquanto isso o javadoc continua dizendo "dados são restaurados do backup" e o log de erro continua
dizendo "a transação será revertida e o banco voltará ao estado anterior". Ambos passaram a ser falsos
com aquele commit — o código mente sobre o que faz.

Para o treinador, um atleta com CTL/ATL truncado gera recomendação de carga errada até alguém
perceber e mandar recalcular de novo. É perda silenciosa de dado, não fragilidade de performance.

**2. O problema original do ticket continua de pé.** Pelo caminho do onboarding
(`OnboardingServiceImpl.montarContexto`, `@Transactional`), o recálculo **participa da transação do
chamador** — porque um método sem anotação herda o contexto ambiente. Ou seja, 400+ dias numa
transação só, exatamente como o ticket descreve, segurando uma conexão do pool (Hikari default de 10).
A remoção da anotação só afetou o caminho do controller.

| Entrada | Contexto transacional na baseline | Efeito |
|---|---|---|
| `AtletaController` → `AtletaServiceImpl.recalcularMetricasAtleta` (`:237`, sem anotação) | **nenhum** | cada escrita comita; falha deixa histórico parcial |
| `OnboardingServiceImpl.montarContexto` (`:99`, `@Transactional`) → `BaselineCalculator.calcular` | **transação do chamador** | 400+ dias numa transação só |

**3. `@Transactional` morto.** A anotação em `atualizarTsbDia` (`:46`) nunca vale no recálculo: o laço
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

## Métrica de sucesso

Zero atletas com histórico parcial silencioso após falha de recálculo — hoje esse estado é
indetectável, então a primeira entrega é conseguir distingui-lo. Efeito na rotina do treinador: o
recálculo de um atleta com histórico longo deixa de ser uma operação que pode corromper a base de
carga em silêncio e passar recomendação errada até alguém notar.

## Impact

**Código alterado:** `TsbServiceImpl` (`recalcularHistoricoCompleto`, `recalcularPeriodoComProgresso`,
javadoc e comentário `BUG-TEC-002`), mais um colaborador novo para a fronteira transacional do bloco
(`REQUIRES_NEW` exige proxy — não pode ser método privado da mesma classe).

**Sem migration, sem mudança de contrato de API, sem mudança de schema.** Só muda quando o dado é
comitado.

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
- **Premissa:** nenhum consumidor depende de ler o histórico *durante* o recálculo. Com chunking,
  passa a existir uma janela em que o histórico está parcialmente reconstruído e visível — antes
  (no caminho transacional) isso ficava invisível até o commit final.
- **Em aberto:** o que fazer com um recálculo que falhou no meio. Retentar do bloco seguinte? Marcar o
  atleta para reprocessamento? Hoje não há nada — decidir no `design.md`.
- **Em aberto:** o dimensionamento do pool sob `REQUIRES_NEW` no caminho do onboarding. Se as duas
  conexões simultâneas forem inaceitáveis, a alternativa é tirar o recálculo de dentro da transação do
  onboarding — o que aproxima esta change da `refactor-llm-call-outside-transaction`.

## Pre-mortem cross-model (Codex, 2026-07-28)

Rodado sobre a spec + o código real. Achados incorporados acima:

| # | Severidade | Achado | Onde entrou |
|---|---|---|---|
| 1 | Crítico | Baseline errada — em `develop` o método **é** `@Transactional` | "Estado da baseline"; baseline redefinida para a branch |
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
próprio comentário afirma existir; (b) não afetou o caminho do onboarding, onde o problema do ticket
persiste; e (c) introduziu a perda silenciosa de histórico no caminho do controller, com javadoc e log
prometendo uma reversão que deixou de acontecer.

Esta change termina o trabalho: implementa o chunking de fato, torna a semântica de falha honesta e
elimina a janela de "apagado e não reconstruído".
