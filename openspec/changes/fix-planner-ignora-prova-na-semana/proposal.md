**Tamanho:** M · **Trilha:** Full

> **v3.2 (2026-10-11, noite).** A v2 atacava uma causa raiz errada. A leitura de `tb_llm_call` da
> geração real mostrou que o LLM **não ignorou** a instrução de taper: foi o **turno de reparo do
> próprio sistema** que empurrou a prova para a véspera, porque o dia da prova não conta como dia
> disponível para o validador de cobertura. A v3 trocou o enforcement novo pela correção dessa
> contradição; v3.1 e v3.2 incorporam três rodadas de pre-mortem (Codex) e o DoR do `spec-reviewer`
> — tabelas ao final. Histórico da v2 fica no fim.

## Origem

Plano do atleta Leandro no Homelab (gerado 2026-10-11 17:09, `generation_request_id
c69de808-e4ac-4ed9-85b1-dccd08ec9488`): semana 12–18/10 com a prova preparatória "Mizuno Athenas
Run Longer 2026" (meia, domingo 18/10, `provaAlvo=false`) tinha um `LONGO` de 21,1 km (100 TSS) no
sábado 17/10. Corrigido à mão nessa sessão — em **três** lugares: `tb_treino_planejado` (tipo,
distância, TSS), `tb_etapa_treino` (as 3 etapas antigas, fonte do diálogo de edição) e
`tb_plano_semanal.volume_planejado_km`/`volume_alvo_km` (57,2 → 39,1). Esta change ataca a causa
raiz.

## Why — o que realmente aconteceu

Contexto do atleta: dias disponíveis SEG/TER/QUI/SÁB (`tb_dias_disponiveis`), `dia_preferido_longo
= SÁBADO`, prova no **domingo**. Geração sem skeleton (`planner-engine.enabled=false`).

1. **Prompt autocontraditório.** `PeriodizacaoPromptFormatter.formatarEventoCompetitivoSemana`
   manda "Prescreva no dia domingo (18/10/2026) um único treino do tipo PROVA" (linha ~197), e
   `DisponibilidadePromptFormatter` lista "Dias disponíveis: SEGUNDA, TERÇA, QUINTA, SÁBADO" (linha
   76). Nenhum dos dois sabe do outro.
2. **Tentativa 1 (rejeitada).** O LLM prescreveu a prova no **domingo** — dia certo, tipo errado
   (`LONGO` 21,1 km, `provaId` nulo). `WeeklyCoverageValidator.validar` rejeitou com
   `COBERTURA_DIAS`: *"O treino de DOMINGO não está disponível para este atleta nesta semana"*
   (`WeeklyCoverageValidator.java:129`) e *"Dia(s) disponível(is) sem nada prescrito: SABADO"*
   (`:93`). A rejeição vira `PlanoNaoConformeException` (`PlanoLlmValidator.java:97`) → reparo.
3. **Tentativa 2 (aceita).** O LLM obedeceu e moveu os 21,1 km para **sábado**. Passou:
   `validarIntensosAdjacentes` (`WeeklyCoverageValidator.java:177`) já proíbe dois intensos em dias
   vizinhos **e já inclui `PROVA`** — mas não havia PROVA na lista para ele ver.
4. **Persistência.** `garantirProvasNaSemana` (`PlanGenerationPersister.java:366`) inseriu a PROVA
   determinística no domingo, **depois** da validação. Ficou LONGO 21,1 (sáb) + PROVA 21,1 (dom).
5. **Shadow engine** registrou `DIA_INDISPONIVEL` para a própria PROVA de domingo
   (`SkeletonComplianceChecker.java:154`; mesma regra em `ConstraintValidator.java:22`) — o mesmo
   bug, em falso positivo.

Conclusão: **o dia de prova precisa contar como dia de treino em todo lugar que lê "dias
disponíveis"**, e a PROVA precisa existir na lista **antes** da validação de cobertura, para a
regra de vizinhança que já existe enxergá-la. Não é preciso um check novo.

Por que a v2 estava errada: o `validarProvaSemSessaoPesadaAdjacente` proposto lançaria na tentativa
2, `MAX_TENTATIVAS=2` esgotaria e o treinador receberia 422 — as três regras (domingo indisponível
+ PROVA no domingo + nada pesado no sábado) são insatisfazíveis juntas. E o Estágio 2
pós-redistribuição não podia ter pego o caso: com cobertura ativa a redistribuição nem roda
(`PlanGenerationPersister.java:348`).

