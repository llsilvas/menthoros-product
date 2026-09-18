# refactor-threshold-call-outside-transaction — abre um ponto de extensão seguro pra chamada externa na inferência de limiares

**Tamanho:** S · **Trilha:** Full (mexe em fronteira transacional de um fluxo
sensível/de alta frequência)
**Status:** 🟡 EM REVISÃO — design.md escrito (2026-09-18), aguardando DoR
**Criado:** 2026-09-18

> Destacada de `use-best-effort-for-threshold-inference` por decisão do founder em 2026-09-18: a
> mudança de fronteira transacional do `TsbServiceImpl` (3 pontos de entrada, incluindo o laço de
> recálculo histórico) é, sozinha, do tamanho de uma change própria — mesmo raciocínio de
> decomposição que já gerou `refactor-llm-call-outside-transaction` como change separada da geração
> de plano. Fazer as duas juntas misturaria uma restruturação de risco alto numa área já sensível
> (tem histórico de refactor anterior, `refactor-threshold-orchestration`) com uma feature nova no
> mesmo PR.
>
> **Esta change não muda nenhum comportamento observável.** É puramente mecânica: prepara o seam
> pra `use-best-effort-for-threshold-inference` (que precisa chamar `MelhorEsforcoService.buscar()`,
> uma chamada HTTP externa ao intervals.icu) sem repetir o padrão de risco já aceito como dívida em
> `add-athlete-best-efforts` — lá a chamada externa acontece só na abertura do perfil (baixa
> frequência); aqui aconteceria a cada sync de treino (alta frequência), o que muda o cálculo de
> custo/benefício da mitigação leve.

## Why

`AthleteThresholdUpdater.atualizarLimiares` é chamado de dentro de `TsbServiceImpl.atualizarMetaDados`,
que por sua vez roda dentro de `@Transactional` em **3 pontos de entrada**:

1. `atualizarTsbDia(UUID, LocalDate)` — `TsbServiceImpl.java:68`, único dia.
2. `recalcularDesde(UUID, LocalDate)` — `TsbServiceImpl.java:80`, laço multi-dia (recálculo
   histórico); `atualizarMetaDados` só dispara na última iteração (`dia.equals(fim)`), então já é
   eficiente nesse ponto — mas o `@Transactional` envolve o laço inteiro.
3. Um terceiro caller em `TsbServiceImpl.java:379/463` (mesmo padrão).

Hoje, dentro dessa fronteira, só há leitura de banco (prova/treinos, sem chamada externa) — o risco
de "chamada externa presa numa transação de alta frequência" ainda não existe no código. Ele **vai**
existir assim que `use-best-effort-for-threshold-inference` precisar consultar
`MelhorEsforcoService.buscar()` (que às vezes faz uma chamada HTTP real ao intervals.icu — cache
`@Cacheable` de 30min amortiza syncs repetidos do mesmo atleta, mas o cache-miss ainda bloqueia
dentro da transação, seguraria conexão de um pool de 5 no Railway durante a chamada externa).

## What Changes

Só `apps/menthoros-backend`, sem contrato de API, sem migration.

- `AthleteThresholdUpdater` ganha uma separação de fases: um passo de **decisão** (é preciso buscar
  uma fonte externa? hoje sempre "não" — prova e quintil são só leitura de banco) que roda antes da
  transação, e um passo de **aplicação** (grava em `metaDados`) que continua dentro dela.
- Os 3 pontos de entrada de `TsbServiceImpl` passam a orquestrar essas duas fases em vez de fazer
  tudo dentro de um único `@Transactional`.
- Nenhuma fonte de limiar nova é adicionada aqui — o comportamento observável (prova > quintil,
  valores calculados, campos persistidos) fica idêntico. O teste de aceite principal é "nada mudou
  pro usuário", com um teste de regressão comparando resultado antes/depois pra cada um dos 3
  pontos de entrada.

## Non-Goals

- Não adiciona a fonte "melhor esforço" — isso é `use-best-effort-for-threshold-inference`, que
  passa a depender desta change.
- Não muda o comportamento de `recalcularDesde` além da fronteira transacional (mesma saída,
  mesmos dias recalculados).
- Não introduz retry/circuit-breaker — fora de escopo por decisão já registrada (ADR-0008).

## Impact (provisório)

- **Repositórios:** só `apps/menthoros-backend`.
- **Risco:** área sensível — `refactor-threshold-orchestration` já extraiu `AthleteThresholdUpdater`
  de `TsbServiceImpl` uma vez; `recalcularDesde` tem um comentário explícito avisando sobre
  auto-invocação e fronteira transacional intencional (`TsbServiceImpl.java:57-62`). Qualquer
  mudança aqui precisa preservar esse comportamento — cobertura de teste antes/depois é o gate
  principal, não um "parece certo".

## Open Questions

- ~~A decisão "preciso buscar fonte externa?" vira interface/strategy ou pré-check simples?~~ —
  resolvida no design.md (D1): pré-check simples, sem abstração nova (duplicar até a 3ª
  ocorrência).
- ~~`recalcularDesde` precisa da mesma separação de fases?~~ — resolvida no design.md (D2): sim,
  mas resolvida uma vez antes do laço inteiro (só importa no último dia), sem mudar a fronteira do
  bloco de `DIAS_POR_BLOCO` já documentada.

## Critérios de aceite

1. Given os mesmos inputs (atleta, treinos, provas) de antes desta change, When
   `atualizarTsbDia`/`recalcularDesde`/o 3º ponto de entrada rodam, Then `paceLimiarEstimado`/
   `fonteLimiarPace`/`confiancaInferenciaPace` persistidos são idênticos a antes — teste de
   regressão, não "parece certo" (design.md D3).
2. Given uma prova válida recente, When a fase de decisão roda, Then o resultado tem a mesma
   precedência de hoje (prova > quintil), só numa função pura sem mutação.
3. `./mvnw clean verify` verde.

## Métrica de sucesso

Nenhuma métrica de produto (sem comportamento observável) — o critério é a suíte de regressão
(critério 1) e a redução mensurável do escopo da transação de alta frequência (nº de statements
entre a abertura da transação e a chamada que poderia envolver I/O externo, hoje 0 mas preparado
pra próxima change).
