**Tamanho:** M · **Trilha:** Full

## Why

A branch `refactor-iaservice-decomposition` (F2) reduziu `IaServiceImpl` de ~1700 para 218 linhas e
concentrou a validação/normalização pós-LLM em `PlanoLlmValidator.normalizarTreino`
(`services/helper/PlanoLlmValidator.java:119-246`). O `/qa` daquela branch mostrou onde a fricção
sobrou: **dois dos bugs corrigidos ali eram bugs de ordem** dentro desse método —

1. `validarTreinoIntervalado` rodava *antes* de `normalizarTreinoIntervalado`, e o fix IA-05 (que
   recalcula `duracaoMin` ao ajustar `distanciaKm`) passou a produzir tiros acima do teto de 10 min
   que ninguém revalidava (achado do Codex, adversarial review 2026-09-14);
2. a correção ingênua — mover a validação inteira para depois — deixou o gate de 6 etapas rodar
   depois de `adicionarTiroERecuperacao`, que sintetiza pares tiro+recuperação: um treino que a IA
   gerou com 4 etapas passava completado pelo normalizador em vez de cair no retry (achado do
   code-reviewer, 2ª rodada).

Nenhum dos 9 arquivos de teste unitário das peças (`TreinoNormalizador*Test`, `EtapaFcValidatorTest`,
`PlanoLlmValidatorTest`) podia ver esses bugs: cada passo isolado estava correto. **A regra de
negócio é a ordem, e a ordem hoje mora em comentários** (`PlanoLlmValidator.java:138-148`), não em
nenhuma interface. Zero locality: o bug mora na composição, os testes moram nas peças.

Fricção secundária que o mesmo refactor resolve de graça: `TreinoPlanejadoLlmDto` (14 campos
posicionais) é reconstruído 8× no caminho quente e `EtapaTreinoLlmDto` (8 campos) 6× — campos
adjacentes do mesmo tipo (`duracaoMin/distanciaKm/ritmoAlvo`, `descricao/zonaAlvo`) tornam uma
troca de posição compilável e invisível aos testes. Cada passo novo custa mais uma cópia.

Origem: candidato #1 da revisão de arquitetura de 2026-09-14
(`/improve-codebase-architecture` sobre o núcleo de geração), fechado por grilling em 19 decisões —
ver `design.md`.

## What Changes

**Seção 1 — withers nos DTOs da LLM (pré-requisito).** `TreinoPlanejadoLlmDto` ganha
`comEtapas`, `comRitmo`, `comDistancia`, `comDuracao`; `EtapaTreinoLlmDto` ganha `comDistancia`,
`comDuracao`, `comFc`. As 14 reconstruções posicionais em `PlanoLlmValidator`, `TreinoNormalizador`
e `PlanoEstruturaReparador` são substituídas. O construtor canônico fica para o Jackson e as fixtures.

**Seção 2 — o module `NormalizacaoDeTreino`** (`services/helper`), interface
`normalizar(treinoBruto, ContextoNormalizacao)`:
- `enum FamiliaTreino { INTERVALADO_TIRO, FARTLEK, TRES_ETAPAS, PADRAO }`, cada uma carregando sua
  `Receita` (`List<Passo>`) e concatenando uma cauda comum (repetições → FC → pace → duração →
  distância-contínuo → triângulo) ao fim. `familiaDe(tipoTreino)` tem retorno fechado.
- `record Passo(String nome, Etapa fn)` com `Etapa = (treino, ctx) -> treino`. Um tipo só: passo de
  validação devolve o treino intacto e lança `LLMException`.
- `validarTreinoIntervalado` (~180 linhas, 7 checagens numeradas em comentário) **some**: vira 6
  passos nomeados da receita `INTERVALADO_TIRO`; `gate-duracao-tiros` aparece **duas vezes** na lista
  (antes e depois de `normalizar-intervalado`) — a regra do IA-05 lida direto no golden. A mensagem
  "(mínimo 8)" que contradiz a regra `< 6` é corrigida de passagem.
- O runner loga em DEBUG o nome de cada passo e se alterou o treino (identidade do record).
- `record ContextoNormalizacao(atleta, atletaId, zonasFC, tetoPorTipo, pisoPorTipo)` — só dados;
  os colaboradores (`TreinoNormalizador`, `EtapaFcValidator`, `PlanoEstruturaReparador`,
  `PaceValidator`) são campos do module e viram **internal seams**: nada mais os chama em produção.
