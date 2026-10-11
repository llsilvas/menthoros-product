# Design — fix-planner-ignora-prova-na-semana (v3.1)

> Reescrito em 2026-10-11 (noite) após a leitura de `tb_llm_call`; revisado pelo 2º pre-mortem
> (7 achados, ver proposal.md). As decisões abaixo substituem as da v2.

## Cadeia causal (verificada contra o banco e o código)

| Passo | Onde | Evidência |
|---|---|---|
| Prompt diz "PROVA no domingo" e "disponíveis: SEG/TER/QUI/SÁB" | `PeriodizacaoPromptFormatter.java:~200`, `DisponibilidadePromptFormatter.java:76` | texto dos formatters |
| Tentativa 1: LONGO 21,1 no DOMINGO → rejeitada por `COBERTURA_DIAS` | `WeeklyCoverageValidator.java:128,92` | `tb_llm_call.attempt=1`, `violations` |
| Tentativa 2: LONGO 21,1 no SÁBADO → aceita (sem PROVA na lista) | `WeeklyCoverageValidator.java:177` | `tb_llm_call.attempt=2`, `response_json` |
| PROVA inserida no domingo depois da validação | `PlanGenerationPersister.java:366` | linha com `provaId`, sem `justificativa_ia`, sem etapas |
| Shadow acusa a PROVA como `DIA_INDISPONIVEL` | `SkeletonComplianceChecker.java:154` | `planner_metadata_json.violations[0]` |

Fatos que moldam o desenho:

- A regra de vizinhança **já existe e já inclui PROVA** (`TIPOS_ALTA_INTENSIDADE`,
  `WeeklyCoverageValidator.java:34-42`).
- Com cobertura ativa a redistribuição **não roda** (`PlanGenerationPersister.java:348`); quem move
  o longo é `LongRunAnchor`, dentro do reparo.
- **`cobertura == null` sempre que há skeleton** (`PlanoTreinoPromptBuilder.java:254`). Então
  `aplicarCobertura` é o lugar natural do fix legado: só roda sem skeleton, depois da
  normalização (`PlanoLlmValidator.java:120-157`: converter descanso → normalizar → carga semanal
  → `aplicarCobertura` → âncora → descartar restDays → validar).
- `garantirProvasNaSemana` busca por intervalo sem filtrar "hoje" (`ProvaNoPlanoService.java:69-86`)
  e `construirTreinoProva` deixa `tssPlanejado` nulo (`:121-124`).

## Decisão 1 — Dia de prova é dia efetivo, pelo intervalo efetivo

`effectiveDays` (`PlanoTreinoPromptBuilder.java:254`) passa a ser
`dias ∪ {diaSemana(p.dataProva) | p não cancelada, p.dataProva ∈ [max(inicio, hoje), fim]}`. O
limite inferior é a mesma referência que o chamador já usa para tirar dias passados em
`SEMANA_ATUAL` — um único ponto. As provas da semana já são carregadas nesse builder para
`formatarEventoCompetitivoSemana`; reusar.

`DisponibilidadePromptFormatter` lista o dia com "(prova)". Efeito colateral aceito:
`limiteDescansos()` e `diasDaSequenciaLonga()` passam a contar o dia da prova — correto, a prova é
carga.

Prova já passada em `SEMANA_ATUAL` (achado 1): não entra nos efetivos **nem** na validação
(Decisão 2); o persister continua inserindo-a como hoje — a validação não a vê, logo não a rejeita.

## Decisão 2 — A PROVA entra em `aplicarCobertura`, não no callback

`WeeklyCoverageContext` ganha `provasDaSemana: List<TreinoPlanejadoLlmDto>` — DTOs de
`ProvaNoPlanoService.construirTreinoProva` para o mesmo intervalo efetivo da Decisão 1, montados no
builder (que já tem as provas; injeta o service ou só o método extraído). No início de
`aplicarCobertura` (`PlanoLlmValidator.java:74`), antes de `longRunAnchor.ancorar`:

```
para cada PROVA em ctx.provasDaSemana():
    treinos  = treinos  sem os do mesmo diaSemana
    restDays = restDays sem os do mesmo diaSemana
    treinos += PROVA
```

Por que aqui e não no callback (`IaServiceImpl.java:209-212`): o callback alimenta dois ramos. No v2
(`validarPlanoV2`), `validarTssSlotV2` (`NormalizacaoDeTreino.java:127-140`) lê `tssPlanejado`
nulo como 0 e rejeita a PROVA determinística em toda tentativa (achado 2). Em `aplicarCobertura` a
PROVA entra depois de `normalizar` e fora do v2 — TSS nulo nela é exatamente o que o persister já
grava hoje.

