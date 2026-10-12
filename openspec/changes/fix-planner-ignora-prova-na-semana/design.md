# Design — fix-planner-ignora-prova-na-semana (v3.2)

> Reescrito em 2026-10-11 (noite) após a leitura de `tb_llm_call`; revisado por três rodadas de
> pre-mortem e pelo DoR (ver proposal.md). As decisões abaixo substituem as da v2.

## Cadeia causal (verificada contra o banco e o código)

| Passo | Onde | Evidência |
|---|---|---|
| Prompt diz "PROVA no domingo" e "disponíveis: SEG/TER/QUI/SÁB" | `PeriodizacaoPromptFormatter.java:~197`, `DisponibilidadePromptFormatter.java:76` | texto dos formatters |
| Tentativa 1: LONGO 21,1 no DOMINGO → rejeitada por `COBERTURA_DIAS` | `WeeklyCoverageValidator.java:129,93` | `tb_llm_call.attempt=1`, `violations` |
| Tentativa 2: LONGO 21,1 no SÁBADO → aceita (sem PROVA na lista) | `WeeklyCoverageValidator.java:177` | `tb_llm_call.attempt=2`, `response_json` |
| PROVA inserida no domingo depois da validação | `PlanGenerationPersister.java:366` | linha com `provaId`, sem `justificativa_ia`, sem etapas |
| Shadow acusa a PROVA como `DIA_INDISPONIVEL` | `SkeletonComplianceChecker.java:154` | `planner_metadata_json.violations[0]` |

Fatos que moldam o desenho:

- A regra de vizinhança **já existe e já inclui PROVA** (`TIPOS_ALTA_INTENSIDADE`,
  `WeeklyCoverageValidator.java:34-42`).
- Com cobertura ativa a redistribuição **não roda** (`PlanGenerationPersister.java:348`); quem move
  o longo é `LongRunAnchor`, dentro do reparo.
- `cobertura == null` sempre que há skeleton (`PlanoTreinoPromptBuilder.java:254`). O schema v1/v2 é
  por tenant (`IaServiceImpl.java:175`); ambos os validadores terminam em `aplicarCobertura`
  (`PlanoLlmValidator.java:148` e `:202`). Ordem do v1: converter descanso (`:120`) → normalizar
  (`:131-144`) → carga semanal → `aplicarCobertura` (âncora → descartar restDays → validar). O v2:
  `validarEstruturaV2` + `validarTssSlotV2` se houver slot (`:184-191`) → `aplicarCobertura`.
- `garantirProvasNaSemana` busca por intervalo sem filtrar "hoje" (`ProvaNoPlanoService.java:69-86`)
  e `construirTreinoProva` deixa `tssPlanejado` nulo (`:121-124`).

## Decisão 1 — Dia de prova é dia efetivo, pelo intervalo efetivo

`diasEfetivos` (`PlanoTreinoPromptBuilder.java:254`; campo `effectiveDays` do
`WeeklyCoverageContext`) passa a ser
`dias ∪ {diaSemana(p.dataProva) | p não cancelada, p.dataProva ∈ janela}`, com janela
`[inicio, fim]` em `PROXIMA_SEMANA` e `[max(inicio, amanhã), fim]` em `SEMANA_ATUAL`. O limite
inferior espelha `CoberturaSemanalPolicy.diasEfetivos` → `RegraGeracaoTreino.diaSemanaJaPassou`
(`<=`): **hoje já conta como dia passado**, então uma prova de hoje não é dia a cobrir. "Hoje" vem de
`ctx.dataReferencia()` (= `LocalDate.now(clock)`), o que mantém o builder testável sem mock estático.
As provas da semana já são carregadas nesse builder para `formatarEventoCompetitivoSemana`; reusar.

`DisponibilidadePromptFormatter` lista o dia com "(prova)". Efeito colateral aceito:
`limiteDescansos()` e `diasDaSequenciaLonga()` passam a contar o dia da prova — correto, a prova é
carga (risco registrado no proposal).

Prova já passada em `SEMANA_ATUAL`: não entra nos efetivos **nem** na validação (Decisão 2); o
persister continua inserindo-a como hoje — a validação não a vê, logo não a rejeita.

