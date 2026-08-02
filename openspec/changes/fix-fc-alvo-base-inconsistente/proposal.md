# fix-fc-alvo-base-inconsistente — FC do treino enviado ao relógio sai acima do prescrito

**Tamanho:** M · **Trilha:** Full
**Status:** proposta
**Criado:** 2026-08-02

> Origem: bug relatado em 2026-08-02 — ao enviar o treino para o relógio, a frequência cardíaca
> apareceu **bem acima** da especificada no treino planejado.

## Why

O número de FC que o atleta vê no relógio não é o número que o treinador prescreveu. Isso não é
cosmético: é a variável que governa a intensidade do treino. Um atleta perseguindo uma FC alta demais
executa em zona errada — o treino fácil vira moderado, o moderado vira limiar, e a carga real diverge
do plano de forma invisível para o treinador.

O levantamento em 2026-08-02 encontrou **três camadas** de confusão de base, empilhadas. Cada uma
sozinha já produz o sintoma relatado.

### Camada 1 — o prompt se contradiz

`PlanoTreinoPromptBuilder:503` entrega ao LLM as zonas em **bpm absoluto**:

```
- Z2 (Aeróbico): 137-143 bpm
```

com a instrução explícita (`:493`) *"Use EXATAMENTE as zonas de FC listadas abaixo. NÃO invente
outros valores de BPM."*

Mas o **exemplo de saída** no mesmo prompt (`plano-treino-prompt.txt:34-45`) demonstra outro formato:

```json
{ "fcAlvo": "90-95% FCmax" }
```

Entrega-se bpm e proíbe-se inventar; em seguida exemplifica-se percentual. Modelo segue exemplo.

### Camada 2 — "% FCmax" não é a base do modelo de zonas

`ZonaTreinoService:89-90` é explícito: as zonas de FC são calculadas com **`fcLimiar` (LTHR) como
base em todas**, e *"o parâmetro `fcMaxima` é mantido para compatibilidade de chamada, mas **não é
usado**"*. As faixas são 75–85% do LTHR para Z1, 85–89% para Z2, até 100–106% para Z5.

Ou seja: internamente o Menthoros raciocina em **%LTHR**, e o rótulo que sai do planner diz
**"% FCmax"**. Como LTHR ≈ 85% da FCmax, tratar um número de base-LTHR como se fosse base-FCmax
**infla o resultado em torno de 18%** — na direção exata do sintoma relatado.

### Camada 3 — o alvo relativo é resolvido por um perfil que não controlamos

`IntervalsIcuAdapter.montarHr:264` envia alvo **relativo**, nunca absoluto:

- percentual → `units: "%hr"` com os números crus
- zona → `units: "hr_zone"` com o número da zona

Quem converte para bpm é o intervals.icu, usando o perfil do atleta **armazenado lá**. E o
`IntervalsIcuClientImpl` só **lê** `/api/v1/athlete/0` (`:44`) e escreve *eventos* (`:67`, `:83`) —
**nunca grava** FC máxima, limiar ou zonas. O Menthoros conhece `fcMaxima` e `fcLimiar`
(`Atleta:209`, `:235`) e não os envia. O relógio exibe o que o intervals.icu derivar da configuração
dele, que pode ser default, vazia ou editada por terceiros.

### Por que os testes não pegaram

`IntervalsIcuAdapterTest:117,133` afirmam apenas que a **string da unidade** trafega (`"bpm"`,
`"hr_zone"`). Nenhum teste afirma um **bpm absoluto**. A suíte valida o formato do payload, não que o
número significa o que o plano quis dizer — é estruturalmente incapaz de detectar erro de base.

> É a mesma classe de defeito do BUG-CONF-001 (`fix-tss-planejado-divergente`): duas expressões da
> mesma grandeza convivendo com bases diferentes, cada uma correta isoladamente.

## What Changes

1. **Uma base única e declarada para FC em todo o pipeline.** Escolher `%LTHR` (o que o
   `ZonaTreinoService` já faz) e eliminar o rótulo `FCmax` do planner, ou o inverso — mas uma só,
   nomeada no código e no prompt.
2. **O push resolve para bpm absoluto antes de enviar.** O adapter passa a emitir `units: "bpm"` com
   valores calculados no Menthoros a partir de `fcLimiar`/`fcMaxima` do atleta. Isso remove a
   dependência do perfil remoto.
3. **Prompt coerente:** entrega bpm e exige bpm na saída, sem exemplo em percentual.
4. **Testes que afirmam valor absoluto**, não string de unidade — incluindo o caso que reproduz o bug
   relatado.

## Capabilities

