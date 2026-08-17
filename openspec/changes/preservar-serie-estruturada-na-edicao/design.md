# design — preservar-serie-estruturada-na-edicao

## O round-trip, hoje e depois

```
HOJE
  banco: [AQ, INT 1min Z4, REC 2min Z1, INT 1min Z4, REC 2min Z1,
              INT 2min Z5, REC 3min Z1, INT 2min Z5, REC 3min Z1, DQ]
    ↓ hidratação (TreinoEditDialog:256-286) — pega o PRIMEIRO de cada tipo
  editor: AQ | esforço 1min Z4 | recuperação 2min Z1 | 4× | DQ
    ↓ serialização (:407-450) — emite no máximo 4 etapas
  patch:  [AQ, INTERVALADO(rep=4), RECUPERACAO(rep=4), DQ]
    ↓ expandirRepeticoes
  banco: [AQ, INT 1min Z4, REC 2min Z1,  ×4 iguais, DQ]   ← a variação sumiu

DEPOIS
  banco: as mesmas 10 etapas
    ↓ itensFromEtapas()
  editor: [AQ] [BLOCO 2× (INT 1min Z4, REC 2min Z1)] [BLOCO 2× (INT 2min Z5, REC 3min Z1)] [DQ]
    ↓ serializarItens() — compartilhado com o TreinoAddDialog
  patch:  [AQ, BLOCO(2, subEtapas), BLOCO(2, subEtapas), DQ]
    ↓ expandirBlocos + aplicarEtapasPatch (agora com blocoId)
  banco: as mesmas 10 etapas, agora com blocoId por grupo
```

O ponto de teste mais importante do design é a identidade: **abrir e salvar sem alterar nada não
pode mudar nada**. É o CA1, e é o que hoje falha.

## Componentes

### Front — `features/coach/components/etapas/` (novo módulo)

Extraído do `TreinoAddDialog`, sem mudança de comportamento:

| Peça | Origem | Papel |
|---|---|---|
| `StepRow`, `BlockRow`, `SubStep`, `EtapaItem` | `TreinoAddDialog.tsx:55-79` | modelo de edição |
| `serializarItens(itens): EtapaInputPayload[]` | `TreinoAddDialog.tsx:105-127` | itens → payload |
| **`itensFromEtapas(etapas): EtapaItem[]`** | **novo** | etapas planas → itens |

`itensFromEtapas` é o inverso de `serializarItens` e a única peça genuinamente nova:

1. Varre as etapas em ordem.
2. Sequência consecutiva com o mesmo `blocoId` → um `BlockRow` com `repeticoes = blocoRepeticoes` e
   as sub-etapas de **uma** janela (`grupo.length / reps`).
3. Sem `blocoId` → procura a maior janela repetida à frente; ≥2 repetições vira `BlockRow`.
4. Nada disso → `StepRow` avulso.

Regra 3 espelha `IntervalsIcuWorkoutConverter.inferirBloco`, incluindo a exigência de uma etapa
`INTERVALADO` na janela — sem ela, um ondulado `A B A B` viraria uma série que ninguém prescreveu
(defeito real, pego no quality gate da change anterior por convergência entre dois revisores).

Módulo puro, sem hooks nem estado: testável com `*.test.ts` direto, sem renderizar dialog.

### Front — `TreinoEditDialog`

Troca os quatro `useState<BlocoState>` por `useState<EtapaItem[]>`. `liveBlocks` passa a derivar dos
itens — o que **simplifica** o laço introduzido em `expandir-serie-timeline-revisao`, porque a
expansão deixa de ser um caso especial do intervalado e vira a leitura natural da lista.

`handleSalvar` emite `patch.etapas = serializarItens(itens)` **apenas quando a lista de itens mudou**
— a guarda `blocosMudados` (`:415`) é preservada, agora rastreando a lista em vez dos quatro blocos.

