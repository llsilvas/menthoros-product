# Tasks — fix-fc-alvo-base-inconsistente (S · Full · backend · 12 tasks)

> **Refinada em 2026-08-02:** escopo reduzido ao **formato de alvo** (padrão Garmin). O
> `ZonaTreinoService` **não é tocado** — nenhuma faixa muda. Diff em `ZonaTreinoService.java` é sinal
> de escopo estourado.
>
> **Anchors verificados em 2026-08-02** contra `develop` @ `fb58e0c`.
> Validação: `./mvnw clean verify` (é o gate; `test` não roda os `*IT`).

## 0. Discovery

- [ ] **0.1 Obter os números do caso real:** alvo prescrito na etapa (texto), bpm exibido no relógio,
  `fcMaxima` e `fcLimiar` do atleta
  - `verify:` a inflação observada bate com os ~18% previstos (base LTHR lida como FCmax)? Se bater,
    é confirmação; se não, há outra coisa e a hipótese precisa ser revista **antes** de codificar
  - ⚠️ Separar o que foi **observado** do que foi **inferido** no registro final

- [ ] **0.2 Decidir o comportamento sem FC medida** — omitir o alvo ou usar o fallback etário — [CA3]
  - ⚠️ Decisão de produto: muda o que o atleta vê. Recomendação do `design.md`: **omitir**, porque
    alvo errado induz a treinar na intensidade errada acreditando estar certo
  - `verify:` decisão confirmada e registrada

## 1. Rede de segurança

- [ ] **1.1 Teste que reproduz o bug** — alvo prescrito para uma zona, bpm enviado bem acima — [CA6]
  - ⚠️ Deve **falhar** antes da correção. Se passar de primeira, não está reproduzindo o defeito
- [ ] **1.2 Caracterizar o payload atual** dos três caminhos (`BPM`, `PERCENT`, `ZONE`), para provar
  depois que só o pretendido mudou
  - `verify:` `./mvnw clean verify` verde antes de alterar `src/main`

## 2. Resolver para bpm absoluto

- [ ] **2.1 Resolver `HrTarget` para bpm no `IntervalsIcuWorkoutConverter`**, usando o atleta — [CA1]
  - ⚠️ No converter, **não** no adapter: o adapter não tem referência a `Atleta` e seu papel é
    traduzir modelo canônico → JSON
  - Consequência: `HrTarget` chega ao adapter sempre em `BPM`; `PERCENT`/`ZONE` viram representação
    intermediária do parser e não atravessam mais a fronteira
- [ ] **2.2 Zona resolve reusando `ZonaTreinoService.calcularZonas`** — a zona N vira o
  `fcMin`–`fcMax` da zona N — [CA2]
  - ⚠️ **Não reimplementar a conta.** Reimplementar a mesma grandeza em dois lugares é exatamente
    como o BUG-CONF-001 nasceu
- [ ] **2.3 Percentual legado** (`"90-95% FCmax"` já gravado em `fcAlvoEtapa`): interpretar na base do
  domínio (%LTHR) e **registrar a interpretação** — [CA5]
  - ⚠️ Não reinterpretar em silêncio: o mesmo texto passa a significar outro bpm
- [ ] **2.4 Remover a emissão de `%hr` e `hr_zone`** do `IntervalsIcuAdapter:272,277` — [CA1]
  - `verify:` nenhum alvo relativo trafega; `grep` por `"%hr"`/`"hr_zone"` em `src/main` ⇒ 0

## 3. Prompt coerente

- [ ] **3.1 Alinhar o prompt** — entregar bpm e exigir bpm na saída; remover o exemplo
  `"90-95% FCmax"` de `plano-treino-prompt.txt:34-45` — [CA4]
  - ⚠️ Hoje o prompt entrega bpm (`PlanoTreinoPromptBuilder:503`) e proíbe inventar valores (`:493`),
    mas exemplifica percentual. Modelo segue exemplo — é a origem do rótulo ambíguo
  - Conferir **os dois** prompts: `plano-treino-prompt.txt` e `plano-treino-otimizado-claude.txt`

## 4. Testes que afirmam valor

- [ ] **4.1 Substituir as asserções de string de unidade por valor absoluto** em
  `IntervalsIcuAdapterTest:117,133`
  - ⚠️ Afirmar `units == "bpm"` não prova nada sobre o número — foi por isso que a suíte não pegou
- [ ] **4.2 Afirmar a igualdade com o `ZonaTreinoService`** e **fixar valores absolutos** — [CA2]
  - ⚠️ Só a igualdade não basta: se as duas pontas quebrarem juntas, o teste segue verde. Lição
    explícita do BUG-CONF-001

## 5. Verificação

- [ ] **5.1** O teste de 1.1 passa a verde e a correção explica a diferença — [CA6]
- [ ] **5.2 Guardrail de escopo:** `git diff develop -- '*ZonaTreinoService.java'` ⇒ **vazio**
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