**Fatos estruturais que delimitam o escopo:**

- `cobertura` é `null` sempre que há skeleton (`PlanoTreinoPromptBuilder.java:254` — variável
  `diasEfetivos`; o campo do record é `effectiveDays`). O fix legado só age com `cobertura != null`.
- O schema v1/v2 é allowlist **por tenant** (`schemaVersionResolver.usaV2`, `IaServiceImpl.java:175`),
  independente do skeleton. `validarPlanoV2` também termina em `aplicarCobertura`
  (`PlanoLlmValidator.java:202`). Logo o fix vale para v1 **e** v2 sem skeleton; com skeleton
  (`cobertura == null`) nada muda.

**Relação com o gate do planner-engine.** A porta 1 (`planner-engine-enforcement`, task 8.4,
arquivada/mergeada) exige divergência do shadow ≤ 2% em ≥ 30 planos. Homelab, 60 dias, planos com
ledger: 9 de 10 **sem** prova e 1 de 1 **com** prova divergem. O bug desta change contamina a
medição em semana de prova (a violação do Leandro foi `DIA_INDISPONIVEL` para a própria PROVA), mas
**não explica a divergência das semanas sem prova** — o gate continua fechado por outros motivos.
Esta change limpa uma fonte de falso positivo; não abre a porta.

## What Changes

Tudo em `menthoros-backend`.

**Legado (sem skeleton, `cobertura != null`, v1 e v2):**

1. **Dia de prova é dia efetivo.** `diasEfetivos`/`effectiveDays` (`PlanoTreinoPromptBuilder.java:254`)
   = dias configurados ∪ dias das provas não canceladas no **intervalo efetivo**
   `[max(inicio, hoje), fim]` — prova já passada em `SEMANA_ATUAL` não entra.
   `DisponibilidadePromptFormatter` lista o dia com a marca "(prova)".
2. **PROVA visível à validação, em dois passos dentro de `PlanoLlmValidator`.**
   `WeeklyCoverageContext` ganha `provasDaSemana: List<TreinoPlanejadoLlmDto>`
   (`ProvaNoPlanoService.construirTreinoProva`, mesmo intervalo efetivo, montadas no builder).
   (a) **Antes** de `descansoNaoAutorizadoConverter`/normalização (`PlanoLlmValidator.java:120`, e o
   equivalente em `validarPlanoV2`): com `cobertura != null`, descartar treinos e `restDays` do LLM
   nos dias de prova — um treino malformado que seria descartado não pode consumir o reparo.
   (b) No início de `aplicarCobertura` (`:74`), antes de `LongRunAnchor`: inserir as PROVAs. A PROVA
   determinística não passa por `normalizar`/`validarEstruturaV2`, e sem skeleton não há slot para
   `validarTssSlotV2`; TSS nulo nela é o status quo do persister (`:366`, que fica — idempotente).
3. **PROVA/PROVA não é violação — nem vizinhas, nem no mesmo dia.** `validarIntensosAdjacentes`
   deixa de acusar par em que **ambos** são `PROVA` (evento fixo) — log WARN; LONGO/PROVA continua
   violação. E `registrarDias` conta ocupação de `PROVA` **no máximo uma vez por dia**: o cadastro
   permite duas provas na mesma data e `garantirProvasNaSemana` já gera dois `PROVA` nesse caso
   (risco aceito no javadoc) — sem isso a inserção determinística tornaria "dia aparece mais de
   uma vez" insolúvel no reparo. E `garantirProvasNaSemana` passa a fazer o que o javadoc promete:
   hoje o loop (`ProvaNoPlanoService.java:78-86`) remove todos os DTOs do dia a cada prova, então a
   segunda apaga a primeira — corrigir para remover os dias afetados **uma vez** e inserir todas as
   PROVAs, idempotente por `provaId`.
4. **`LongRunAnchor` não ancora em D-1, D nem D+1 de prova.** Se `dia_preferido_longo` cair em
   qualquer um dos três, `ancorar` devolve o plano intacto; fora disso, como hoje. LONGO + PROVA
   em dias não vizinhos **é permitido** por esta change (Non-goals).

**Shadow engine (skeleton):**