Sem ela, mudar só o TSS regravaria todas as etapas: a hidratação inferiu blocos, a serialização os
reexpande, e o backend limpa e recria. O treino "não mudou" mas foi reescrito — o mesmo dano que esta
change corrige, com aparência de feature correta. É a regressão mais fácil de introduzir aqui, e por
isso virou critério de aceite próprio (CA7).

### Ajuste de tipo necessário

`TreinoPlanejadoPatch.etapas` é hoje `EtapaTreinoDto[]` (`types/PlanoReview.ts:97`), tipo que **não
tem `subEtapas`** — enquanto `serializarItens` devolve `EtapaInputPayload[]`. O código não compila
como está.

Não é mudança de contrato: o backend já aceita, `TreinoPlanejadoPatchDto.etapas` é
`List<EtapaInputDto>`, que tem `subEtapas` e passa por `expandirBlocos`. O tipo do cliente TS é que
está mais estreito que o contrato real — resquício do cliente curado à mão. Corrigir para
`EtapaInputPayload[]`, o mesmo tipo que `TreinoPlanejadoAddPayload.etapas` já usa (`:71`).

Totais (`totalKm`/`totalMin`) passam a somar sobre os itens, com bloco contando `reps ×` suas
sub-etapas. Hoje o cálculo já multiplica por repetições (`:291-313`); muda a fonte, não a semântica.

### Backend — um caminho de escrita, não dois

Hoje há dois, e só um grava `blocoId`:

| Caminho | Entrada | Atribui `blocoId`? |
|---|---|---|
| adição (`expandirBlocoParaAdicao`, `:264-285`) | `BLOCO` | ✅ via `buildEtapaSimples` |
| patch (`expandirEtapas` → `aplicarEtapasPatch`, `:313-318`, `:410-423`) | `BLOCO` | ❌ `toEntity` direto |

O problema estrutural: `expandirBlocos` (`:325-356`) achata o `BLOCO` em N cópias de `EtapaInputDto`
e **perde qual grupo era qual** — e `EtapaInputDto` não tem campo para carregar isso (`EtapaMapper:34`
ignora `blocoId` de propósito, porque ele nunca vem do cliente).

Correção: `aplicarEtapasPatch` passa a expandir os blocos ele mesmo, gerando um `UUID` por `BLOCO` e
construindo as etapas via `buildEtapaSimples` — exatamente o que a adição já faz. `expandirBlocos`
deixa de ser necessário no caminho de patch; `expandirRepeticoes` (que trata o formato legado
`INTERVALADO(rep=N)` + `RECUPERACAO`) permanece, porque o payload antigo ainda pode chegar.

## Compatibilidade

- **Payload legado.** Um cliente que ainda envie `INTERVALADO(repeticoes=4)` continua funcionando via
  `expandirRepeticoes`. Não há versionamento de API a fazer.
- **Dados existentes.** Treinos gravados sem `blocoId` são lidos pela inferência (regra 3). Nenhuma
  migration; nenhum backfill.
- **Contrato de saída inalterado.** `EtapaTreinoDto` já expõe `blocoId` e `blocoRepeticoes`.

## Erros e casos de borda

| Caso | Comportamento |
|---|---|
| Bloco com `reps` que não divide o grupo | cai para itens avulsos (mesma degradação de `tentarMontarBloco`) |
| Janelas com mesmo `blocoId` mas conteúdo divergente | itens avulsos — o dado está inconsistente, não se inventa estrutura |
| Treino sem etapas | lista vazia; o editor mostra o estado de "adicionar etapa" |
| Coach remove todas as etapas | patch com `etapas: []`; o backend limpa. Sem validação de estrutura, por decisão |
| Bloco com 1 repetição | serializa como sub-etapas avulsas, não como `BLOCO` — evita bloco degenerado |
| Coach remove aquecimento ou desaquecimento | **aviso não-bloqueante** antes de salvar (ver abaixo) |

## Soft-warning ao remover aquecimento ou desaquecimento

Adotado após convergência entre o product-review e o pre-mortem, que chegaram ao mesmo ponto por
caminhos diferentes.

