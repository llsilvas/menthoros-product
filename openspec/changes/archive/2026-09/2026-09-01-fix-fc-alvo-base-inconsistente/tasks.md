# Tasks — fix-fc-alvo-base-inconsistente (S · Full · backend + front · 37 tasks)

> **Arquivada em 2026-09-01** com 35/37. As duas restantes (3c.5 e 5.3) são a mesma validação
> operacional com conta real do intervals.icu e ficam adiadas no Radar do SPRINTS.

> **Refinada em 2026-08-02:** escopo reduzido ao **formato de alvo** (padrão Garmin). O
> `ZonaTreinoService` **não é tocado** — nenhuma faixa muda. Diff em `ZonaTreinoService.java` é sinal
> de escopo estourado.
>
> **Anchors verificados em 2026-08-02** contra `develop` @ `fb58e0c`.
> Validação: `./mvnw clean verify` (é o gate; `test` não roda os `*IT`).

## 0. Discovery

- [x] **0.1 Números do caso real — MEDIDO em 2026-08-02** contra o banco de dev (`.env`,
  `192.168.15.24`), 633 etapas / 133 treinos planejados / 6 atletas.

  **A contradição do prompt é visível nos dados.** Das 629 etapas com alvo de FC:

  | Formato | Etapas | % | Origem |
  |---|---:|---:|---|
  | `NN-NN bpm` | 446 | 70,5% | seguiu a **instrução** do prompt ("use EXATAMENTE as zonas em bpm") |
  | `NN-NN% FCmax` | 183 | 28,9% | seguiu o **exemplo** do prompt |
  | vazio | 4 | 0,6% | — |
  | zona (`z1`–`z5`) | **0** | 0% | formato nunca usado |
  | não reconhecido | **0** | 0% | — |

  **Raio de alcance do bug: as 183 etapas percentuais** (28,9%). As 446 em bpm já trafegam absolutas
  e chegam certas.

  **A inflação é por atleta, não constante.** A previsão de "~18%" vinha de assumir LTHR ≈ 0,85 ×
  FCmax; a razão real varia:

  | Atleta (fmax / flim) | `60-70% FCmax` intenção → lido | Inflação |
  |---|---|---:|
  | 195 / 170 | 102 → 117 bpm | **+14,7%** |
  | 172 / 142 | 85 → 103 bpm | **+21,1%** |
  | 165 / 150 | 90 → 99 bpm | **+10,0%** |

  Direção confirmada, magnitude corrigida: **+10% a +21%**, conforme o LTHR/FCmax do atleta.

  - ⏳ **Ainda útil ter o caso concreto que você observou** para confirmar que é este o mecanismo, e
    não um quarto fator. Mas a hipótese já está sustentada por dado, não só por inferência.

- [x] **0.2 Comportamento sem FC medida — DECIDIDO em 2026-08-02: omitir a meta.**
  **Medido:** **165 das 629** etapas com alvo de FC (26%) pertencem a atletas **sem `fc_limiar`** — 3
  dos 6 atletas não têm FC cadastrada. Não é caso de borda: é um quarto da base. Reforça o CA10 — se
  essas etapas passarem a ir sem meta silenciosamente, o treinador perde a prescrição em 26% dos casos
  sem saber.
  "Sem objetivo" é prescrição que o treinador já pode fazer deliberadamente, então cair nela por
  falta de dado usa um estado que o produto suporta, em vez de criar caminho de exceção. O fallback
  etário (`220 - idade`) erra dezenas de bpm e não vira meta que o atleta persegue — [CA3]

- [x] **0.3 ONDE o treinador é avisado — DECIDIDO em 2026-08-20: no status do push.** O treino
  conclui em `SINCRONIZADO_PARCIAL` com o motivo em `erroSincronizacao` — [CA10]
  - ⚠️ No payload, "treinador escolheu sem objetivo" e "prescrição descartada" são **idênticos**: etapa
    sem meta. Sem aviso, o treinador prescreve uma zona, o atleta recebe treino livre, e nada na tela
    diferencia isso de uma decisão dele
  - **Por que o status e não a tela do plano:** `StatusSincronizacao.SINCRONIZADO_PARCIAL` e o campo
    `TreinoPlanejado.erroSincronizacao` **já existem** e já são lidos pelo front. Marcar por etapa no
    DTO do plano exigiria campo novo + front, subindo a change de S para M e invadindo o escopo que a
    proposal empurrou de propósito para `coach-meta-intensidade-editor`
  - Granularidade aceita: o aviso é **por treino**, não por etapa. O treinador sabe que aquele treino
    saiu com prescrição descartada e por quê; qual etapa exatamente fica para a change do editor