## Decisão 2 — Descartar antes de normalizar; inserir em `aplicarCobertura`

`WeeklyCoverageContext` ganha `provasDaSemana: List<TreinoPlanejadoLlmDto>` — DTOs de
`ProvaNoPlanoService.construirTreinoProva` para o mesmo intervalo efetivo, montados no builder
(injeta o service ou só o método extraído).

**(a) Descarte, antes da conversão/normalização** — em `validarENormalizarPlano` antes de
`descansoNaoAutorizadoConverter.converter` (`:120`) e em `validarPlanoV2` antes do loop de
`validarEstruturaV2` (`:184`), só com `cobertura != null`:

```
dias = ctx.provasDaSemana().map(diaSemana)
treinos  = treinos  sem os de `dias`
restDays = restDays sem os de `dias`
```

Sem isso, um treino do LLM malformado no dia da prova (ex.: INTERVALADO sem etapas) falha em
`gateExistencia` e consome o reparo — embora fosse ser substituído de qualquer jeito (pre-mortem 3).

**(b) Inserção, no início de `aplicarCobertura`** (`:74`), antes de `longRunAnchor.ancorar`:
`treinos += ctx.provasDaSemana()`. A PROVA determinística não passa por `normalizar` nem por
`validarEstruturaV2`; sem skeleton não há slot, logo `validarTssSlotV2` não roda — TSS nulo nela é o
que o persister já grava hoje. Vale para v1 e v2 sem skeleton; com skeleton `cobertura == null` e
nada muda.

Ganhos: o LONGO/"prova" que o LLM põe no dia certo vira PROVA com `provaId`;
`validarIntensosAdjacentes` vê `LONGO(SÁB)+PROVA(DOM)` e devolve `INTENSOS_ADJACENTES` ao reparo;
`restDay` no dia da prova não vira "dia aparece mais de uma vez". A chamada do persister (`:366`)
fica — idempotente por contrato.

## Decisão 3 — PROVA/PROVA vizinhas não é violação

`validarIntensosAdjacentes` (`WeeklyCoverageValidator.java:192-200`) pula o par quando **ambos** os
tipos são `PROVA`: eventos fixos, o LLM não os controla, e "separe-os com um dia leve" seria
insolúvel. Log WARN. Demais pares seguem violação.

Mesmo dia: o cadastro aceita duas provas na mesma data e `garantirProvasNaSemana` gera dois
`PROVA` (javadoc: "caso raro, sem regra especial"). Com a inserção antes da cobertura,
`registrarDias` (`:109-134`) contaria o dia duas vezes e rejeitaria em toda tentativa (pre-mortem
4). Política única: na cobertura, ocupações de `PROVA` contam no máximo uma por dia —
`registrarDias` passa a receber os DTOs (ou o tipo) em vez de só os dias.

E o javadoc de `garantirProvasNaSemana` está errado: o loop (`ProvaNoPlanoService.java:78-86`)
filtra "todos os DTOs do mesmo `diaSemana`" a cada prova e **depois** insere a sua — a segunda
prova do dia apaga a PROVA da primeira (pre-mortem 5). Correção no service: coletar os dias de
todas as provas, remover uma vez, inserir todas; idempotente por `provaId` (uma PROVA já presente
com o mesmo `provaId` não é duplicada). A inserção em `aplicarCobertura` (Decisão 2) já segue
esse formato.

## Decisão 4 — `LongRunAnchor` não ancora em D-1, D nem D+1 de prova

Se `ctx.diaPreferidoLongo` é véspera, dia ou dia seguinte de alguma PROVA da lista, `ancorar`
devolve o plano intacto. Sem o D-1 o reparo não converge (a âncora devolve o LONGO ao sábado);
sem o D+1 a âncora **cria** a violação que o LLM tinha evitado (prova quarta, longo domingo,
preferido quinta — pre-mortem 3). Fora dos três dias, como hoje.

