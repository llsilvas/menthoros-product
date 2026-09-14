## Pré-requisitos

- [ ] 0.1 PR de `refactor-iaservice-decomposition` (F2) mergeado em `develop` e arquivado — esta
      change toca exatamente os arquivos que aquele PR criou (`PlanoLlmValidator`,
      `TreinoNormalizador`, `EtapaFcValidator`, `PlanoLlmValidatorTest`,
      `PlanoLlmValidatorCaracterizacaoTest`).
- [ ] 0.2 DoR: `spec-reviewer` + Codex adversarial sobre `proposal.md` + `design.md`. Pedir ao Codex
      explicitamente: (a) a cauda comum declarada no `design.md` reproduz a ordem atual de
      `normalizarTreino` linha a linha? (b) algum passo da receita `INTERVALADO_TIRO` depende de
      estado que só existe antes de outro passo?
- [ ] 0.3 Branch `feature/pipeline-normalizacao-treino` a partir de `origin/develop`, em worktree.

## 1. Withers nos DTOs da LLM

- [ ] 1.1 `TreinoPlanejadoLlmDto`: `comEtapas(List<EtapaTreinoLlmDto>)`, `comRitmo(String)`,
      `comDistancia(Double)`, `comDuracao(String)`. Teste: cada wither preserva os outros 13 campos
      (um `@ParameterizedTest` sobre um record de fixture com todos os campos distintos).
- [ ] 1.2 `EtapaTreinoLlmDto`: `comDistancia(Double)`, `comDuracao(Integer)`, `comFc(String)`. Mesmo
      teste.
- [ ] 1.3 Substituir as reconstruções posicionais: `PlanoLlmValidator.java` (4×),
      `TreinoNormalizador.java` (4× treino + 6× etapa), `PlanoEstruturaReparador.java` (1×).
      `verify:` `grep -c "new TreinoPlanejadoLlmDto(" src/main/java/.../services/helper` = 0 e
      `grep -c "new EtapaTreinoLlmDto(" .../services/helper` = 0.
- [ ] 1.4 `./mvnw clean test` verde, saída dos testes de caracterização inalterada.
- [ ] 1.5 Commit `refactor(ia): withers em TreinoPlanejadoLlmDto/EtapaTreinoLlmDto (parte 1/3)`.

## 2. O module `NormalizacaoDeTreino`

- [ ] 2.1 `record ContextoNormalizacao(atleta, atletaId, zonasFC, tetoPorTipo, pisoPorTipo)` em
      `services/helper`.
- [ ] 2.2 `record Passo(String nome, Etapa fn)` + `@FunctionalInterface Etapa { TreinoPlanejadoLlmDto
      aplicar(TreinoPlanejadoLlmDto, ContextoNormalizacao); }` + `record Receita(List<Passo> passos)`
      com `nomes()`.
- [ ] 2.3 **TDD vermelho — golden da ordem:** `FamiliaTreinoTest` com a lista esperada de nomes por
      família (transcrita do `design.md`) e `de(tipo)` para os 11 `TipoTreino`. Vermelho porque o
      enum não existe.
- [ ] 2.4 `enum FamiliaTreino { INTERVALADO_TIRO, FARTLEK, TRES_ETAPAS, PADRAO }` com
      `static FamiliaTreino de(String tipoTreino)` (fechado; desconhecido → `PADRAO`) e a receita
      como campo. As receitas são montadas por um `ReceitasNormalizacao` package-private que recebe
      os colaboradores — o enum só nomeia; a lista concreta vem da instância do module (passos são
      lambdas de instância, decisão Q15). Golden verde.
- [ ] 2.5 Quebrar `validarTreinoIntervalado` nos 6 passos nomeados (`gate-existencia`,
      `gate-contagem`, `gate-ordem-aquec-desaq`, `gate-balanceamento`, `alerta-distancias`,
      `gate-duracao-tiros`); corrigir a mensagem "(mínimo 8)" → "(mínimo 6)". O método some.
- [ ] 2.6 `NormalizacaoDeTreino` (`@Component`): campos `TreinoNormalizador`, `EtapaFcValidator`,
      `PlanoEstruturaReparador`, `PaceValidator`; `normalizar(bruto, ctx)` resolve a família, itera
      a receita, loga DEBUG `passo={} alterou={}` por identidade do record.
- [ ] 2.7 **TDD — os 2 testes de ordem migram** de `PlanoLlmValidatorTest#ValidacaoPosNormalizacaoIA05`
      para `NormalizacaoDeTreinoTest`, chamando `normalizar` direto (sem mockar
      `TreinoHistoricoProvider`/`PaceHistoricoFormatter`/`ZonaTreinoService`): padding de 4 etapas →
      `LLMException` "mínimo 6"; tiro > 10 min pós-crescimento → `LLMException` "duração incoerente".
      Verdes na primeira execução (comportamento não muda) — se algum ficar vermelho, a cauda
      comum foi transcrita errada: parar e comparar com `normalizarTreino` atual.
- [ ] 2.8 `PlanoLlmValidator` encolhe: monta `ContextoNormalizacao` uma vez, `map(normalizar)`,
      `validarDistribuicaoCargaSemanal`, monta o DTO. Os 9 métodos públicos de validação por tipo
      saem (viram passos). `IaServiceImpl` não muda.
      `verify:` `wc -l PlanoLlmValidator.java` < 120.
- [ ] 2.9 `./mvnw clean test` verde; caracterização inalterada.
- [ ] 2.10 Commit `refactor(ia): NormalizacaoDeTreino — receita por familia, ordem como dado (parte 2/3)`.

## 3. Testes: substituir, não empilhar

- [ ] 3.1 `PlanoLlmValidatorCaracterizacaoTest` → `NormalizacaoDeTreinoCaracterizacaoTest`:
      chama `normalizar` direto; cada cenário assere `isEqualTo(esperado)` com o record completo
      escrito à mão (intervalado, longo, regenerativo). O esperado é **capturado do comportamento
      atual** (rodar uma vez, copiar o record) — é caracterização, não especificação.
- [ ] 3.2 Cenário **FARTLEK** novo na caracterização, com zonas FC presentes (é a família que o
      golden nunca cobriu e onde IA-02 morava): "4x (1min Z2 + 2min Z1)" expandido, FC por
      etapa Z2-Z4/Z1-Z2.
- [ ] 3.3 `PlanoLlmValidatorTest#Estrutura3Etapas` migra para testar o passo `validar-por-tipo`
      via `normalizar` (família `TRES_ETAPAS`); `PlanoLlmValidatorTest` fica só com o que sobrou
      no nível do plano (carga semanal) ou é apagado se vazio.
- [ ] 3.4 Confirmar que `TreinoNormalizador*Test` (6), `EtapaFcValidatorTest` continuam verdes sem
      alteração — são testes de internal seam.
- [ ] 3.5 `./mvnw clean verify` verde.
- [ ] 3.6 Commit `test(ia): caracterizacao com record completo + cenario FARTLEK (parte 3/3)`.

## 4. Validação final

- [ ] 4.1 Diff de comportamento: os 3 cenários de caracterização produzem o mesmo record antes e
      depois (a seção 3.1 capturou o "antes"); o cenário FARTLEK é adição, não mudança.
- [ ] 4.2 `/qa` (3 reviewers + Codex). Pedir ao Codex: a receita `INTERVALADO_TIRO` com
      `gate-duracao-tiros` 2× fecha os dois achados da branch F2 (padding e duração)?
- [ ] 4.3 `tasks.md` atualizado; `SPRINTS.md` (F2.5) marcado; arquivar via `/done` após merge.
