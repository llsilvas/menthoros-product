# Plano de Implementação — Menthoros com Spring AI + Skills.md + @Tool

**Documento:** Arquitetura técnica consolidada de Agent Skills
**Versão:** 3.0 (consolidação de v2.0 e v2.1)
**Data da consolidação:** 2026-04-22
**Audiência:** Engenharia, arquitetura técnica
**Base:** `Plano_SpringAI_Agent_Skills.md` v2.0 (Spring AI Generic Agent Skills) + `plano_spring_ai_agent_skills.md` v2.1 (Skills.md + @Tool)

---

## 0. Resumo e conflitos resolvidos

Esta consolidação unifica os dois planos anteriores em uma única arquitetura incremental. Três conflitos foram resolvidos explicitamente com a anuência do usuário (fase de definição):

1. **Skills.md + @Tool: complementares, não alternativos.**
   Adotamos o modelo de duas camadas de v2.1: Skills.md como "cérebro" (conhecimento modular carregado por tipo de treino) e `@Tool` como "mãos" (cálculos determinísticos em Java). A abordagem de v2.0 (Spring AI Generic Agent Skills) é usada como infraestrutura de orquestração nas fases avançadas (seções 11–12). A transição é **incremental**: começamos com Skills.md + @Tool simples e evoluímos para Generic Agent Skills quando o inventário justificar.

2. **Três camadas de execução como progressão, não como opções paralelas.**
   Adotamos ordem: (a) primeiro `@Tool` expostos via `add-llm-tool-use` (MVP), (b) em seguida `Skill<Request, Response>` encapsulando execução determinística + composição com Tools, (c) por último orquestração via `SkillRegistry` / workflows multi-skill. Cada camada é pré-requisito da próxima.

3. **Skills decidem; IA comunica.**
   A decisão fisiológica (ex: "este treino é Z2 puro") e prescritiva (ex: "aumente 10% no longo") é feita **dentro da Skill em Java**, de forma determinística. O LLM é responsável por **traduzir a decisão em linguagem natural personalizada** ao perfil do atleta e gerar narrativa educacional. Em nenhum momento o LLM toma decisão fisiológica numérica sem validação por Skill.

---

## 1. Visão geral

O Menthoros combina três ingredientes para gerar análise e plano de treino de qualidade profissional:

- **Dados observados** (Strava, Garmin, entrada manual): treinos realizados com etapas, FC, pace, elevação, RPE.
- **Motor determinístico** (`TssCalculatorService`, `TsbServiceImpl`, `IntervaladoElegibilidadeService`, etc): transforma dados em sinais fisiológicos (TSS, CTL/ATL/TSB, drift, decaimento).
- **Camada de Skills + LLM**: interpreta sinais no contexto do atleta e produz análise narrativa + prescrição.

Agent Skills no sentido desta arquitetura são **capacidades executáveis** que:

1. Podem ser chamadas diretamente por código Java
2. Podem ser expostas como tools para o LLM (`@Tool`)
3. Carregam um `.md` (cérebro) com regras de interpretação em linguagem natural
4. Produzem `SkillResult` tipado e determinístico

## 2. Arquitetura proposta

```
┌─────────────────────────────────────────────────────────────────┐
│                     SKILLS (.md)                                 │
│          "CÉREBRO" — O que o agente SABE                         │
│                                                                  │
│  interval-analysis.md   long-run-analysis.md  recovery-analysis │
│    Quando usar?            Quando usar?            Quando usar? │
│    Quais tools?            Quais tools?            Quais tools? │
│    Como interpretar?       Como interpretar?       Como interp.?│
│    Ranges por nível        Ranges por nível        Ranges p/nív.│
│    Recomendações           Recomendações           Recomendações│
└───────────┬─────────────────────┬──────────────────────┬────────┘
            │     Carregado dinamicamente por tipo       │
            └─────────────────────┬──────────────────────┘
                                  │
                    ┌─────────────▼──────────────┐
                    │    AnaliseSkillService       │
                    │   (Orquestrador Spring)      │
                    │  1. Identifica tipo treino   │
                    │  2. Carrega skill(.md)       │
                    │  3. Compõe system prompt     │
                    │  4. ChatClient + Tools       │
                    │  5. Structured Output        │
                    │  6. Persiste resultado       │
                    └─────────────┬──────────────┘
                                  │
┌─────────────────────────────────┼───────────────────────────────┐
│                     TOOLS (@Tool Java)                          │
│          "MÃOS" — O que o agente PODE FAZER                     │
│                                                                 │
│  IntervalAnalysisTools   LongRunAnalysisTools   AtletaContext   │
│   - decaimento()          - driftCardiaco()      - histórico()  │
│   - consistência()        - negativeSplit()      - perfil()     │
│   - recuperaçãoFC()       - efficiency()         - tendências() │
│                                                                 │
│  Cálculos DETERMINÍSTICOS em Java. Testáveis.                   │
└─────────────────────────────────────────────────────────────────┘
```