Descartada a v3 ("não ancorar em semana com PROVA"): desligar a âncora não faz a prova substituir
o longo — LONGO na quinta + PROVA no domingo passaria igual. Se o longo deve sair da semana da
prova é regra de carga, não de posição: non-goal, `add-taper-guidance`.

## Decisão 5 — Shadow: "provas da semana" por data real, propagadas

`provaDeterminante` pode estar meses à frente ou, em `POST_RACE`, no passado
(`PeriodizationPlanner.java:35-51`); projetar seu `DayOfWeek` na semana corrente bloquearia um D-1
inexistente. Lista canônica:

```
provasDaSemana = (determinante se data ∈ [referenceDate, referenceDate+6]) ∪ provasPreparatoriasNaSemana
```

Hoje ela morre em `PlannerEngine` (`:91-101` passa só a determinante ao `WeekPlanSkeleton`) e
`ComplianceContext` só tem `provaDeterminante`. Ambos ganham `provasDaSemana`;
`PlannerShadowService` propaga nas três construções (`:151`, `:207`, `:228`). Dono do campo:
`PlannerEngine`.

Isenção em `ConstraintValidator` (`:22`) e `SkeletonComplianceChecker.checarConstraintsDuras`/
`checarDiasPermitidos` (`:137-157`): sessão cuja **data real** é a de uma prova da semana não é
`DIA_INDISPONIVEL`/`CONSTRAINT_DURA_VIOLADA`. Isentar "qualquer tipo PROVA" aceitaria PROVA em data
errada — não.

## Decisão 6 — Allocator: filtrar para pesadas; pesada inviável sai do skeleton

`SessionDayAllocator.allocate(…, List<DayOfWeek> diasDeProva)`: ancora todos; `proibidos` = D-1 de
cada um. Passo 2 passa a tratar **todo** LONGO (chave primeiro, depois os demais) — hoje só
`chave=true` (`:65`), e a `PhaseSpec` de TAPER compõe LONGO com `keyType=null`
(`SessionCompositionResolver.java:70-72`), que cairia no passo 4 (pre-mortem 4). Passo 3, as
`DURAS` (`:23-24`, sem LONGO). Ambos escolhem em `livres \ proibidos`. O passo 4 (leves, `:91-98`)
continua usando `livres` inteira **e pula LONGO ∪ `DURAS`** — exatamente o conjunto que 2–3
tratam; hoje ele recebe "qualquer slot restante", o que devolveria um LONGO sem candidato ao D-1
(pre-mortem 3).

Um LONGO/dura que termina sem dia **não vai ao prompt**: `PlannerEngine` o remove de `sessoes` e
marca `requiresCoachReview=true` com motivo ("<tipo> sem dia elegível fora da véspera da prova
<nome>"). Como o passo 2 roda antes do 3, com um único dia elegível é o LONGO que o ocupa e a
dura que sai (fixture de CA9). Limite conhecido: `escolherDiaEspacado` usa distância circular, então
após uma prova no domingo a segunda conta como "vizinha" — é mais restritivo que o necessário, não
menos; sem ação. Deixá-lo com `day=null` faria `formatarBlocoSlots` (`PlanoTreinoPromptBuilder.java:500-519`)
pedir "(dia a definir)" ao LLM — que recolocaria a sessão onde quisesse. Remover é a única opção
que preserva a garantia; o treinador decide se completa a semana.

## Decisão 7 — Shadow: materializar (mantida da v2)

`SessionCompositionResolver` compõe slot `PROVA` para cada preparatória, independente da fase; TSS
pela distância (`PlannerEngine.paceDefaultMinPorKm`), sem somar ao `loadTarget`.
`PlannerEngine.comporSessoes` deriva os dias a ancorar de `provasDaSemana` (Decisão 5), não de
`fase == RACE_WEEK`. Fase/`loadTarget`/taper continuam só da determinante.

## Não-decisões

- Cobertura **desligada** (kill-switch): `RedistribuicaoTreinoHelper` ainda roda antes de
  `garantirProvasNaSemana`. Legado; follow-up.
- LONGO + PROVA não vizinhos na mesma semana — `add-taper-guidance`.
- Prova no 1º dia da semana vs. último da anterior — fora da unidade de validação; risco aceito.