5. **"Provas da semana" por data real, propagadas.** Lista = `provaDeterminante` **se** sua data
   cai em `[referenceDate, referenceDate+6]` ∪ `provasPreparatoriasNaSemana`. `WeekPlanSkeleton`
   (`PlannerEngine.java:91-101`) e `ComplianceContext` ganham `provasDaSemana`; `PlannerShadowService`
   propaga nas 3 construções (`:151`, `:207`, `:228`). A isenção de
   `DIA_INDISPONIVEL`/`CONSTRAINT_DURA_VIOLADA` em `ConstraintValidator` e `SkeletonComplianceChecker`
   vale para sessão **na data real** de uma prova da semana — `PROVA` em data errada continua violação.
6. **Allocator protege D-1 sem tirar capacidade das leves — e slot pesado inviável sai do
   skeleton.** `SessionDayAllocator.allocate` recebe `diasDeProva`; ancora todos; passo 2 passa a
   cobrir **todo** LONGO (chave primeiro — hoje só `chave=true`, e TAPER compõe LONGO sem chave) e
   passo 3 as duras, ambos escolhendo em `livres \ proibidos` (D-1 de cada prova); passo 4 (leves)
   usa `livres` inteira e **pula** LONGO ∪ `DURAS` — exatamente o que os passos 2–3 tratam. Um
   LONGO/dura sem candidato fica sem dia e **é removido** da lista de sessões pelo `PlannerEngine`,
   que marca `requiresCoachReview=true` com motivo. O prompt nunca vê "(dia a definir)"
   (`PlanoTreinoPromptBuilder.formatarBlocoSlots`, `:500-519`) para uma sessão pesada.
7. **`SessionCompositionResolver` compõe slot `PROVA` por prova preparatória independente da fase;
   `PlannerEngine.comporSessoes` deriva os dias a ancorar da lista do item 5.** Fase e `loadTarget`
   seguem só da determinante.

## Non-goals

- Check determinístico novo de "sessão pesada em D-1" (v2) — redundante com
  `validarIntensosAdjacentes`.
- Estágio 2 pós-redistribuição (v2) — só no caminho com cobertura **desligada** (kill-switch
  `CoberturaSemanalPolicy`), onde `RedistribuicaoTreinoHelper` ainda roda antes de
  `garantirProvasNaSemana`; legado pré-existente, follow-up.
- **LONGO + PROVA em dias não vizinhos na mesma semana** — esta change protege D-1/D/D+1; se a prova
  deve *substituir* o longo é regra de carga, escopo de `add-taper-guidance`.
- Prova no 1º dia da semana com intenso no último dia da semana anterior — atravessa planos; a
  unidade de validação é a semana. **Risco aceito**, registrado em "Riscos".
- Taper/volume para preparatória, prioridade de `selecionarProvaDeterminante`, ligar
  `planner-engine.enabled`, correção retroativa em massa.

## Critérios de aceite

Fixture base ("caso real"): atleta com dias SEG/TER/QUI/SÁB, `dia_preferido_longo=SÁBADO`, prova
preparatória no domingo, sem skeleton, tenant v1.

- **CA1 (reprodução real):** resposta com LONGO no domingo **não** gera `COBERTURA_DIAS` por esse
  dia e sai como PROVA com `provaId`; resposta com LONGO/INTERVALADO/TIRO/SUBIDA/FARTLEK/TEMPO_RUN
  no sábado gera `INTENSOS_ADJACENTES` citando `PROVA` e aciona o reparo; REGENERATIVO no sábado
  passa.
- **CA2:** idem com `provaAlvo=true`.
- **CA3:** preferido = sábado (D-1), domingo (D) ou — com prova na quarta — quinta (D+1): a âncora
  não move; preferido = terça com prova no domingo: move como hoje.
- **CA4:** treino do LLM **malformado** (ex.: INTERVALADO sem etapas) no dia da prova é descartado
  antes da normalização, sem violação nem reparo; `restDay` no dia da prova idem. Plano persistido
  tem exatamente uma PROVA por prova, com `provaId`, no dia certo.
- **CA5:** provas no sábado **e** no domingo (duas `tb_prova` do mesmo atleta) → sem
  `INTENSOS_ADJACENTES`; a geração converge com duas PROVAs.
- **CA6:** `SEMANA_ATUAL` gerada na quarta com prova na segunda já passada → segunda não entra nos
  efetivos, nenhuma PROVA é inserida na validação, a geração converge; o persister insere a PROVA
  passada como hoje.
- **CA7:** tenant **v2 sem skeleton** (`cobertura != null`) recebe a mesma proteção de CA1/CA4 via
  `validarPlanoV2`; tenant v2 **com** skeleton (`cobertura == null`) não muda de comportamento.