## 3. Implementação detalhada — contratos fundamentais

### 3.1 Contrato `Skill<I, O>`

```java
public interface Skill<I, O> {
    String getName();
    String getDescription();
    Class<I> getInputType();
    Class<O> getOutputType();
    O execute(I input, SkillContext context);
    Skill.Status checkPrerequisites(I input);
}
```

### 3.2 Contrato `SkillContext`

Carrega `tenantId`, `atletaId`, `sessionId` e referências aos serviços internos (injetados pelo orquestrador).

### 3.3 Contrato `@Tool` (Spring AI)

```java
@Component
public class IntervalAnalysisTools {
    @Tool(description = "Calcula decaimento percentual entre primeira e última etapa do intervalado")
    public double calcularDecaimento(UUID treinoId) { ... }
}
```

### 3.4 Relação entre Skill e @Tool

- Cada Skill pode usar 0..N ferramentas `@Tool` para seus cálculos.
- Cada `@Tool` pode ser registrada independentemente no `ChatClient` via `add-llm-tool-use` (ver openspec correspondente) para uso avulso pelo LLM.

## 4. Skills de análise (determinísticas)

O MVP cobre 3 Skills prioritárias, cada uma com seu par `.md` (cérebro) + `@Tool` (mãos):

- **IntervalAnalysisSkill**: decaimento entre tiros, consistência de pace, recuperação de FC entre séries.
- **LongRunAnalysisSkill**: drift cardíaco, negative split, pacing efficiency, estimativa de `tempoSustentado`.
- **RecoveryAnalysisSkill**: tempo de recuperação estimado, correlação com readiness (requer `add-daily-readiness-checkin`).

Detalhes específicos das regras, ranges, interpretação por nível e formato de resposta permanecem em arquivos `.md` versionados em `src/main/resources/skills/` — cada um com:

- Princípios fundamentais
- Ajuste de ranges por nível do atleta
- Formato da resposta (JSON Schema alvo)
- Contexto fisiológico
- Instruções passo a passo
- Gabaritos de recomendação

Para detalhes textuais das Skills MVP, consultar a versão original em `docs/archive/plano_spring_ai_agent_skills_v2.1.md` (após arquivamento) — o conteúdo de `.md` será migrado para `src/main/resources/skills/` durante a implementação.

## 5. Skills como Tools (para IA)

Além de serem chamadas diretamente pelo motor, cada Skill pode ser registrada como `@Tool` e exposta ao LLM via infraestrutura `LlmTool` da openspec `add-llm-tool-use`. Isso permite dois modos:

- **Modo orquestrado**: motor determinístico chama Skill, Skill invoca Tools, resultado alimenta o LLM para narrativa. Caminho padrão para análise pós-treino.
- **Modo agêntico**: LLM decide em tempo de conversa qual Skill invocar (ex: coach faz pergunta aberta e o LLM chama `IntervalAnalysisSkill` como tool). Caminho para interface conversacional.

Ambos os modos coexistem a partir da fase 3 (seção 11).

## 6. Comparação: YAML vs Spring AI Skills vs Skills.md + @Tool

| Aspecto | YAML-based (abandonado) | Spring AI Generic Agent Skills puro | Skills.md + @Tool (adotado) |
|---|---|---|---|
| Lógica | Regras estáticas em YAML | Tudo em Java | Conhecimento em `.md` + cálculo em Java |
| Testabilidade | Baixa | Alta | Alta (Tools testáveis) + validação de `.md` via snapshot |
| Versionamento | Git sobre YAML | Git sobre Java | Git sobre ambos; `.md` permite edição por não-devs |
| Modularidade | Média | Alta | Alta (carregamento dinâmico por tipo) |
| Evolução | Ruim (strings) | Boa | Ótima (cérebro e mãos evoluem separados) |

## 7. Cronograma

| Fase | Duração | Escopo |
|---|---|---|
| **Fase 1 — Tool foundation** | 2 semanas | Implementa `add-llm-tool-use` (3 tools iniciais: GetAtletaMetricasTool, GetHistoricoTreinosTool, GetProvaAlvoTool) |
| **Fase 2 — Skill MVP** | 3 semanas | `IntervalAnalysisSkill` (com Tools próprias), `LongRunAnalysisSkill`, orquestrador `AnaliseSkillService` |
| **Fase 3 — Skills avançadas** | 4 semanas | `RecoveryAnalysisSkill`, `RaceTimePredictionSkill` (consome `add-race-time-prediction`), `TaperGuidanceSkill` |
| **Fase 4 — Agêntico** | 2 semanas | Registro de Skills como Tools para modo conversacional (coach assistant) |

