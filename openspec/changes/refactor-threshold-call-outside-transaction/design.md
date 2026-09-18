# Design — refactor-threshold-call-outside-transaction

> Anchors verificados em 2026-09-18 contra `develop` do backend (`TsbServiceImpl`,
> `AthleteThresholdUpdater`, `ThresholdInferenceService`, `PlanoMetadadosService`). Precedente
> seguido: `refactor-llm-call-outside-transaction` (D1 — "três fases, orquestrador sem transação,
> colaboradores transacionais").
>
> **Revisão 2 (2026-09-18)** — pre-mortem (DeepSeek, fallback do Codex indisponível por limite de
> uso) derrubou a v1 deste design com 2 achados reais, verificados contra o código:
> 1. `PlanoMetaDados` só é carregado (`planoMetadadosService.buscarOuCriarMetadados(...)`) **dentro**
>    de `atualizarMetaDados` (`TsbServiceImpl.java:307`), já dentro da transação — a v1 assumia
>    poder "resolver a fonte antes da transação" recebendo a entidade como parâmetro, o que não
>    fecha: a entidade não existe ainda nesse ponto.
> 2. Mover a chamada pra fora da `@Transactional` de `TsbServiceImpl` **sem trocar de bean** cai em
>    auto-invocação — a mesma armadilha já documentada no `CLAUDE.md` do backend para o idiom
>    "catch de `DataIntegrityViolationException` fora de `@Transactional`": chamar um método anotado
>    através de `this.` dentro da mesma classe não passa pelo proxy do Spring, a anotação é
>    ignorada em silêncio.
>
> Os dois exigem revisão de design, não só de documentação — refeito abaixo. Achados menores do
> mesmo pre-mortem (FC sem fonte externa não precisa da mesma simetria; `recalcularDesde` precisa
> da janela certa, não "resolver uma vez" vago) também incorporados.

## D1 — O seam não recebe a entidade: recebe primitivos, e faz sua própria consulta de tenant

**v1 (derrubada):** `resolverFontePace(atletaId, tenantId, PlanoMetaDados metaDados, hoje,
treinos30d)` — dependia de `metaDados` já carregado.

**v2:** `resolverFontePace(UUID atletaId, UUID tenantId, LocalDate hoje, List<TreinoRealizado>
treinos30d, BigDecimal paceLimiarAnterior)` — só primitivos e uma lista já em memória. Não recebe
nem `Atleta` nem `PlanoMetaDados`:
- A decisão (prova válida? quintil?) só precisa de `atletaId`/`tenantId`/`hoje`/`treinos30d` —
  nenhum desses vem da entidade `Atleta`/`PlanoMetaDados`, são parâmetros de query
  (`provaRepository.findProvasRealizadasRecentes`, já assim hoje).
- `paceLimiarAnterior` substitui `metaDados.getPaceLimiarEstimado()` — só o valor usado pelo log de
  outlier (`logSinalizacaoOutlierPace`, design.md v1 D5 herdado de `infer-threshold-from-race-result`),
  não a entidade inteira.
- Retorna `PaceLimiarResolvido` (record: `fonte`, `valor`, `confianca`) — puro, sem mutação, sem
  acessar nada gerenciado pelo JPA.

**`tenantId` sem carregar `Atleta`:** hoje só existe via `atleta.getAssessoria().getId()`. Nova
query de projeção, `AtletaRepository.findAssessoriaIdById(UUID atletaId): Optional<UUID>` — 1
método, sem carregar o agregado inteiro. `paceLimiarAnterior` vem de uma projeção equivalente em
`PlanoMetaDadosRepository` (`findPaceLimiarEstimadoByAtletaId`, ou reaproveitar
`buscarOuCriarMetadados` só pra leitura — decisão de implementação, sem impacto de design; ambas
são leituras baratas, indiferente pro objetivo desta change).

**Fase de aplicação (`aplicarPaceLimiar`) fica como estava** — recebe `PlanoMetaDados` (já
carregado dentro da transação, como hoje) e um `PaceLimiarResolvido`, seta os campos. Sem mudança
aqui: essa fase **precisa** estar dentro da transação (é a mutação que será persistida).

## D2 — Sem troca de bean, o entry point de `TsbServiceImpl` perde `@Transactional` no nível certo

**Achado #2 do pre-mortem:** não dá pra "encolher" a transação de um método simplesmente tirando
código de dentro dele se ele continua `@Transactional` — tudo que roda durante sua execução,
inclusive chamadas a outros beans, roda na mesma transação. A única forma real de excluir algo é o
método **público, anotado, chamado de fora** não envolver aquele trecho.

**Decisão:** os 3 pontos de entrada (`atualizarTsbDia` 2-arg `:68`, `recalcularDesde` `:80`, e o de
`:379`) **perdem `@Transactional` no próprio método** e passam a orquestrar:

```java
public void atualizarTsbDia(UUID atletaId, LocalDate data) {           // sem @Transactional
    PaceLimiarResolvido paceResolvido = resolverPaceSeNecessario(atletaId, data); // fora de tx
    tsbDiaPersister.atualizarDiaTransacional(atletaId, data, true, paceResolvido); // @Transactional, bean próprio
}
```

`resolverPaceSeNecessario` primeiro checa `thresholdInferenceService.isPaceLimiarDesatualizado`
(leitura simples, sem tx explícita — Spring Data já envolve cada chamada de repositório numa
transação curta própria, `SimpleJpaRepository` default) e só chama `resolverFontePace` se
`paceStale=true`; senão retorna `null`/`Optional.empty()` sem nenhuma query extra. Se
`findAssessoriaIdById` vier vazio (atleta sem assessoria — mesmo guard que
`AthleteThresholdUpdater.atualizarLimiares` já faz hoje, `:56-59`), `resolverPaceSeNecessario`
retorna vazio direto, sem chamar `resolverFontePace` — mesmo comportamento de hoje (log de warning
+ inferência ignorada), só que verificado antes em vez de dentro da transação.

**As 3 leituras que compõem `resolverPaceSeNecessario` (`isPaceLimiarDesatualizado`,
`findAssessoriaIdById`, `paceLimiarAnterior`) não são atômicas entre si** (achado #2 da 2ª rodada
de pre-mortem) — cada uma é uma transação curta própria do Spring Data, não uma foto única do
estado. Aceito: o único uso de `paceLimiarAnterior` é o **log** de outlier
(`logSinalizacaoOutlierPace`, cosmético/observabilidade), não a decisão de qual fonte vence —
mesmo se ele estiver 1 leitura "atrasado" em relação ao `paceStale` calculado, o pior caso é uma
mensagem de log com o delta levemente impreciso, nunca um valor persistido errado.

**Sem risco de ciclo de injeção (verificado, 2ª rodada de pre-mortem):** `AthleteThresholdUpdater`
depende só de `TreinoRealizadoRepository`/`ProvaRepository`/`ThresholdInferenceService` — nenhuma
dependência de volta pra `TsbServiceImpl`/`TsbDiaPersister`. `TsbRecalculoExecutor` depende só de
`MetricasDiariasRepository`/`CacheManager`/`MeterRegistry` — mesma coisa. `TsbDiaPersister` →
`AthleteThresholdUpdater` e `TsbServiceImpl` → `TsbDiaPersister` são as duas únicas arestas novas,
ambas unidirecionais.

**Sem auto-invocação:** a parte que precisa do proxy (`@Transactional`) migra para um **novo bean**
— `TsbDiaPersister` (`@Component`, mesmo padrão de `AthleteThresholdUpdater` já extraído de
`TsbServiceImpl` em `refactor-threshold-orchestration`) — com o método
`atualizarDiaTransacional(atletaId, data, atualizarMetaDadosHoje, PaceLimiarResolvido)` carregando
**o corpo que hoje é o método privado de 3 argumentos** (`buscarAtleta` → `buscarTreinosDia` → ...
→ `athleteThresholdUpdater.aplicarPaceLimiar(metaDados, paceResolvido)` → `save`).
`TsbServiceImpl` passa a **injetar** `TsbDiaPersister` e chamá-lo — chamada real entre beans via
proxy Spring, não `this.`, então `@Transactional` funciona.

**`recalcularDesde` (laço multi-dia):** mesma lógica — perde `@Transactional` no nível do método
público; o `resolverPaceSeNecessario` roda **uma vez, com `hoje=fim`** (o único dia que persiste,
`dia.equals(fim)`, não `data` nem cada iteração — precisão que a v1 deixou implícita e o pre-mortem
corretamente cobrou). O laço em si passa a chamar `tsbDiaPersister.atualizarDiaTransacional(...)`
por dia — **o bloco de `DIAS_POR_BLOCO` como fronteira transacional documentado em
`TsbServiceImpl.java:57-62` continua existindo**, só que agora é a fronteira do
`TsbRecalculoExecutor` (que já envolve o laço externamente, ver `TsbServiceImplTest`/
`TsbRecalculoExecutor` atual) — nenhuma mudança no comportamento de blocos, só em quem chama o quê.

**Correção sobre o "3º ponto de entrada":** o proposal original citava `:379` — na prática esse é
`processarDiasDescanso` (`TsbServiceImpl.java:379-395`), que só faz um laço chamando o
`atualizarTsbDia(UUID, LocalDate)` público em cada dia sem treino; corrigido automaticamente ao
corrigir esse método, sem trabalho extra. Já `recalcularHistoricoCompleto` (`:433`), que chama
`atualizarMetaDados` diretamente dentro de `tsbRecalculoExecutor.consolidar(...)`, fica **fora do
escopo** — ver D2b abaixo.

## D2b — `recalcularHistoricoCompleto` fica FORA do escopo (2ª rodada de pre-mortem, DeepSeek)

**Achado:** pré-resolver `paceResolvido` antes do passo 2 (`recalcularPeriodoComProgresso`, que
pode levar minutos) e só aplicá-lo na consolidação final introduz uma janela de staleness que
**não existe hoje** — se um sync concorrente do mesmo atleta gravar um `paceLimiarEstimado` novo
durante esse passo custoso, o valor pré-resolvido sobrescreveria dado mais recente na consolidação.
Comportamento atual resolve a fonte **dentro** da consolidação (o mais tarde possível), sem essa
janela.

**Decisão revisada: `recalcularHistoricoCompleto` NÃO é tocado por esta change.** Ele é
"operação custosa, usar apenas em caso de migração" (JavaDoc do método já existente) — não é o
caminho de alta frequência (por sync de treino) que motiva esta change inteira. Continua resolvendo
a fonte de pace **dentro** de `tsbRecalculoExecutor.consolidar(...)`, como hoje — quando
`use-best-effort-for-threshold-inference` chegar, a chamada externa aí dentro é rara (recálculo
histórico não roda por sync) e não tem o problema de segurar o pool sob carga real que motivou o
split desta change. Fica registrado como dívida aceita, não ignorada: se `recalcularHistoricoCompleto`
alguma vez passar a rodar com frequência real, revisitar.

**Consequência:** os "3 pontos de entrada" do proposal viram **2** que esta change realmente muda —
`atualizarTsbDia`/`recalcularDesde` (que convergem no mesmo `TsbDiaPersister`) — mais
`processarDiasDescanso`, que já era só um delegate do primeiro (corrigido de graça).

## D3 — FC não ganha a mesma separação (achado #4 do pre-mortem — YAGNI)

**v1 (derrubada):** "mesma simetria" pro FC, sem fonte externa nenhuma cogitada pra ele.
**v2:** FC continua exatamente como está — `AthleteThresholdUpdater.atualizarLimiares` só separa a
parte de **pace** em decisão/aplicação; a parte de FC (`inferirFcLimiar`, dentro do mesmo método
público) não muda. Sem 3ª fonte de FC no roadmap, dividir essa parte agora seria abstração sem uso
(mesmo racional de D1 do proposal — duplicar/expandir só até a 3ª ocorrência real).

## D4 — Sem mudança de comportamento observável, gate é regressão + teste estrutural

Critérios de aceite revisados (empurram pro tasks.md/proposal):
1. **Regressão de valor:** mesmos inputs → mesmo `paceLimiarEstimado`/`fonteLimiarPace`/
   `confiancaInferenciaPace` persistidos, nos 2 pontos de entrada em escopo (`atualizarTsbDia`,
   `recalcularDesde` — `recalcularHistoricoCompleto` fora, D2b; fixture com prova válida E fixture
   só-quintil pra cada um).
2. **Regressão estrutural:** teste com `@MockitoSpyBean`/`ArgumentCaptor` em `TsbDiaPersister`
   comprovando que `resolverFontePace`/`resolverPaceSeNecessario` roda e retorna **antes** de
   qualquer interação com `metricasDiariasRepository`/`planoMetaDadosRepository` — `InOrder`/spy
   real, não "parece certo".
3. **Ausência de `@Transactional` residual (novo, resolve achado #6 da 2ª rodada de pre-mortem):**
   teste de reflexão confirmando que `atualizarTsbDia(UUID, LocalDate)` e `recalcularDesde` não
   carregam mais `@Transactional` — o critério 2 (InOrder) sozinho não pegaria uma anotação
   esquecida que ainda envolvesse tudo na mesma transação apesar da reorganização de código.
4. `./mvnw clean verify` verde.

## Riscos e mitigações

- **Novo bean (`TsbDiaPersister`) é superfície nova** — mitigado por ser extração mecânica do
  método privado já existente, mesmo padrão já usado uma vez nesta área
  (`refactor-threshold-orchestration` extraiu `AthleteThresholdUpdater` da mesma forma).
- **Área sensível, já refatorada duas vezes agora** — mitigado por D4 (regressão de valor +
  regressão estrutural), e por manter o comentário existente sobre a fronteira de
  `DIAS_POR_BLOCO` intacto (D2, `recalcularDesde` não muda o que já era true lá).
- **Query de projeção nova (`findAssessoriaIdById`)** — baixo risco, leitura simples, mesmo padrão
  de outras projeções já existentes no repositório.
- **Rollback:** revert do PR único — sem migration, sem dado persistido em formato novo (o schema
  de `PlanoMetaDados`/`FonteLimiarInferencia` não muda nesta change). Reverter o código volta ao
  comportamento anterior sem nenhum passo de limpeza de dado.