- `PlanoLlmValidator` fica só com o nível do **plano semanal**: pré-computar o contexto, chamar o
  module por treino, `validarDistribuicaoCargaSemanal`, montar o DTO.

**Seção 3 — testes: substituir, não empilhar.**
- Golden da ordem: um teste por família assere `FamiliaTreino.X.receita().nomes()` contra a lista
  esperada, e um `for (values())` garante que nenhuma família fica sem receita.
- Os 2 testes de comportamento de ordem (`PlanoLlmValidatorTest#ValidacaoPosNormalizacaoIA05`:
  padding e duração) migram para a interface do module.
- `PlanoLlmValidatorCaracterizacaoTest` migra e passa a asserir o **record completo** escrito à mão
  por cenário (fecha o débito apontado pelo Codex: hoje só verifica contagem/tipo), e ganha um cenário
  FARTLEK — a família que o golden nunca cobriu e onde IA-02 morava.
- `TreinoNormalizador*Test`, `EtapaFcValidatorTest` ficam como testes de internal seam (descrevem
  regras — IA-03, IA-05 — que sobrevivem ao refactor).

**Glossário:** `CONTEXT.md` ganha **Receita de normalização** (já adicionado em 2026-09-14).

## Não-objetivos

- **Sem mudança de comportamento.** `PADRAO` (`FACIL`, `SUBIDA`, `PROVA`, `DESCANSO`) = a cauda comum
  de hoje, idêntica. Um `DESCANSO` sendo validado por pace é estranho, mas é decisão de domínio com
  dono (treinador), não de estrutura — fica como follow-up nomeado abaixo.
- Não faz o `PerfilFisiologico` (#3 da revisão: unificar as duas tabelas de fator de pace Z1/Z2
  divergentes — `×1.35/1.20` em `TreinoNormalizador` vs `×1.15–1.25/1.05–1.15` em
  `ZonaTreinoService`) nem o `PerfilAtletaPlano` (#4: parar de passar a entidade JPA `Atleta`, que
  hoje é relida do banco dentro do laço de retry). `ContextoNormalizacao` é onde os dois pousam
  depois; esta change deixa o slot pronto.
- Não toca `PlanoResilienceService`/ledger (#5) nem a tabela exceção→`GenerationOutcome` (#6).

## Relação com o roadmap

- **Depende do merge de `refactor-iaservice-decomposition` (F2).** Toca exatamente os arquivos que
  aquele PR criou.
- **Antes de F3 (`plan-generation-repair-turn`)**: o turno de reparo alimenta o LLM com as violações
  por treino/etapa — com passos nomeados, a violação já nasce com o nome do passo que a detectou.
- **Prepara F4 (`semantic-session-schema`)**: o DTO v2 sem pace/FC/distância/duração encolhe a
  validação para invariantes de estrutura + TSS do slot. Com receitas explícitas, esse encolhimento
  é um **diff de lista** por família, não uma reescrita de método de 130 linhas.

## Métrica de sucesso

- `IaServiceImpl` e `PlanoLlmValidator` não crescem; `PlanoLlmValidator` fica < 120 linhas.
- Zero reconstruções posicionais de `TreinoPlanejadoLlmDto`/`EtapaTreinoLlmDto` em `services/helper`.
- Um teste de ordem por família; os 2 testes de comportamento de ordem continuam verdes na nova
  interface; a caracterização assere records completos em 4 cenários.
- `./mvnw clean verify` verde; nenhuma mudança na saída dos cenários de caracterização fora da
  adição do cenário FARTLEK.

## Rollback

Sem migration nem mudança de contrato de API — `git revert` do commit de merge. Os withers (seção 1)
são aditivos e podem ficar mesmo se a seção 2 for revertida.

## Follow-ups nomeados (fora desta change)

- `DESCANSO`/`PROVA` deveriam pular pace/FC/triângulo? Decisão de domínio; com a receita `PADRAO`
  explícita, é uma linha.
- #3 `PerfilFisiologico` e #4 `PerfilAtletaPlano` — encolhem `ContextoNormalizacao` de 5 campos para 1.
- Observabilidade por passo como `Counter` (hoje só DEBUG) se algum passo virar suspeito.
