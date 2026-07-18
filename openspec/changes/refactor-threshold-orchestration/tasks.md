# Tasks: refactor-threshold-orchestration

**Status:** Proposed
**Tamanho:** S · Trilha: Fast
**Repos:** menthoros-backend (apenas)
**Dependências:** nenhuma

---

## 1. Extrair `AthleteThresholdUpdater` de `TsbServiceImpl`

- [x] 1.1 Criar `services/helper/AthleteThresholdUpdater.java` (`@Component`, `@RequiredArgsConstructor`)
  injetando `TreinoRealizadoRepository`, `ProvaRepository`, `ThresholdInferenceService`. Método público
  `atualizarLimiares(Atleta atleta, PlanoMetaDados metaDados, LocalDate hoje)` com o JavaDoc de
  Idempotent/Side Effects/Tenant-aware (Service Standards do CLAUDE.md).
- [x] 1.2 Mover para dentro dele, sem alterar lógica: `atualizarLimiareInferidos`,
  `atualizarPaceLimiarInferido`, `logSinalizacaoOutlierPace` (linhas 283–376 de `TsbServiceImpl.java`) e
  a constante `LIMIAR_OUTLIER_SEC_KM`.
  - `verify:` os métodos movidos compilam sem alterar assinatura interna nem comportamento.
- [x] 1.3 Atualizar `TsbServiceImpl`: injetar `AthleteThresholdUpdater`, remover `ProvaRepository` do
  construtor, trocar a chamada em `atualizarMetaDados` para
  `athleteThresholdUpdater.atualizarLimiares(atleta, metaDados, hoje)`.
  - `verify:` `grep -n "ProvaRepository" services/impl/TsbServiceImpl.java` não retorna nada (CA2).
  **Achado fora do escopo original:** 5 arquivos de teste (`TsbServiceImplRecalculoSemanticaTest`,
  `TsbServiceImplDiasConsecutivosTest`, `TsbServiceImplRecalculoHistoricoTest`,
  `TsbServiceImplRampRateTest`, `TsbServiceImplSemanticaTest`) construíam `new TsbServiceImpl(...)`
  manualmente (não via `@InjectMocks`) com o construtor de 8 args antigo — ajustados para o novo
  construtor de 7 args, criando `AthleteThresholdUpdater` real (ou com repos `null`) onde o teste
  precisava de comportamento de inferência real.
- [x] 1.4 Criar `AthleteThresholdUpdaterTest.java` (`@ExtendWith(MockitoExtension.class)`, `@Nested` por
  cenário, seguindo o padrão de `TreinoServiceImplTest`) portando os 9 cenários de
  `TsbServiceImplAtualizarLimiaresTest` chamando `atualizarLimiares(...)` direto — sem reflection.
  - `verify:` os mesmos asserts de valor/estado do teste original passam inalterados (CA1).
  **Nota:** eram 10 cenários (4 FC + 4 pace + 2 outlier), não 9 — a proposta subcontou por um; todos
  portados.
- [x] 1.5 Deletar `test/.../services/impl/TsbServiceImplAtualizarLimiaresTest.java`.
  - `verify:` `grep -rl "setAccessible" src/test/java/.../services/impl/TsbServiceImpl*` não retorna nada.

## 2. Staleness compartilhada em `ThresholdInferenceService`

- [x] 2.1 Adicionar `isFcLimiarDesatualizado(Atleta atleta, LocalDate hoje)` e
  `isPaceLimiarDesatualizado(Atleta atleta, LocalDate hoje)` em `ThresholdInferenceService` — puros,
  sem novas dependências injetadas. Guard `atleta == null → false`. Mesma regra hoje duplicada:
  `atleta.getFcLimiar() == null || atleta.getDataUltimoTesteFc() == null || ChronoUnit.DAYS.between(...) > DIAS_LIMIAR_DESATUALIZACAO`
  (idem para pace).
- [x] 2.2 Usar os dois métodos novos dentro de `AthleteThresholdUpdater.atualizarLimiares` (substitui o
  cálculo inline de `fcStale`/`paceStale` feito na Task 1).
  **Achado fora do escopo original:** `AthleteThresholdUpdaterTest` (task 1.4) mockava
  `thresholdInferenceService` inteiro — precisou ganhar `when(...isFcLimiarDesatualizado/...)` e
  `isPaceLimiarDesatualizado` explícitos em cada cenário (mock booleano sem stub retorna `false` por
  padrão, o que fazia os cenários "stale" pararem de disparar a inferência). 8 dos 10 testes ajustados.
