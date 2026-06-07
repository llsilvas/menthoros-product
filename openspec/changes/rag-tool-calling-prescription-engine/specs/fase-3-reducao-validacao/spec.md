## CONTEXT

Esta fase é consequência direta das Fases 1 e 2. Com Tool Calling, o LLM consulta zonas de FC, histórico e recuperação antes de gerar — eliminando a necessidade de corrigir dados incoerentes após a geração. O objetivo é reduzir o `IaServiceImpl` de 1.500+ linhas (~1.000 de validação reativa) para ~300 linhas de validação estrutural intencional.

---

## MODIFIED Requirements

### Requirement: Manter apenas validações estruturais obrigatórias

O sistema SHALL manter validações que verificam integridade estrutural do plano gerado, independentemente da origem dos dados.

#### Scenario: Treino intervalado com estrutura mínima
- **WHEN** o plano gerado contiver sessão do tipo `INTERVALADO`
- **THEN** o sistema SHALL verificar que a sessão contém ao menos 6 etapas
- **THEN** o sistema SHALL verificar que há alternância entre etapas `INTERVALADO` e `RECUPERACAO`
- **THEN** o sistema SHALL verificar que a sessão inicia com `AQUECIMENTO` e termina com `DESAQUECIMENTO`
- **THEN** se a estrutura for inválida, o sistema SHALL lançar `InvalidWorkoutStructureException` com descrição da violação

#### Scenario: Treino longo com exatamente 3 etapas
- **WHEN** o plano gerado contiver sessão do tipo `LONGO`
- **THEN** o sistema SHALL verificar que a sessão contém exatamente 3 etapas: `AQUECIMENTO`, `PRINCIPAL`, `DESAQUECIMENTO`

#### Scenario: Treino regenerativo com duração dentro dos limites
- **WHEN** o plano gerado contiver sessão do tipo `REGENERATIVO`
- **THEN** o sistema SHALL verificar que a duração total está entre 20 e 45 minutos

#### Scenario: Etapas agregadas expandidas
- **WHEN** o plano contiver etapas no padrão agregado (ex: "6x400m", "4x(1min Z2 + 2min Z1)")
- **THEN** o sistema SHALL expandir automaticamente para etapas individuais antes de persistir
- **THEN** cada repetição SHALL gerar um par `INTERVALADO` + `RECUPERACAO` no plano final

### Requirement: Remover validações reativas de dados disponíveis via Tool Calling

O sistema SHALL remover correções pós-geração que compensavam a ausência de dados precisos no prompt. Essas correções são redundantes após a Fase 1 porque o LLM consultou os dados corretos antes de gerar.

#### Scenario: Ausência de correção de FC por zona
- **WHEN** o LLM gerar uma sessão com `fcAlvo` de uma zona específica
- **THEN** o sistema SHALL confiar que o LLM usou os dados de `getTrainingZones()` para prescrever FC coerente
- **THEN** o sistema NOT SHALL executar `validarECorrigirZonaFC()` ou qualquer lógica de "ajustar para quartil central da zona"

#### Scenario: Ausência de correção do triângulo pace × distância × duração
- **WHEN** o LLM gerar uma sessão com `distanciaKm`, `duracaoMin` e `ritmoAlvo`
- **THEN** o sistema SHALL confiar que os valores são coerentes com os dados consultados via tools
- **THEN** o sistema NOT SHALL executar validação de "triângulo pace × distância × duração"
- **NOTA:** se incoerências persistirem em produção, adicionar log de warning em vez de correção silenciosa

#### Scenario: Ausência de correção de volume semanal por TSB
- **WHEN** o LLM gerar `volumePlanejadoKm`
- **THEN** o sistema SHALL confiar que o LLM usou `getRecoveryStatus()` para calibrar volume
- **THEN** o sistema NOT SHALL ajustar `volumePlanejadoKm` com base em TSB calculado pós-geração

### Requirement: Reduzir IaServiceImpl para responsabilidade única

O `IaServiceImpl` SHALL ser responsável apenas por: orquestrar a chamada ao LLM com tools e advisor, e executar validações estruturais obrigatórias.

#### Scenario: IaServiceImpl sem formatters de prompt
- **WHEN** `gerarPlano()` for invocado após a Fase 1
- **THEN** o `IaServiceImpl` SHALL não instanciar nem chamar nenhum dos formatters: `MetricasPromptFormatter`, `AlertasPromptFormatter`, `RecuperacaoPromptFormatter`, `PeriodizacaoPromptFormatter`, `VariabilidadePromptFormatter`, `DisponibilidadePromptFormatter`, `PaceHistoricoFormatter`
- **THEN** esses formatters SHALL ser removidos do codebase ou marcados como `@Deprecated` com remoção planejada

#### Scenario: Validação pós-geração limitada a ~300 linhas
- **WHEN** a Fase 3 estiver completa
- **THEN** o total de linhas de código de validação em `IaServiceImpl` (ou serviço substituto) SHALL ser ≤ 350 linhas
- **THEN** cada método de validação remanescente SHALL ter um comentário declarando o invariante que valida e por que não pode ser garantido via Tool Calling

### Requirement: Registrar métricas de qualidade pré e pós refatoração

O sistema SHALL instrumentar a qualidade dos planos gerados para comparar a versão legada (prompt template) com a versão moderna (RAG + Tool Calling).

#### Scenario: Campo de versão de geração no plano
- **WHEN** um plano semanal for persistido
- **THEN** o sistema SHALL registrar `geradoPorVersao` no plano: `v1` (prompt template legado) ou `v2` (RAG + Tool Calling)

#### Scenario: Registro de edição pelo coach
- **WHEN** um coach aprovar um plano sem fazer edições
- **THEN** o campo `editadoPeloCoach` SHALL ser `false`
- **WHEN** um coach salvar um plano com alterações em relação ao gerado
- **THEN** o campo `editadoPeloCoach` SHALL ser `true`

#### Scenario: Query de taxa de aceitação por versão
- **WHEN** a instrumentação estiver em produção por ao menos 4 semanas
- **THEN** SHALL existir query de baseline:
  ```sql
  SELECT gerado_por_versao,
         AVG(CASE WHEN NOT editado_pelo_coach THEN 1.0 ELSE 0.0 END) AS taxa_aceitacao,
         COUNT(*) AS total_planos
  FROM tb_plano_treino
  GROUP BY gerado_por_versao
  ```
- **THEN** a transição de `v1` para `v2` como padrão SHALL ocorrer quando `taxa_aceitacao` da `v2` atingir ≥ 75% em piloto

## NON-GOALS

- Reescrever o `IaServiceImpl` como classe nova (refatoração incremental, não reescrita)
- Remover validação de expansão de etapas agregadas (esta validação é estrutural, não reativa)
- Alterar os DTOs `PlanoSemanalLlmDto`, `TreinoPlanejadoLlmDto` ou `EtapaTreinoLlmDto`
- Modificar o fluxo de análise pós-treino (`WorkoutAnalysisListener`) — escopo separado
