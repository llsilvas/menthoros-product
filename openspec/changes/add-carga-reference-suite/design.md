# Design — add-carga-reference-suite

## O problema de desenho, em uma frase

A fórmula que se quer verificar é `private` dentro de um service de ~640 linhas que precisa de banco
para rodar. Não há como chamá-la de um teste rápido, e é por isso que a tentativa anterior a
reimplementou no teste — o que anulou a verificação.

Estado atual verificado:

```java
// TsbServiceImpl — ambos privados
private double calcularCtlCorreto(Double ctlAnterior, Integer tss, Atleta atleta) { ... }
private double calcularAtlCorreto(Double atlAnterior, Integer tss, Atleta atleta) { ... }

private static final int CTL_TIME_CONSTANT = 42;
private static final int ATL_TIME_CONSTANT = 7;
```

O parâmetro `atleta` aparece na assinatura — a task 1.2 precisa descobrir **se ele é usado** no
cálculo. Se for (constante de tempo personalizada por atleta, por exemplo), a costura precisa
carregá-lo; se não for, é parâmetro morto e a extração fica trivial. Não presumir.

## Decisão 1 — extrair um calculador puro, não alargar visibilidade

Três caminhos considerados:

| Caminho | Por que não / por que sim |
|---|---|
| Ir pelo público `atualizarTsbDia` | Precisa de banco → a suíte vira `*IT`, sai do inner loop e passa a rodar só em `verify`. Uma suíte de aritmética que leva minutos não é consultada quando alguém mexe na fórmula — que é justamente o momento em que ela deveria falar. |
| Subir `calcularCtlCorreto` para package-private | Funciona e é barato, mas é o teste ditando o desenho: um método muda de visibilidade sem que nada em produção precise disso. Deixa a fórmula onde ela já é dívida. |
| **Extrair para um colaborador puro** ✅ | Cria a costura *e* reduz o `TsbServiceImpl`, que o `CLAUDE.md` lista nominalmente como dívida a não crescer (~640 linhas). O teste passa a ser unitário, sem Spring nem banco. |

Forma proposta — sem estado, sem I/O, sem JPA (mesma regra das skills):

```java
// services/helper/CargaExponencialCalculator.java
public final class CargaExponencialCalculator {
    public static double proximoCtl(double ctlAnterior, int tss) { ... }
    public static double proximoAtl(double atlAnterior, int tss) { ... }
}
```

O `TsbServiceImpl` passa a delegar. **Nenhuma mudança de comportamento** — as constantes e a fórmula
vão intactas, e é isso que a task 2.3 verifica antes de portar teste nenhum.

## Decisão 2 — regerar os esperados, não relaxar o DELTA

O drift medido (CTL até `0.0357`, contra `DELTA` de `0.01`) vem de a referência arredondar a cada dia
e a produção não. Duas saídas:

- **Relaxar o `DELTA` para ~0.05** — esconde a diferença de método atrás de uma tolerância maior, e
  de quebra reduz a sensibilidade do teste a defeitos reais. Um erro de 3% na constante de tempo
  passaria despercebido.
- **Regerar os esperados sem arredondamento intermediário** ✅ — mantém o `DELTA` apertado, e a
  referência continua externa porque a **entrada** (a série de TSS) é que vem de fora, não a saída.

O segundo caminho depende da premissa registrada no proposal: a fonte precisa publicar a série de
entrada. A task 1.1 confirma isso **antes** de qualquer código — se a fonte só tiver saídas
arredondadas, a decisão inverte e o motivo fica registrado aqui.

## Decisão 3 — a suíte é `*Test`, não `*IT`

Consequência direta da Decisão 1: sem banco, ela roda no inner loop (`./mvnw test`). Isso é o ponto,
não um detalhe — o `CLAUDE.md` documenta que `*IT` **não roda** em `mvn test`, e uma suíte de
referência que só aparece no `verify` perde o papel de guardar quem está mexendo na fórmula agora.

## Decisão 4 — o contrafactual é critério de entrega, não conferência opcional

O defeito da suíte anterior não era estar errada: era **passar sempre**. A única prova de que a nova
não repete isso é mutar a fórmula em produção e ver vermelho. Por isso o CA3 é task própria (4.1), com
resultado registrado — e não uma linha de "conferi que funciona".

Mutação sugerida: trocar `CTL_TIME_CONSTANT` de 42 para 40. Sutil o bastante para não quebrar
compilação e grande o bastante para sair do `DELTA`.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| 🔴 **A referência não é tão externa quanto se acredita** — se os números tiverem saído do próprio código, a suíte é circular e não verifica nada. | Task 1.1 documenta a fonte **antes** de portar. Sem fonte identificável, a change para e vira decisão: gerar referência nova (planilha independente) ou arquivar. |
| 🟠 **`atleta` usado no cálculo** transforma a extração pura numa extração com dependência de entidade JPA — o que a regra das skills proíbe. | Task 1.2 verifica primeiro. Se for usado, a costura recebe os campos que importam como parâmetros primitivos, nunca a entidade. |
| 🟠 **Extração introduz regressão** no `TsbServiceImpl`, que é usado em todo lugar. | A extração é passo separado (2.x) e só entra com `clean verify` verde **antes** de qualquer teste novo ser portado. Se quebrar, quebra sozinha e o culpado é óbvio. |
| 🟡 45 testes portados é volume; tédio produz desatenção. | Priorizar: série principal (CA1) → bordas (CA4) → degenerados (CA5). Cada bloco entra e valida sozinho; parar no meio deixa valor entregue. |
| 🟡 A branch original tem 3 "bugfixes" tentadores. | Declarados fora de escopo no proposal, com o motivo de cada um. Não reabrir. |

## O que este design não resolve

A `RecoveryCargaSkill` continua rodando em **shadow mode** dentro do `MetricasAlertaService` — o
resultado vai só para `log.debug`. Esta change não decide se ela passa a valer; só garante que os
números que ela consome estejam verificados. A decisão sobre o shadow mode é outra conversa, e está
registrada como pendência no SPRINTS.
