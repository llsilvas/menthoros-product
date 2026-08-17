# preservar-serie-estruturada-na-edicao — editar um treino na revisão achata a série

**Tamanho:** M · **Trilha:** Full
**Status:** pronta para implementar (DoR revisado 2026-08-17)
**Criado:** 2026-08-17

> Origem: follow-ups registrados em `fix-fartlek-expansao-etapas` (arquivada 2026-08-17) e
> `expandir-serie-timeline-revisao` (menthoros-front #78). Os dois defeitos são o mesmo problema
> visto de dois lados, e nenhum dos dois se resolve sozinho.

## Why

O treinador abre um fartlek de `4x (1min forte + 2min leve)` na tela de revisão, muda o TSS, salva —
e o treino vira `1x` de esforço contínuo. Ele não fez nada errado, não recebeu aviso, e a duração
total continua correta. A estrutura simplesmente desapareceu.

São dois mecanismos independentes, e por isso corrigir um só não resolve:

**1. O editor colapsa na entrada e na saída.** `TreinoEditDialog` hidrata qualquer treino em quatro
campos fixos — aquecimento, um esforço, uma recuperação, desaquecimento (`:256-286`) — e serializa
de volta no máximo quatro etapas (`:407-450`). Uma série de 4 pares heterogêneos entra como o
*primeiro* par e um contador `4×`; sai como 4 cópias do primeiro par. A variação some no round-trip.

**2. O backend descarta o agrupamento no patch.** `aplicarEtapasPatch`
(`TreinoPlanejadoServiceImpl:410-423`) chama `etapaMapper.toEntity` direto e nunca atribui
`blocoId` — o mapper inclusive o ignora explicitamente (`EtapaMapper:34`). O caminho de *adição*
faz certo, via `buildEtapaSimples` (`:444-452`). São dois caminhos para a mesma escrita, e só um
grava o agrupamento.

### Por que agora, e por que junto

A change `fix-fartlek-expansao-etapas` fez o backend finalmente produzir séries expandidas, e a
`expandir-serie-timeline-revisao` fez a tela desenhá-las. O resultado é que a perda ficou **visível**:
a timeline agora mostra N pares idênticos, deixando explícito que o editor não tem como representar
uma série que varia. Antes o defeito estava escondido atrás de um bloco único.

### Custo para a rotina do treinador

A tela de revisão existe para o treinador ajustar o que a IA propôs. Hoje, ajustar qualquer campo de
um treino intervalado destrói a estrutura do treino — o oposto do que a tela promete. Na prática ele
aprende a não editar intervalados por ali, e o coach-in-the-loop perde justamente o *loop*.

## What Changes

1. **Modelo de etapas compartilhado (front).** Extrair `StepRow` / `BlockRow` / `SubStep` e
   `serializarItens` do `TreinoAddDialog` para um módulo próprio, consumido pelos dois dialogs.
2. **Hidratação inversa (front).** Nova `itensFromEtapas()`: agrupa por `blocoId` quando existe;
   infere a janela repetida quando não existe (treinos da IA); o resto vira item avulso.
3. **Editor com lista de itens (front).** `TreinoEditDialog` troca os quatro campos fixos pela lista
   completa — aquecimento e desaquecimento inclusive —, com adicionar, remover e reordenar.
4. **`blocoId` preservado no patch (backend).** Unificar o caminho de patch com o de adição, que já
   atribui `blocoId` corretamente.

### Non-goals

- Não mudar o contrato de saída (`EtapaTreinoDto`) nem fazer o backend devolver etapas já agrupadas
  — ver "Dívida aceita" no `design.md`.
- Não alterar `IntervalsIcuWorkoutConverter`, `WorkoutTimelineChart` nem o `DetalheTreinoDialog`.
- Não introduzir validação de estrutura no patch. O caminho do coach hoje valida só os tipos
  (`EtapaInputDto`, `@Pattern`) e limites de tamanho; `PlanoEstruturaReparador` roda apenas na
  geração (`IaServiceImpl:421`). O treinador segue soberano sobre a estrutura — decisão consciente,
  coerente com coach-in-the-loop.
- Sem migration. Treinos já gravados sem `blocoId` continuam legíveis pela inferência.
- **Não re-sincronizar com o relógio.** Editar um treino não redispara o push — verificado:
  `TreinoPlanejadoServiceImpl` não publica evento algum, e `IntervalsIcuPushListener:71-72` reage
  apenas a `PlanoAprovadoEvent`. Consequência aceita e registrada: se o treinador editar um treino
  de um plano já aprovado, o relógio do atleta segue com a versão anterior. É comportamento
  **pré-existente**, não introduzido aqui, mas esta change torna a edição de intervalados viável —
  e portanto mais frequente. Merece change própria.

## Dependências

- **`expandir-serie-timeline-revisao`** (menthoros-front **#78**) precisa estar em `develop` antes
  de começar a seção 2. A task 2.5 assume o laço de expansão do `liveBlocks` já existente; sem ele,
  a base é outra e o merge conflita. Estado em 2026-08-17: PR aberto, CI verde, `MERGEABLE`/`CLEAN`.
  **Conferir o merge antes de criar a branch**, não depois.

## Critérios de aceite

**CA1 — série heterogênea sobrevive ao round-trip**
Given um treino com `INTERVALADO(1min Z4)+RECUPERACAO(2min Z1)` duas vezes e `INTERVALADO(2min Z5)+RECUPERACAO(3min Z1)` duas vezes
When o treinador abre o editor, altera uma etapa e salva
Then as 8 etapas persistidas preservam **conteúdo e ordem** — `tipoEtapa`, `duracaoMin`, `distanciaKm`, `fcAlvoEtapa`, `ordem` — exceto a que ele alterou.

> Deliberadamente sobre **conteúdo observável**, não identidade de registro. `aplicarEtapasPatch`
> faz `clear()` e recria as etapas, então o `id` de cada linha muda por construção, e o `blocoId`
> passa a existir onde antes era nulo. Exigir "as mesmas linhas" seria um critério impossível de
> satisfazer sem reescrever a estratégia de persistência — fora do escopo, e desnecessário: o que o
> treinador percebe é o conteúdo.

**CA7 — edição administrativa não toca nas etapas**
Given qualquer treino
When o treinador altera **apenas** TSS ou observação e salva
Then o patch enviado **não contém** `etapas`, e nenhuma etapa é regravada.

> A guarda `blocosMudados` (`TreinoEditDialog.tsx:415`) já existe hoje e é o que impede uma edição
> administrativa de virar regravação estrutural. A reescrita **precisa preservá-la** — perdê-la
> reintroduziria, com aparência de feature correta, exatamente o dano que esta change corrige.

**CA2 — hidratação agrupa por `blocoId`**
Given etapas com o mesmo `blocoId` e `blocoRepeticoes=4`
When o editor abre
Then é exibido um bloco `4×` com as sub-etapas de uma janela.

**CA3 — hidratação infere bloco sem `blocoId`**
Given 8 etapas sem `blocoId` formando 4 pares idênticos
When o editor abre
Then é exibido um bloco `4×` — mesma leitura do caso com `blocoId`.

**CA4 — não inventa bloco**
Given etapas heterogêneas sem repetição
When o editor abre
Then cada etapa aparece como item avulso, sem bloco.

**CA5 — patch grava `blocoId`**
Given o treinador salva um treino com um `BLOCO` de 4 repetições
When o patch é aplicado
Then as 8 etapas persistidas compartilham o mesmo `blocoId` e têm `blocoRepeticoes=4`.

**CA6 — treino simples inalterado**
Given um treino contínuo (aquecimento, principal, desaquecimento)
When o treinador abre e salva
Then as 3 etapas são preservadas e nenhum bloco é criado.

## Métrica de sucesso

Zero perda de estrutura em edição: para qualquer treino, abrir o editor e salvar sem alterar nada
produz exatamente as mesmas etapas. Hoje um intervalado de 4 pares heterogêneos vira 4 cópias do
primeiro par.

Efeito na rotina do treinador: ajustar um campo de um treino intervalado deixa de exigir reconstruir
a série à mão depois.

## Open Questions & Assumptions

**Premissas assumidas:**
- O backend já aceita o payload `tipoEtapa=BLOCO` + `subEtapas` + `blocoRepeticoes`
  (`EtapaInputDto`, `expandirBlocos`), usado hoje pelo `TreinoAddDialog`. Nenhuma mudança de
  contrato de entrada é necessária.
- Permitir remover aquecimento/desaquecimento não quebra o backend — verificado: não há validação de
  estrutura no caminho de patch.

**Em aberto:**
- A regra de inferência de bloco passará a existir em Java (`IntervalsIcuWorkoutConverter`) e em
  TypeScript. Decisão e gatilho de revisão registrados em "Dívida aceita" no `design.md`.
