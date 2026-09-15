**Tamanho:** L · **Trilha:** Full

## Why

Hoje a LLM decide **quanto** (pace, FC, distância, duração — números absolutos) e **o quê**
(estrutura qualitativa do treino) na mesma resposta. O contrato de saída (`TreinoPlanejadoLlmDto`,
`EtapaTreinoLlmDto`) pede à LLM para calcular `fcAlvo`, `ritmoAlvo`, `distanciaKm` e `duracaoMin`
por etapa — aritmética que o Java já sabe fazer de forma determinística a partir das zonas do
atleta (`zonaParaFc` em `TreinoNormalizador`, `PaceValidator`), e que a LLM erra com frequência
suficiente para justificar ~155 linhas de `plano-treino-system.txt` (`183-337`) ensinando fórmulas
de contagem de etapas e faixas percentuais de recuperação, mais um pipeline de correção pós-hoc em
`NormalizacaoDeTreino` (`corrigirFcZona`, `corrigirPaceTetoPiso`, `recalcularDuracao`,
`reconciliarDistanciaComEtapas`, `expandirEtapasAgregadas` — todo esse bloco existe só para
consertar aritmética que a LLM não deveria ter feito).

Essa mistura tem um custo direto: prompt maior (mais tokens de instrução, mais chance de erro
aritmético), validação maior (regras de tolerância como o triângulo pace×distância×duração,
`validarTrianguloPaceDuracaoDistancia`, hoje WARN em 20% flat — ver `fix-cold-start-calibration-plan-generation`
§13.3–13.4), e um `WeekPlanSkeleton`/`SessionSlot` (`domain/planner/`) que já tem quase o shape
certo (`sessionType`, `intensityZone`, `targetTss`, `durationMinutes`) mas vive em shadow mode —
audita o plano depois de pronto, não o determina.

A separação de responsabilidade é o próximo salto de F1–F3 (system/user split, ledger, turno de
reparo): tirar da LLM tudo que é cálculo determinístico e deixar só o julgamento qualitativo —
que tipo de estímulo, em que ordem, com que peso relativo. O `SessionSlot` do skeleton passa a
determinar tipo/foco de cada dia da semana (hoje é o LLM quem decide isso do zero); a LLM preenche
o miolo (blocos por papel, zona relativa, racional); o Java resolve os números absolutos que o
front já espera.

Esta change também fecha um gap de duas changes ativas e obsoletas: `validate-interval-workout-standards`
(0/79 tasks — a ideia de "validação rigorosa + padronização automática" foi superada pelo
`PlanoLlmValidator`/`NormalizacaoDeTreino` que já existem) e `fix-cold-start-calibration-plan-generation`
§13.4 (as perguntas de produto sobre tolerância do triângulo pace×distância×duração e quais WARNs
sobem para obrigatório ficam moot em v2 — não existe mais triângulo a tolerar quando o Java calcula
os três números a partir da zona).

## What Changes

**DTO v2 por slot do skeleton — a LLM para de calcular, o Java para de corrigir.**

1. **`WeekPlanSkeleton`/`SessionSlot` sai do shadow mode e passa a determinar tipo/foco real de
   cada dia.** Hoje `PlannerEngine.planWeek` gera o skeleton só para auditoria comparativa
   (`SkeletonComplianceChecker`); em v2, sob a flag, o skeleton é montado **antes** do prompt e
   `tipo`/`foco` de cada slot vão no `user` como contexto fixo — a LLM não escolhe mais o tipo do
   treino do zero, só preenche o `SessionOutputV2` daquele slot.
2. **Novo contrato de saída da LLM, por slot:** `tipo`, `foco`, `blocos: [{papel
   AQUEC/PRINCIPAL/RECUP/DESAQ, quantidade, unidade MIN/KM/M/REP, zona Z1–Z5/LIMIAR, recuperacao?}]`,
   `racional`, `notaCoach` — **sem pace, FC, distância ou duração**. Convive com o DTO v1
   (`TreinoPlanejadoLlmDto`/`EtapaTreinoLlmDto`) por trás da flag; nenhum campo de v1 é removido
   nesta change.
3. **`SessionResolver` novo, domínio puro, sem Spring/IO.** Resolve cada bloco v2 em etapa(s)
   absolutas — pace, FC, distância, duração — usando as zonas do atleta. Reusa a lógica de
   `zonaParaFc` (hoje package-private em `TreinoNormalizador:341`, promovida a serviço público) e a
   conversão zona→pace (hoje espalhada como constantes `FATOR_PACE_Z1/Z2` no mesmo arquivo,
   extraída para módulo próprio, na linha do que `PaceValidator.calcularPaceMedia` já faz para
   corrigir). Saída do `SessionResolver` é o mesmo formato absoluto que `TreinoMapper` já produz
   hoje para o front (`TreinoPlanejadoOutputDto`/`EtapaTreinoDto`) — **o contrato com o front não
   muda**.
