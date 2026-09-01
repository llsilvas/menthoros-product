# Design — fix-fc-alvo-base-inconsistente

**Refinado em 2026-08-02:** escopo reduzido ao **formato de alvo** (padrão Garmin). O modelo de zonas
permanece Friel %LTHR, intocado.

## O padrão Garmin, e por que ele fecha a decisão

Alvo de FC numa etapa de treino estruturado (FIT):

| Forma | Codificação | Quem resolve |
|---|---|---|
| Relativa | valor **1–100** ⇒ % da **FC máxima** | o relógio |
| Absoluta | valor **> 100** ⇒ **bpm + 100** | ninguém — é o número final |
| Zona | número da zona | o relógio, pela config dele |

O canal relativo é **%FCmax por definição do formato**. O domínio do Menthoros é **%LTHR**. Logo:

> Não existe percentual que o Menthoros possa enviar por esse canal e que chegue certo.

Isso não é preferência de design — é propriedade do formato. Resolver para bpm absoluto é o único
caminho compatível, e é robusto **independentemente** de como o intervals.icu interpreta `%hr` no meio
do caminho (que eu não verifiquei, e que deixa de importar).

Enviar zona tem o mesmo defeito: delega ao relógio, cuja config de zonas o Menthoros não escreve.

## Validado na UI do Garmin Connect (2026-08-02)

Verificado no criador de treinos, não inferido. A etapa tem dois eixos independentes:

- **Duração → Tipo:** Distância, Tempo, Pressionar botão Lap…
- **Meta de intensidade → Tipo:** um **dropdown de escolha única** com
  `Sem objetivo` (default) · `Ritmo` · `Cadência` · **`Zona de frequência cardíaca`** ·
  **`Frequência cardíaca personalizada`** · `Zona de potência` · `Potência personalizada`

Três consequências diretas para esta change:

1. **A meta é escolha única, por construção do produto.** Não são campos acumuláveis. Modelar como
   dois opcionais resolvidos por precedência (o que fazemos hoje) diverge do domínio que estamos
   integrando.
2. **`Sem objetivo` é o default e tem nome próprio.** Não é "campo não preenchido" — é opção, e a
   primeira da lista.
3. **FC tem duas formas, e a distinção é exatamente o bug:**

   | Forma Garmin | Quem resolve o bpm | Serve para nós? |
   |---|---|---|
   | `Zona de frequência cardíaca` | as zonas configuradas **no relógio** | **não** — nossas zonas vêm do LTHR que só o Menthoros conhece |
   | `Frequência cardíaca personalizada` | ninguém: é faixa de bpm | **sim** — é a forma nativa para alvo absoluto |

   Ou seja: **o alvo que a correção vai emitir é a forma nativa do Garmin**, não um contorno. A
   correção deixa de ser "contornar o formato" e passa a ser "usar o formato certo dos dois que
   existem".

## Meta de intensidade: modelar o que o Garmin modela

No padrão Garmin a etapa tem **uma** meta de intensidade: sem meta, ritmo, FC, cadência ou potência.
O modelo canônico do Menthoros carrega `pace` e `hr` como campos independentes no `WorkoutStep`, e a
exclusividade é obtida por um `if/else` no converter — não pelo tipo.

Isso funciona hoje, mas é frágil por três motivos:

- **`montarStep` (`IntervalsIcuAdapter:243-249`) emite os dois se os dois vierem.** Nada estrutural
  impede; só o converter é que nunca produz o par. Uma mudança futura no converter vaza direto para o
  payload.
- **A precedência é implícita.** `pace != null ? pace : hr` é uma decisão de produto escrita como
  detalhe de controle de fluxo. Ninguém a declarou; ela emergiu.
- **Rebaixar FC a texto perde a meta.** `anexarFc` transforma o alvo em `"(140-150 bpm)"` dentro da
  descrição. O atleta lê, o relógio não controla. Para uma etapa prescrita por FC, é perder
  silenciosamente o que o treinador pediu.

**Consequência hoje, verificada:** `ritmoAlvo` é campo do **treino** (`plano-treino-prompt.txt:80`),
não da etapa; o schema de etapa do prompt só tem `fcAlvo`. Logo `etapa.ritmoAlvo` nunca é preenchido
por plano gerado, `pace` é sempre nulo, e **100% das etapas caem no ramo de FC** — o que está
quebrado. O ramo de pace é código morto para o fluxo principal.

Direção: tornar a meta um **tipo com uma escolha** (sem meta | pace | FC), em vez de dois campos
opcionais cuja combinação é resolvida por precedência. O adapter então não tem como emitir dois.

## Estado verificado (2026-08-02)

| Onde | O que faz |
|---|---|
| `ZonaTreinoService:43-49` | 5 zonas, **Friel %LTHR** — Z1 75-85%, Z2 85-89%, Z3 89-94%, Z4 94-100%, Z5 100-106%. LTHR na fronteira Z4/Z5 |
| `ZonaTreinoService:89-90` | explícito: `fcMaxima` **não é usado** |
| `PlanoTreinoPromptBuilder:503` | entrega as zonas ao LLM em **bpm absoluto** |
| `PlanoTreinoPromptBuilder:493` | "Use EXATAMENTE as zonas listadas. NÃO invente outros valores de BPM" |
| `plano-treino-prompt.txt:34-45` | exemplifica a saída como **`"90-95% FCmax"`** |
| `IntervalsIcuTargetParser:52` | extrai os números do percentual — agnóstico de base |
| `IntervalsIcuAdapter:272,277` | emite `%hr` (cru) e `hr_zone` (número da zona) |
| `IntervalsIcuAdapter:267` | **já emite `units: "bpm"`** no caminho BPM — formato não é novo |
| `IntervalsIcuClientImpl:44,67,83` | lê `/athlete/0`, escreve eventos — **nunca grava perfil de FC** |
| `IntervalsIcuAdapterTest:117,133` | afirma a **string da unidade**, nunca um bpm |

