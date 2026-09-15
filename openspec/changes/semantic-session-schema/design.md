# Design — semantic-session-schema (F4, 3ª correção, 2026-09-15)

## 0. Correção sobre a versão anterior deste design

A versão anterior assumia um "loop de chamada à LLM por treino" que não existe. Confirmado (leitura
integral): `IaServiceImpl.geraPlanoSemanalAvancado` (`:144-190`) faz **uma única chamada por
tentativa** — `PlanoResilienceService` itera *tentativas* (retry de reparo, F3), não treinos. A LLM
devolve `PlanoSemanalLlmDto` com todos os `treinosPlanejados` de uma vez, parseado via
`ObjectMapper.readValue` (`IaServiceImpl.java:246-254`, deliberadamente sem `BeanOutputConverter` na
resposta — achado de F3, quebra igualdade de prefixo). O schema JSON pedido à LLM é gerado por
`LlmJsonSchemaBuilder.buildSchemaTightInlineOrDefs()` (`services/prompt/LlmJsonSchemaBuilder.java:68-203`)
via `BeanOutputConverter` **de reflexão** sobre `PlanoSemanalLlmDto.class` — usado só para *gerar o
schema*, nunca para parsear.

Esta versão redesenha o encaixe de v2 em cima do seam real que já existe:
`PlanoLlmValidator.validarENormalizarPlano` (`PlanoLlmValidator.java:56-96`, **public**) já itera
`plano.treinosPlanejados()` **depois** do parse único e reconstrói um novo `PlanoSemanalLlmDto` — é
esse padrão (record→loop por treino→novo record) que F4 reusa, não um loop de chamadas à LLM.

## 1. Fluxo hoje vs. proposto

**Hoje (v1), dentro de uma tentativa:**
```
gerarChamadaLlm → chatClient.call() [1 chamada, semana inteira] → json bruto
parsearPlano(json) → PlanoSemanalLlmDto { treinosPlanejados: [TreinoPlanejadoLlmDto{ etapas: [...] }] }
validarENormalizarPlanoGerado(plano) = PlanoLlmValidator.validarENormalizarPlano
  for treino in plano.treinosPlanejados():
    NormalizacaoDeTreino.normalizar(treino, ctx)  // receita: corrigir-temporais → expandir →
                                                   // gates de estrutura → normalizar-intervalado →
                                                   // reconciliar-distancia
  → novo PlanoSemanalLlmDto com treinos normalizados
aplicarComplianceEstagio1 (SkeletonComplianceChecker, nível de dia — planner-engine-enforcement,
  fora de escopo aqui)
```

**Proposto (v2, dentro da mesma tentativa, sem chamada extra):**
```
[dentro de gerar — sem validar nada, roda fora do escopo de retry]
gerarChamadaLlm → chatClient.call() [1 chamada, schema v2] → json bruto
parsearPlanoV2(json) → PlanoSemanalLlmDtoV2 { treinosPlanejados: [TreinoPlanejadoLlmDtoV2{ blocos: [...] }] }
SessionResolver.resolverPlano(planoV2, athleteZones): PlanoSemanalLlmDto  // NOVO, só aritmética
  for treinoV2 in planoV2.treinosPlanejados():
    List<EtapaTreinoLlmDto> etapas = resolver(treinoV2.blocos(), zonasDoAtleta)
    TreinoPlanejadoLlmDto treino = agregarCamposDeTreino(treinoV2, etapas)  // 7 campos:
                                     // duracaoMin/distanciaKm/fcAlvo/ritmoAlvo/tssPlanejado/
                                     // intensidadePlanejada/percepcaoEsforcoEsperada
  → PlanoSemanalLlmDto (MESMO shape de v1, já resolvido, ainda não validado)

[dentro de validar — protegido pelo retry F3]
NormalizacaoDeTreino.validarEstruturaV2(treino, ctx)  // NOVO, dispatch por família (Decisão 3)
checagemTSS(treino, sessionSlot)                      // NOVO, só roda se estrutura passou
aplicarComplianceEstagio1 (inalterado — nível de dia, fora de escopo)
```

**Ponto-chave:** depois de `SessionResolver.resolverPlano`, o objeto em memória é um
`PlanoSemanalLlmDto` normal — `PlanoResilienceService.ChamadaLlm`, o turno de reparo (F3), a
persistência (`TreinoMapper`) e o enforcement de nível-dia (`planner-engine-enforcement`) continuam
operando sobre ele **sem saber que veio de v2**. A única diferença de v1 é o que acontece *dentro*
de `gerarChamadaLlm`/logo após o parse — nenhuma assinatura pública muda.

