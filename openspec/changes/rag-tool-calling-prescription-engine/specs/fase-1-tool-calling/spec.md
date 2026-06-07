## ADDED Requirements

### Requirement: Expor dados do atleta como ferramentas invocáveis pelo LLM

O sistema SHALL expor os dados dinâmicos do atleta como tools `@Tool` do Spring AI, consultáveis sob demanda pelo LLM durante a geração do plano semanal.

#### Scenario: LLM consulta perfil fisiológico do atleta
- **WHEN** o LLM iniciar a geração do plano semanal
- **THEN** o sistema SHALL disponibilizar a tool `getAthleteProfile(atletaId)` retornando: FC máxima, FC limiar, VO2max estimado, pace limiar, nível de experiência e peso
- **THEN** o LLM SHALL invocar essa tool antes de prescrever intensidades e zonas de FC

#### Scenario: LLM consulta histórico recente de treinos
- **WHEN** o LLM precisar avaliar aderência e padrão de carga das últimas semanas
- **THEN** o sistema SHALL disponibilizar a tool `getRecentWorkouts(atletaId, weeks)` retornando lista com: data, tipo, distância planejada vs realizada, TSS, pace médio e RPE
- **THEN** o LLM SHALL consultar no mínimo 2 semanas de histórico antes de definir volume semanal

#### Scenario: LLM consulta estado de recuperação atual
- **WHEN** o LLM precisar avaliar se o atleta está em condição de suportar carga elevada
- **THEN** o sistema SHALL disponibilizar a tool `getRecoveryStatus(atletaId)` retornando: CTL, ATL, TSB e estado qualitativo de fadiga
- **THEN** o LLM SHALL usar TSB para classificar a semana como: carga (TSB < -10), manutenção (-10 ≤ TSB ≤ 5) ou recuperação (TSB > 5)

#### Scenario: LLM consulta zonas de treinamento
- **WHEN** o LLM precisar prescrever sessões com zona alvo de FC ou pace
- **THEN** o sistema SHALL disponibilizar a tool `getTrainingZones(atletaId)` retornando zonas Z1–Z5 em bpm e em pace (min/km)
- **THEN** toda sessão prescrita SHALL referenciar ao menos uma zona retornada por esta tool

#### Scenario: LLM consulta elegibilidade para treinos intervalados
- **WHEN** o LLM avaliar se pode incluir sessão intervalada na semana
- **THEN** o sistema SHALL disponibilizar a tool `getIntervalEligibility(atletaId)` retornando: elegível (true/false), motivo e restrições vigentes
- **THEN** o LLM SHALL omitir sessões intervaladas se `elegivel = false`

#### Scenario: LLM consulta disponibilidade semanal do atleta
- **WHEN** o LLM for distribuir as sessões pelos dias da semana
- **THEN** o sistema SHALL disponibilizar a tool `getWeeklyAvailability(atletaId)` retornando: dias disponíveis e dia preferido para longão
- **THEN** o plano SHALL conter sessões apenas nos dias disponíveis retornados por esta tool

### Requirement: Garantir isolamento multi-tenant em todas as tools

O sistema SHALL garantir que nenhuma tool retorne dados de atleta pertencente a tenant diferente do contexto ativo.

#### Scenario: Tentativa de acesso cross-tenant
- **WHEN** uma tool for invocada com `atletaId` de atleta pertencente a tenant diferente do `TenantContext` ativo
- **THEN** o sistema SHALL lançar `AccessDeniedException`
- **THEN** nenhum dado do atleta alvo SHALL ser retornado ou logado

#### Scenario: Tool invocada com tenant correto
- **WHEN** uma tool for invocada com `atletaId` de atleta pertencente ao tenant ativo
- **THEN** a tool SHALL retornar os dados normalmente

### Requirement: Substituir injeção upfront de dados no prompt

O sistema SHALL remover a injeção antecipada de dados do atleta no prompt de geração do plano.

#### Scenario: Prompt de geração sem dados interpolados
- **WHEN** o `PlanoSemanalService` iniciar a geração
- **THEN** o prompt de usuário enviado ao LLM SHALL conter apenas: identificador do atleta e semana de referência
- **THEN** o prompt NÃO SHALL conter: métricas de CTL/ATL/TSB interpoladas, histórico de treinos serializado, zonas de FC como texto, ou qualquer dado que uma tool possa fornecer
- **THEN** os formatters `MetricasPromptFormatter`, `AlertasPromptFormatter`, `RecuperacaoPromptFormatter`, `PeriodizacaoPromptFormatter`, `VariabilidadePromptFormatter`, `DisponibilidadePromptFormatter` e `PaceHistoricoFormatter` SHALL ser removidos do fluxo de geração

#### Scenario: LLM solicita dados que necessita via tool call
- **WHEN** o LLM precisar de qualquer dado do atleta para gerar o plano
- **THEN** o LLM SHALL invocar a tool correspondente
- **THEN** o sistema SHALL registrar no log cada tool invocada, com latência e summary do retorno

### Requirement: Preservar structured output tipado

O sistema SHALL manter o output da geração de plano como `PlanoSemanalLlmDto` via `.entity()`.

#### Scenario: Geração retorna DTO tipado
- **WHEN** o LLM concluir a geração do plano
- **THEN** o retorno SHALL ser deserializado automaticamente para `PlanoSemanalLlmDto`
- **THEN** campos obrigatórios do DTO SHALL estar preenchidos (nunca nulos): `volumePlanejadoKm`, `objetivoSemanal`, `treinosPlanejados`

## MODIFIED Requirements

### Requirement: PlanoSemanalService usa ChatClient com tools

O `PlanoSemanalService.gerarPlano()` SHALL usar `ChatClient` configurado com `AthleteQueryTools` registradas via `.tools()`.

#### Scenario: Chamada ao LLM com tools disponíveis
- **WHEN** `gerarPlano(atletaId, semana)` for invocado
- **THEN** o `ChatClient` SHALL ter as tools de `AthleteQueryTools` disponíveis
- **THEN** o fluxo SHALL usar `.tools(athleteQueryTools).call().entity(PlanoSemanalLlmDto.class)`
