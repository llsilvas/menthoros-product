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
| Q17 | Withers em `EtapaTreinoLlmDto` | Sim: `comDistancia`, `comDuracao`, `comFc`, trocando as 6 reconstruções do normalizador | Mesmo mecanismo, mesmo commit; deixar metade das cópias é aprofundar pela metade |
| Q18 | Caracterização com DTO completo | `isEqualTo(esperado)` com o record escrito à mão por cenário, + cenário FARTLEK | O record à mão *é* a documentação; snapshot em arquivo esconde o esperado |
| Q19 | Quando abrir a change | Agora, marcando dependência de merge de F2 | O design está fresco; o DoR roda quando a dependência fechar |

## Forma do module

```
NormalizacaoDeTreino                              (services/helper, @Component)
  interface:  TreinoPlanejadoLlmDto normalizar(TreinoPlanejadoLlmDto bruto, ContextoNormalizacao ctx)
  ─────────────────────────────────────────────────────────────────────────────
  implementation:
    FamiliaTreino.de(bruto.tipoTreino()).receita()   → List<Passo>
    for (Passo p : receita) { antes = t; t = p.fn().aplicar(t, ctx); log.debug(p.nome(), antes != t) }
    internal seams: TreinoNormalizador · EtapaFcValidator · PlanoEstruturaReparador · PaceValidator
```

```
enum FamiliaTreino {
  INTERVALADO_TIRO  ( corrigir-temporais, expandir,
                      gate-existencia, gate-contagem, gate-ordem-aquec-desaq, gate-balanceamento,
                      alerta-distancias, gate-duracao-tiros,
                      normalizar-intervalado, reconciliar-distancia,
                      gate-duracao-tiros,                    ← 2ª vez: IA-05
                      + CAUDA_COMUM ),
  FARTLEK           ( corrigir-temporais, expandir, reconciliar-distancia, + CAUDA_COMUM ),
  TRES_ETAPAS       ( reparar-3-etapas, validar-por-tipo, + CAUDA_COMUM ),
  PADRAO            ( + CAUDA_COMUM );

  static FamiliaTreino de(String tipoTreino)   // fechado, nunca null
}

CAUDA_COMUM = ( reparar-3-etapas?, validar-repeticoes, validar-fc-zona, validar-pace-teto-piso,
                recalcular-duracao, garantir-distancia-continuo, validar-triangulo )
```

> A cauda exata (incluindo se `reparar-3-etapas` é no-op nas outras famílias, como hoje) é fixada
> na implementação a partir do código atual de `normalizarTreino` — a regra desta change é **ordem
> idêntica à de hoje**, só que declarada.

```
record ContextoNormalizacao(Atleta atleta, UUID atletaId, List<ZonaFC> zonasFC,
                            Map<TipoTreino, BigDecimal> tetoPorTipo,
                            Map<TipoTreino, BigDecimal> pisoPorTipo)
```

`PlanoLlmValidator.validarENormalizarPlano` passa a: montar `ContextoNormalizacao` uma vez →
`treinos.map(t -> normalizacaoDeTreino.normalizar(t, ctx))` → `validarDistribuicaoCargaSemanal` →
montar o `PlanoSemanalLlmDto`. Os 9 métodos públicos de validação por tipo saem dela (viram passos).

## Test surface

- `FamiliaTreinoTest`: para cada família, `receita().nomes()` igual à lista esperada; `de(tipo)`
  cobre os 11 tipos.
- `NormalizacaoDeTreinoTest`: os 2 cenários de ordem (padding com 4 etapas → `LLMException`
  "mínimo 6"; tiro que passa de 10 min após crescimento → `LLMException` "duração incoerente"),
  chamando `normalizar` direto.
- `NormalizacaoDeTreinoCaracterizacaoTest`: intervalado, longo, regenerativo, **fartlek** — record
  esperado escrito à mão, `isEqualTo`.
- Mantidos como internal seam: `TreinoNormalizador*Test` (6), `EtapaFcValidatorTest`,
  `PlanoLlmValidatorTest#Estrutura3Etapas` (migra para o passo `validar-por-tipo`).

## O que não muda

Saída idêntica para todo cenário de hoje. Sem migration, sem contrato de API, sem flag.