## 2. Decisão 1 — DTOs v2 são uma família paralela, não campos opcionais em `TreinoPlanejadoLlmDto`

`PlanoSemanalLlmDtoV2 { ...mesmos campos de nível-plano..., treinosPlanejados: List<TreinoPlanejadoLlmDtoV2> }`,
`TreinoPlanejadoLlmDtoV2 { diaSemana, tipoTreino, justificativaIa, blocos: List<BlocoDto> }` — **sem**
`fcAlvo`/`duracaoMin`/`distanciaKm`/`ritmoAlvo`/`etapas`. Alternativa descartada: adicionar `blocos`
como campo opcional em `TreinoPlanejadoLlmDto` — misturaria os dois contratos numa classe só,
contra a disciplina de "v1 e v2 convivem sem se misturar" do proposal.md. Custo aceito: um método
novo em `LlmJsonSchemaBuilder` (`buildSchemaV2...`, mesmo padrão do atual) refletindo sobre
`PlanoSemanalLlmDtoV2.class` em vez de `PlanoSemanalLlmDto.class`.

## 3. Decisão 2 — `BlocoDto`: `repeticoes` e `quantidadePorRepeticao` separados

`BlocoDto(papel: AQUEC/PRINCIPAL/RECUP/DESAQ, repeticoes: int (default 1), quantidadePorRepeticao:
BigDecimal, unidade: MIN/SEG/KM/M, zona: Zona enum (Z1-Z5/LIMIAR), recuperacao:
RecuperacaoDto?)`. `RecuperacaoDto(quantidade: BigDecimal, unidade: MIN/SEG/KM/M)` — **sem `zona`
própria**: recuperação sempre resolve na zona fixa `Z1` (mesma decisão que v1 usa
implicitamente — `TreinoNormalizador` não varia zona de recuperação; fixar isso explicitamente em
v2 fecha o achado do pré-mortem "recuperação sem zona própria, FC/pace indeterminados").

## 4. Decisão 3 — validação v2: TUDO dentro de `validar` (retry-aware), dispatch por família

**Correção BLOCKER (4ª rodada de pré-mortem):** a versão anterior fazia a validação estrutural
lançar dentro de `gerarChamadaLlm` — mas essa função é a `gerar` passada para
`PlanoResilienceService.gerarComResiliencia`, e **`gerar` roda fora do `try` que captura violações
para o turno de reparo (F3)** (confirmado: `PlanoResilienceService.java:129`, `gerar.apply(...)`
antes do bloco protegido). Uma violação lançada ali mataria a geração sem acionar o retry.

**Decisão final:** `gerar` (branch v2) faz só LLM + parse (`PlanoSemanalLlmDtoV2`) +
`SessionResolver.resolverPlano` — **sem validar nada**, só aritmética determinística (um bloco com
`repeticoes` insuficientes não lança, só produz menos etapas). Isso preserva o mesmo contrato de
`gerar` em v1 (chama+parseia, não valida) e joga **toda** a validação estrutural para dentro de
`validar`, protegido pelo retry — igual a `aplicarComplianceEstagio1(validarENormalizarPlanoGerado(...))`
em v1.