- [x] 2.3 Testes em `ThresholdInferenceServiceTest`: FC/pace stale por `null`, por data antiga
  (>90 dias), não-stale (≤90 dias), e `atleta == null` retornando `false` nos dois métodos.
  - `verify:` `./mvnw test -Dtest=ThresholdInferenceServiceTest`. 45 testes (+14: 7 por método ×
  2 métodos, incluindo boundary exato de 90 dias).

## 3. Migrar os dois consumidores restantes

- [x] 3.1 `CoachAthleteProfileServiceImpl.resolverLimiareisInferidos`: trocar `fcDesatualizado`/
  `paceDesatualizado` inline pelas chamadas a `thresholdInferenceService.isFcLimiarDesatualizado(...)`/
  `isPaceLimiarDesatualizado(...)`. Nenhuma outra lógica do método muda.
  `CoachAthleteProfileServiceImpl` ganhou `ThresholdInferenceService` no construtor (não injetado
  antes, só usado estaticamente para `DIAS_LIMIAR_DESATUALIZACAO`/`formatarPace`).
- [x] 3.2 `ThresholdConstraintFormatter.fcLimiarDesatualizado`/`paceLimiarDesatualizado`: remover os
  métodos privados, chamar `ThresholdInferenceService` diretamente nos dois call sites
  (`constraintFc`/`constraintPace`).
  - `verify:` `grep -n "ChronoUnit.DAYS.between" services/impl/CoachAthleteProfileServiceImpl.java services/prompt/ThresholdConstraintFormatter.java` não retorna nada (CA3). Confirmado vazio.
  `ThresholdConstraintFormatter` ganhou `@RequiredArgsConstructor` + `ThresholdInferenceService`
  injetado (antes tinha 0 dependências).
- [x] 3.3 Ajustar os testes existentes de `CoachAthleteProfileServiceImplTest` e
  `ThresholdConstraintFormatterTest` (se mockarem `ThresholdInferenceService`, adicionar os `when(...)`
  necessários para os dois métodos novos; se montarem `Atleta` com datas específicas, manter — o
  comportamento observável não muda).
  **`ThresholdConstraintFormatterTest` não existe** no codebase (a spec presumiu um arquivo que
  nunca foi criado) — único consumidor de teste é `PlanoPromptArquetipos.java` (golden-master,
  helper de fixture, não um Test), que construía `new ThresholdConstraintFormatter()` sem args;
  ajustado para `new ThresholdConstraintFormatter(new ThresholdInferenceService())` (instância
  real, não mock — mantém o golden-master determinístico). `PlanoTreinoPromptBuilderGoldenTest`/
  `ProgressaoPromptIntegracaoTest` (7 testes) confirmam prompt byte-idêntico.
  `CoachAthleteProfileServiceImplTest` ganhou `@Mock ThresholdInferenceService`; 4 dos 7 cenários
  de `ResolverLimiareisInferidos` precisaram de `when(...isFcLimiarDesatualizado/isPaceLimiarDesatualizado...)`
  explícito (mesma causa da task 2.2 — mock sem stub retorna `false`).

## 4. Validação e limpeza

- [x] 4.1 `./mvnw clean test` — suíte completa verde (CA5). 1784 testes, 0 falhas.
- [x] 4.2 Conferir que `TsbServiceImpl` está em ~650 linhas (abaixo do teto informal do CLAUDE.md) —
  `wc -l services/impl/TsbServiceImpl.java`. 748 → 643 linhas.
- [x] 4.3 Revisar imports órfãos deixados pela extração (`ChronoUnit`, `Prova`, `ProvaRepository`,
  `FonteLimiarInferencia` etc.) em `TsbServiceImpl.java`. Já limpos na task 1.3 (removidos junto
  com os métodos movidos); nenhum órfão remanescente.

## 5. QA e entrega

- [ ] 5.1 `./mvnw clean test` verde.
- [ ] 5.2 QA (Fast track): `code-reviewer` + `clean-code-reviewer` sobre o diff — atenção a CA1 (nenhum
  assert de teste mudou de expectativa) e CA4 (persistência não duplicada).
- [ ] 5.3 Abrir PR (`feature/refactor-threshold-orchestration`) → `develop`.
