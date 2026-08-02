# Tasks — fix-fc-alvo-base-inconsistente (M · Full · backend · 14 tasks)

> **Anchors verificados em 2026-08-02** contra `develop` @ `fb58e0c`.
>
> Validação: `./mvnw clean verify` (é o gate; `test` não roda os `*IT`).

## 0. Discovery — responder antes de escrever código

- [ ] **0.1 Obter os números do caso real** relatado: alvo prescrito na etapa (texto), bpm exibido no
  relógio, `fcMaxima` e `fcLimiar` do atleta no Menthoros
  - ⚠️ Sem isso, corrige-se três camadas por precaução sem saber qual disparou. Com isso, dá para
    dizer **o que foi observado** e separar do **que foi inferido**
  - `verify:` a conta fecha com uma das camadas — ex. inflação ≈18% aponta base LTHR lida como FCmax

- [ ] **0.2 Confirmar a base do `%hr` no intervals.icu** — documentação ou teste contra a API real
  - ⚠️ **Hoje é inferência**, não fato verificado. A correção escolhida (resolver para bpm) não
    depende da resposta, mas a **descrição do defeito** depende. Não afirmar na doc o que não foi
    verificado
  - `verify:` fonte citada (doc oficial ou resposta da API), anexada à task

- [ ] **0.3 Decidir a base canônica do domínio** — `%LTHR` (o que o `ZonaTreinoService` já faz) ou
  `%FCmax`. Uma só, nomeada em código
  - Recomendação do `design.md`: `%LTHR`, alinhando o resto ao que já existe
  - `verify:` decisão registrada com o motivo; nenhum ponto do pipeline usando a outra

- [ ] **0.4 Decidir o comportamento sem dado de FC medido** — omitir o alvo ou usar o fallback por
  idade — [CA3]
  - ⚠️ Muda o que o atleta vê; decisão de produto, não técnica. Recomendação do `design.md`: **omitir**,
    porque alvo errado induz o atleta a treinar na intensidade errada acreditando estar certo
  - `verify:` decisão confirmada com o produto

## 1. Rede de segurança antes de mexer

- [ ] **1.1 Teste que reproduz o bug** — alvo prescrito para uma zona, bpm enviado bem acima — [CA6]
  - ⚠️ Deve **falhar** antes da correção. Se passar de primeira, não está reproduzindo o defeito
  - `verify:` red, por divergência numérica

- [ ] **1.2 Caracterizar o payload atual** dos três caminhos (`BPM`, `PERCENT`, `ZONE`) para provar
  depois que só o pretendido mudou
  - `verify:` `./mvnw clean verify` verde antes de qualquer alteração em `src/main`

## 2. Base única

- [ ] **2.1 Alinhar o prompt** — entrega bpm e exige bpm na saída; remover o exemplo em
  `"% FCmax"` de `plano-treino-prompt.txt:34-45` — [CA4]
  - ⚠️ Hoje o prompt entrega bpm absoluto (`PlanoTreinoPromptBuilder:503`) e proíbe inventar valores
    (`:493`), mas exemplifica percentual. Modelo segue exemplo — é a origem do rótulo ambíguo
  - Conferir os dois prompts: `plano-treino-prompt.txt` e `plano-treino-otimizado-claude.txt`
- [ ] **2.2 Nomear a base no código.** Se `HrTarget.PERCENT` sobreviver como representação
  intermediária, o javadoc precisa dizer percentual **de quê** — hoje diz "percentual de FC máxima",
  que contradiz o `ZonaTreinoService`
- [ ] **2.3 Tratamento do legado:** `fcAlvoEtapa` já gravado como `"90-95% FCmax"` — interpretar na
  base decidida e registrar a interpretação — [CA5]
  - ⚠️ Não reinterpretar em silêncio: o mesmo texto passa a significar outro bpm

## 3. Resolver para absoluto antes de enviar

- [ ] **3.1 Resolver `HrTarget` para bpm no `IntervalsIcuWorkoutConverter`**, usando `fcLimiar` do
  atleta — [CA1]
  - ⚠️ Preferir o converter ao adapter: o adapter hoje **não tem acesso ao `Atleta`** e seu papel é
    traduzir modelo canônico → JSON. Levar o atleta até lá misturaria as responsabilidades
  - Consequência: o adapter passa a receber `HrTarget` sempre em `BPM`
- [ ] **3.2 Afirmar a igualdade com o `ZonaTreinoService`** — o bpm enviado para a zona N coincide com
  a faixa que o serviço calcula para a zona N — [CA2]
  - ⚠️ É a costura que quebrou: duas partes derivando bpm da mesma zona sem nada afirmando que
    concordam. Só a igualdade não basta — fixar também valores absolutos, senão as duas quebram juntas
    e o teste segue verde (lição do BUG-CONF-001)
- [ ] **3.3 Substituir as asserções de string de unidade por valor absoluto** em
  `IntervalsIcuAdapterTest:117,133`
  - ⚠️ Afirmar `units == "bpm"` não prova nada sobre o número. Foi por isso que a suíte não pegou

## 4. Verificação

- [ ] **4.1** O teste de 1.1 passa a verde, e a correção explica a diferença — [CA6]
- [ ] **4.2 Validar ponta a ponta com conta real** de intervals.icu: o bpm no relógio é o mesmo da
  tela do plano
  - ⚠️ É contrato externo. O canal foi validado em 2026-07-14; a mudança de payload
    (relativo → absoluto) precisa ser confirmada contra a API real, não só contra teste
- [ ] **4.3** `./mvnw clean verify` verde

## Fora de escopo — abrir como change própria

- **Sincronizar o perfil de FC do atleta para o intervals.icu.** Resolvido o push para absoluto, o
  perfil remoto deixa de importar neste fluxo.
- **Revisar as faixas do modelo de zonas** (75–85%, 85–89%, …). Esta change alinha bases, não
  redefine zonas.
- **Pace.** Já trafega em `secs/km`, absoluto — não sofre do mesmo problema.