O risco não é de dado, é fisiológico: um `8×400m Z5` sem aquecimento faz o atleta apertar start e ir
direto para Z5. E o cenário provável não é o treinador decidindo remover — é remover **sem querer**
durante uma edição rápida, que é exatamente a situação que originou esta change ("só mudei o TSS").

Bloquear seria errado: o treinador é soberano sobre a estrutura, e há casos legítimos (o atleta
aquece por conta, sessão emendada em outra). Um aviso confirmável preserva a soberania e elimina a
remoção acidental — custo de uma caixa de diálogo, no mesmo componente que já está sendo reescrito.

Dispara apenas quando o treino **tinha** a etapa e ela deixou de existir. Não valida no backend: o
non-goal de não introduzir validação de estrutura no patch permanece.

## Testes

| Nível | O quê |
|---|---|
| Unit (TS) | `itensFromEtapas` — CA2, CA3, CA4, borda de reps indivisível; e o **round-trip** `serializarItens(itensFromEtapas(x)) ≡ x` (CA1), o teste que mais protege este design |
| Component (TS) | `TreinoEditDialog` — abre série heterogênea, salva sem alterar, patch idêntico; adicionar/remover item |
| Unit (Java) | `TreinoPlanejadoServiceImpl` — patch com `BLOCO` grava `blocoId` compartilhado e `blocoRepeticoes` (CA5); treino simples inalterado (CA6) |
| E2E | fluxo de edição na revisão — ver ressalva no `tasks.md` |

## Dívida aceita: a regra de inferência em dois lugares

Depois desta change, "detectar a série a partir da repetição" existe em Java
(`IntervalsIcuWorkoutConverter.inferirBloco`) e em TypeScript (`itensFromEtapas`). Duas
implementações da mesma regra divergem — é questão de tempo.

**Alternativa considerada e rejeitada:** o backend devolver as etapas já agrupadas no DTO de saída,
com o front apenas lendo. É a solução correta em termos de "uma verdade só", mas muda o contrato de
saída e atinge todos os consumidores do `EtapaTreinoDto` — escopo desproporcional para esta change.

**Decisão:** aceitar a duplicação agora. Os dois lados servem propósitos diferentes (um exporta para
o relógio, o outro alimenta um editor) e nenhum depende do resultado do outro.

**Gatilho para revisitar:** na primeira vez que a regra precisar mudar, unificar — mover o
agrupamento para o backend e expor no DTO. Uma mudança que precise ser feita em dois lugares é o
sinal de que a duplicação deixou de ser barata.

**O sintoma de divergência, concretamente** (levantado no pre-mortem): um treino cuja janela o TS
não agrupa e o Java sim. O treinador vê 16 itens avulsos no editor; o atleta recebe no relógio uma
série `8×`. O treinador então "arruma" a lista na tela e o relógio muda de novo. Não é um
desalinhamento silencioso — é chamado de suporte no formato "editei uma coisa e o Garmin mostrou
outra", e o custo cai sobre quem menos tem contexto para diagnosticar.

Mitigação dentro desta change: **teste de paridade**. Os mesmos fixtures de agrupamento rodam nos
dois lados — `IntervalsIcuWorkoutConverterTest` (Java) e `itensFromEtapas.test.ts` (TS) — com os
casos escritos lado a lado e um comentário cruzado em cada arquivo apontando para o outro. Não
impede a divergência, mas faz com que ela apareça como teste vermelho em vez de chamado do coach.

## Rollback

`git revert` dos PRs. Sem migration, sem mudança de contrato de saída, sem dado novo que precise ser
desfeito — os `blocoId` gravados pelo patch corrigido continuam válidos e legíveis pelo código
anterior, que simplesmente os ignora. Os dois repos revertem de forma independente: reverter só o
front devolve o editor colapsado sobre um backend que grava `blocoId` (inofensivo); reverter só o
backend devolve o `blocoId` nulo, que a inferência do converter cobre.