4. **Validador v2 cai para invariantes de estrutura + TSS do slot.** `PlanoLlmValidator`/
   `NormalizacaoDeTreino` ganham um caminho v2 que valida: papéis obrigatórios por tipo de treino
   (herdando a matriz descoberta em `fix-cold-start-calibration-plan-generation` §13.2 — intervalado
   exige AQUEC→...→DESAQ com contagem mínima, contínuo exige 3 blocos na ordem, FARTLEK/FACIL/SUBIDA/PROVA
   seguem sem estrutura obrigatória), e TSS do slot resolvido dentro de ±20% do `targetTss` do
   `SessionSlot`. As regras de reconciliação/correção aritmética pós-hoc (item 3 do "Why") não se
   aplicam a v2 — não há o que corrigir porque o Java nunca deixa o número sair errado.
5. **Prompt v2** substitui o bloco "ESTRUTURA OBRIGATÓRIA DO TREINO INTERVALADO"
   (`plano-treino-system.txt:183-337`, ~155 linhas de fórmulas de contagem de etapas e faixas de
   recuperação) por instruções sobre o schema de blocos — texto novo, mais curto. Saída esperada
   ~600–800 tokens (vs. o volume atual por treino com etapas absolutas).
6. **Flag por tenant, `app.llm.plano.schema-version`** (`1` default, `2` opt-in). Sem
   infraestrutura de feature flag por tenant hoje no projeto (precedente é `@Value` global, ex.
   `planner-engine.enabled`) — nesta change o mecanismo é uma allowlist de tenant IDs via property
   (`app.llm.plano.schema-version-v2-tenants`, CSV de UUIDs), suficiente para o piloto de 2 tenants;
   generalizar para flag de produto fica fora de escopo.
7. **Ledger.** `tb_llm_call.schema_version` já existe (V94) mas não é populado por nenhum
   componente hoje — passa a ser preenchido em toda chamada (`"1"` ou `"2"`), permitindo comparar
   v1×v2 pela mesma tabela sem migration nova.
8. **Arquivamento de changes supersedidas.** `validate-interval-workout-standards` e
   `fix-cold-start-calibration-plan-generation` movem para `changes/archive/` com nota "superseded
   by semantic-session-schema" ao fim desta change — a primeira porque sua proposta foi implementada
   sob outro desenho (`PlanoLlmValidator`), a segunda porque a §13.4 (as perguntas de produto sobre
   tolerância) deixa de fazer sentido quando não há mais triângulo pace×distância×duração para a
   LLM errar.

**Fora de escopo, de propósito:**
- **Remover o DTO v1 ou o prompt v1.** Convivem atrás da flag até o piloto validar v2; descomissionar
  v1 é change própria, depois do gate.
- **Mudar o contrato de saída para o front** (`TreinoPlanejadoOutputDto`/`EtapaTreinoDto`) — o
  `SessionResolver` produz os mesmos campos absolutos que o front já recebe hoje.
- **Flag de produto genérica por tenant** — o mecanismo aqui é uma allowlist mínima para o piloto,
  não um sistema de feature flags reutilizável.
- **`llm-code-switching`** (tradução do `system` para inglês) — reaberta no roadmap para depois de
  F4, quando o `system` for reescrito de novo por outro motivo; não é objetivo desta change, mesmo
  reescrevendo boa parte do prompt.
- **Mudar o teto de 2 tentativas/100s do turno de reparo** (F3) — v2 usa a mesma
  `PlanoResilienceService` sem alterar orçamento.
- **`validar_plano` tool** (auto-checagem antes do `end_turn`) — mencionada no roadmap como
  opcional, continua fora.

## Critérios de aceite

- **Given** a flag `app.llm.plano.schema-version-v2-tenants` inclui o tenant do request, **when**
  o plano semanal é gerado, **then** o `user` enviado à LLM inclui o skeleton (`tipo`/`foco` por
  dia) como contexto fixo, e o schema de saída pedido é o v2 (blocos por papel/zona, sem
  pace/FC/distância/duração).
- **Given** a LLM devolve um `SessionOutputV2` válido para um slot INTERVALADO, **when**
  `SessionResolver` processa o bloco `PRINCIPAL` (zona `Z4`, `quantidade=6`, `unidade=REP`),
  **then** a etapa absoluta resultante usa o range de FC/pace da zona do atleta (via `zonaParaFc`
  promovido), no mesmo formato (`fcAlvoEtapa`, `ritmoAlvo`) que `TreinoMapper` produz hoje para v1.
- **Given** a resposta v2 de um treino INTERVALADO não tem o número mínimo de blocos exigido pela
  matriz de estrutura (herdada de `fix-cold-start-calibration-plan-generation` §13.2), **when** o
  validador v2 roda, **then** rejeita com violação estrutural — mesma família de exceção
  (`PlanoNaoConformeException`) e mesmo turno de reparo (F3) que v1.
- **Given** o TSS resolvido de um slot foge de ±20% do `targetTss` do `SessionSlot`, **when** o
  validador v2 roda, **then** rejeita como violação — nova checagem que não existe em v1.