Nenhuma capability nova. Corrige o comportamento de uma existente (envio de treino estruturado ao
relógio via intervals.icu).

## Impact

- **Backend apenas.** `IntervalsIcuAdapter`, `IntervalsIcuWorkoutConverter`, o pipeline de push (que
  precisa passar a ter acesso ao `Atleta`), o prompt e o parser.
- **O payload enviado ao intervals.icu muda de forma** (relativo → absoluto). É contrato externo:
  validar contra a API real antes de considerar fechado.
- **Sem mudança de schema.** Os dados necessários já existem em `Atleta`.
- **Planos já gerados** continuam com o rótulo antigo em `fcAlvoEtapa`. A resolução no push precisa
  lidar com o texto legado — ver Open Questions.

## Critérios de aceite

- **CA1** — Dado um treino planejado com alvo de FC e um atleta com `fcLimiar` conhecido, quando o
  treino é enviado, então o payload leva **bpm absoluto**, e o valor corresponde ao que o plano
  prescreveu para aquela zona.
- **CA2** — Dado o mesmo treino, quando se compara o bpm enviado com a faixa que o
  `ZonaTreinoService` calcula para aquela zona, então **coincidem**. Hoje não há nada afirmando essa
  igualdade, e é exatamente a costura que quebrou.
- **CA3** — Dado um atleta **sem** `fcLimiar` e sem `fcMaxima` cadastrados, quando o treino é enviado,
  então o comportamento é explícito e seguro — nunca um bpm inventado. Ver Open Questions: omitir o
  alvo é preferível a enviar um palpite, porque um alvo errado é pior que nenhum.
- **CA4** — Dado o prompt de geração de plano, quando o LLM responde, então o formato de `fcAlvo` é
  **um só** e coerente com o que o prompt entrega. O exemplo e a instrução não podem discordar.
- **CA5** — Dado um `fcAlvoEtapa` legado no formato `"90-95% FCmax"`, quando o treino é enviado,
  então é interpretado na base decidida e o resultado é registrado — não silenciosamente reinterpretado.
- **CA6** — Existe teste que **reproduz o bug relatado**: alvo prescrito X, valor enviado bem acima.
  Deve falhar antes da correção.

## Métrica de sucesso

O bpm que aparece no relógio é o mesmo que o treinador vê na tela do plano, para o mesmo treino e o
mesmo atleta. Verificável de ponta a ponta com uma conta real de intervals.icu — o canal já foi
validado nesse formato em 2026-07-14.

## Open Questions & Assumptions

**Bloqueante:**

- **Qual base o intervals.icu usa para `%hr`?** Não verifiquei contra a documentação nem contra a API
  real — é inferência a partir do nosso código. Se `%hr` for `%LTHR`, a camada 3 contribui pouco e a
  camada 2 explica quase tudo; se for `%FCmax`, o efeito soma. **A escolha entre "resolver para bpm"
  e "corrigir a base do percentual" depende dessa resposta.** Resolver para bpm é robusto aos dois
  cenários, o que é argumento a favor — mas a confirmação ainda é necessária para descrever o defeito
  com honestidade.
- **Os números do caso real.** O relato não veio com valores. Confirmar o alvo prescrito, o bpm
  exibido e a FCmax do atleta permite dizer **qual** camada disparou, em vez de corrigir três por
  precaução.

**Premissas:**

- `fcLimiar` é a base correta do domínio, porque é o que o `ZonaTreinoService` já usa e o que a
  literatura de treinamento adota para zonas de corrida. A mudança seria alinhar o resto a ele, não o
  contrário.
- O canal de push está funcional; o defeito é de conteúdo, não de transporte (gate de 2026-07-14
  aprovado).

## Decomposição — avaliada e rejeitada

A divisão natural seria: (A) push resolve para bpm; (B) prompt e base coerentes. **Rejeitada:** as
duas metades dependem da mesma pergunta não respondida — *percentual de quê?*. Corrigir só o push
obriga a escolher uma base para interpretar `"% FCmax"`, que é justamente a decisão da metade B.
Entregar A sozinha significa fixar a ambiguidade em código e chamar de correção.

## Fora de escopo

- **Sincronizar o perfil de FC do atleta para o intervals.icu.** Resolvido o push para bpm absoluto,
  o perfil remoto deixa de importar para este fluxo. Sincronizar manteria duas fontes de verdade e
  continuaria sujeito a edição do outro lado.
- **Revisar o modelo de zonas em si** (as faixas 75–85%, 85–89%, …). Esta change alinha as bases; se
  as faixas estão certas é outra discussão, com outra literatura.
- **Pace.** `PaceTarget` trafega em `secs/km`, que já é absoluto e não sofre do mesmo problema.