## 1. Rede de segurança

- [x] **1.1 Teste que reproduz o bug** — alvo prescrito para uma zona, bpm enviado bem acima — [CA6]
  - ⚠️ Deve **falhar** antes da correção. Se passar de primeira, não está reproduzindo o defeito
- [x] **1.2 Caracterizar o payload atual** dos três caminhos (`BPM`, `PERCENT`, `ZONE`), para provar
  depois que só o pretendido mudou
  - `verify:` `./mvnw clean verify` verde antes de alterar `src/main`

## 2. Resolver para bpm absoluto

- [x] **2.1 Resolver `HrTarget` para bpm no `IntervalsIcuWorkoutConverter`**, usando o atleta — [CA1]
  - ⚠️ No converter, **não** no adapter: o adapter não tem referência a `Atleta` e seu papel é
    traduzir modelo canônico → JSON
  - Consequência: `HrTarget` chega ao adapter sempre em `BPM`; `PERCENT`/`ZONE` viram representação
    intermediária do parser e não atravessam mais a fronteira
- [x] **2.2 Zona resolve reusando `ZonaTreinoService.calcularZonas`** — a zona N vira o
  `fcMin`–`fcMax` da zona N — [CA2]
  - ⚠️ **Não reimplementar a conta.** Reimplementar a mesma grandeza em dois lugares é exatamente
    como o BUG-CONF-001 nasceu
- [x] **2.3 Percentual legado** (`"90-95% FCmax"` já gravado em `fcAlvoEtapa`): interpretar na base do
  domínio (%LTHR) e **registrar a interpretação** — [CA5]
  - ⚠️ Não reinterpretar em silêncio: o mesmo texto passa a significar outro bpm
- [x] **2.4 Remover a emissão de `%hr` e `hr_zone`** do `IntervalsIcuAdapter:272,277` — [CA1]
  - `verify:` nenhum alvo relativo trafega; `grep` por `"%hr"`/`"hr_zone"` em `src/main` ⇒ 0

## 2b. Meta de intensidade explícita

- [x] **2b.1 Tornar a meta de intensidade uma escolha declarada** no `WorkoutStep`: sem meta, ritmo ou
  FC — em vez de dois campos opcionais resolvidos por precedência — [CA7]
  - ✅ **Validado na UI do Garmin (2026-08-02):** "Meta de intensidade → Tipo" é dropdown de escolha
    única (`Sem objetivo` · `Ritmo` · `Cadência` · `Zona de frequência cardíaca` ·
    `Frequência cardíaca personalizada` · `Zona de potência` · `Potência personalizada`). O produto
    que integramos modela como escolha; nosso modelo diverge disso
  - ⚠️ Hoje a exclusividade vem de um `if/else` no converter (`:222-228`), enquanto
    `IntervalsIcuAdapter:243-249` emitiria **os dois** se os dois viessem. Nada estrutural impede;
    uma mudança futura no converter vaza direto para o payload
  - Usar o vocabulário do produto nos nomes: "meta de intensidade", "sem objetivo"
- [x] **2b.2 Etapa prescrita por FC mantém a FC como meta**, mesmo havendo ritmo informado — [CA8]
  - ⚠️ Hoje `pace` ganha sempre e a FC é rebaixada a texto por `anexarFc`: o atleta lê `"(140-150
    bpm)"` na descrição e o relógio não controla nada. Para uma etapa prescrita por FC, é perder em
    silêncio o que o treinador pediu
- [x] **2b.3 "Sem objetivo" como escolha de primeira classe** — o treinador pode não informar meta, e
  o treino vai sem meta. É prescrição válida, não falha; nunca substituir por meta inventada — [CA9]
- [x] **2b.4 Distinguir os dois caminhos até "sem objetivo"** — [CA10]
  - ⚠️ No payload são idênticos. "Treinador escolheu não prescrever" e "prescrição do treinador foi
    descartada por falta de dado" são opostos, e sem sinalização o segundo se disfarça do primeiro
  - `verify:` existe teste para os dois casos, afirmando que o **aviso** só ocorre no segundo

## 3. Prompt coerente

