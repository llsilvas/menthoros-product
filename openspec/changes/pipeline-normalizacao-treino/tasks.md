## Pré-requisitos

- [x] 0.1 PR de `refactor-iaservice-decomposition` (F2) mergeado em `develop` (PR #121, merge
      `72304b9`, 2026-09-14) e arquivado — esta change toca exatamente os arquivos que aquele PR
      criou (`PlanoLlmValidator`, `TreinoNormalizador`, `EtapaFcValidator`,
      `PlanoLlmValidatorTest`, `PlanoLlmValidatorCaracterizacaoTest`).
- [ ] 0.2 DoR: `spec-reviewer` + Codex adversarial sobre `proposal.md` + `design.md`. **1ª rodada
      (2026-09-14): NOT READY nos dois**, achados convergentes e verificados contra o código —
      (a) a receita `INTERVALADO_TIRO` omitia `gate-sequencia` (hard-fail "recuperação sem tiro
      anterior"); (b) `reparar-3-etapas` aparecia duas vezes (cauda + `TRES_ETAPAS`) e as guardas
      de FC/duração não estavam declaradas; (c) `alterou` por identidade mentiria (o normalizador
      sempre constrói record novo); (d) o baseline seria capturado depois do refactor. Todos
      corrigidos no `design.md`. **2ª rodada:** spec-reviewer READY (fidelidade linha a linha
      confirmada, `reparar` é identidade fora de `TIPOS_3_ETAPAS` — `PlanoEstruturaReparador.java:43-46`);
      Codex ainda NOT READY, agora no nível de predicado — (e) semântica de null não declarada
      (`gate-duracao-tiros` rejeita `duracaoMin == null`; `validar-repeticoes` é no-op com
      `etapas == null` e aceita `repeticoes == null`); (f) baseline sem cenário que exercite
      expansão→gate-contagem nem reparo→validação; (g) `alerta-distancias` só avalia proporções com
      `distanciaPlanejada > 0`; (h) mover o log de sucesso mudaria os valores logados; (i)
      `proposal.md` e o pseudocódigo ainda diziam "6 passos"/identidade. Todos corrigidos.
      **3ª rodada (Codex):** ordem e predicados confirmados contra `72304b9`; restou (j) os withers
      não cobriam `ordem` (`reordenarEtapas`, `PlanoEstruturaReparador.comOrdem`) e o gate "zero
      construtores" era inatingível porque expansão/reparo **criam** etapas — `comOrdem` adicionado
      em 1.2, gate restrito a reconstruções em 1.3. **4ª rodada (Codex):** restou só (k) o gate
      alcançava `RedistribuicaoTreinoHelper.atualizarDiaTreino`, fora do pipeline — confirmado por
      `grep` (1 ocorrência, as outras 9 são os 3 arquivos da change); gate restrito aos 3 arquivos
      em 1.3 e na métrica do `proposal.md`. Codex declarou "nenhum outro impedimento material".
      **Veredito consolidado: READY** — spec-reviewer READY na 2ª rodada; Codex sem achado aberto
      após (k), que é de escopo de `verify:`, não de comportamento.
      `verify:` ✅ 4 rodadas registradas acima.
- [x] 0.3 Branch `feature/pipeline-normalizacao-treino` a partir de `origin/develop` (`72304b9`), em
      worktree `.worktrees/pipeline-normalizacao-treino` (2026-09-14).
- [x] 0.4 (`982731f`, 12/12 verde em `72304b9`; capturado com um teste-rascunho que imprimia os
      records em sintaxe Java, depois apagado. Congelado sem julgar: aquec/desaq sintetizados pelo
      reparo saem com `distanciaKm = null`; no intervalado já expandido, gap +0.9 cresce tiros
      1.0→1.1 e o IA-05 recalcula duração 4→5.) **Baseline antes de qualquer refactor.** Reescrever `PlanoLlmValidatorCaracterizacaoTest`
      contra o `PlanoLlmValidator` **atual** (`72304b9`): record completo escrito à mão por cenário
      (`isEqualTo`), colaboradores reais para `TreinoNormalizador`/`EtapaFcValidator`/
      `PaceValidator`/`PlanoEstruturaReparador`, mocks só para as fontes de dados. Cenários:
      intervalado, longo, regenerativo, **fartlek com zonas FC** ("4x (1min Z2 + 2min Z1)"
      expandido; FC por etapa Z2-Z4 / Z1-Z2), **FACIL** (família `PADRAO`), e — para congelar as
      **dependências de ordem** que o Codex apontou na 2ª rodada — **intervalado comprimido**
      (`AQUECIMENTO + "5x800m Z4" + DESAQUECIMENTO`, 3 etapas na entrada, que só passa em
      `gate-contagem` porque `expandir` roda antes) e **REGENERATIVO só com PRINCIPAL** (1 etapa,
      que só passa em `validar-por-tipo` porque `reparar-3-etapas` sintetiza aquec/desaq antes, e
      sai com duração/distância finais). Quatro rejeições — padding de 4 etapas ("mínimo 6"), tiro
      > 10 min pós-crescimento ("duração incoerente"), tiro com `duracaoMin == null` ("duração
      incoerente", antes de qualquer normalização), e
      `AQUECIMENTO, RECUPERACAO, INTERVALADO, INTERVALADO, RECUPERACAO, DESAQUECIMENTO`
      ("recuperações sem tiro"). Mais um caso de aceitação de null: etapa com `repeticoes == null`
      passa. O esperado é **capturado** rodando uma vez e copiando o record — é caracterização, não
      especificação.
      `verify:` 12 cenários verdes em `72304b9`; commit próprio
      `test(ia): baseline de caracterizacao com record completo (parte 0/3)` antes da seção 1.

## 1. Withers nos DTOs da LLM

> **Seção entregue em `2e9811b`** (2026-09-14): 1.1–1.5 abaixo `[x]`. Gate 1.3 medido: 0 construtores
> de treino nos 3 arquivos; 7 `new EtapaTreinoLlmDto(` restantes, todos criações genuínas marcadas
> (2 pares da expansão NxDist/fartlek, 1 par de tiro extra, 1 síntese de aquec/desaq do reparo).
> `clean test` 3556/3556; baseline (`982731f`) com diff vazio.

- [x] 1.1 `TreinoPlanejadoLlmDto`: `comEtapas(List<EtapaTreinoLlmDto>)`, `comRitmo(String)`,
      `comDistancia(Double)`, `comDuracao(String)` — **sempre pelo construtor canônico de 14
      campos** (o overload de 11 apaga `descricao`/`zonaAlvo`/`provaId`).
      `verify:` `TreinoPlanejadoLlmDtoTest` — `@ParameterizedTest` sobre um record de fixture com
      os 14 campos distintos: cada wither muda só o seu campo e preserva os outros 13 (`isEqualTo`
      contra o record montado à mão).
- [x] 1.2 `EtapaTreinoLlmDto`: `comDistancia(Double)`, `comDuracao(Integer)`, `comFc(String)`,
      **`comOrdem(Integer)`** (achado do Codex, 3ª rodada: `TreinoNormalizador.reordenarEtapas`
      `:655-664` e `PlanoEstruturaReparador.comOrdem` `:96-98` renumeram `ordem` — sem esse wither a
      1.3 não fecha).
      `verify:` `EtapaTreinoLlmDtoTest`, mesmo formato, 8 campos, 4 withers.
- [x] 1.3 Substituir as **reconstruções de record existente** (cópia posicional que muda 1-2
      campos): `PlanoLlmValidator.java` (4× treino), `TreinoNormalizador.java` (4× treino;
      etapas em `reordenarEtapas`, `clampDistanciaPorTipo`, `distribuirDeltaPorTipo`,
      `corrigirEtapaTemporal`), `PlanoEstruturaReparador.java` (`comOrdem`). **Criações genuínas
      continuam pelo construtor canônico** — etapas sintetizadas por `expandirEtapasAgregadas`
      (`TreinoNormalizador.java:127-130`), `adicionarTiroERecuperacao` e o reparo que sintetiza
      aquec/desaq (`PlanoEstruturaReparador.java:92-93`) não têm record de origem.
      `verify:` **só nos 3 arquivos do pipeline** (`PlanoLlmValidator.java`,
      `TreinoNormalizador.java`, `PlanoEstruturaReparador.java` — DoR 4ª rodada:
      `RedistribuicaoTreinoHelper.atualizarDiaTreino` `:340-354` também reconstrói um treino,
      mudando `diaSemana`, e está fora do escopo desta change): `grep -c "new TreinoPlanejadoLlmDto("`
      = 0 nos 3 (treino nunca é criado do zero neles); para `new EtapaTreinoLlmDto(` nos 3, cada
      ocorrência restante está numa criação genuína e leva o comentário
      `// criação: sem record de origem` — listar as ocorrências no PR.
- [x] 1.4 `./mvnw clean test` verde (3556/3556); **baseline da 0.4 inalterado** (nenhum record esperado editado).
      `verify:` `git diff --stat -- '*CaracterizacaoTest.java'` vazio ✅.
- [x] 1.5 Commit `2e9811b` — `refactor(ia): withers em TreinoPlanejadoLlmDto/EtapaTreinoLlmDto (parte 1/3)`.

## 2. O module `NormalizacaoDeTreino`

- [ ] 2.1 `record ContextoNormalizacao(atleta, atletaId, zonasFC, tetoPorTipo, pisoPorTipo)` em
      `services/helper`.
      `verify:` compila; nenhum colaborador (`@Component`) entre os campos (decisão Q15).
- [ ] 2.2 `record Passo(String nome, Etapa fn)` + `@FunctionalInterface Etapa { TreinoPlanejadoLlmDto
      aplicar(TreinoPlanejadoLlmDto, ContextoNormalizacao); }` + `record Receita(List<Passo> passos)`
      com `nomes()`.
      `verify:` `ReceitaTest` — `nomes()` devolve os nomes na ordem de inserção; lista imutável.
- [ ] 2.3 **TDD vermelho — golden da ordem:** `FamiliaTreinoTest` com a lista esperada de nomes por
      família (transcrita do `design.md`, incluindo `gate-sequencia` e `gate-duracao-tiros` 2×) e
      `de(tipo)` para os 11 `TipoTreino`. Vermelho porque o enum não existe.
      `verify:` falha de compilação/asserção registrada antes de 2.4.
- [ ] 2.4 `enum FamiliaTreino { INTERVALADO_TIRO, FARTLEK, TRES_ETAPAS, PADRAO }` com
      `static FamiliaTreino de(String tipoTreino)` (fechado; desconhecido → `PADRAO`). As receitas
      são montadas por um `ReceitasNormalizacao` package-private que recebe os colaboradores — o
      enum só nomeia; a lista concreta vem da instância do module (passos são lambdas de
      instância, decisão Q15).
      `verify:` `FamiliaTreinoTest` verde.
- [ ] 2.5 Quebrar `validarTreinoIntervalado` nos passos nomeados da receita, **na ordem dos itens
      1-8 do método**: `gate-existencia`, `gate-contagem`, `gate-presenca-aquec-desaq`,
      `gate-ordem-aquec-desaq`, `alerta-poucos-tiros`, `gate-balanceamento`, `gate-sequencia`
      (hard-fail + 2 WARNs no mesmo laço), `alerta-distancias` (proporções só se
      `distanciaPlanejada > 0`), `gate-duracao-tiros` (`null` conta como inválido),
      `log-validacao-ok` (INFO, na posição de hoje, valores pré-normalização); corrigir a mensagem
      "(mínimo 8)" → "(mínimo 6)". O método some. `validar-repeticoes` na cauda preserva o no-op
      com `etapas == null` e a aceitação de `repeticoes == null`.
      `verify:` `grep -c "validarTreinoIntervalado" src/main` = 0; os 4 cenários de rejeição e o
      de `repeticoes == null` do baseline continuam verdes.
- [ ] 2.6 `NormalizacaoDeTreino` (`@Component`): campos `TreinoNormalizador`, `EtapaFcValidator`,
      `PlanoEstruturaReparador`, `PaceValidator`; `normalizar(bruto, ctx)` resolve a família, itera
      a receita, loga DEBUG `passo={} alterou={}` com `!antes.equals(depois)` (não identidade).
      `verify:` `NormalizacaoDeTreinoTest` — um passo que devolve record igual loga `alterou=false`
      (capturar log com `OutputCaptureExtension` ou `ListAppender`).
- [ ] 2.7 **Os cenários de rejeição migram** de `PlanoLlmValidatorTest#ValidacaoPosNormalizacaoIA05`
      para `NormalizacaoDeTreinoTest`, chamando `normalizar` direto. Verdes na primeira execução
      (comportamento não muda) — se algum ficar vermelho, a cauda foi transcrita errada: parar e
      comparar com `normalizarTreino` em `72304b9`.
      `verify:` 3 rejeições verdes com `hasMessageContaining` específico.
- [ ] 2.8 `PlanoLlmValidator` encolhe: monta `ContextoNormalizacao` uma vez, `map(normalizar)`,
      `validarDistribuicaoCargaSemanal`, monta o DTO. Os 9 métodos públicos de validação por tipo
      saem (viram passos). `IaServiceImpl` não muda.
      `verify:` `wc -l PlanoLlmValidator.java` < 120 (fallback declarado: se ficar entre 120 e
      140 só por JavaDoc, registrar e não cortar documentação para bater número).
- [ ] 2.9 `./mvnw clean test` verde; **baseline da 0.4 inalterado**.
      `verify:` `git diff --stat -- '*CaracterizacaoTest.java'` vazio.
- [ ] 2.10 Commit `refactor(ia): NormalizacaoDeTreino — receita por familia, ordem como dado (parte 2/3)`.

## 3. Testes: substituir, não empilhar

- [ ] 3.1 `PlanoLlmValidatorCaracterizacaoTest` → `NormalizacaoDeTreinoCaracterizacaoTest`: mesmos 12
      cenários e **mesmos records esperados** da 0.4, agora chamando `normalizar` direto (sem
      `PlanoLlmValidator`, sem `TreinoHistoricoProvider`/`PaceHistoricoFormatter`).
      `verify:` o diff dos records esperados entre a versão da 0.4 e esta é vazio (só muda o
      arranjo/chamada).
- [ ] 3.2 `PlanoLlmValidatorTest#Estrutura3Etapas` migra para testar o passo `validar-por-tipo`
      via `normalizar` (família `TRES_ETAPAS`); `PlanoLlmValidatorTest` fica só com o nível do plano
      (carga semanal) ou é apagado se vazio.
      `verify:` nenhum teste referencia método removido de `PlanoLlmValidator`.
- [ ] 3.3 Confirmar que `TreinoNormalizador*Test` (6) e `EtapaFcValidatorTest` continuam verdes sem
      alteração — testes de internal seam.
      `verify:` `git diff --stat` não lista esses arquivos.
- [ ] 3.4 `./mvnw clean verify` verde.
- [ ] 3.5 Commit `test(ia): caracterizacao migra para a interface do module (parte 3/3)`.

## 4. Validação final

- [ ] 4.1 Diff de comportamento: os 12 records/rejeições esperados da 0.4 são os mesmos em 3.1 (o
      baseline foi capturado em `72304b9`, antes de qualquer refactor).
- [ ] 4.2 `/qa` (3 reviewers + Codex). Pedir ao Codex: a receita `INTERVALADO_TIRO` com
      `gate-sequencia` e `gate-duracao-tiros` 2× fecha os dois achados da branch F2 (padding e
      duração) e o do DoR desta (sequência)?
- [ ] 4.3 `tasks.md` atualizado; `SPRINTS.md` (F2.5) marcado; arquivar via `/done` após merge.