- **CA8 (shadow):** `PROVA` na data real de uma prova da semana → zero
  `DIA_INDISPONIVEL`/`CONSTRAINT_DURA_VIOLADA`; `PROVA` em data errada → violação; determinante
  daqui a 3 meses → sem âncora nem isenção; preparatória em fase `PEAK` → slot ancorado, nenhum
  LONGO/dura no D-1, REGENERATIVO no D-1 permitido.
- **CA9 (shadow):** fixture: dias QUI/SÁB/DOM, prova no domingo, composição com LONGO + 1 dura +
  1 leve → sábado proibido para pesadas, só quinta elegível; o passo 2 dá a quinta ao LONGO e a
  **dura** fica sem dia, **sai** de `sessoes`, `requiresCoachReview=true` com motivo citando o tipo
  da dura e a prova; a leve pode cair no sábado; o bloco de slots do prompt não contém
  "(dia a definir)".
- **CA11:** duas `tb_prova` do mesmo atleta **na mesma data** → validação sem "dia aparece mais de
  uma vez"; a geração converge; o plano persistido tem **dois** `PROVA` nesse dia, um por
  `provaId` (hoje só o último sobrevive); reaplicar `garantirProvasNaSemana` sobre a lista já
  garantida não duplica.
- **CA12 (shadow):** fase `TAPER` (LONGO sem chave), dias SEG/QUA/SEX, sem prova → o LONGO ganha
  dia normalmente (não é removido, sem `requiresCoachReview`); mesma fase com prova no sábado →
  LONGO não cai na sexta.
- **CA10:** regressão zero em `WeeklyCoverageValidatorTest`, `LongRunAnchorTest`,
  `PlanoLlmValidatorTest`, `PlanoTreinoPromptBuilderTest` (inclui golden-master do prompt legado —
  atualizar deliberadamente pela linha "(prova)"), `PlanGenerationPersisterCoberturaTest`,
  `SessionCompositionResolverTest`, `SessionDayAllocatorTest`, `PlannerEngineTest`,
  `SkeletonComplianceCheckerTest`, `ConstraintValidatorTest`, `PlannerShadowServiceTest`.

## Métrica de sucesso

Fonte: Homelab, `tb_llm_call` × `tb_plano_semanal` × `tb_prova`. Baseline (60 dias até 2026-10-11,
11 planos com ledger — **N pequeno, 1 semana com prova**):

| métrica | baseline | meta (60 dias pós-deploy, ≥ 10 semanas com prova) |
|---|---|---|
| rejeições `COBERTURA_DIAS` cujo dia é dia de prova | 1 de 1 | **0** |
| planos persistidos com intenso em D-1 de PROVA (query do debug) | 1 de 1 | **0** |
| semanas com prova que precisaram de reparo (`attempt ≥ 2`) | 1 de 1 | ≤ taxa das semanas sem prova (hoje 1 de 10) |
| shadow `FAILED`/`VIOLATIONS_DETECTED` em semana com prova, citando `DIA_INDISPONIVEL` no dia da prova | 1 de 1 | **0** |

Para o treinador: nenhuma edição manual de plano por "treino pesado na véspera da prova" — hoje
foi uma correção em três tabelas; a meta é zero ocorrências no período.

## Riscos, rollback e dependências

- **Rollback:** sem flag própria; é revert do PR. O bump de `prompt_version` não altera planos já
  gerados (o ledger grava a versão por chamada). O kill-switch de cobertura
  (`CoberturaSemanalPolicy`) desliga o fix legado junto com a cobertura — comportamento pré-change,
  não pior.
- **Risco: `limiteDescansos()` e `diasDaSequenciaLonga()` passam a contar o dia da prova.** Aceito
  — a prova é carga; mitigação: teste de regressão com 3 dias + prova (limite de descanso continua
  1).
- **Risco: golden-master do prompt legado muda** (linha "(prova)"). Mitigação: atualização
  deliberada, revisada no PR.
- **Risco: fronteira de semana** (intenso no domingo da semana anterior, prova na segunda). Aceito;
  follow-up se aparecer no ledger.
- **Dependências:** `planner-engine-enforcement` — arquivada em
  `openspec/changes/archive/2026-09/2026-09-13-planner-engine-enforcement/` e mergeada, é a base
  do shadow tocado aqui. `add-taper-guidance` — **não implementada**; esta change não depende dela;
  quando entrar, deve consumir `provasDaSemana` (dono: `PlannerEngine`, item 5) em vez de
  recalcular. Sem dependência de frontend.

## Open Questions & Assumptions