- [x] **3.1 Alinhar o prompt** — entregar bpm e exigir bpm na saída; remover o exemplo
  `"90-95% FCmax"` de `plano-treino-prompt.txt:34-45` — [CA4]
  - ⚠️ Hoje o prompt entrega bpm (`PlanoTreinoPromptBuilder:503`) e proíbe inventar valores (`:493`),
    mas exemplifica percentual. Modelo segue exemplo — é a origem do rótulo ambíguo
  - Conferir **os dois** prompts: `plano-treino-prompt.txt` e `plano-treino-otimizado-claude.txt`
- [x] **3.2 Declarar a meta de intensidade no schema de etapa — DECIDIDO em 2026-08-21: o ramo de
  pace fica.** O `fcAlvoEtapa` ganhou `pattern` de bpm e os dois prompts passaram a exigir bpm — [CA7]
  - ❌ **A premissa desta task estava errada, e a verificação do código a refutou.** Ela dizia que
    `ritmoAlvo` é campo só do treino e que o ramo de pace é código morto. Isso vale para o
    `plano-treino-prompt.txt`, mas **não é o prompt que manda**: o schema de structured output é
    construído em código e **exige `ritmoAlvo` por etapa** (`IaServiceImpl:243-250`, nullable, com
    `pattern` `m:ss-m:ss/km`), desde `22716ba` (2026-04-30). `TreinoMapper.toEntity` é MapStruct e
    mapeia o campo por nome. **O planner prescreve ritmo por etapa e o banco persiste.**
  - Remover o ramo teria apagado funcionalidade viva. A spec o teria mandado remover.
  - Confirmado com o founder em 2026-08-21: **os campos da etapa ficam a critério do treinador** —
    ele prescreve uma etapa por ritmo ou por FC

## 3b. Ritmo por etapa deixa de ser apagado na edição

> Aberta em 2026-08-21, durante a 3.2: se o planner prescreve ritmo por etapa, era preciso ver o que
> a edição fazia com ele. Fazia sumir.

- [x] **3b.1 `ritmoAlvo` no `EtapaInputDto`** — o PATCH limpa as etapas e as reconstrói a partir
  dele, então campo ausente do DTO nascia nulo: **editar qualquer coisa no treino apagava o ritmo de
  todas as etapas**, sem erro e sem aviso
  - **Terceira ocorrência do mesmo defeito no mesmo método**, depois de `blocoId`
    (`preservar-serie-estruturada-na-edicao`) e de `descricaoEtapa`. O padrão é estrutural: enquanto
    o payload de entrada for um subconjunto do que a entidade guarda, haverá um quarto campo
  - Provado por sonda antes de corrigir: `EtapaMapper.toEntity(EtapaInputDto)` devolvia
    `ritmoAlvo = null`
- [x] **3b.2 `comRepeticoes()` copia o campo** — segundo vazamento, no mesmo método: sem isso a
  expansão de um `BLOCO` perdia o ritmo em cada cópia da série, mesmo com o DTO de entrada carregando
- [x] **3b.3 Front devolve o ritmo no patch** — `etapaItem.ts` (modelo, serialização, hidratação).
  Corrigir só o backend não pararia a perda: o editor não devolvia o valor. Viaja intacto, como
  `descricaoEtapa`; o seletor de objetivo é escopo de `coach-meta-intensidade-editor`
- [x] **3b.4 Assinatura da série inclui o ritmo** — espelha `etapasEquivalentes` no backend. Sem
  isso um progressivo (mesma duração, ritmo caindo) viraria uma série que ninguém prescreveu
- [x] **3b.5 `EtapaMapperTest`** prende os campos que a edição precisa preservar — era o teste que
  faltava para o defeito aparecer sozinho
- [x] **3b.6 E2E** (`plan-review-edicao.spec.ts`): editar as repetições e salvar mantém o ritmo no
  payload do PATCH

## 3c. Contrato do alvo — investigado contra fonte primária (2026-08-21)

> FIT SDK 21.171.00 (`Profile.xlsx`), cookbook oficial da Garmin, OpenAPI + código do intervals.icu,
> posts do criador no fórum. Investigado a pedido do founder, depois da 3b.

- [x] **3c.1 A premissa da change está confirmada por fonte primária.** O tipo `workout_hr` do FIT:
  `0 - 100 indicates % of max hr; >100 indicates bpm (255 max) plus 100`. O canal relativo é
  **%FCmax por definição do formato** — não havia percentual correto a enviar