- **Given** um tenant fora da allowlist, **when** o plano é gerado, **then** o caminho é
  exatamente o de hoje (v1), sem nenhuma diferença observável de prompt, DTO ou validação.
- **Given** qualquer chamada de geração de plano (v1 ou v2), **when** ela é registrada no ledger,
  **then** `tb_llm_call.schema_version` contém `"1"` ou `"2"` — nunca nulo.
- **Given** o piloto roda 2 tenants × 2 semanas, **when** medido contra v1, **then** retry ≤ 10%,
  violações estruturais ≤ 5%, aceitação sem edição ≥ v1 + 10 p.p., p50 ≤ 20s (gate do roadmap,
  Sprint 28–29).

## Open Questions & Assumptions

- **Assumido:** a matriz de estrutura obrigatória por tipo (`fix-cold-start-calibration-plan-generation`
  §13.2 — INTERVALADO ≥6 etapas AQUEC→...→DESAQ, contínuo 3 blocos na ordem, FARTLEK/FACIL/SUBIDA/PROVA
  sem estrutura obrigatória) é o ponto de partida para o validador v2, reformulada em termos de
  **blocos** em vez de etapas expandidas. Confirmar com o coach/produto se a pergunta 3 do §13.4
  ("PROVA/SUBIDA/FARTLEK/FACIL seguem sem estrutura obrigatória?") já está decidida ou precisa de
  grilling próprio antes da task de validador v2.
- **Assumido:** o TSS do slot vem do `SessionSlot.targetTss` já calculado pelo `PlannerEngine`
  existente — esta change não muda como o TSS alvo semanal é distribuído entre dias, só passa a
  validar contra ele.
- **Em aberto:** o mecanismo exato da allowlist por tenant (property CSV vs. tabela) — CSV é o
  mínimo viável para 2 tenants; se o piloto crescer, revisitar.
- **Em aberto (achado do `product-reviewer`, 2026-09-15, REFINE):** o `WeekPlanSkeleton` sai de
  shadow-mode (só audita hoje) para decisor de tipo/foco do dia sem nunca ter sido validado nesse
  papel — risco de produto distinto de "LLM parou de calcular números" (ver design.md §9). O gate
  do piloto (task 11.3) passa a incluir feedback qualitativo direto dos 2 coaches, não só a métrica
  de aceitação sem edição. Confirmar com produto se isso é suficiente ou se vale medir a taxa de
  divergência skeleton×LLM (de `SkeletonComplianceChecker`, hoje já registrada em shadow) antes de
  o piloto começar.
- **Em aberto (achado do `product-reviewer`):** a decomposição em blocos por papel/zona habilita
  sinal de edição mais fino (por bloco, não só por plano inteiro) para o `WeekSuggestion` — fora de
  escopo nesta change (só `schema_version` é capturado para comparar v1×v2), mas candidato a change
  seguinte depois que v2 estabilizar.
- **Em aberto:** se `zonaParaFc`/conversão zona→pace saem como métodos públicos no mesmo arquivo
  (`TreinoNormalizador`) ou migram para um serviço `services/helper` dedicado (`SessionResolver`
  usaria via injeção) — decisão de design, não de produto; resolver no design.md.
- **Pendente:** pré-mortem cross-model (`/adversarial-review` do plugin `codex`) não rodou nesta
  sessão — plugin instalado 2026-09-15 após o início da sessão, não carregado na lista de skills.
  Rodar manualmente antes do DoR (`/implement init`) numa sessão nova.
- **Confirmado no levantamento desta proposta:** o contrato de saída para o front
  (`TreinoPlanejadoOutputDto`/`EtapaTreinoDto`) já é absoluto hoje — o `SessionResolver` só precisa
  alimentar o `TreinoMapper` existente com os mesmos campos, não criar um contrato novo de saída.

## Métrica de sucesso

- Gate do piloto (roadmap Sprint 28–29): retry ≤ 10%, violações estruturais ≤ 5%, aceitação sem
  edição ≥ v1 + 10 p.p., p50 ≤ 20s — medido via `tb_llm_call` filtrado por `schema_version`.
- Tokens de saída por treino: v2 ~600–800 (alvo do roadmap) vs. volume atual de v1 com etapas
  absolutas — medir via `tb_llm_call.output_tokens` por `schema_version`.
- **Ligada à rotina do treinador:** aceitação sem edição é a métrica que importa para o coach — um
  plano v2 que o coach aceita sem mexer é tempo economizado; a comparação v1×v2 no mesmo piloto é o
  que decide se v2 vira default.

## Rollback

Sem migration de schema além do que já existe (V94). Reverter é remover o tenant da allowlist —
volta ao caminho v1 imediatamente, sem deploy. Se o merge inteiro precisar reverter, `git revert`
do commit de merge; nenhum dado gravado sob v2 (`schema_version="2"`) precisa de limpeza — fica
como histórico no ledger.