Fases 1–2 são bloqueantes para `introduce-domain-skills-architecture`.

## 8. Exemplo completo end-to-end

Fluxo para "Maria termina longão de 21 km":

1. Strava envia webhook → `TreinoRealizadoService.criar()` persiste etapas.
2. `TssCalculatorService` calcula TSS por etapa (após `refine-tss-tsb-precision` estar mergeada).
3. `TsbServiceImpl` atualiza CTL/ATL/TSB (após `fix-tsb-semantics`).
4. `PostWorkoutDebriefService` (`add-post-workout-debrief`) dispara análise:
   - Identifica tipo = `LONGO`
   - Carrega `long-run-analysis.md`
   - Invoca `LongRunAnalysisSkill.execute(treinoId, contexto)`
   - Skill usa `@Tool` para calcular drift cardíaco, negative split, efficiency
   - Skill devolve `SkillResult { metrics, interpretations, recommendations }`
5. `AnaliseSkillService` compõe prompt com `.md` + `SkillResult` → LLM gera narrativa personalizada
6. Frontend exibe narrativa + métricas determinísticas lado a lado

## 9. Vantagens da abordagem

- **Precisão garantida em cálculos** (motor Java determinístico, testável)
- **Personalização narrativa** (LLM + contexto do atleta)
- **Modularidade** (cada tipo de treino tem seu próprio `.md` e seu próprio Tool bundle)
- **Custo controlado** (prompts menores — apenas o `.md` relevante + dados compactos)
- **Observabilidade** (`tb_llm_tool_call` registra cada invocação, métricas Micrometer)
- **Multi-tenancy nativo** (Skills recebem `tenantId` via `SkillContext`)

## 10. Custos estimados

Custo por análise de treino (estimativa com GPT-4o temperature 0.2):

- Fase 1 (monolítico): prompt ~5k tokens → ~US$ 0.025 por análise
- Fase 2 (Skill + Tools): prompt ~1.5k tokens + 2-3 tool calls → ~US$ 0.015 por análise (40% de redução)
- Fase 3 (cache em idempotentes): ~US$ 0.010 por análise para treinos recorrentes

Para um usuário com 5 treinos/semana e mensalidade de R$ 30–50, a margem de custo LLM fica em <5%.

## 11. Próximos passos

1. **Finalizar `add-llm-tool-use`** (openspec) — infraestrutura base de Tools
2. **Migrar Skills plan para openspec `introduce-domain-skills-architecture`** com 13 seções deste doc como referência
3. **Implementar IntervalAnalysisSkill** como prova de conceito da fase 2
4. **Validar com 10 treinos históricos de 3 atletas** antes de expor ao produto
5. **Publicar `.md` iniciais** no repositório (`src/main/resources/skills/`) versionados como código

## 12. Referências

- Spring AI Generic Agent Skills: https://spring.io/blog/2026/01/13/spring-ai-generic-agent-skills
- Spring AI Function Calling / Tools: https://docs.spring.io/spring-ai/reference/api/tools.html
- OpenAI Function Calling: https://platform.openai.com/docs/guides/function-calling
- OpenSpec relevantes:
  - `introduce-domain-skills-architecture` (consumidor principal)
  - `add-llm-tool-use` (infraestrutura base)
  - `add-post-workout-debrief` (consumidor de Skills)
  - `add-race-time-prediction` (Skill candidata)
  - `add-taper-guidance` (Skill candidata)

## 13. Glossário

- **Skill**: capacidade executável em Java que combina cérebro (`.md`) e mãos (`@Tool`) para produzir `SkillResult` determinístico.
- **@Tool**: anotação do Spring AI que expõe um método Java como ferramenta invocável pelo LLM.
- **Skill.md**: arquivo markdown carregado dinamicamente que contém regras de interpretação em linguagem natural, usado como parte do system prompt.
- **SkillContext**: contrato com `tenantId`, `atletaId`, `sessionId` e referências aos serviços, injetado pelo orquestrador.
- **SkillResult**: DTO tipado contendo `metrics` (números determinísticos), `interpretations` (decisões fisiológicas) e `recommendations` (prescrições acionáveis).
- **AnaliseSkillService**: orquestrador Spring que identifica tipo de treino, carrega Skill apropriada e compõe chamada ao `ChatClient`.
- **LlmTool**: contrato interno do Menthoros (openspec `add-llm-tool-use`) que padroniza como Tools são descobertas, registradas e auditadas.
