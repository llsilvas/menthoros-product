# Design — refactor-threshold-call-outside-transaction

> Anchors verificados em 2026-09-18 contra `develop` do backend (`TsbServiceImpl`,
> `AthleteThresholdUpdater`, `ThresholdInferenceService`). Precedente seguido:
> `refactor-llm-call-outside-transaction` (D1 — "três fases, orquestrador sem transação,
> colaboradores transacionais").

## D1 — Sem interface/strategy: o seam é um parâmetro, não uma abstração nova

**Pergunta em aberto do proposal:** a decisão "preciso buscar fonte externa?" vira uma
interface/strategy que `use-best-effort-for-threshold-inference` implementa depois, ou fica um
pré-check simples?

**Decisão: pré-check simples, sem interface.** Hoje existe exatamente **um** consumidor conhecido
do seam (`use-best-effort-for-threshold-inference`, já com proposal escrito). Uma
`ExternalThresholdSourceStrategy` genérica seria abstração para um problema de um caso só — o
próprio `CLAUDE.md` do backend pede duplicar até a 3ª ocorrência antes de extrair (mesmo raciocínio
já aplicado em D2/D2b de `infer-threshold-from-race-result`, que duplicou a fórmula de Riegel e a
resolução de distância em vez de criar uma abstração compartilhada). Se um 3º tipo de fonte externa
aparecer no futuro, promover pra uma abstração então.

**O que muda concretamente:** `AthleteThresholdUpdater.atualizarPaceLimiarInferido` (privado hoje)
para de fazer tudo inline — separa em duas fases:

1. **Decisão** (`resolverFontePace`, novo método): dado `atletaId`, `tenantId`, `hoje`, retorna um
   `PaceLimiarResolvido` (record: `fonte: FonteLimiarInferencia`, `valor: BigDecimal`,
   `confianca: ConfiancaInferencia`, ou vazio se nenhuma fonte disponível) — **sem** persistir nada.
   Hoje só olha prova válida e quintil (ambos leitura de banco, nenhuma chamada externa). Esta é a
   função que `use-best-effort-for-threshold-inference` vai estender pra também considerar melhor
   esforço, ANTES de decidir entre prova/quintil.
2. **Aplicação** (`aplicarPaceLimiar`, novo método): dado `PlanoMetaDados` e um
   `PaceLimiarResolvido`, seta os campos (`paceLimiarEstimado`/`confiancaInferenciaPace`/
   `fonteLimiarPace`/`dataInferenciaLimiar`) e chama `logSinalizacaoOutlierPace`. Mutação em
   memória, mesma responsabilidade de hoje — chamador ainda persiste via `save()`.

`atualizarLimiares` (método público) passa a chamar `resolverFontePace(...)` seguido de
`aplicarPaceLimiar(...)` em vez do bloco único de hoje — **mesmo resultado, mesma ordem de
execução**, só a fronteira de responsabilidade muda.

## D2 — `TsbServiceImpl`: a decisão roda antes da transação da métrica do dia

**Problema real que isso resolve, mesmo sem fonte externa ainda:** hoje `atualizarLimiares` roda
**depois** de `metricasDiariasRepository.save(metricasHoje)`, dentro da mesma transação
(`atualizarTsbDia`, `TsbServiceImpl.java:96-117`). Se a decisão de pace (fase 1, D1) puder
eventualmente envolver uma chamada de rede (a próxima change), ela precisa acontecer **antes** de
qualquer escrita — senão a escrita da métrica do dia fica presa esperando uma chamada HTTP externa
dentro da mesma transação, e um timeout de rede reverte também o TSB do dia (efeito colateral que
não deveria existir).

**Decisão:** os 3 pontos de entrada de `TsbServiceImpl` (`atualizarTsbDia` 2-arg, `recalcularDesde`,
e o terceiro em `:379`) passam a chamar `athleteThresholdUpdater.resolverFontePace(...)`
**antes** de entrar no `@Transactional` que atualiza a métrica do dia, guardando o resultado
(`PaceLimiarResolvido`, e o equivalente de FC — que já não tem fonte externa nem nesta nem na
próxima change, mas segue o mesmo padrão de simetria) numa variável local. O `@Transactional`
continua envolvendo a leitura/escrita de `MetricasDiarias` e a chamada a `aplicarPaceLimiar` (fase
2), agora recebendo o valor já resolvido em vez de recalculá-lo.

**`recalcularDesde` (laço multi-dia):** a resolução de fonte só é relevante no último dia
(`dia.equals(fim)`, onde `atualizarMetaDadosHoje=true`) — resolvida **uma vez antes do laço
inteiro**, não a cada iteração. Isso preserva o comentário existente
(`TsbServiceImpl.java:57-62`) sobre a fronteira transacional do recálculo histórico ser o bloco de
`DIAS_POR_BLOCO`, não o dia — este design não mexe nisso, só antecipa a resolução de pace pro
começo do método público, antes do `@Transactional` do laço abrir.

## D3 — Sem mudança de comportamento observável, gate é o teste de regressão

Nenhuma fonte nova, nenhum campo novo, nenhuma migration. O teste de aceite é: para os mesmos
inputs (atleta, treinos, provas), `paceLimiarEstimado`/`fonteLimiarPace`/`confiancaInferenciaPace`
persistidos são **idênticos** antes e depois desta change, nos 3 pontos de entrada. Cobertura:
- `AthleteThresholdUpdaterTest`: `resolverFontePace` cobrindo os mesmos 3 cenários que
  `atualizarPaceLimiarInferido` já cobre hoje (prova válida, só quintil, nenhuma fonte) — mesmas
  asserções, método diferente.
- `TsbServiceImplTest`: teste de integração/unit garantindo que os 3 pontos de entrada ainda
  produzem o mesmo `PlanoMetaDados` persistido que produziam antes (fixture com prova válida e
  fixture só com quintil, para pelo menos `atualizarTsbDia` e `recalcularDesde`).

## Riscos e mitigações

- **Área sensível, já refatorada uma vez** (`refactor-threshold-orchestration` extraiu
  `AthleteThresholdUpdater` de `TsbServiceImpl`). Mitigado por D3 (teste de regressão byte-a-byte
  do resultado persistido) — não "parece certo", precisa provar que o resultado é idêntico.
- **`recalcularDesde` processa muitos dias por chamada** (recálculo histórico) — mover a resolução
  de pace pra antes do laço é seguro porque ela já só importa no último dia; nenhuma mudança na
  quantidade de leituras de banco por dia recalculado.
- **Seam sem uso real ainda** (D1): aceito deliberadamente — o valor desta change isolada é
  encolher a transação de alta frequência ANTES de introduzir a chamada externa, não depois. Sem
  isso, a próxima change teria que fazer as duas coisas juntas (mesmo risco que motivou o split).