**Correção BLOCKER 2 (gates são por família, não universais):** os gates que a versão anterior
listava (`gateContagem`, `gatePresencaAquecDesaq`, `gateOrdemAquecDesaq`, `gateBalanceamento`,
`gateSequencia`) pertencem só à receita de `FamiliaTreino.INTERVALADO_TIRO` — aplicá-los a todo
mundo rejeitaria um contínuo válido de 3 etapas pelo mínimo de 6. `FamiliaTreino` real (confirmado
no código, `services/helper/FamiliaTreino.java:12-24`) tem só 4 valores: `INTERVALADO_TIRO`,
`FARTLEK`, `TRES_ETAPAS` (cobre REGENERATIVO/CONTINUO/TEMPO_RUN/LONGO), `PADRAO` (cobre
FACIL/SUBIDA/PROVA/DESCANSO). Em vez de mudar visibilidade de métodos individuais (descartado),
`NormalizacaoDeTreino` ganha **um único método novo, package-private**,
`validarEstruturaV2(TreinoPlanejadoLlmDto, ContextoNormalizacao)`, que despacha por família
(`FamiliaTreino.de(treino.tipoTreino())`, mesmo método que `montarReceitas()` já usa) para os gates
corretos, chamando os métodos `private` existentes **internamente**:
```java
void validarEstruturaV2(TreinoPlanejadoLlmDto treino, ContextoNormalizacao ctx) {
    switch (FamiliaTreino.de(treino.tipoTreino())) {
        case INTERVALADO_TIRO -> {
            gateExistencia(treino, ctx); gateContagem(treino, ctx);
            gatePresencaAquecDesaq(treino, ctx); gateOrdemAquecDesaq(treino, ctx);
            gateSequencia(treino, ctx);
            // validarDuracaoTiros — correção MAJOR (6ª rodada de pré-mortem): a geração
            // determinística de v2 NÃO garante tiros fisiologicamente plausíveis (0,3-10 min) — a
            // LLM ainda escolhe `quantidadePorRepeticao`/`unidade` livremente; um bloco com
            // `quantidadePorRepeticao=11, unidade=MIN` passaria por todos os outros gates. Reusado
            // sem mudança (já lê `treino.etapas()`, compatível com a saída do SessionResolver).
            validarDuracaoTiros(treino, ctx);
            // gateBalanceamento (v1) NÃO é reusado aqui — ele valida proporção tiro:recuperação
            // típica de texto livre da LLM, irrelevante para blocos v2. Em vez disso, v2 fecha o
            // mesmo risco (intervalado sem NENHUMA recuperação, achado do pré-mortem — contraexemplo:
            // AQUEC + PRINCIPAL(repeticoes=6, recuperacao=null) + DESAQ, 8 etapas, passaria em todos
            // os gates acima) com uma checagem NOVA sobre as ETAPAS JÁ RESOLVIDAS (não sobre o bloco
            // original — `validarEstruturaV2` roda pós-resolução, só tem `treino.etapas()`
            // disponível): rejeita se houver 2+ etapas `INTERVALADO` consecutivas sem uma
            // `RECUPERACAO` entre elas.
            gateRecuperacaoEntreTiros(treino, ctx);  // NOVO — não existe em v1
        }
        case TRES_ETAPAS -> {
            boolean validarOrdem = !"LONGO".equals(treino.tipoTreino());
            validarEstrutura3Etapas(treino, treino.tipoTreino(), ctx.atletaId(), validarOrdem);
        }
        case FARTLEK, PADRAO -> { /* sem estrutura obrigatória em v1; mantido em v2 */ }
    }
}
```
(Assinatura real confirmada: `validarEstrutura3Etapas(TreinoPlanejadoLlmDto treino, String tipo,
UUID atletaId, boolean validarOrdem)` — `validarOrdem=false` só para `LONGO`, `true` para os
demais membros de `TRES_ETAPAS`, replicando a regra que `montarReceitas()` já aplica hoje.)
Preserva exatamente a seleção por família que v1 já tem, sem reimplementá-la numa segunda matriz.
**Não há mais `NormalizacaoDeTreinoV2` como classe separada** — é um método a mais na classe
existente, sem mudar visibilidade de nada.

**Ordem final, tudo dentro de `validar`:**
1. `SessionResolver.resolverPlano` já rodou dentro de `gerar` (produziu `PlanoSemanalLlmDto`
   v1-shaped, sem validação, incluindo `tssPlanejado`/`intensidadePlanejada`/
   `percepcaoEsforcoEsperada` — Decisão 4 abaixo).
2. `validar`, por treino: `NormalizacaoDeTreino.validarEstruturaV2` (estrutura, dispatch por
   família).
3. Checagem de TSS do slot (Decisão 6) — só roda se a estrutura passou; compara
   `tssPlanejado` (já calculado no passo 1) contra `SessionSlot.targetTss`.
4. `aplicarComplianceEstagio1` (nível de dia, inalterado) roda por último, como já roda hoje.

## 5. Decisão 4 — `SessionResolver` produz `PlanoSemanalLlmDto` (v1-shaped) COMPLETO, campos omitidos incluídos

**Correção MAJOR (4ª rodada):** a versão anterior só agregava `duracaoMin`/`distanciaKm`/`fcAlvo`/
`ritmoAlvo` — esqueceu `tssPlanejado`, `intensidadePlanejada`, `percepcaoEsforcoEsperada`, campos
que `TreinoPlanejadoLlmDto` (v1) também carrega e que a LLM gera hoje, mas `TreinoPlanejadoLlmDtoV2`
não pede (Decisão 1). `SessionResolver` precisa calculá-los, não só os 4 campos originais:
- `percepcaoEsforcoEsperada`: lookup fixo zona-dominante→RPE (ex. `Z1=2, Z2=4, Z3=6, Z4=8, Z5=9,
  LIMIAR=7`) — **valores de exemplo, não confirmados**; precisa validação de produto/fisiologia
  antes de fechar (task 0.5, junto da calibração de pace).
