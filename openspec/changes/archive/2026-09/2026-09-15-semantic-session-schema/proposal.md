**Tamanho:** M · **Trilha:** Full

## Correção de escopo (2026-09-15, 3 rodadas de DoR — histórico)

**Rodada 3 (esta versão):** a rodada 2 assumia um loop de chamada à LLM por treino — não existe.
`IaServiceImpl.geraPlanoSemanalAvancado` faz **uma única chamada por tentativa**, devolvendo o
`PlanoSemanalLlmDto` da semana inteira de uma vez (`treinosPlanejados` já populado). O encaixe de v2
corrigido: `SessionResolver` roda **uma vez por tentativa**, logo após o parse da resposta única,
convertendo `PlanoSemanalLlmDtoV2` (blocos) em `PlanoSemanalLlmDto` (v1-shaped, etapas já
resolvidas) — a partir daí todo o resto do pipeline (turno de reparo F3, validação, persistência)
roda idêntico para v1 e v2, sem saber a diferença. Ver design.md §0-§1 para o fluxo completo e a
correção contra o código real.

A versão anterior deste proposal partia de uma premissa desatualizada: que o `WeekPlanSkeleton`
ainda vivia em shadow-mode, e que F4 precisaria "promovê-lo a decisor" de tipo/foco/TSS por dia.
**Isso já aconteceu** — `planner-engine-enforcement` (arquivada, PRs #107-109/#119, MERGED) já
injeta o skeleton como bloco mandatório no `user` (`PlanoTreinoPromptBuilder.formatarBlocoSlots`,
`":367,450-469"`, texto literal "não altere dia/tipo/TSS/zona; preencha apenas a estrutura fina de
cada sessão") e já enforça em 2 estágios via `SkeletonComplianceChecker` (retry no estágio 1,
`FAILED`+`requiresCoachReview` terminal no estágio 2). Os Javadocs de `SessionSlot`/`WeekPlanSkeleton`
("não é prescritiva") ficaram desatualizados no merge — o comportamento real diverge deles.

**Escopo real de F4, corrigido:** o skeleton já fixa **o quê** em nível de dia (tipo, foco, TSS
alvo, zona da sessão). O que a LLM ainda decide livremente é **o quanto** dentro de cada dia já
fixado — pace, FC, distância, duração por etapa (`EtapaTreinoLlmDto`). É aí, um nível abaixo do que
a proposta original mirava, que F4 atua. Tamanho revisado de L para M — o escopo real é mais
contido: não muda a **assinatura pública** de `IaServiceImpl.geraPlanoSemanalAvancado` nem de
`PlanoResilienceService.ChamadaLlm` (que continuam operando no `PlanoSemanalLlmDto` de sempre) —
o `SessionResolver` roda **dentro** de `gerarChamadaLlm` (privado), logo após o parse único da
resposta da LLM, convertendo `PlanoSemanalLlmDtoV2` para o shape v1 antes de devolver ao resto do
pipeline (ver design.md §1).

## Why

Dentro de cada slot do dia (já fixado pelo skeleton: tipo, foco, TSS-alvo, zona), a LLM ainda
escreve a etapa inteira — `fcAlvo`, `ritmoAlvo`, `distanciaKm`, `duracaoMin` — como aritmética
livre. Ela erra com frequência suficiente para justificar ~155 linhas de
`plano-treino-system.txt:183-337` ensinando fórmulas de contagem de etapas
(`3 + 2×tiros`) e faixas percentuais de recuperação, mais um pipeline de correção pós-hoc em
`TreinoNormalizador`/`NormalizacaoDeTreino` (`expandirEtapasAgregadas`, `normalizarTreinoIntervalado`,
`reconciliarDistanciaComEtapas`) que existe só para consertar aritmética que a LLM não deveria ter
feito. Essa mistura tem custo direto: prompt maior, mais chance de erro, e um pipeline de correção
que hoje **sempre insere recuperação após cada tiro, inclusive o último** (`TreinoNormalizador:126`)
— uma decisão implícita no código, nunca revisada como regra de produto.

A separação "quanto é do Java, o quê é do LLM" já valeu para o nível de dia (F planner-engine-enforcement);
esta change estende a mesma lógica um nível abaixo, para dentro do treino: a LLM decide a estrutura
qualitativa do treino (quantas repetições, em que zona, com que recuperação relativa); o Java
resolve os números absolutos, do mesmo jeito determinístico que já faz hoje só que como correção —
em v2, vira geração direta, sem o que corrigir.

Esta change também fecha um gap de duas changes ativas e obsoletas: `validate-interval-workout-standards`
(0/79 tasks — superada pelo `PlanoLlmValidator`/`NormalizacaoDeTreino` que já existem) e
`fix-cold-start-calibration-plan-generation` §13.4 (as perguntas de produto sobre tolerância do
triângulo pace×distância×duração ficam moot quando o Java calcula os três números a partir da
zona, em vez de a LLM escrever e o Java tolerar/corrigir).

## What Changes

1. **Família de DTOs v2 paralela**, não campos opcionais misturados em v1: `PlanoSemanalLlmDtoV2 {
   ...campos de nível-plano..., treinosPlanejados: List<TreinoPlanejadoLlmDtoV2>}`,
   `TreinoPlanejadoLlmDtoV2 {diaSemana, tipoTreino, justificativaIa, blocos: List<BlocoDto>}` — sem
   `fcAlvo`/`duracaoMin`/`distanciaKm`/`ritmoAlvo`/`etapas`. `BlocoDto {papel
   AQUEC/PRINCIPAL/RECUP/DESAQ, repeticoes (int, default 1), quantidadePorRepeticao, unidade
   MIN/SEG/KM/M, zona enum Z1-Z5/LIMIAR, recuperacao? {quantidade, unidade}}` — sem zona própria na
   recuperação (resolve sempre em `Z1`, mesma convenção implícita de v1). `repeticoes` e
   `quantidadePorRepeticao` são campos separados (não um único `quantidade` com `unidade=REP`) —
   resolve a ambiguidade "6 não distingue 6×400m de 6×2min". `zona` é um enum fechado, nunca texto
   livre com range (`"Z2-Z3"`). Requer um método novo em `LlmJsonSchemaBuilder` (mesmo padrão do
   atual, refletindo sobre `PlanoSemanalLlmDtoV2.class`). Convive com os DTOs v1 por trás da flag;
   nenhum campo de v1 é removido.
2. **`SessionResolver` novo, domínio puro, roda uma vez por tentativa dentro de `gerarChamadaLlm`.**
   Logo após o parse único da resposta da LLM (`parsearPlano`, que em v2 produz
   `PlanoSemanalLlmDtoV2`), `SessionResolver.resolverPlano(PlanoSemanalLlmDtoV2, AthleteZones):
   PlanoSemanalLlmDto` converte a semana inteira para o shape v1 (etapas absolutas resolvidas +
   campos de nível-treino agregados a partir delas, mesmo padrão que
   `NormalizacaoDeTreino.recalcularDuracaoTreino` já faz hoje em v1). A partir daqui, **todo o resto
   do pipeline roda idêntico para v1 e v2** — `PlanoResilienceService.ChamadaLlm`, o turno de reparo
   (F3), `TreinoMapper`, persistência — sem mudança de assinatura pública em nenhum deles. Zona→absoluto
   usa `ZoneResolver` novo, dedicado a v2 (não uma extração de `TreinoNormalizador.zonaParaFc`, que
   hoje lida com texto livre e tem comportamento confuso em casos de borda — ver design.md Decisão
   2); entrada já é o enum fechado do DTO v2. Para atleta sem FC cadastrada, `ZoneResolver` usa o
   mesmo fallback percentual fixo que v1 já usa hoje (design.md Decisão 6) — não introduz
   elegibilidade por atleta além da allowlist de tenant.
3. **Validação v2 é toda pós-resolução, dentro de `validar` (protegida pelo retry F3) — `gerar` só
   resolve, nunca valida.** `SessionResolver` (item 2) roda dentro de `gerar` sem lançar nada; a
   estrutura só é checada depois, em `NormalizacaoDeTreino.validarEstruturaV2` (método novo,
   package-private, despacha por `FamiliaTreino` para os gates corretos daquela família — reusa os
   métodos `private` existentes sem mudar visibilidade de nenhum: intervalado usa os gates de
   contagem/ordem/sequência, contínuo usa `validarEstrutura3Etapas`, tipos sem estrutura obrigatória
   não validam nada), seguida da checagem de TSS do slot ±20% contra `SessionSlot.targetTss` (já
   calculado pelo skeleton existente). Corrige um BLOCKER do pré-mortem: validar dentro de `gerar`
   mataria a geração sem acionar o turno de reparo, porque `gerar` roda fora do escopo protegido
   pelo retry (`PlanoResilienceService.java:129`).
4. **Prompt v2** substitui o bloco de fórmulas de contagem de etapas/recuperação
   (`plano-treino-system.txt:183-337`) por instruções sobre o schema de blocos. Convive com o prompt
   v1 (arquivo novo, não sobrescreve).
5. **Versionamento de schema, criado do zero.** Não existe hoje mecanismo de seleção — `SchemaVersion.CURRENT`
   é uma constante fixa `"schema-v1"` (`domain/compliance/SchemaVersion.java`), único call site em
   `PlanoLlmLedgerHook.java:67`. Esta change introduz a seleção real (enum ou resolução condicional)
   e o valor `"schema-v2"`, mantendo o ledger já-existente como está (`tb_llm_call.schema_version`
   já é gravado hoje — task de ledger é só passar o valor certo, não "ligar o fio", que já está
   ligado).
6. **Flag por tenant, `app.llm.plano.schema-version-v2-tenants`** (CSV de UUIDs via `@Value`, vazio
   por default). Sem infraestrutura de flag por tenant no projeto — allowlist mínima para o piloto,
   não um sistema de feature flags reutilizável. **Correção de rollback** (achado do pré-mortem): um
   `@Value` sem `@RefreshScope`/endpoint de refresh não muda em runtime — tirar um tenant da
   allowlist exige alterar a env var e **reiniciar** a aplicação (rolling restart), não é "sem
   deploy" como a versão anterior deste proposal dizia. Ainda é ordens de magnitude mais barato que
   reverter código.
7. **Arquivamento de changes supersedidas.** `validate-interval-workout-standards` e
   `fix-cold-start-calibration-plan-generation` movem para `changes/archive/` com nota "superseded
   by semantic-session-schema" — a primeira porque sua proposta foi implementada sob outro desenho,
   a segunda porque a §13.4 (perguntas de produto sobre tolerância) deixa de fazer sentido quando o
   Java calcula os números a partir da zona.

**Fora de escopo, de propósito:**
- **Qualquer mudança no nível de dia/skeleton** (tipo, foco, TSS-alvo, zona da sessão,
  `SkeletonComplianceChecker`, `formatarBlocoSlots`) — já está resolvido por
  `planner-engine-enforcement`; esta change não toca esse código.
- **Remover o DTO v1 ou o prompt v1.** Convivem atrás da flag até o piloto validar v2.
- **Mudar o contrato de saída para o front** (`TreinoPlanejadoOutputDto`/`EtapaTreinoDto`) — o
  `SessionResolver` produz `EtapaTreinoLlmDto`, que já alimenta o `TreinoMapper` existente sem
  adaptação.
- **Consolidar `SkeletonComplianceChecker` sendo chamado 2x** (enforcement + shadow, achado desta
  investigação) — débito pré-existente, não desta change.
- **`PlannerComplianceStatus.RETRIED_PASSED` nunca setado** e **`GenerationBudget` não
  compartilhado entre estágio 1 e fallback** (achados desta investigação, `planner-engine-enforcement`)
  — débito pré-existente, fora de escopo.
- **Flag de produto genérica por tenant**, **`llm-code-switching`**, **mudar o teto de 2
  tentativas/100s do turno de reparo (F3)**, **`validar_plano` tool** — mesmos non-goals da versão
  anterior, continuam válidos.

## Critérios de aceite

- **Given** a flag `app.llm.plano.schema-version-v2-tenants` inclui o tenant do request, **when** o
  plano é gerado, **then** o prompt do treino usa o schema v2 (blocos por papel/repetições/zona, sem
  pace/FC/distância/duração) — o bloco de skeleton no `user` (tipo/foco/TSS/zona do dia,
  `planner-engine-enforcement`) não muda.
- **Given** a LLM devolve um `TreinoPlanejadoLlmDtoV2` válido para um treino INTERVALADO com bloco
  `PRINCIPAL` (`zona=Z4`, `repeticoes=6`, `quantidadePorRepeticao=400`, `unidade=M`,
  `recuperacao={quantidade:90, unidade:SEG}`), **when** `SessionResolver.resolverPlano` processa o
  bloco (dentro de `gerar`, sem validar), **then** produz 6 pares tiro+recuperação (12 etapas +
  aquec/desaq) com FC/pace absolutos da zona do atleta e todos os campos de nível-treino (incl.
  `tssPlanejado`), no mesmo shape `TreinoPlanejadoLlmDto` que a LLM produziria hoje em v1.
- **Given** a resposta v2 de um treino INTERVALADO tem `repeticoes` insuficientes no bloco
  `PRINCIPAL` para atingir a contagem mínima de etapas, **when**
  `NormalizacaoDeTreino.validarEstruturaV2` roda **dentro de `validar`** (pós-resolução, protegido
  pelo retry), **then** rejeita com violação estrutural — mesma família de exceção
  (`PlanoNaoConformeException`) e mesmo turno de reparo (F3) que v1.
- **Given** o TSS resolvido de um treino foge de ±20% do `targetTss` do `SessionSlot` daquele dia,
  **when** a checagem de TSS roda (dentro de `validar`, depois de `validarEstruturaV2` passar),
  **then** rejeita como violação — checagem nova que não existe em v1.
- **Given** um tenant fora da allowlist, **when** o plano é gerado, **then** o caminho é exatamente
  o de hoje (v1 + skeleton do dia, sem diferença de schema de treino/etapa).
- **Given** qualquer chamada de geração de plano (v1 ou v2), **when** registrada no ledger, **then**
  `tb_llm_call.schema_version` contém `"schema-v1"` ou `"schema-v2"` — o campo já é gravado hoje,
  esta change só corrige o valor.
- **Given** o piloto roda 2 tenants × 2 semanas, **when** medido contra v1, **then** retry ≤ 10%,
  violações estruturais ≤ 5%, aceitação sem edição ≥ v1 + 10 p.p., p50 ≤ 20s (gate do roadmap) **e**
  feedback qualitativo dos 2 coaches sobre percepção de planos genéricos coletado (achado do
  `product-reviewer`).

## Open Questions & Assumptions

- **Confirmado nesta investigação:** a recuperação hoje é **sempre** inserida após cada tiro,
  inclusive o último (`TreinoNormalizador.expandirEtapasAgregadas:126`) — v2 herda essa regra por
  default (bloco `recuperacao` do `PRINCIPAL` aplica a todas as repetições, incluindo a última),
  mas é uma decisão de produto nunca revisada explicitamente — se o coach preferir omitir a
  recuperação pós-última-repetição, é mudança de comportamento em v1 e v2 juntos, fora de escopo
  aqui.
- **Assumido:** a matriz de estrutura obrigatória por tipo (`fix-cold-start-calibration-plan-generation`
  §13.2) é o ponto de partida para a validação de blocos v2. Confirmar com produto se a pergunta 3
  do §13.4 ("PROVA/SUBIDA/FARTLEK/FACIL seguem sem estrutura obrigatória?") já está decidida.
- **Assumido:** o TSS do slot vem do `SessionSlot.targetTss` já calculado hoje pelo skeleton
  (`planner-engine-enforcement`) — esta change só passa a validar contra ele no nível de treino, não
  muda como o TSS semanal é distribuído entre dias.
- **Em aberto:** mecanismo exato de seleção de `SchemaVersion` (enum simples com valor resolvido no
  call site vs. algo mais elaborado) — greenfield, decidir no design.md.
- **Em aberto (achado do `product-reviewer`, mantido da versão anterior, mas agora sobre risco
  menor):** mesmo com o nível de dia já fixado pelo skeleton, a LLM ainda tem menos liberdade
  criativa no nível de etapa em v2. O piloto inclui feedback qualitativo dos 2 coaches, não só o
  gate quantitativo — ver Métrica de sucesso.
- **Em aberto:** sinal de edição por bloco (papel/zona) para o `WeekSuggestion` — fora de escopo
  nesta change, candidato a change seguinte.

## Métrica de sucesso

- Gate do piloto: retry ≤ 10%, violações estruturais ≤ 5%, aceitação sem edição ≥ v1 + 10 p.p.,
  p50 ≤ 20s — medido via `tb_llm_call` filtrado por `schema_version`, mais feedback qualitativo dos
  coaches (não só o número — achado do `product-reviewer`).
- Tokens de saída por treino: v2 ~600–800 vs. volume atual de v1 — medir via
  `tb_llm_call.output_tokens` por `schema_version`.
- **Ligada à rotina do treinador:** aceitação sem edição é a métrica que importa para o coach — a
  comparação v1×v2 no mesmo piloto decide se v2 vira default.

## Rollback

Sem migration de schema (`tb_llm_call.schema_version` já existe e já é gravado). Reverter é remover
o tenant da allowlist e **reiniciar a aplicação** (não é instantâneo/sem deploy — `@Value` sem
refresh scope; correção do proposal anterior). `git revert` do commit de merge se precisar reverter
o código inteiro; nenhum dado gravado sob `schema-v2` precisa de limpeza.
