# Design — semantic-session-schema (F4)

## 1. Fluxo hoje vs. proposto

**Hoje (v1):**
```
PlannerEngine.planWeek → WeekPlanSkeleton (shadow, só compliance)
IaServiceImpl → prompt v1 (system fixo + user com regras aritméticas) → LLM
             → TreinoPlanejadoLlmDto (fcAlvo, ritmoAlvo, distanciaKm, duracaoMin já absolutos)
PlanoLlmValidator/NormalizacaoDeTreino → corrige aritmética + valida estrutura
TreinoMapper → TreinoPlanejadoOutputDto (mesmos campos absolutos) → front
```

**Proposto (v2, atrás da flag):**
```
PlannerEngine.planWeek → WeekPlanSkeleton (fonte de verdade do slot, não mais shadow)
IaServiceImpl → prompt v2 (system reduzido + user com skeleton do dia + schema de blocos) → LLM
             → SessionOutputV2 (tipo, foco, blocos[papel/quantidade/unidade/zona], racional, notaCoach)
PlanoLlmValidatorV2 → valida estrutura de blocos + TSS do slot (sem correção aritmética)
SessionResolver (domínio puro) → resolve blocos em EtapaTreinoLlmDto-equivalente (absoluto)
TreinoMapper → TreinoPlanejadoOutputDto (mesmos campos absolutos) → front
```

O ponto de junção é `TreinoMapper`: em v1 recebe o DTO da LLM já absoluto; em v2 recebe a saída do
`SessionResolver`, que tem o mesmo shape. O front não sabe qual caminho gerou o plano.

## 2. Decisão 1 — `SessionResolver` é domínio puro, não um service Spring

Segue a regra de Skills Architecture (`CLAUDE.md`, "JPA entities must not cross into skill logic") —
mesmo não sendo formalmente um `DomainSkill` registrado, o motivo é o mesmo: testável sem mock,
sem lifecycle de transação. `SessionResolver.resolver(SessionOutputV2 saida, AthleteZones zonas):
List<EtapaResolvida>` — entrada e saída são records, sem `@Entity`, sem `@Component` injetado (é
instanciado ou é um `@Component` sem estado, tanto faz para o teste, mas a assinatura não recebe
nada do Spring).

`AthleteZones` é um record novo — reaproveita o formato de `List<ZonaFC>` que `TreinoNormalizador`
já usa (`bpmDaZona`), mais o `paceLimiar` do atleta que `PaceValidator` já consulta. O mapeamento
`Atleta`/`ZonaFC` (entidade) → `AthleteZones` (record) é feito no service layer, mesma disciplina
de mapper que os skills já seguem.

## 3. Decisão 2 — `zonaParaFc` e zona→pace saem de `TreinoNormalizador` para um serviço próprio

Hoje `zonaParaFc` é package-private em `TreinoNormalizador:341-357`; a conversão zona→pace é
constantes (`FATOR_PACE_Z1/Z2`, `:38-41`) usadas inline. Extrair os dois para
`services/helper/ZoneResolver.java` (nome provisório — confirmar no início da implementação):
`bpmDaZona(String zona, List<ZonaFC> zonas): FaixaFc`, `paceDaZona(String zona, BigDecimal
paceLimiar): FaixaPace`. `TreinoNormalizador` (v1) passa a chamar `ZoneResolver` em vez da lógica
inline — **sem mudar o comportamento de v1**, é extração pura. `SessionResolver` (v2) usa o mesmo
`ZoneResolver`. Isso evita duas implementações de "zona → absoluto" divergindo com o tempo.

`PaceValidator` continua existindo como está (safety net de v1, corrige o que a LLM escreveu) —
não é chamado pelo caminho v2, porque em v2 a LLM nunca escreve pace.

## 4. Decisão 3 — DTO v2 fica em `dto/llm/v2/`, não substitui `dto/llm/`

`SessionOutputV2`, `BlocoDto` (record `papel`, `quantidade`, `unidade`, `zona`, `recuperacao`
opcional) — pacote novo, paralelo a `dto/llm/`. `IaServiceImpl` decide qual usar por
`schemaVersion` resolvido no início do método (task 1). Isso mantém v1 intocado durante o piloto —
nenhum código de v1 lê tipos de v2 nem vice-versa, reduzindo o risco de regressão em v1 enquanto v2
é validado.

## 5. Decisão 4 — Validador v2 é uma classe nova (`PlanoLlmValidatorV2`), não um `if` dentro da v1

`PlanoLlmValidator`/`NormalizacaoDeTreino` (v1) fazem duas coisas hoje: corrigir aritmética errada e
validar estrutura. V2 só precisa da segunda metade, com uma checagem nova (TSS do slot). Meter um
branch `if (schemaVersion == 2)` dentro da classe de 573 linhas que já mistura duas preocupações
(ver `CLAUDE.md`, "Service Size & Decomposition") pioraria o débito existente. `PlanoLlmValidatorV2`
reusa `FamiliaTreino` e a matriz de estrutura obrigatória (mesma tabela de
`fix-cold-start-calibration-plan-generation` §13.2), mas opera sobre `List<BlocoDto>` em vez de
`List<EtapaTreinoLlmDto>` — sem a etapa de correção. Lança `PlanoNaoConformeException` com a mesma
`List<Violacao>` que v1, então o turno de reparo (F3) funciona para os dois sem mudança.

