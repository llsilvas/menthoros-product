# Tasks — add-carga-reference-suite

**Tamanho:** M · **Trilha:** Full · Repo: `menthoros-backend`

Origem do material: branch `feature/testes-carga-referencia` (9 commits, 2026-07-28, nunca virou PR).
Ela **não deve ser mergeada** — só o dataset se aproveita. Ver "Fora de escopo" no `proposal.md`.

## 0. Gate — a referência é mesmo externa?

- [ ] 0.1 Identificar e **documentar a fonte** dos valores esperados (planilha, TrainingPeaks,
      artigo, livro), e se ela publica a **série de entrada** (TSS por dia) ou apenas as saídas
      arredondadas.
      **Bloqueante:** se os números tiverem saído do próprio código, a suíte é circular e verifica
      nada — a change para aqui e vira decisão (gerar referência independente ou arquivar). Se a
      fonte só tiver saídas com 2 casas, a Decisão 2 do `design.md` inverte.
      *validação:* fonte registrada no `design.md`, com link ou referência bibliográfica.
- [ ] 0.2 Perguntar ao autor da branch por que a fórmula foi reimplementada no teste em vez de
      chamar a produção — a hipótese do `proposal.md` é que ele esbarrou no drift de arredondamento.
      Confirmar evita repetir o contorno por outro caminho.
      *validação:* resposta registrada aqui (ou "não obtida", explicitamente).

## 1. Descoberta no código

- [ ] 1.1 Verificar se o parâmetro `atleta` é **usado** em `calcularCtlCorreto`/`calcularAtlCorreto`.
      Se for, listar quais campos — a costura recebe primitivos, nunca a entidade JPA.
      *validação:* achado registrado no `design.md`.
- [ ] 1.2 Mapear todos os chamadores dos dois métodos, para dimensionar a extração.
      *validação:* lista no PR.

## 2. Costura — extrair o calculador puro

- [ ] 2.1 **Teste primeiro:** `CargaExponencialCalculatorTest` cobrindo a fórmula com valores
      triviais calculados à mão (TSS zero, primeiro dia sem histórico, decaimento puro).
      *validação:* `./mvnw test -Dtest=CargaExponencialCalculatorTest` — vermelho antes da classe.
- [ ] 2.2 Criar `services/helper/CargaExponencialCalculator` — sem estado, sem I/O, sem JPA — e mover
      a fórmula e as constantes de tempo intactas.
      *validação:* `./mvnw clean test`.
- [ ] 2.3 `TsbServiceImpl` passa a delegar. **Nenhuma mudança de comportamento**: os testes de TSB já
      existentes têm de passar sem uma linha alterada — é a prova da extração.
      *validação:* `./mvnw clean verify` verde **antes** de portar qualquer teste novo. Se falhar,
      falhou sozinha e a causa é óbvia.

## 3. Portar a referência

- [ ] 3.1 Regerar os valores esperados da série de 65 dias **sem arredondamento intermediário**,
      a partir da série de TSS da fonte (ver 0.1).
      ⚠️ Não relaxar o `DELTA` para acomodar o drift — o `design.md` explica por quê.
      *validação:* tabela dia-a-dia no PR, para revisão humana.
- [ ] 3.2 Portar a série principal chamando `CargaExponencialCalculator` (CA1).
      *validação:* `./mvnw test -Dtest=CargaReferenciaTest`.
- [ ] 3.3 Portar os casos de borda: TSS zero, pico abrupto, sequência longa de descanso, tapering (CA4).
      *validação:* idem.
- [ ] 3.4 Portar os degenerados: nulos, negativos, valores extremos (CA5). Onde o comportamento atual
      não for o desejado, **abrir bug separado** — não corrigir aqui.
      *validação:* idem.
- [ ] 3.5 Conferir o CA2: nenhum arquivo da suíte contém reimplementação da fórmula.
      *validação:* `grep` por `Math.exp`/`ALPHA`/`EXP_` em `src/test` da suíte não retorna nada.

## 4. Prova de que a suíte tem dentes

- [ ] 4.1 **Contrafactual (CA3):** trocar `CTL_TIME_CONSTANT` de 42 para 40 em produção, rodar a
      suíte, confirmar **vermelho**, e restaurar.
      **Sem isto a change não está entregue** — foi exatamente esta verificação que faltou na suíte
      anterior, que passava 45/45 sem tocar em produção.
      *validação:* saída do teste falhando, colada no PR, e `git diff` limpo depois de restaurar.
- [ ] 4.2 Registrar no `CLAUDE.md` do backend (ou onde couber) que a fórmula de carga tem suíte de
      referência, e onde ela vive — senão a próxima pessoa reimplementa de novo.
      *validação:* diff do doc no PR.

## Estimativa

M. A extração (bloco 2) é pequena e de baixo risco. O volume está no bloco 3 — 45 casos — e o valor
está no 4.1, que é o único passo que distingue esta suíte da anterior.