Ganhos: o LONGO/"prova" que o LLM põe no dia certo vira PROVA com `provaId`;
`validarIntensosAdjacentes` vê `LONGO(SÁB)+PROVA(DOM)` e devolve `INTENSOS_ADJACENTES` ao reparo;
`restDay` no dia da prova não vira "dia aparece mais de uma vez". A chamada do persister (`:366`)
fica — idempotente por contrato.

## Decisão 3 — PROVA/PROVA vizinhas não é violação

`validarIntensosAdjacentes` (`WeeklyCoverageValidator.java:192-200`) passa a pular o par quando
**ambos** os tipos são `PROVA`: eventos fixos, o LLM não os controla, e a mensagem "separe-os com
um dia leve" seria insolúvel (achado 3). Log WARN para o treinador ver no ledger. LONGO/PROVA e
demais pares seguem violação.

## Decisão 4 — `LongRunAnchor` não ancora no dia da prova nem no D-1

Se `ctx.diaPreferidoLongo` é dia de alguma PROVA da lista ou sua véspera, `ancorar` devolve o
plano intacto. Sem isso o reparo não converge: o LLM tira o LONGO do sábado, a âncora o devolve
(`dia_preferido_longo = SÁBADO`), `INTENSOS_ADJACENTES` dispara de novo na última tentativa.

Descartada a v3 ("não ancorar em semana com PROVA"): desligar a âncora não faz a prova substituir
o longo — LONGO na quinta + PROVA no domingo passaria igual (achado 4). Se o longo deve sair da
semana da prova é regra de carga, não de posição: non-goal, `add-taper-guidance`.

## Decisão 5 — Shadow: "provas da semana" por data real, propagadas

`provaDeterminante` pode estar meses à frente ou, em `POST_RACE`, no passado
(`PeriodizationPlanner.java:35-51`); projetar seu `DayOfWeek` na semana corrente bloquearia um D-1
inexistente (achado 6). Lista canônica:

```
provasDaSemana = (determinante se data ∈ [referenceDate, referenceDate+6]) ∪ provasPreparatoriasNaSemana
```

Hoje ela morre em `PlannerEngine` (`:93-103` passa só a determinante ao `WeekPlanSkeleton`) e
`ComplianceContext` só tem `provaDeterminante` (achado 7). Ambos ganham `provasDaSemana`;
`PlannerShadowService` propaga nas três construções (`:151`, `:207`, `:228`).

Isenção em `ConstraintValidator` (`:22`) e `SkeletonComplianceChecker.checarConstraintsDuras`/
`checarDiasPermitidos` (`:137-157`): sessão cuja **data real** é a de uma prova da semana não é
`DIA_INDISPONIVEL`/`CONSTRAINT_DURA_VIOLADA`. Isentar "qualquer tipo PROVA" aceitaria PROVA em data
errada — não.

## Decisão 6 — Allocator: filtrar, não excluir; slot sem dia é revisão

`SessionDayAllocator.allocate(…, List<DayOfWeek> diasDeProva)`: ancora todos; `proibidos` = D-1 de
cada um. Passos 2 (LONGO) e 3 (duras) escolhem entre `livres \ proibidos`; o passo 4 (leves) continua
usando `livres` inteira — remover D-1 de `livres` tiraria capacidade de um REGENERATIVO e produziria
slots sem data que o prompt imprime como "(dia a definir)" (`PlanoTreinoPromptBuilder.java:505-519`,
achado 5).

Se um LONGO/dura ficar sem candidato: o slot fica sem dia **e** `PlannerEngine` marca o skeleton com
`requiresCoachReview=true` + motivo ("sem dia elegível para LONGO fora da véspera de prova") — campo
e fluxo já existentes. Política explícita em vez do comentário "não deve ocorrer".

## Decisão 7 — Shadow: materializar (mantida da v2)

`SessionCompositionResolver` compõe slot `PROVA` para cada preparatória, independente da fase; TSS
pela distância (`PlannerEngine.paceDefaultMinPorKm`), sem somar ao `loadTarget`.
`PlannerEngine.comporSessoes` deriva os dias a ancorar de `provasDaSemana` (Decisão 5), não de
`fase == RACE_WEEK`. Fase/`loadTarget`/taper continuam só da determinante.

## Não-decisões

- Cobertura **desligada** (kill-switch): `RedistribuicaoTreinoHelper` ainda roda antes de
  `garantirProvasNaSemana`. Legado; follow-up.
- LONGO + PROVA não vizinhos na mesma semana — `add-taper-guidance`.
- Prova no 1º dia da semana vs. último da anterior — fora da unidade de validação.