- `tssPlanejado`: **reusa `TssCalculatorService.calcularTssEstimado(Duration, Integer rpe)`**
  (`services/helper/TssCalculatorService.java:52-56`, já existe, `@Component` público) com a
  duração total resolvida e o `percepcaoEsforcoEsperada` acima — não uma fórmula nova. Esse método
  é o pipeline RPE→IF→TSS unificado entre planejado e realizado (comentário no código cita
  BUG-CONF-001: duas fórmulas duplicadas divergiam 2,4×-6× antes da unificação) — reusar em vez de
  duplicar evita reabrir exatamente esse bug. É também o mesmo valor usado na checagem de TSS do
  slot (Decisão 3, passo 3), calculado uma vez só.
- `intensidadePlanejada`: **reusa `TssCalculatorService.converterRpeParaIf(double rpe)`** (mesmo
  arquivo, linha 370, hoje `private`) — muda para package-private (mesmo padrão de visibilidade
  cirúrgica da Decisão 3 em `NormalizacaoDeTreino`, agora em `TssCalculatorService`) para
  `SessionResolver` reusar a tabela RPE→IF em vez de duplicá-la.

`SessionResolver.resolverPlano(PlanoSemanalLlmDtoV2 planoV2, AthleteZones zonas): PlanoSemanalLlmDto`
— roda **uma vez por tentativa**, dentro de `gerarChamadaLlm`, logo após `parsearPlano`. Não é
domínio 100% puro no sentido de "zero dependência Spring" (injeta `TssCalculatorService`, um
`@Component`) — segue a mesma convenção dos `DomainSkill` do projeto (CLAUDE.md, Skills Architecture
Standards): pode ser `@Component`, só não recebe `@Entity` JPA como entrada (`AthleteZones` é
record puro). Internamente itera `planoV2.treinosPlanejados()` (mesmo padrão do loop já existente
em `PlanoLlmValidator.validarENormalizarPlano`), mas é trabalho Java síncrono sobre uma resposta já
recebida — **não é uma 2ª chamada à LLM**.

`AthleteZones`/zona por dia: como o skeleton já fixa a zona do dia (`SessionSlot.intensityZone`,
`planner-engine-enforcement`), `zonas` pode ser um único `AthleteZones` por atleta (não por dia) —
as `ZonaFC` do atleta não mudam dia a dia, só a zona-alvo de cada bloco varia (isso já vem no
`BlocoDto.zona`). Simplifica a assinatura: `resolverPlano(planoV2, AthleteZones)`.

## 6. Decisão 5 — Recuperação sempre após cada repetição, incluindo a última (herda v1)

Confirmado: `TreinoNormalizador.expandirEtapasAgregadas:126` sempre insere recuperação após cada
tiro, inclusive o último — v2 herda esse comportamento por default explícito (não por acidente):
`SessionResolver` gera `repeticoes` pares tiro+recuperação quando `bloco.recuperacao() != null`,
sem tratamento especial da última repetição. Revisar essa regra de produto (se a última recuperação
deveria ser omitida) é decisão que afeta v1 e v2 igualmente — fora de escopo aqui.

## 7. Decisão 6 — `ZoneResolver` v2: fallback de FC herdado de v1; fallback de pace Z3-Z5 é NOVO (não existe em v1)

Achado do pré-mortem (MAJOR): `PlanoLlmValidator.contexto:98-109` mostra que hoje, quando o atleta
não tem `fcLimiar` nem `fcMaxima` cadastrados, `zonasFC = null` e `corrigirFcZona` (v1) vira no-op
silencioso. Em v2 não há "o que a LLM escreveu" para cair de volta — o `SessionResolver` **precisa**
produzir um valor sempre.

**FC — fallback herdado de v1, sem mudança:** `ZoneResolver.bpm(Zona zona, @Nullable List<ZonaFC>
zonas)` usa o mesmo fallback percentual fixo que v1 já usa (`"90-95% FCmax"`...`"60-70% FCmax"`,
`TreinoNormalizador.java:351-355`) quando `zonas == null` — cobre Z1-Z5 completo hoje, sem gap.