**TSS do slot ±20%:** `PlanoLlmValidatorV2` recebe o `SessionSlot` do dia (do `WeekPlanSkeleton`,
já calculado por `PlannerEngine`) e compara `targetTss` contra o TSS resolvido — que só existe
**depois** que `SessionResolver` roda (TSS depende de duração/intensidade absolutas). Ordem real:
`validar estrutura de blocos (antes do resolver) → SessionResolver → validar TSS resolvido (depois
do resolver)`. Duas passadas, não uma — documentar isso explicitamente na assinatura pública para
não virar uma silent skip de TSS se alguém tentar juntar em uma passada só.

## 6. Decisão 5 — Skeleton passa a determinar tipo/foco antes do prompt

`PlannerEngine.planWeek` já roda hoje (shadow, para `SkeletonComplianceChecker`). Em v2, o service
que monta o prompt (`IaServiceImpl` ou o composer de `user`) passa a chamar `planWeek` **antes** de
montar o `user`, e serializa `tipo`/`foco` de cada `SessionSlot` como contexto fixo no prompt — não
como pergunta para a LLM decidir. A LLM recebe "SEGUNDA: intervalado, foco Z4" e devolve os blocos
daquele treino; não escolhe mais o tipo do zero. Isso muda `SkeletonComplianceChecker` de "audita
depois" para redundante em v2 (o skeleton virou a fonte, não há mais o que comparar contra ele) —
mantido ativo só no caminho v1, sem mudança de comportamento lá.

## 7. Decisão 6 — Flag por allowlist de tenant, não feature-flag genérica

Sem infraestrutura de flag por tenant no projeto (achado do levantamento). Property
`app.llm.plano.schema-version-v2-tenants` (CSV de UUIDs, vazio por default). Resolução:
```java
boolean usaV2 = v2TenantIds.contains(TenantContext.getRequiredTenantId());
```
Simples o suficiente para 2 tenants × 2 semanas; documentado como débito assumido se o piloto
crescer (ver "Fora de escopo" no proposal.md). Não usa `TenantContext` para nada além de leitura —
sem novo campo em `Tenant`/tabela nova.

## 8. Decisão 7 — Ledger: `schema_version` é resolvido uma vez e passado explicitamente

Hoje `tb_llm_call.schema_version` (V94) existe mas nenhum componente escreve nele. O ponto de
escrita é o mesmo que já grava as outras colunas do ledger (achado do levantamento: procurar
`LlmCallRegistro`/hook de ledger, mesmo ponto de F1-F3) — passa a receber `schemaVersion` (`"1"` ou
`"2"`) como parâmetro explícito da chamada que já registra o resultado, resolvido uma vez no início
de `geraPlanoSemanalAvancado` (mesmo lugar que decide `usaV2`), não recalculado em cada retry.

## 9. Riscos e mitigações

- **Risco de produto (achado do `product-reviewer`, não só técnico):** o `WeekPlanSkeleton` sai de
  shadow-mode (hoje só audita, `SkeletonComplianceChecker`) para **decisor** de tipo/foco do dia
  sem nunca ter sido validado nesse papel — só como auditor de conformidade contra o que a LLM já
  escolhia. Se o skeleton errar o tipo do dia (ex.: marcar intervalado numa semana em que o histórico
  recente do atleta pedia recuperação), a LLM v2 não tem mais liberdade para divergir — só preenche
  os blocos do tipo já fechado. É uma perda de sensibilidade contextual distinta do risco "LLM parou
  de calcular números" (baixo risco de percepção) — esta é "LLM parou de decidir o quê", que pode
  aumentar edição do coach exatamente na métrica que o gate mede. Mitigação: o gate (aceitação sem
  edição) capturaria a regressão, mas só depois de 2 semanas rodando com tenants reais — por isso a
  task 11.3 do piloto passa a incluir uma checagem qualitativa direta com os 2 coaches (não só o
  número), e o design assume esse risco como aberto, não como resolvido pelo shadow-mode anterior.
- **Risco:** matriz de estrutura obrigatória por tipo (blocos) diverge silenciosamente da matriz de
  v1 (etapas) com o tempo, já que agora existem duas fontes de verdade sobre "o que é um treino
  intervalado válido". Mitigação: `PlanoLlmValidatorV2` documenta explicitamente de qual tabela
  (`fix-cold-start-calibration-plan-generation` §13.2) herda cada regra, e task de validação cruzada
  compara os dois validadores com o mesmo fixture (mesmo treino, gerado em v1 e v2) antes do piloto.
- **Risco:** `SessionResolver` calcula TSS diferente do que `PlannerEngine` esperava para o slot
  (`targetTss`), por divergência de fórmula de TSS entre o skeleton (estimativa a priori) e o
  cálculo real pós-resolução. Mitigação: tolerância de ±20% (não igualdade estrita) absorve o gap
  esperado entre estimativa e real; se o gate do piloto mostrar violações de TSS acima de 5%
  sistematicamente, é sinal de fórmula divergente, não de LLM errando — task de medição cobre isso.
- **Risco:** allowlist de tenant vaza para produção sem coordenação (ex.: tenant errado no CSV).
  Mitigação: property lida via `@Value` com default vazio — nenhum tenant entra em v2 sem deploy
  explícito da env var; não há endpoint de auto-toggle.
- **Risco:** prompt v2 mais curto reduz tokens mas aumenta ambiguidade (LLM interpreta "papel
  PRINCIPAL, zona Z4, quantidade 6" de formas diferentes de request para request). Mitigação: é
  exatamente o que o gate do piloto mede (violações estruturais ≤ 5%, retry ≤ 10%) — se a
  ambiguidade for real, o piloto reprova antes de v2 virar default, sem afetar tenants fora da
  allowlist.

## 10. Fora do design (decidido no proposal.md)

Migração de v1 para v2 como default, descomissionamento de v1, flag de produto genérica — todos
fora desta change.