- Assume que `PlanoTreinoPromptBuilder` pode receber `ProvaNoPlanoService` (ou `construirTreinoProva`
  extraído) sem ciclo; as provas da semana já são carregadas lá.
- "Hoje" para o intervalo efetivo é a mesma referência de `CoberturaSemanalPolicy.diasEfetivos`
  (`IaServiceImpl.java:171`) — um ponto só.
- Auditoria retroativa (produto, pergunta 3): correção manual toca três tabelas; ou script único,
  ou regerar o plano. Não decidido aqui.
- O que o treinador vê quando o skeleton perde um slot (CA9) é o fluxo de `requiresCoachReview`
  já existente — sem UI nova.

## Impact

- **Repo:** apenas `menthoros-backend`. Sem migration, sem mudança de API.
- **Prompt:** uma linha em `DisponibilidadePromptFormatter` — bump de `prompt_version`.

---

## DoR — rodada 4 (Codex + `spec-reviewer`, sobre a v3.2)

| origem | achado | resolução |
|---|---|---|
| spec-reviewer | fixture de CA9 contradiz a ordem dos passos (LONGO ocupa a quinta; a dura é que fica sem dia) | CA9/5.2(c)/5.3 alinhados ao resultado determinístico |
| spec-reviewer | path da `planner-engine-enforcement`; wrap circular dom→seg no allocator | path explícito; limite registrado (mais restritivo, sem ação) |
| Codex | duas provas na mesma data → "dia aparece mais de uma vez" insolúvel | item 3: ocupação de PROVA conta uma vez por dia (CA11) |
| Codex | pular pesadas no passo 4 remove LONGO sem chave (TAPER) mesmo com dia elegível | item 6: passo 2 cobre todo LONGO; passo 4 pula LONGO ∪ `DURAS` (CA12) |
| Codex (rodada 5) | `garantirProvasNaSemana` contradiz o javadoc: a 2ª prova do dia apaga a 1ª | item 3: remover dias uma vez, inserir todas, idempotente por `provaId` (CA11) |

## DoR — rodada 3 (Codex + `spec-reviewer`, 2026-10-11, sobre a v3.1)

Codex **needs-attention** (3 altos) e `spec-reviewer` **NOT READY** (3 bloqueantes + 4 menores).
Tudo verificado no código e incorporado na v3.2:

| origem | achado | resolução |
|---|---|---|
| Codex | treino malformado no dia da prova consome o reparo antes de ser descartado | item 2(a): descarte **antes** da normalização (CA4) |
| Codex | âncora no D+1 recria PROVA/LONGO vizinhos | item 4: D-1/D/D+1 (CA3) |
| Codex | passo 4 do allocator recoloca LONGO no D-1; "(dia a definir)" chega ao prompt | item 6: passo 4 pula pesadas; slot pesado sem dia sai do skeleton (CA9) |
| spec-reviewer | `usaV2` é por tenant; `validarPlanoV2` chama `aplicarCobertura` → CA7 falso | fato estrutural + CA7 reescrito |
| spec-reviewer | métrica sem baseline/janela/query | seção reescrita com baseline do Homelab |
| spec-reviewer | sem rollback/risco | seção nova |
| spec-reviewer | `file:line` deslocadas; `effectiveDays` vs `diasEfetivos`; dependências; fixtures CA5/CA9 | corrigidas; fixtures explícitas |

## Pre-mortem — rodada 2 (Codex, sobre a v3)

7 achados, incorporados na v3.1: prova passada em `SEMANA_ATUAL` (intervalo efetivo); PROVA com TSS
nulo em `validarTssSlotV2` (inserção em `aplicarCobertura`); PROVA/PROVA vizinhas (isento);
âncora desligada não substitui o longo (regra fina + non-goal); excluir D-1 tira capacidade das
leves (`proibidos` só para pesadas); determinante fora da semana (lista por data real);
`ComplianceContext` sem preparatórias (`provasDaSemana` propagada).

## Histórico — v2 e pre-mortem rodada 1 (Codex, tarde)

A v2 assumia que o LLM tinha ignorado a instrução de 48-72h e propunha enforcement em dois estágios.
O pre-mortem de então (5 achados) corrigiu a v1 mas revisou contra a mesma premissa errada. Dos
cinco, sobrevivem os achados 2 e 4 (shadow); 1 e 5 ficaram sem objeto; 3 virou non-goal.

**Product review (v2): Go** — mantido; a v3 é mais barata e preserva coach-in-the-loop.