- [x] **3c.2 "Sem objetivo" é `target_type = open` (=2)** — valor nomeado no enum `wkt_step_target`,
  o que sustenta o CA9. No FIT **não existe alvo "pace"**: é `speed`, em m/s × 1000
- [x] **3c.3 CA8 revisto à luz do contrato real — DECISÃO DO FOUNDER (2026-08-22): mantido.**
  - **O intervals.icu guarda os três alvos e escolhe na execução.** O criador: *"Any step can have
    power, HR and pace targets but you need to choose one of power/HR/pace when executing"*. O evento
    tem `target: AUTO | POWER | HR | PACE` (confirmado no OpenAPI)
  - Consequência: a regra implementada (FC vence, ritmo desce para o texto) **descarta informação que
    o canal aceitaria**. O desenho que o provedor modela é emitir os dois e **declarar** qual manda
  - O FIT também tem alvo secundário (`secondary_target_*`, campos 19-22), então "não são
    acumuláveis" — afirmação do `design.md` — está desatualizado. Suporte é por dispositivo
  - **Decisão: o CA8 fica como foi implementado e mergeado** — a FC permanece a meta única e o ritmo
    desce para o texto. Emitir os dois alvos e declarar `target: HR` é o desenho que o provedor
    modela, mas **contradiz o CA7** ("exatamente uma meta"), que teria de ser reescrito, e só se
    verifica contra conta real — a mesma validação que a 5.3 ainda deve. Reabrir uma change já
    mergeada para isso custaria branch, PR e revalidação, sem fechar a incerteza
  - **Follow-up registrado no Radar do SPRINTS:** emitir FC + ritmo com o alvo executado declarado
- [x] **3c.4 O intervals.icu aceita `%lthr`** — a chave `hr` aceita `%hr`, `%lthr`, `hr_zone`, `bpm`.
  Existe canal relativo com a base do domínio, ao contrário do que a proposal afirmava. **Não muda a
  decisão:** seria resolvido contra o LTHR do perfil remoto, que o Menthoros não escreve — a mesma
  delegação que condenou o `hr_zone`. Continuamos certos, por um motivo mais forte
- [ ] **3c.5 ADIADA (2026-09-01, arquivamento) — NÃO confirmado: como o intervals.icu converte
  `workout_doc` → FIT no download.** Fecha junto com a 5.3, no Radar do SPRINTS. Sem
  fonte. Há um bug report de usuário (2026-08-21) alegando que `hr_zone` sai como custom errado e que
  `%pace` vira `OPEN` — **não verificado e contestado no próprio tópico**. Reforça a 5.3: só a
  validação com conta real fecha isso

## 4. Testes que afirmam valor

- [x] **4.1 Substituir as asserções de string de unidade por valor absoluto** em
  `IntervalsIcuAdapterTest:117,133`
  - ⚠️ Afirmar `units == "bpm"` não prova nada sobre o número — foi por isso que a suíte não pegou
- [x] **4.2 Afirmar a igualdade com o `ZonaTreinoService`** e **fixar valores absolutos** — [CA2]
  - ⚠️ Só a igualdade não basta: se as duas pontas quebrarem juntas, o teste segue verde. Lição
    explícita do BUG-CONF-001

## 4b. QA — gate de 2026-08-21

> 4 reviewers Claude (backend: convenções, segurança, design; frontend) + 2 passes do Codex
> (review + adversarial). Builds verdes nos dois repos.

- [x] **4b.1 CRITICAL corrigido — o aviso contradizia o payload.** Quando a FC era descartada
  (atleta sem `fcLimiar`) **e** a etapa tinha ritmo, o ritmo virava a meta, mas o treino era marcado
  `SINCRONIZADO_PARCIAL` dizendo "etapa sem meta". O treinador lia que o relógio não controlava nada,
  e ele estava controlando ritmo — [CA10]
  - **Alcance real:** 26% das etapas com alvo de FC são de atletas sem `fcLimiar` (task 0.2) e o
    planner prescreve ritmo por etapa (task 3.2). Não era caso de borda
  - **Divergência cross-model, resolvida por experimento.** Codex BLOQUEOU; o `code-reviewer` do
    Claude classificou o mesmo trecho como Minor e escreveu "usa o pace como meta — o que é correto".
    Reproduzi com sonda antes de decidir: `metaFcDescartada=true` com `meta=PaceTarget[240,250]`.
    Os dois tinham razão em metade — cair no ritmo é defensável, **o defeito era o aviso mentir**
  - **Decisão do founder: manter o ritmo como meta e corrigir o aviso.** O ritmo também é prescrição
    do treinador; entregar a etapa em outra grandeza é melhor que entregá-la livre
  - A conversão passa a distinguir `fcDescartadaSemMeta` de `fcDescartadaComRitmo`, e o motivo
    gravado diz qual dos dois — ou os dois, quando o treino tem etapas nos dois desfechos
  - A FC descartada passa a ser anexada ao texto da etapa: sem isso o treinador não sabe qual meta
    se perdeu (achado do `code-reviewer`)