## O desenho

```
hoje:   plano (%LTHR) → rótulo "% FCmax" → payload "%hr"/"hr_zone" → o relógio resolve → bpm errado
                 ↑ base A        ↑ base B          ↑ base C (deles)

alvo:   plano (%LTHR) → resolvido para bpm onde o dado do atleta vive → payload "bpm" → relógio
                 ↑ base única
```

### Onde resolver

No **`IntervalsIcuWorkoutConverter`**, não no adapter. O adapter hoje não tem nenhuma referência a
`Atleta`, e o papel dele é traduzir modelo canônico → JSON. Levar o atleta até lá misturaria
responsabilidades; o converter já recebe o treino.

Consequência: `HrTarget` chega ao adapter **sempre** em `BPM`. `PERCENT` e `ZONE` passam a ser
representação intermediária do parser, consumida pela resolução — nunca atravessam a fronteira.

### A resolução de zona reusa o que já existe

`ZonaTreinoService.calcularZonas(atleta)` já devolve `ZonaFC(numero, nome, fcMin, fcMax)`. A zona N
resolve para `fcMin`–`fcMax` da zona N. **Não reimplementar a conta** — reimplementar é como o
BUG-CONF-001 nasceu.

Para percentual legado (`"90-95% FCmax"`), interpretar na base do domínio (%LTHR) e registrar. Não
reinterpretar em silêncio: o mesmo texto passa a significar outro bpm.

## Alternativas consideradas

| Opção | A favor | Contra | Veredito |
|---|---|---|---|
| **Resolver para bpm no converter** | única compatível com o padrão; independe do intervals.icu; dado já existe | precisa do atleta no converter | **escolhida** |
| Corrigir a base do percentual e seguir enviando `%hr` | menor diff | **impossível estar certo**: o canal relativo é %FCmax por definição | rejeitada pelo padrão |
| Continuar enviando `hr_zone` | legível no app deles | delega à config de zonas do relógio, que não escrevemos | rejeitada |
| Sincronizar o perfil de FC para o intervals.icu | mantém alvo relativo | duas fontes de verdade; editável do outro lado; não corrige o prompt | rejeitada |
| Adotar o modelo %FCmax do Garmin | alinharia o rótulo "% FCmax" já emitido | muda todas as faixas (Z2: ~138-144 → 114-133 bpm em FCmax 190) e a intensidade de toda prescrição | rejeitada — decisão de produto, não correção de bug |

## "Sem objetivo" é estado de primeira classe

O treinador pode deliberadamente não informar meta e manter o treino sem objetivo. Isso muda como o
caso "atleta sem FC medida" deve ser tratado: **não é exceção a inventar, é um estado que o produto
já suporta**.

`Atleta:209,235` têm fallback (FCmax = `220 - idade` ou 180; LTHR = 0,85 × FCmax). Para **exibir**
estimativa, aceitável. Para **mandar ao relógio um número que o atleta vai perseguir**, não — a
fórmula etária erra dezenas de bpm entre indivíduos. Sem dado confiável, a etapa cai em "sem
objetivo".

### Mas os dois caminhos até "sem objetivo" não são a mesma coisa

| Caminho | O que significa | O treinador precisa saber? |
|---|---|---|
| Treinador não informou meta | prescrição intencional | não — foi ele quem escolheu |
| Treinador informou FC, mas falta dado do atleta | **prescrição descartada** | **sim** |

No payload os dois são idênticos: etapa sem meta. Se o segundo caso não avisar, o treinador prescreve
uma zona, o atleta recebe um treino livre, e **nada na tela diferencia isso de uma decisão dele**. O
treino sai errado de um jeito que se parece com estar certo — é a assinatura de todos os defeitos
desta change.

Daí o CA10: cair em "sem objetivo" por falta de dado precisa ser **visível**. Onde exibir é a única
questão de produto que resta em aberto.

## Riscos

| Risco | Mitigação |
|---|---|
| Mudar o payload quebra o canal validado em 2026-07-14 | `units: "bpm"` já é emitido hoje (`:267`) — não é formato novo. Validar ponta a ponta com conta real antes de fechar |
| Reimplementar a conta de zona em vez de reusar `ZonaTreinoService` | CA2 exige que o bpm enviado **coincida** com a faixa do serviço, e fixa valores absolutos junto |
| Planos legados com `"% FCmax"` gravado | CA5: interpretar na base do domínio e registrar |
| Testes seguirem afirmando string de unidade | CA1/CA2/CA6 exigem valor absoluto e um teste que reproduza o bug |
| Atribuir ao código o que pode ser config do atleta | Task 0.1: os números do caso real dizem se a inflação bate com os ~18% previstos. Separar observado de inferido |