**Pace — correção MAJOR (4ª rodada):** v1 só define fatores de conversão pace↔zona para **Z1/Z2**
(`FATOR_PACE_Z1=1.35`, `FATOR_PACE_Z2=1.20`, `TreinoNormalizador.java:38-41`) — não existe fórmula
para Z3/Z4/Z5/LIMIAR porque v1 nunca precisou (a LLM escrevia o pace direto para essas zonas mais
intensas, só corrigido por teto/piso do histórico via `PaceValidator`, não derivado de zona). Em v2,
`SessionResolver` **precisa** de um pace para toda zona, inclusive Z3-Z5/LIMIAR (usado no bloco
`PRINCIPAL` de treinos intervalados, que são justamente Z4/Z5). **Não há fórmula existente para
herdar aqui — é greenfield.** Decisão: definir uma tabela de fatores (`paceZona = paceLimiar ×
fator`), extrapolando a proporção de v1 (fatores decrescem conforme a zona sobe — mais intensa =
mais rápida = fator menor que 1 perto do limiar):

| Zona | Fator (× paceLimiar) | Origem |
|---|---|---|
| Z1 | 1.35 | v1, herdado |
| Z2 | 1.20 | v1, herdado |
| Z3 | 1.10 | **novo, estimado — precisa calibração** |
| Z4 | 1.00 | **novo, estimado — precisa calibração** |
| Z5 | 0.92 | **novo, estimado — precisa calibração** |
| LIMIAR | 1.00 | **novo, estimado** (mesmo que Z4, ponto de referência) |

**Os valores Z3-Z5/LIMIAR são estimativas, não dado calibrado** — precisam de validação com dado
histórico real (paces de treinos intervalados já registrados, comparados à zona que o coach
classificou) ou confirmação de um fisiologista/coach antes de ir para produção. Task nova (0.5)
cobre essa calibração como pré-requisito, separado da implementação do `SessionResolver` em si (que
pode ser codificada e testada com os valores estimados, ajustados depois sem mudar a estrutura).

Quando `paceLimiar == null`: usar os mesmos defaults fixos de v1 (`PACE_Z2_DEFAULT_MIN_KM=7.0`,
`PACE_Z1_DEFAULT_MIN_KM=8.0`) para Z1/Z2, e aplicar os mesmos fatores da tabela acima sobre esse
pace-base estimado para Z3-Z5/LIMIAR (mesma lógica, só sem `paceLimiar` real).

## 8. Decisão 7 — Versionamento de schema (igual à versão anterior, confirmado sem mudança)

`SchemaVersion` ganha `"schema-v2"` como segundo valor; único call site
(`PlanoLlmLedgerHook.java:67`) passa a receber o valor resolvido junto de `usaV2` em vez da
constante fixa. Ledger já grava a coluna hoje — só o valor muda.

## 9. Decisão 8 — Flag por allowlist de tenant, rollback com restart (confirmado sem mudança)

`app.llm.plano.schema-version-v2-tenants` (CSV de UUIDs, `@Value`, default vazio). Rollback exige
restart (sem `@RefreshScope`) — documentado corretamente no proposal.md.

## 10. Riscos e mitigações

- **Risco de produto:** LLM perde liberdade no nível de etapa em v2. Mitigação: gate qualitativo com
  os 2 coaches do piloto (proposal.md).
- **Risco:** `SessionResolver`/`ZoneResolver` fallback percentual de FC (Decisão 6) produz FC menos
  precisa que v1 para atletas sem zonas cadastradas — mesma imprecisão que v1 já tem hoje (fallback
  idêntico), não é regressão: nomear no relatório do piloto quantos % caíram nesse fallback.
- **Risco real, não mitigado — tabela de pace Z3-Z5/LIMIAR é estimada, não calibrada** (Decisão 6):
  paces de treinos intervalados em v2 podem sair sistematicamente rápidos ou lentos demais até
  calibrar contra dado real. Mitigação: task 0.5 calibra antes do piloto começar com tenants reais;
  o piloto mede exatamente isso (retry/violações/aceitação) e serve como segunda camada de
  validação mesmo se a calibração inicial errar.
- **Risco:** `intensidadePlanejada`/`percepcaoEsforcoEsperada` (Decisão 4) usam lookup fixo
  zona→número não confirmado com produto/fisiologia — mesma mitigação: task 0.5, piloto como
  segunda camada.
- **Risco:** fórmula de TSS do slot (Decisão 3, passo 3) diverge da estimativa do skeleton.
  Mitigação: tolerância ±20% absorve o gap esperado; task 0.4 mapeia o ponto de cálculo exato antes
  de escrever o teste.
- **Risco:** allowlist de tenant vaza sem coordenação. Mitigação: `@Value` com default vazio, exige
  restart explícito.

## 11. Fora do design

Nível de dia/skeleton (já resolvido por outra change), migração de v1 para v2 como default,
descomissionamento de v1, flag de produto genérica, consolidação do `SkeletonComplianceChecker`
chamado 2x (débito pré-existente) — todos fora desta change.
