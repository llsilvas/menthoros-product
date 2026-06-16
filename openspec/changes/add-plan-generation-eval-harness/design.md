## Context

Estado real confirmado (2026-06-16):

- `PlanoTreinoPromptBuilder.buildOptimizedPrompt(Atleta, PlanoMetaDados, Prova, LocalDate inicioSemana, List<DiaSemana>)` — 533 linhas, monta o prompt agregando 8 formatters (`AlertasPromptFormatter`, `MetricasPromptFormatter`, `PeriodizacaoPromptFormatter`, `VariabilidadePromptFormatter`, `RecuperacaoPromptFormatter`, `DisponibilidadePromptFormatter`, `PaceHistoricoFormatter`, `PromptTemplateLoader`) + `IntervaladoElegibilidadeService`. **Zero testes.**
- A decisão determinística de intervalado já entra no prompt como instrução mandatória (`formatarDecisaoIntervalado`), via `IntervaladoElegibilidadeService.avaliar(...)`.
- O motor já calcula, antes do LLM: teto de pace por tipo (`PaceHistoricoFormatter.calcularTetoPorTipo`), TSS alvo (`PeriodizacaoPromptFormatter.calcularTssAlvoAjustado`), máximo de dias consecutivos, restrições de lesão.
- Skills relevantes ao oráculo de qualidade: `TrainingPrescriptionGuardSkill` (skills/prescription), `IntervaladoElegibilidadeSkill`, `RecoveryCargaSkill`.
- `IaServiceImpl.geraPlanoSemanalAvancado(...)` produz `PlanoSemanalLlmDto` (saída estruturada do LLM) — é o objeto que a Camada B verifica.

## D1 — Golden-master determinístico (Camada A)

- Capturar a saída de `buildOptimizedPrompt` para cada arquétipo em arquivo versionado `src/test/resources/golden/plano-prompt/<arquetipo>.txt`.
- Teste assert por igualdade (com `assertThat(prompt).isEqualTo(golden)`); mensagem de falha aponta o arquivo e sugere regeneração.
- **Regeneração explícita:** system property (ex.: `-Dgolden.update=true`) reescreve os arquivos; nunca automática. Mudança de golden = decisão revisada no diff.
- **Determinismo:** a data de referência vem de `ctx.dataReferencia()` (via `TreinoHistoricoProvider`). O fixture deve fixar a data (clock fixo / provider stubado) para o prompt ser reprodutível. Nenhum outro campo volátil é esperado; se houver, normalizar antes do assert.

### Arquétipos mínimos
`iniciante-sem-lesao` · `avancado-tsb-baixo` (degrada intervalado) · `com-lesao-ativa` (proíbe intervalado) · `taper-semana-prova` · `sem-dados` (exercita fallbacks).

## D2 — `PlanQualityChecker` determinístico (Camada B)

Componente puro que recebe (plano gerado + contexto determinístico) e retorna uma lista de violações tipadas:

```
check(PlanoSemanalLlmDto plano, ContextoDeterministico ctx) -> List<ViolacaoQualidade>
```

Regras (oráculo = motor determinístico, não opinião):
- **Intervalado:** se `RecomendacaoIntervalado` = Substituido/Degradado, o plano não pode conter sessão INTERVALADO acima da categoria permitida.
- **Teto de pace:** nenhuma sessão com pace-alvo mais rápido que o teto por tipo.
- **TSS alvo:** soma do TSS planejado dentro de tolerância do TSS alvo semanal.
- **Dias consecutivos:** não excede o máximo recomendado.
- **Lesão:** respeita restrições ativas.

`ViolacaoQualidade` carrega regra, severidade e evidência — é a métrica de "alucinação" tornada determinística.

**Reuso:** sempre que possível delegar a `TrainingPrescriptionGuardSkill` e aos serviços de elegibilidade/pace já existentes, em vez de reimplementar as regras. O checker é o agregador.

## D3 — Dois modos de eval

- **Offline (CI, no `./mvnw clean test`):** fixtures de plano "bom" e "alucinado" (JSON hand-authored) → o teste prova que o checker passa no bom e acusa o alucinado. **Não chama o LLM** (rápido, determinístico, sem custo/flakiness).
- **Ao vivo (opt-in):** profile/tag (ex.: `@Tag("llm-eval")`) que chama o LLM real para um atleta-fixture e roda o checker sobre a saída real, reportando score. Fora do gate de build; uso manual/nightly. Documentar como rodar.

## D4 — Escopo deliberadamente "observa, não altera"

Esta change **não** muda o fluxo de geração. `PlanQualityChecker` é usado pelo harness de eval, não injetado em `IaServiceImpl`. Transformá-lo em guard de produção (rejeitar/sinalizar plano alucinado em runtime) é decisão futura — naturalmente ligada a `add-llm-tool-use`/prescription-guard — e fica fora daqui para manter risco zero sobre a geração atual.

## D5 — Posicionamento no roadmap

Trilho da thread de IA. Ordem proposta no Bloco 1:

```
skills-core ✅ ─▶ add-plan-generation-eval-harness ─▶ debito-tecnico ─▶ add-llm-tool-use ─▶ llm-code-switching
                  (rede: golden-master + eval)         (gate)            (fim do monólito)    (EN/PT)
```

Cada change seguinte deve manter o golden-master verde (ou divergir com diff revisado) e não introduzir novas `ViolacaoQualidade` na eval.

## Risks / Trade-offs

- **[Risco] Golden-master quebradiço.** Mitigação: poucos arquétipos, data fixa, regeneração explícita e revisada. O objetivo é detectar mudança **não intencional** — falhar é o recurso, não o bug.
- **[Risco] Eval ao vivo é não-determinística e custa tokens.** Mitigação: fora do CI unitário, atrás de tag/profile, com poucos atletas-fixture.
- **[Trade-off] O checker duplica parte das regras do motor.** Mitigação: delegar às skills/serviços existentes; o checker agrega, não reimplementa.