- [x] **4b.2 `AtomicBoolean` → `DescartesFc`** — nunca houve concorrência no converter, e o tipo
  sugeria uma preocupação inexistente (achado do `clean-code-reviewer`)
- [x] **4b.3 Log da reinterpretação desce para `debug`** — carrega FC de limiar e bpm, dado
  fisiológico que não deve ficar em nível de rotina. **Convergência**: apontado independentemente
  pelo `security-reviewer` e pelo `code-reviewer`
- [x] **4b.4 Reinterpretação do legado sem versionamento — aceito conscientemente** — o Codex
  adversarial classificou como
  ERRADA: reenviar o mesmo treino em datas diferentes pode gerar bpm diferente por mudança de regra,
  não por mudança do atleta. O log registra o efeito, não a intenção. **Não corrigido** — exigiria
  versionar a interpretação ou campo normalizado separado, o que é mudança de schema
  - **Decisão do founder (2026-08-22):** aceito nesta change, registrado no Radar do SPRINTS como
    candidato próprio — versionar a interpretação é mudança de schema e merece change dedicada
- [x] **4b.5 Granularidade do aviso é por treino, não por etapa — aceito conscientemente** — 1 de
  10 etapas perdidas produz o
  mesmo sinal que 10 de 10. Aceito conscientemente na decisão 0.3; o adversarial reforça que o sinal
  mede **existência** do dano, não tamanho nem localização
  - **Decisão do founder (2026-08-22):** aceito nesta change, registrado no Radar do SPRINTS
- Minor não corrigidos, por escopo: `case BPM -> throw` inalcançável no resolver;
  `calcularZonasFC` recebendo parâmetro que o serviço ignora; `ritmoAlvo` sem `@Pattern` (mesmo
  padrão pré-existente do `fcAlvoEtapa`); assinatura de série concatenando texto livre sem escape no
  front; falta teste explícito de treino legado sem `ritmoAlvo` agrupando como série

## 5. Verificação

- [x] **5.1** O teste de 1.1 passa a verde e a correção explica a diferença — [CA6]
- [x] **5.2 Guardrail de escopo:** `git diff develop -- '*ZonaTreinoService.java'` ⇒ **vazio**
- [ ] **5.3 ADIADA (2026-09-01, arquivamento) — Validar ponta a ponta com conta real** de
  intervals.icu: o bpm no relógio é o mesmo da tela do plano. Decisão do founder: arquivar com a
  validação operacional pendente, registrada no Radar do SPRINTS para ser feita junto com o teste
  real do `convite-assessorias-fundadoras` (5.1), que já exige conta real
  - ⚠️ Contrato externo. `units: "bpm"` já é emitido hoje (`IntervalsIcuAdapter:267`), então não é
    formato novo — mas confirmar contra a API real, não só contra teste
- [x] **5.4** `./mvnw clean verify` verde — rodado em `develop` **depois** do merge dos PRs #75
  (backend) e #84 (front), em 2026-08-22: **2660 unitários + 113 de integração, zero falha**

## Fora de escopo — abrir como change própria

- **Adotar o modelo %FCmax do Garmin** (50-60 / 60-70 / 70-80 / 80-90 / 90-100). Avaliado no refino e
  rejeitado: mudaria todas as faixas — Z2 de ~138-144 para 114-133 bpm num atleta de FCmax 190 —
  alterando a intensidade de toda prescrição existente. Decisão de produto, não correção de bug.
- **Sincronizar o perfil de FC do atleta para o intervals.icu.** Resolvido o push para absoluto, o
  perfil remoto deixa de importar neste fluxo.
- **Revisar as faixas do modelo de zonas.** Alinhar transporte ≠ redefinir zonas.
- **Pace.** Já trafega em `secs/km`, absoluto — não sofre do mesmo problema.
