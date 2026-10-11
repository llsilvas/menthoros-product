**Tamanho:** M · **Trilha:** Full

> **v3.1 (2026-10-11, noite).** A v2 atacava uma causa raiz errada. A leitura de `tb_llm_call` da
> geração real mostrou que o LLM **não ignorou** a instrução de taper: foi o **turno de reparo do
> próprio sistema** que empurrou a prova para a véspera, porque o dia da prova não conta como dia
> disponível para o validador de cobertura. A v3 trocou o enforcement novo pela correção dessa
> contradição; a v3.1 incorpora o segundo pre-mortem (7 achados, todos verificados no código — tabela
> ao final). Histórico da v2 fica no fim.

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
= SÁBADO`, prova no **domingo**. Geração no caminho legado (sem skeleton — `planner-engine.enabled=false`).

1. **Prompt autocontraditório.** `PeriodizacaoPromptFormatter.formatarEventoCompetitivoSemana`
   manda "Prescreva no dia domingo (18/10/2026) um único treino do tipo PROVA" (linha ~200), e
   `DisponibilidadePromptFormatter` lista "Dias disponíveis: SEGUNDA, TERÇA, QUINTA, SÁBADO" (linha
   76). Nenhum dos dois sabe do outro.
2. **Tentativa 1 (rejeitada).** O LLM prescreveu a prova no **domingo** — dia certo, tipo errado
   (`LONGO` 21,1 km, `provaId` nulo). `WeeklyCoverageValidator.validar` rejeitou com
   `COBERTURA_DIAS`: *"O treino de DOMINGO não está disponível para este atleta nesta semana"*
   (`WeeklyCoverageValidator.java:128`) e *"Dia(s) disponível(is) sem nada prescrito: SABADO"*
   (`:92`). A rejeição vira `PlanoNaoConformeException` (`PlanoLlmValidator.java:97`) → reparo.
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

**Por que isso também trava o rollout do planner-engine.** A porta 1 do gate
(`planner-engine-enforcement`, task 8.4) exige divergência do shadow ≤ 2% em ≥ 30 planos. No
Homelab (últimos 60 dias, todos `planner_enabled=false`): 13 `FAILED`, 5 `VIOLATIONS_DETECTED`, 3
`PASSED`/`COMPLIANT`, 11 sem shadow — ~86% de divergência. Parte é falso positivo do mesmo bug: o
plano do Leandro foi `VIOLATIONS_DETECTED` tendo como primeira violação `DIA_INDISPONIVEL` para a
própria PROVA de domingo. Enquanto o shadow acusa a prova como erro, a métrica do gate está
contaminada — esta change é pré-requisito para medir a porta 1 de verdade.

Fato estrutural que delimita o escopo: **`cobertura` é `null` sempre que há skeleton**
(`PlanoTreinoPromptBuilder.java:254`). As mudanças no legado (itens 1–4 abaixo) só valem no caminho
sem skeleton; com skeleton, quem protege a semana é o próprio skeleton (itens 5–7).

## What Changes

Tudo em `menthoros-backend`.

**Legado (caminho sem skeleton, `cobertura != null`):**

1. **Dia de prova é dia efetivo.** `effectiveDays` (`PlanoTreinoPromptBuilder.java:254`) = dias
   configurados ∪ dias das provas não canceladas no **intervalo efetivo** `[max(inicio, hoje), fim]`
   — prova já passada em `SEMANA_ATUAL` não entra. `DisponibilidadePromptFormatter` lista o dia com
   a marca "(prova)".
2. **PROVA visível à validação — dentro de `aplicarCobertura`.** `WeeklyCoverageContext` ganha
   `provasDaSemana: List<TreinoPlanejadoLlmDto>` (construídas por
   `ProvaNoPlanoService.construirTreinoProva`, mesmo intervalo efetivo do item 1, montadas no mesmo
   builder). No início de `aplicarCobertura` (`PlanoLlmValidator.java:74`) — **depois** da
   normalização, **antes** de `LongRunAnchor` — remove-se treino e `restDay` do LLM no dia de cada
   prova e insere-se a PROVA. A PROVA determinística não passa por `normalizar` nem por
   `validarTssSlotV2` (que só existe no ramo v2, onde `cobertura == null`); TSS nulo nela é o
   status quo do persister. A chamada em `PlanGenerationPersister.java:366` fica — idempotente.
3. **PROVA/PROVA vizinhas não é violação.** `validarIntensosAdjacentes` deixa de acusar par em que
   **ambos** são `PROVA` (evento fixo, o LLM não controla) — log WARN. LONGO/PROVA continua
   violação.
4. **`LongRunAnchor` não ancora no dia da prova nem no D-1.** Se `dia_preferido_longo` for dia de
   prova ou véspera, `ancorar` devolve o plano intacto. Fora disso a âncora funciona como hoje —
   LONGO + PROVA em dias não vizinhos **é permitido** por esta change (ver Non-goals).

**Shadow engine (skeleton):**

5. **"Provas da semana" por data real, propagadas.** Lista = `provaDeterminante` **se** sua data
   cai em `[referenceDate, referenceDate+6]` ∪ `provasPreparatoriasNaSemana`. `WeekPlanSkeleton`
   e `ComplianceContext` ganham `provasDaSemana`; `PlannerShadowService` (3 construções:
   `:151`, `:207`, `:228`) propaga. A isenção de `DIA_INDISPONIVEL`/`CONSTRAINT_DURA_VIOLADA` em
   `ConstraintValidator` e `SkeletonComplianceChecker` vale para sessão **na data real** de uma
   prova da semana — `PROVA` em data errada continua violação.
6. **Allocator protege D-1 sem tirar capacidade das leves.** `SessionDayAllocator.allocate`
   recebe `diasDeProva`; ancora todos; os passos 2 (LONGO) e 3 (duras) filtram candidatos por um
   conjunto `proibidos` (D-1 de cada prova) — `livres` fica intacta para o passo 4 (leves). Se um
   LONGO/dura ficar sem candidato, o slot fica sem dia **e** o skeleton sai com
   `requiresCoachReview=true` e motivo — política explícita, não `null` silencioso.
7. **`SessionCompositionResolver` compõe slot `PROVA` por prova preparatória independente da fase;
   `PlannerEngine.comporSessoes` deriva os dias a ancorar da lista do item 5.** Fase e `loadTarget`
   seguem só da determinante.

## Non-goals

- Check determinístico novo de "sessão pesada em D-1" (v2) — redundante com
  `validarIntensosAdjacentes`.
- Estágio 2 pós-redistribuição (v2) — só no caminho com cobertura **desligada** (kill-switch), onde
  `RedistribuicaoTreinoHelper` ainda roda antes de `garantirProvasNaSemana`; legado pré-existente,
  follow-up.
- **LONGO + PROVA em dias não vizinhos na mesma semana** — esta change protege a data da prova e a
  véspera; se a prova deve *substituir* o longo da semana é regra de carga, escopo de
  `add-taper-guidance`.
- Taper/volume para preparatória, prioridade de `selecionarProvaDeterminante`, ligar
  `planner-engine.enabled`, correção retroativa em massa, prova na fronteira da semana.

## Critérios de aceite

- **CA1 (reprodução real):** atleta sem o dia da prova entre os disponíveis, prova nesse dia, sem
  skeleton. Resposta com PROVA/LONGO no dia da prova **não** gera `COBERTURA_DIAS` por esse dia;
  resposta com LONGO/INTERVALADO/TIRO/SUBIDA/FARTLEK/TEMPO_RUN na véspera gera
  `INTENSOS_ADJACENTES` citando `PROVA` e aciona o reparo; sessão leve na véspera passa.
- **CA2:** vale para prova alvo e preparatória.
- **CA3:** `dia_preferido_longo` = véspera ou dia da prova → âncora não move; preferido em outro dia
  → comportamento atual.
- **CA4:** plano validado e persistido tem exatamente uma PROVA por prova, com `provaId`, no dia
  certo; treino e `restDay` do LLM nesse dia são descartados sem violação.
- **CA5:** duas provas em dias consecutivos → sem `INTENSOS_ADJACENTES`; a geração converge.
- **CA6:** `SEMANA_ATUAL` gerada depois de uma prova da semana já passada → o dia não entra nos
  efetivos, nenhuma PROVA é inserida na validação, a geração converge; o persister continua
  inserindo a PROVA passada como hoje.
- **CA7:** ramo v2 com skeleton: nenhuma mudança de comportamento em `validarPlanoV2`
  (`cobertura == null`).
- **CA8 (shadow):** `PROVA` na data real de uma prova da semana → zero
  `DIA_INDISPONIVEL`/`CONSTRAINT_DURA_VIOLADA`; `PROVA` em data errada → violação mantida;
  determinante fora da semana → nenhuma âncora nem isenção; preparatória em fase `PEAK` → slot
  ancorado, nenhum LONGO/dura no D-1, leve no D-1 permitida.
- **CA9 (shadow):** LONGO sem candidato após o filtro → slot sem dia e `requiresCoachReview=true`
  com motivo.
- **CA10:** regressão zero em `WeeklyCoverageValidatorTest`, `LongRunAnchorTest`,
  `PlanoLlmValidatorTest`, `PlanoTreinoPromptBuilderTest`, `PlanGenerationPersisterCoberturaTest`,
  `SessionCompositionResolverTest`, `SessionDayAllocatorTest`, `PlannerEngineTest`,
  `SkeletonComplianceCheckerTest`, `PlannerShadowServiceTest`.

## Métrica de sucesso

- `violacoes_plano{key=COBERTURA_DIAS}` cuja mensagem cita o dia de uma prova → **0**.
- Zero planos persistidos com sessão intensa na véspera de PROVA (consulta de auditoria do debug).
- Taxa de reparo (`attempt=2`) em semanas com prova **cai** — o fix remove uma rejeição.
- Shadow: `planner_compliance_status IN (FAILED, VIOLATIONS_DETECTED)` em semanas com prova **cai**
  após o deploy, e nenhuma violação restante cita `DIA_INDISPONIVEL` no dia de uma prova. Após
  ≥ 30 planos, reavaliar a divergência real para a porta 1 do gate.

## Open Questions & Assumptions

- Assume que `PlanoTreinoPromptBuilder` pode receber `ProvaNoPlanoService` (ou só
  `construirTreinoProva` extraído) sem ciclo; as provas da semana já são carregadas lá.
- "Hoje" para o intervalo efetivo é a mesma referência que o chamador usa para filtrar
  `effectiveDays` em `SEMANA_ATUAL` — confirmar o ponto único na implementação (1.1).
- Auditoria retroativa (produto, pergunta 3): correção manual toca três tabelas; ou script único,
  ou regerar o plano. Não decidido aqui.
- O que o treinador vê quando o skeleton sai com slot sem dia (CA9) é o fluxo de
  `requiresCoachReview` já existente — sem UI nova.

## Impact

- **Repo:** apenas `menthoros-backend`. Sem migration, sem mudança de API.
- **Prompt:** uma linha em `DisponibilidadePromptFormatter` — bump de `prompt_version`.
- **Coordena com:** `add-taper-guidance` (LONGO + PROVA; reusar `provasDaSemana`).

---

## Pre-mortem adversarial — rodada 2 (Codex, 2026-10-11, sobre a v3)

Veredito **needs-attention**; 7 achados, todos verificados no código e incorporados:

| # | Achado | Resolução (v3.1) |
|---|--------|-------------------|
| 1 | Prova passada em `SEMANA_ATUAL`: `garantirProvasNaSemana` insere, `effectiveDays` não contém → 422 inevitável | Intervalo efetivo `[max(inicio, hoje), fim]` para efetivos **e** PROVAs da validação (item 1–2, CA6) |
| 2 | Inserção no callback antes dos ramos v1/v2: PROVA com TSS nulo cai em `validarTssSlotV2` | Inserção movida para dentro de `aplicarCobertura` (legado, pós-normalização); ramo v2 intocado (CA7) |
| 3 | Duas provas consecutivas → `INTENSOS_ADJACENTES` insolúvel | Par PROVA/PROVA isento (item 3, CA5) |
| 4 | Desligar a âncora não faz a prova substituir o longo | Regra fina (dia da prova e D-1); LONGO+PROVA não vizinhos vira non-goal explícito |
| 5 | Excluir D-1 de `livres` tira capacidade das leves; slot `null` chega ao prompt | `proibidos` só nos passos 2–3; slot sem dia → `requiresCoachReview` (item 6, CA9) |
| 6 | Determinante pode estar fora da semana (ou no passado em `POST_RACE`) | Lista por data real dentro da semana (item 5, CA8) |
| 7 | `ComplianceContext`/`WeekPlanSkeleton` não carregam as preparatórias | Campo `provasDaSemana` propagado nas 3 construções (item 5) |

## Histórico — v2 e pre-mortem rodada 1 (Codex, 2026-10-11, tarde)

A v2 assumia que o LLM tinha ignorado a instrução de 48-72h e propunha enforcement em dois estágios.
O pre-mortem de então (5 achados) corrigiu a v1 mas revisou contra a mesma premissa errada. Dos
cinco, sobrevivem os achados 2 e 4 (shadow); 1 e 5 ficaram sem objeto; 3 virou non-goal.

**Product review (v2): Go** — mantido; a v3 é mais barata e preserva coach-in-the-loop. Perguntas 1
(custo de retries) e 4 (alerta) ficam sem objeto; 2 (dia seguinte à prova) e 3 (auditoria)
continuam abertas.
