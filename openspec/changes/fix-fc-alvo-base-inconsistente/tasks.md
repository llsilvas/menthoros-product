# Tasks — fix-fc-alvo-base-inconsistente (S · Full · backend · 20 tasks + 1 decidida)

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
- [x] **3.2 Declarar a meta de intensidade no schema de etapa** — [CA7]
  - ⚠️ Achado que muda o quadro: `ritmoAlvo` é campo do **treino** (`plano-treino-prompt.txt:80`),
    não da etapa, e o schema de etapa só tem `fcAlvo`. Por isso `etapa.ritmoAlvo` nunca é preenchido
    em plano gerado, `pace` é sempre nulo e **100% das etapas caem no ramo de FC** — o quebrado. O
    ramo de pace é código morto no fluxo principal
  - Decidir: a etapa passa a declarar a meta (e opcionalmente aceitar ritmo por etapa), ou assume-se
    que etapa é sempre por FC e o ramo de pace é removido. **Não deixar código morto se passando por
    funcionalidade**

## 4. Testes que afirmam valor

- [x] **4.1 Substituir as asserções de string de unidade por valor absoluto** em
  `IntervalsIcuAdapterTest:117,133`
  - ⚠️ Afirmar `units == "bpm"` não prova nada sobre o número — foi por isso que a suíte não pegou
- [x] **4.2 Afirmar a igualdade com o `ZonaTreinoService`** e **fixar valores absolutos** — [CA2]
  - ⚠️ Só a igualdade não basta: se as duas pontas quebrarem juntas, o teste segue verde. Lição
    explícita do BUG-CONF-001

## 5. Verificação

- [x] **5.1** O teste de 1.1 passa a verde e a correção explica a diferença — [CA6]
- [x] **5.2 Guardrail de escopo:** `git diff develop -- '*ZonaTreinoService.java'` ⇒ **vazio**
- [ ] **5.3 Validar ponta a ponta com conta real** de intervals.icu: o bpm no relógio é o mesmo da
  tela do plano
  - ⚠️ Contrato externo. `units: "bpm"` já é emitido hoje (`IntervalsIcuAdapter:267`), então não é
    formato novo — mas confirmar contra a API real, não só contra teste
- [ ] **5.4** `./mvnw clean verify` verde

## Fora de escopo — abrir como change própria

- **Adotar o modelo %FCmax do Garmin** (50-60 / 60-70 / 70-80 / 80-90 / 90-100). Avaliado no refino e
  rejeitado: mudaria todas as faixas — Z2 de ~138-144 para 114-133 bpm num atleta de FCmax 190 —
  alterando a intensidade de toda prescrição existente. Decisão de produto, não correção de bug.
- **Sincronizar o perfil de FC do atleta para o intervals.icu.** Resolvido o push para absoluto, o
  perfil remoto deixa de importar neste fluxo.
- **Revisar as faixas do modelo de zonas.** Alinhar transporte ≠ redefinir zonas.
- **Pace.** Já trafega em `secs/km`, absoluto — não sofre do mesmo problema.
