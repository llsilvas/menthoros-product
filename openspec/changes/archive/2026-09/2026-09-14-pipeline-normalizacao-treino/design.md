# Design — `pipeline-normalizacao-treino`

Fechado por grilling em 2026-09-14 (3 rodadas, 19 decisões), a partir do candidato #1 da revisão
de arquitetura do núcleo de geração de plano. Vocabulário de design: **module** (interface +
implementation, em qualquer escala), **interface** (tudo que o chamador precisa saber: tipos,
invariantes, ordem, modos de erro), **seam** (onde uma interface vive), **internal seam** (seam
privada à implementation, usada só pelos próprios testes), **locality** (mudança/bug/teste
concentram num lugar).

## Decisões

| # | Decisão | Escolha | Por quê |
|---|---|---|---|
| Q1 | Quando/onde | Change própria, após merge de `refactor-iaservice-decomposition` | A branch F2 já está no `/qa` com 9 commits; ADR-0002 faz da change o gate |
| Q2 | Withers (#2 da revisão) | Seção 1 desta change, só os que o pipeline consome | Mergear separado não paga: ninguém mais os usa até o pipeline existir |
| Q3 | Forma da "ordem como dado" | **Receita por família de treino** (lista de passos), runner escolhe pelo tipo | A ordem *varia por família* (gate estrutural e recheck só em INTERVALADO); predicado por passo esconde controle de fluxo de novo; método sequencial + log de nomes testa efeito colateral, não interface |
| Q4 | Onde mora o module | Novo `NormalizacaoDeTreino` em `services/helper`; `PlanoLlmValidator` fica com o nível do plano semanal | Dois níveis de agregação (plano semanal vs. treino planejado) são dois modules. Fato verificado: `TreinoNormalizador`, `PlanoEstruturaReparador`, `EtapaFcValidator` têm **um chamador** em produção — viram internal seams, não precisam de interface própria |
| Q5 | Segundo parâmetro sem esperar #3/#4 | `record ContextoNormalizacao(atleta, atletaId, zonasFC, tetoPorTipo, pisoPorTipo)` | Reduz a interface de 6 parâmetros para 2 e dá a #3/#4 um lugar único para pousar |
| Q6 | Testes | Substituir, não empilhar: testes de ordem e caracterização migram para a interface do module; testes das peças ficam como internal seam | Os testes das peças descrevem regras (IA-03, IA-05) que sobrevivem ao refactor |
| Q7 | Observabilidade por passo | DEBUG com nome do passo e se alterou o treino | Rastro que faltou nos dois bugs de ordem, sem custo de cardinalidade |
| Q8 | Famílias | 4 receitas: `INTERVALADO_TIRO`, `FARTLEK`, `TRES_ETAPAS` (REGENERATIVO/CONTINUO/TEMPO_RUN/LONGO), `PADRAO` (FACIL/SUBIDA/PROVA/DESCANSO); cauda comum concatenada ao fim | `PADRAO` explícita: um tipo novo fica visível como decisão, não como omissão |
| Q9 | Forma do passo | Um tipo só: `record Passo(nome, Etapa fn)`, `Etapa = (treino, ctx) -> treino`; validação devolve intacto e lança `LLMException` | Devolver-o-mesmo é o contrato de validação; dois tipos é interface a mais para o mesmo runner |
| Q10 | Onde as receitas vivem | `enum FamiliaTreino` carregando a `Receita` como campo | `familiaDe(tipo)` fechado; a lista fica ao lado do nome; `for (values())` cobre todas sem esquecer |
| Q11 | Nomes | `NormalizacaoDeTreino` · `Receita` · `Passo` · `FamiliaTreino`; **Receita de normalização** entra no `CONTEXT.md` | Termo novo de domínio, registrado na seção "Geração de planos" |
| Q12 | O que o teste da ordem assere | Golden por família (`receita().nomes()`) **e** os 2 testes de comportamento migrados | O golden é o test surface que Q3 criou; os de comportamento provam que a ordem certa dá o resultado certo |
| Q13 | Dívidas que viram passos | `validarTreinoIntervalado` quebra em 6 passos nomeados; `gate-duracao-tiros` aparece 2× na receita; mensagem "(mínimo 8)" corrigida | É o que a receita pede; o IA-05 fica legível no golden |
| Q14 | Tamanho/trilha | M · Full (`--step`) | Caminho quente da geração; o DoR cross-model já pagou duas vezes nesta área |
| Q15 | Conteúdo do contexto | Só dados; colaboradores são campos do module, passos são lambdas de instância | Colaborador em record é o construtor de 8 argumentos voltando por outra porta |
| Q16 | `PADRAO` e comportamento | **Sem mudança de comportamento**; o que `DESCANSO`/`PROVA` deveriam pular é follow-up | Uma change, um deepening; é decisão de domínio com dono |
| Q17 | Withers em `EtapaTreinoLlmDto` | Sim: `comDistancia`, `comDuracao`, `comFc` e **`comOrdem`** (DoR 3ª rodada: `reordenarEtapas`/`PlanoEstruturaReparador.comOrdem` renumeram `ordem`), trocando as reconstruções do normalizador e do reparador. **Criações genuínas** de etapa (expansão, tiro+rec sintetizados, aquec/desaq do reparo) ficam no construtor canônico — não há record de origem | Mesmo mecanismo, mesmo commit; deixar metade das cópias é aprofundar pela metade. O gate "zero construtores" vale só para cópias, não para criações |
| Q18 | Caracterização com DTO completo | `isEqualTo(esperado)` com o record escrito à mão por cenário, + cenário FARTLEK | O record à mão *é* a documentação; snapshot em arquivo esconde o esperado |
| Q19 | Quando abrir a change | Agora, marcando dependência de merge de F2 | O design está fresco; o DoR roda quando a dependência fechar |

## Forma do module

```
NormalizacaoDeTreino                              (services/helper, @Component)
  interface:  TreinoPlanejadoLlmDto normalizar(TreinoPlanejadoLlmDto bruto, ContextoNormalizacao ctx)
  ─────────────────────────────────────────────────────────────────────────────
  implementation:
    FamiliaTreino.de(bruto.tipoTreino()).receita()   → List<Passo>
    for (Passo p : receita) { antes = t; t = p.fn().aplicar(t, ctx); log.debug(p.nome(), !antes.equals(t)) }
    internal seams: TreinoNormalizador · EtapaFcValidator · PlanoEstruturaReparador · PaceValidator
```

```
enum FamiliaTreino {
  INTERVALADO_TIRO  ( corrigir-temporais, expandir,
                      ── validarTreinoIntervalado, item a item (PlanoLlmValidator.java:248-448) ──
                      gate-existencia,            // etapas null/vazio          → LLMException
                      gate-contagem,              // size < 6                   → LLMException ("mínimo 6")
                      gate-presenca-aquec-desaq,  // falta AQUECIMENTO/DESAQ    → LLMException
                      gate-ordem-aquec-desaq,     // 1ª ≠ AQUEC ou última ≠ DESAQ → LLMException
                      alerta-poucos-tiros,        // tiros < 3                  → WARN
                      gate-balanceamento,         // |tiros − recs| > 1         → LLMException
                      gate-sequencia,             // REC sem tiro imediatamente antes → LLMException;
                                                  // AQUEC após tiro / DESAQ antes de tiro → WARN
                      alerta-distancias,          // soma ≠ total ±0.5 → WARN; tiros < 20% e recs > 65%
                                                  // só [se distanciaPlanejada > 0] → WARN
                      gate-duracao-tiros,         // tiro com duracaoMin == null OU fora de [0.3, 10] min
                                                  // → LLMException (null conta como inválido, :450)
                      log-validacao-ok,           // INFO "VALIDAÇÃO OK … N etapas (T tiros, R recs, km…)"
                                                  // com as contagens PRÉ-normalização, como hoje (:424-433)
                      ────────────────────────────────────────────────────────────────────────
                      normalizar-intervalado, reconciliar-distancia,
                      gate-duracao-tiros,                    ← 2ª vez: IA-05 (mesmo predicado, null incluso)
                      + CAUDA_COMUM ),
  FARTLEK           ( corrigir-temporais, expandir, reconciliar-distancia, + CAUDA_COMUM ),
  TRES_ETAPAS       ( reparar-3-etapas, validar-por-tipo, + CAUDA_COMUM ),
  PADRAO            ( + CAUDA_COMUM );

  static FamiliaTreino de(String tipoTreino)   // fechado, nunca null; desconhecido → PADRAO
}

CAUDA_COMUM = ( validar-repeticoes,                       // [se etapas != null] repeticoes != null && ≠ 1
                                                          // → LLMException; repeticoes == null é aceito (:517-520)
                corrigir-fc-zona        [se zonasFC != null && etapas != null],
                corrigir-pace-teto-piso,                  // paceValidator.validar; só reconstrói se mudou
                recalcular-duracao      [se etapas não-vazia && somaDuracoesMin > 0],
                garantir-distancia-continuo,
                validar-triangulo )                       // só WARN
```

**Fidelidade à ordem atual (`normalizarTreino`, `PlanoLlmValidator.java:119-246`) — regras
fixadas no DoR de 2026-09-14 (spec-reviewer + Codex, 2 achados convergentes):**

- `reparar-3-etapas` roda **uma vez** por treino, e hoje roda incondicionalmente (linha 168) — mas é
  **identidade fora de `TIPOS_3_ETAPAS`** (`PlanoEstruturaReparador.java:34-35`). Por isso ele mora
  só em `TRES_ETAPAS`, não na cauda: chamá-lo nas outras famílias seria no-op, e listá-lo duas vezes
  em `TRES_ETAPAS` seria um bug. A caracterização e a task 0.2 confirmam a identidade.
- `validar-por-tipo` idem: só tem efeito em LONGO/REGENERATIVO/CONTINUO/TEMPO_RUN (linhas 170-184).
- `gate-sequencia` **não estava na 1ª versão desta receita** — é o hard-fail "recuperações sem tiro
  imediatamente anterior" (item 5 de `validarTreinoIntervalado`), com dois WARNs no mesmo laço.
  `AQUECIMENTO, RECUPERACAO, INTERVALADO, INTERVALADO, RECUPERACAO, DESAQUECIMENTO` passa em
  contagem, extremos e balanceamento e **hoje é rejeitado** — a receita sem esse passo aceitaria.
- As guardas entre colchetes são parte do passo (o passo devolve o treino intacto quando a guarda
  falha), não do runner.
- `corrigir-fc-zona` e `corrigir-pace-teto-piso` são **transformações** (podem devolver um record
  diferente), não validações — o nome diz isso.
- O log "VALIDAÇÃO OK … N etapas (T tiros, R recuperações, …)" do fim de `validarTreinoIntervalado`
  é o passo `log-validacao-ok`, **na mesma posição de hoje** (antes de `normalizar-intervalado`):
  movê-lo para o fim da receita mudaria os valores logados (contagens e distâncias já
  normalizadas) — divergência que a 2ª rodada do Codex apontou e que não vale a economia de um passo.
- **Semântica de null é parte do predicado de cada passo**, não do runner: `gate-duracao-tiros`
  rejeita `duracaoMin == null` (`:450`); `validar-repeticoes` é no-op com `etapas == null` e aceita
  `repeticoes == null` (`:517-520`); `alerta-distancias` só avalia proporções com
  `distanciaPlanejada > 0` (`:406`). O baseline (0.4) congela os três.

**`alterou` por `Objects.equals`, não por identidade.** `TreinoNormalizador.recalcularDuracaoTreino`
(linhas 366-386) e `normalizarTreinoIntervalado` sempre constroem um record novo, mesmo com valores
iguais — por identidade o DEBUG diria `alterou=true` em no-op. O runner compara
`!antes.equals(depois)`.

```
record ContextoNormalizacao(Atleta atleta, UUID atletaId, List<ZonaFC> zonasFC,
                            Map<TipoTreino, BigDecimal> tetoPorTipo,
                            Map<TipoTreino, BigDecimal> pisoPorTipo)
```

`PlanoLlmValidator.validarENormalizarPlano` passa a: montar `ContextoNormalizacao` uma vez →
`treinos.map(t -> normalizacaoDeTreino.normalizar(t, ctx))` → `validarDistribuicaoCargaSemanal` →
montar o `PlanoSemanalLlmDto`. Os 9 métodos públicos de validação por tipo saem dela (viram passos).

## Test surface

**O baseline é capturado ANTES de qualquer refactor** (achado do Codex no DoR: capturar "o
comportamento atual" depois das seções 1-2 congelaria uma regressão como esperado). A seção 0.4
escreve a caracterização com records completos contra `PlanoLlmValidator` em `72304b9`, ela fica
verde durante as seções 1-2, e só na seção 3 migra para a interface do module.

- `PlanoLlmValidatorCaracterizacaoTest` (baseline, seção 0.4 → migra para
  `NormalizacaoDeTreinoCaracterizacaoTest` na seção 3): record completo escrito à mão,
  `isEqualTo`, para **intervalado, longo, regenerativo, fartlek** (com zonas FC — família nunca
  coberta, onde IA-02 morava) e **um PADRAO** (`FACIL`); mais os cenários de **rejeição** já
  existentes (padding de 4 etapas → "mínimo 6"; tiro > 10 min pós-crescimento → "duração
  incoerente") e um novo para `gate-sequencia` (REC antes do 1º tiro → "recuperações sem tiro").
  Colaboradores **reais** onde a transformação importa (`TreinoNormalizador`, `EtapaFcValidator`,
  `PaceValidator`, `PlanoEstruturaReparador`); mocks só para `TreinoHistoricoProvider`/
  `PaceHistoricoFormatter`/`ZonaTreinoService` (fontes de dados, não regras).
- `FamiliaTreinoTest`: para cada família, `receita().nomes()` igual à lista esperada; `de(tipo)`
  cobre os 11 tipos.
- `NormalizacaoDeTreinoTest`: os cenários de rejeição acima chamando `normalizar` direto.
- Mantidos como internal seam: `TreinoNormalizador*Test` (6), `EtapaFcValidatorTest`,
  `PlanoLlmValidatorTest#Estrutura3Etapas` (migra para o passo `validar-por-tipo`).

**Limitação aceita:** igualdade de record não cobre o contrato JSON (nomes, `NON_NULL`,
serializadores). Está fora do escopo porque a change não altera nenhum campo dos DTOs — withers
são aditivos e o construtor canônico de 14 campos permanece (o overload de 11 apagaria
`descricao`/`zonaAlvo`/`provaId`; os withers usam o canônico).

## O que não muda

Saída idêntica para todo cenário de hoje. Sem migration, sem contrato de API, sem flag.
