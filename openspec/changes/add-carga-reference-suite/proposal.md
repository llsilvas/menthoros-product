# add-carga-reference-suite

**Tamanho:** M · **Trilha:** Full

Repo único e sem contrato de API ou schema, mas há **incerteza de design** — o cálculo de carga é
privado dentro de um service de 640 linhas, e a costura de teste ainda não existe. Pela regra do
`config.yaml` ("na dúvida, suba"), Full.

## Problema

CTL, ATL e TSB são a base de quase toda decisão do produto: progressão de volume, elegibilidade de
intervalado, alerta de sobrecarga, revisão semanal, projeção de prova. **Não existe teste que
verifique esses números contra uma referência externa.** O que existe hoje cobre o comportamento ao
redor — resiliência do recálculo, janelas, persistência — nunca a aritmética contra uma fonte
independente.

Existe uma tentativa parada na branch `feature/testes-carga-referencia` (9 commits, 2026-07-28,
nunca virou PR): 45 testes em `services/validation/`, com uma série de referência de 65 dias
(pico abrupto, blocos de zero, tapering) vinda de **fonte externa**.

**Ela não serve como está — e o modo de falha é o pior possível: verde permanente.** Nenhum dos
quatro arquivos importa uma única classe de produção. Os testes reimplementam a fórmula localmente e
asserem contra a própria aritmética:

```java
private static double ctl(double prev, int tss) {     // cópia da fórmula, dentro do teste
    return round2(tss * ALPHA_CTL + prev * EXP_CTL);
}
void deveCalcularCtlDia1() { assertEquals(1.06, ctl(0.0, 45), DELTA); }
```

Rodei a suíte contra a `develop` de hoje: **45/45 verdes**, e o verde não significa nada — o
`TsbServiceImpl` nunca é chamado. O caso mais claro é o teste chamado
`deveUsarThresholdsUnificadosAposCorrecao`, que declara `-30.0` numa variável local e assere que
`-28 < -30` é falso. Passaria com qualquer coisa em produção. É exatamente o que o `CLAUDE.md` do
módulo proíbe ("No assertion-free tests… calling the method 'to cover the line' is forbidden").

## O que já foi medido (não é premissa)

A fórmula da produção **está correta**. As constantes da referência batem exatamente:
`EXP_CTL = 0.9764716867` é `Math.exp(-1/42)`, `EXP_ATL = 0.8668778998` é `Math.exp(-1/7)`, e os
alphas são os complementos.

A diferença é de **método**, e acumula: a referência arredonda para 2 casas **a cada dia** e
realimenta o valor arredondado; a produção mantém `double` do início ao fim (`ctl_atual` é
`double precision`, sem arredondamento nem na persistência). Ao longo dos 65 dias da série:

| | referência | produção | drift máx |
|---|---|---|---|
| CTL | 35.97 | 35.94 | **0.0357** |
| ATL | 58.01 | 58.02 | 0.0085 |

O `DELTA` da própria suíte é `0.01`. **O ATL cabe; o CTL não.** Religar os testes sem tratar isso faz
as asserções de CTL falharem por arredondamento, não por defeito — e quem visse o vermelho iria caçar
um bug que não existe.

Em termos de produto o drift é irrelevante (0,08% no CTL). O problema é de método de teste.

## Proposta

Aproveitar o que tem valor — **a escolha dos casos** — e descartar o que não tem — a
reimplementação da fórmula.

1. Criar a costura: extrair o cálculo exponencial de carga do `TsbServiceImpl` para um colaborador
   puro e testável (ver `design.md`; o `TsbServiceImpl` já é dívida declarada no `CLAUDE.md`, com
   ~640 linhas).
2. Portar a série de 65 dias e os casos de borda/edge, chamando produção de verdade.
3. **Regerar os valores esperados sem arredondamento intermediário** — não relaxar o `DELTA`, que
   apenas mascararia a diferença de método.

## Escopo

**Dentro:** a costura pura para CTL/ATL/TSB, a suíte portada, e a documentação de onde a referência
externa veio.

**Fora:**
- Mudar a fórmula ou as constantes de tempo (42/7). Nada indica que estejam erradas.
- Reescrever o `TsbServiceImpl` além do necessário para abrir a costura — decomposição ampla é change
  própria.
- Os três "bugfixes" da branch original (`BUG-CONF-001`, `BUG-CONF-002`, `BUG-TEC-002`): o primeiro
  já está em `develop` por outro caminho, o segundo foi resolvido de forma diferente e deliberada em
  `595f327`, e o terceiro foi superado pela `fix-tsb-recalculo-resiliente`. Nenhum deve ser aplicado.

## Critérios de aceite

1. **Given** a série de referência de 65 dias, **when** ela é processada pelo cálculo de produção,
   **then** cada dia bate com o valor esperado dentro do `DELTA` declarado.
2. **Given** um teste da suíte, **when** o arquivo é inspecionado, **then** ele **não** contém
   reimplementação da fórmula — a fórmula existe só em `src/main`.
3. **Given** a fórmula de produção alterada (constante de tempo trocada, por exemplo), **when** a
   suíte roda, **then** ela **falha**. Verificado por contrafactual, não por leitura.
4. **Given** os casos de borda (TSS zero, pico abrupto, sequência longa de descanso), **when**
   processados, **then** batem com a referência.
5. **Given** entradas degeneradas (nulos, negativos, valores extremos), **when** processadas, **then**
   o comportamento é o documentado — sem exceção não tratada.

## Métrica de sucesso

Não é métrica de rotina do treinador; é de confiança na base de cálculo:

**A fórmula de carga passa a ter verificação contra fonte externa** — hoje tem zero. Mensurável pelo
CA3: mutar a fórmula em produção faz a suíte ficar vermelha. Enquanto esse contrafactual não for
executado, a change não está entregue.

## Open Questions & Assumptions

**Premissas:**
- Os valores de referência vieram de fonte externa (confirmado pelo founder em 2026-08-13), o que os
  torna verificação independente e não circular. **A fonte específica não está registrada em lugar
  nenhum** — a task 1.1 documenta qual é, senão a próxima pessoa não sabe se pode confiar nem como
  regenerar.
- Regerar os esperados sem arredondamento preserva a validade da referência. Vale se a fonte publica
  a série de entrada (TSS por dia) e não apenas as saídas arredondadas. **Se a fonte só publicar
  saídas com 2 casas, a premissa cai** e a decisão muda: aí o certo é comparar com tolerância
  derivada do próprio arredondamento, documentando o porquê.

**Em aberto:**
- **Hipótese não comprovada:** o autor original pode ter reimplementado a fórmula justamente por
  esbarrar nesse drift. Se for isso, o contorno custou a validade da suíte inteira — vale confirmar
  com ele antes de repetir o erro por outro caminho.
- A suíte portada fica como `*Test` (Surefire, inner loop) se a costura for pura; vira `*IT` se
  depender de banco. Decidido no `design.md`, e a diferença importa: `*IT` só roda em `verify`.
