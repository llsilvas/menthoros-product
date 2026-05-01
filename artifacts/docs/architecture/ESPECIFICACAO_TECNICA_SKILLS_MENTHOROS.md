# Especificação Técnica - Uso de Skills no Menthoros

**Data:** 2026-04-07  
**Status:** Proposta técnica recomendada  
**Objetivo:** elevar a assertividade do Menthoros na análise de dados, avaliação de evolução do atleta e prescrição de treinos de corrida para perfis de iniciante a elite

## 1. Resumo Executivo

O Menthoros já possui uma base forte para prescrição assistida por IA, mas sua assertividade ainda depende demais de contexto textual montado para o LLM e de métricas agregadas em partes críticas do domínio. A melhor evolução para o projeto não é delegar mais decisões ao modelo, e sim estruturar um **ecossistema de skills de domínio** que calculem, interpretem e validem sinais fisiológicos de forma determinística antes da chamada ao LLM.

A recomendação técnica para o Menthoros é adotar uma **arquitetura híbrida**:

- **Skills determinísticas de domínio** como camada principal de decisão e interpretação esportiva
- **Agent skills/tools do Spring AI** como camada secundária de orquestração, consulta e explicação
- **LLM** como camada final de síntese, comunicação e montagem contextual da prescrição

Em termos práticos: no Menthoros, a skill deve dizer **o que é seguro, coerente e fisiologicamente justificável**; a IA deve dizer **como explicar e organizar isso para o atleta**.

## 2. Diagnóstico do Estado Atual

### 2.1 Pontos fortes já existentes

O projeto já possui fundamentos importantes:

- `PlanoTreinoPromptBuilder` concentra contexto rico, histórico, alertas, periodização, disponibilidade e zonas.
- `IntervaladoElegibilidadeService` já toma decisão determinística para autorizar, degradar ou proibir intervalados.
- `MetricasAlertaService` já interpreta TSB, ramp rate, dias consecutivos e recomendações.
- `ZonaTreinoService` e `PaceZoneCalculator` já transformam limiares do atleta em zonas utilizáveis.
- `TreinoHistoricoProvider` já consolida dados históricos em uma única carga.
- `EtapaRealizada` já existe e abre caminho para análise granular por repetição/bloco.
- Há documentação e backlog claros para integração Strava e ingestão de laps/splits.

Isso significa que o Menthoros **já está parcialmente orientado a skills**, mesmo sem chamar essas peças formalmente desse nome.

### 2.2 Limitações atuais

Os principais limites identificados são:

- O conhecimento de domínio está espalhado entre helpers, formatadores, prompt e docs, sem um contrato único de skill.
- Parte da inteligência ainda chega ao LLM como texto livre, reduzindo auditabilidade.
- O cálculo e a interpretação ainda usam, em vários pontos, métricas agregadas do treino, quando já existe infraestrutura para granularidade por etapas.
- Falta uma camada explícita de “análise estruturada” reaproveitável para evolução do atleta, revisão semanal, comparação planejado vs realizado e prescrição futura.
- A futura integração com Strava ainda não está conectada a um pipeline de skills que aproveite laps, FC por split, cadência e potência.

## 3. Objetivos da Arquitetura de Skills

As skills devem permitir que o Menthoros:

1. Analise treinos realizados com regras esportivas auditáveis.
2. Gere sinais objetivos de evolução, fadiga, prontidão e aderência.
3. Restrinja a liberdade do LLM em decisões críticas de prescrição.
4. Reaproveite a mesma interpretação em múltiplos fluxos:
   - análise pós-treino
   - revisão semanal
   - geração de plano
   - ajuste de zonas
   - recomendação de testes
5. Escale para perfis distintos:
   - iniciante
   - intermediário
   - avançado
   - elite
6. Incorporar dados granulares de Strava/Garmin sem reescrever a lógica central.

## 4. Recomendação Arquitetural

### 4.1 Modelo recomendado

Adotar três camadas complementares:

### Camada A - Domain Skills Determinísticas

São serviços Java especializados, com entrada e saída estruturadas, sem depender do LLM.

Características:

- implementadas como componentes Spring
- operam sobre entidades e DTOs de domínio
- retornam resultado tipado
- possuem thresholds versionáveis
- podem ser testadas com unit tests e golden datasets

Exemplos:

- `IntervalWorkoutAnalysisSkill`
- `LongRunAnalysisSkill`
- `WeeklyLoadReviewSkill`
- `AthleteProgressionSkill`
- `TrainingPrescriptionGuardSkill`
- `TrainingZoneAssessmentSkill`
- `RecoveryReadinessSkill`

### Camada B - Skill Registry + Orchestrator

Serviço responsável por:

- detectar skills aplicáveis
- carregar contexto necessário
- executar skills em ordem definida
- consolidar resultados
- produzir um `AthleteAnalysisSnapshot` reutilizável

### Camada C - Agent Skills/Tools para o LLM

Expor parte das skills como tools do Spring AI apenas onde isso fizer sentido:

- revisão semanal explicativa
- chat com treinador/atleta
- geração contextual de plano
- justificativas em linguagem natural

Regra central:

- o LLM **pode consultar** skills
- o LLM **não deve substituir** skills
- a decisão final de segurança, intensidade máxima e elegibilidade deve continuar determinística

## 5. Padrão Técnico das Skills

Cada skill deve seguir um contrato comum.

### 5.1 Interface sugerida

```java
public interface DomainSkill<I, O> {
    String key();
    SkillCategory category();
    boolean supports(SkillContext context);
    O execute(I input, SkillContext context);
}
```

### 5.2 Objetos base sugeridos

```java
public record SkillContext(
        UUID atletaId,
        LocalDate dataReferencia,
        NivelExperiencia nivel,
        PlanoMetaDados metaDados,
        List<TreinoRealizado> treinosRecentes,
        List<Prova> provas,
        Map<String, Object> extras
) {}
```

```java
public record SkillResult<T>(
        String skillKey,
        String version,
        SkillSeverity severity,
        T payload,
        List<String> alerts,
        List<String> recommendations,
        Map<String, Object> evidence
) {}
```

### 5.3 Características obrigatórias

- saída estruturada e serializável
- evidências explícitas usadas na decisão
- versão da regra
- indicação de confiabilidade do resultado
- comportamento degradado quando faltarem dados
- possibilidade de `not_applicable`

## 6. Skills Prioritárias para o Menthoros

### 6.1 Skill 1 - `interval-workout-analysis`

**Objetivo:** avaliar intervalados com granularidade por etapa.

Entradas principais:

- `TreinoRealizado`
- `EtapaRealizada`
- dados fisiológicos do atleta
- histórico de intervalados comparáveis

Métricas:

- decaimento de pace
- consistência entre repetições
- recuperação de FC entre blocos
- relação pace planejado vs executado
- RPE por bloco
- aderência da sessão ao objetivo fisiológico

Saídas:

- classificação da execução
- risco de prescrição excessiva
- recomendação do próximo estímulo
- tendência de evolução em intervalados

### 6.2 Skill 2 - `long-run-analysis`

**Objetivo:** avaliar longões e treinos contínuos extensivos.

Métricas:

- drift cardíaco
- positive/negative split
- estabilidade de pace em Z2/Z3
- desacoplamento pace x FC
- custo fisiológico relativo ao volume atual

Saídas:

- qualidade do longo
- sinal de base aeróbica
- risco de fadiga residual
- prontidão para progressão de distância ou finish fast

### 6.3 Skill 3 - `training-prescription-guard`

**Objetivo:** validar qualquer plano antes de enviar ao atleta.

Responsabilidades:

- checar volume vs média recente
- checar TSS alvo vs TSS do plano
- checar dias consecutivos
- checar conflitos com lesão/restrição
- checar coerência com fase da periodização
- checar repetição indevida de estímulo
- checar compatibilidade com nível do atleta

Essa skill deve atuar como **último gate determinístico** antes da persistência do plano.

### 6.4 Skill 4 - `athlete-progression-analysis`

**Objetivo:** medir evolução real do atleta, não apenas carga.

Métricas:

- evolução de pace em zonas comparáveis
- evolução de TSS tolerado com RPE estável
- frequência de cumprimento do planejado
- melhora de eficiência em longos e intervalados
- estabilidade de recuperação semanal
- aderência ao plano por ciclo

Saídas:

- evolução positiva, estável ou regressiva
- qual dimensão evoluiu: aeróbica, limiar, VO2, resistência específica, consistência
- necessidade de reavaliar limiares/testes

### 6.5 Skill 5 - `recovery-readiness`

**Objetivo:** transformar estado recente em recomendação operacional.

Métricas:

- TSB
- ATL/CTL
- ramp rate relativo
- dias consecutivos
- RPE recente
- sono/estresse/feedback do atleta
- densidade de treinos intensivos

Saídas:

- pronto para intensidade
- intensidade degradada
- manter base
- regenerativo obrigatório

### 6.6 Skill 6 - `training-zone-assessment`

**Objetivo:** validar e atualizar confiabilidade das zonas do atleta.

Responsabilidades:

- detectar limiar desatualizado
- detectar incoerência entre pace limiar e performance recente
- recomendar protocolo de teste
- marcar zonas como confiáveis, estimadas ou vencidas

Isso é essencial para evitar prescrição “precisa demais com dado ruim”.

## 7. Mudanças Técnicas Necessárias no Projeto

### 7.1 Nova camada de domínio

Criar pacote dedicado:

```text
src/main/java/com/menthoros/skills/
  core/
  analysis/
  prescription/
  recovery/
  progression/
  zone/
  dto/
```

Estrutura mínima sugerida:

- `DomainSkill.java`
- `SkillContext.java`
- `SkillResult.java`
- `SkillRegistry.java`
- `SkillOrchestratorService.java`
- `AthleteAnalysisSnapshot.java`

### 7.2 Refatorar lógica dispersa para dentro de skills

Migrar gradualmente a lógica hoje espalhada em:

- `MetricasAlertaService`
- `IntervaladoElegibilidadeService`
- partes analíticas de `VariabilidadePromptFormatter`
- partes de `PlanoTreinoPromptBuilder`
- futuras análises hoje descritas apenas em documentação

Observação importante:

- não é para apagar essas classes de imediato
- primeiro elas devem passar a delegar para skills
- depois podem virar adapters/facades

### 7.3 Criar snapshot estruturado para a IA

Hoje o `PlanoTreinoPromptBuilder` monta muito contexto em texto. A proposta é gerar antes um snapshot estruturado.

Exemplo:

```java
public record AthleteAnalysisSnapshot(
        RecoveryReadinessSummary recovery,
        ProgressionSummary progression,
        IntervalCapabilitySummary intervalCapability,
        LongRunCapabilitySummary longRunCapability,
        PrescriptionConstraints constraints,
        ZoneConfidenceSummary zones,
        List<SkillResult<?>> rawResults
) {}
```

Uso:

- o prompt passa a serializar esse snapshot
- o LLM recebe menos texto opinativo e mais estrutura de decisão
- o mesmo snapshot pode ser salvo para auditoria

### 7.4 Integrar skills ao fluxo de geração de plano

Fluxo recomendado:

1. `TreinoHistoricoProvider` monta contexto
2. `SkillOrchestratorService` executa skills aplicáveis
3. gera `AthleteAnalysisSnapshot`
4. `PlanoTreinoPromptBuilder` usa snapshot + dados do atleta
5. LLM propõe plano
6. `training-prescription-guard` valida o plano gerado
7. persistir apenas se validado

### 7.5 Integrar skills ao fluxo pós-treino

Fluxo recomendado:

1. treino realizado é salvo
2. TSS/TSB são recalculados
3. skills de análise do treino são executadas
4. resultado estruturado é salvo
5. feed do atleta e revisão semanal passam a consumir essa análise

### 7.6 Persistir resultados das skills

Adicionar entidade de persistência para auditabilidade.

Sugestão:

```text
SkillExecution
- id
- atleta_id
- treino_realizado_id nullable
- plano_semanal_id nullable
- skill_key
- skill_version
- executed_at
- severity
- confidence
- payload_json
- evidence_json
- recommendations_json
```

Benefícios:

- histórico de interpretação
- comparabilidade entre versões
- suporte a explainability
- base futura para analytics e fine-tuning de regras

### 7.7 Aproveitar `EtapaRealizada` de forma real

Hoje `EtapaRealizada` já existe, mas ainda está subutilizada. Para skills funcionarem com alta assertividade, é obrigatório:

- usar etapas no cálculo de TSS quando existirem
- comparar etapa planejada vs etapa realizada
- classificar blocos de esforço/recuperação
- priorizar análise por repetição em intervalados
- enriquecer importação Strava com laps, cadência, potência e elevação por split

Sem isso, várias skills ficam limitadas a inferência por média geral.

### 7.8 Conectar skills ao roadmap Strava

O roadmap Strava deve ser tratado como habilitador direto das skills.

Impactos:

- `EtapaRealizada` passa a receber laps reais
- `interval-workout-analysis` ganha precisão real
- `long-run-analysis` ganha drift e split mais confiáveis
- `athlete-progression-analysis` passa a comparar sessões homogêneas
- `training-zone-assessment` passa a detectar inconsistências com base observada

Conclusão prática:

- **sem ingestão granular, as skills serão boas**
- **com ingestão granular, as skills serão diferenciadoras**

## 8. Onde usar Agent Skills do Spring AI

O uso de agent skills/tools do Spring AI é recomendado, mas com escopo controlado.

### Usos recomendados

- chat assistido para treinador
- revisão semanal narrativa
- explicação em linguagem natural do motivo de um treino
- sumarização de `AthleteAnalysisSnapshot`
- escolha de quais blocos explicativos mostrar ao usuário

### Usos não recomendados

- decidir sozinho se atleta pode fazer intensidade
- definir sozinho volume semanal
- reestimar zonas sem regra determinística
- sobrescrever restrições de lesão, TSB ou ramp rate

Resumo:

- **Spring AI Agent Skills = ótima camada de interface e orquestração**
- **Domain Skills = camada obrigatória de decisão esportiva**

## 9. Backlog Técnico Recomendado

### Fase 1 - Fundacional

- criar `skills/` no backend
- definir contratos base de skill
- criar `SkillRegistry` e `SkillOrchestratorService`
- criar `AthleteAnalysisSnapshot`
- adaptar `PlanoTreinoPromptBuilder` para consumir snapshot
- transformar `IntervaladoElegibilidadeService` em skill formal
- transformar `MetricasAlertaService` em skill formal de recuperação/carga

### Fase 2 - Precisão de execução

- implementar TSS por etapas quando disponível
- implementar `interval-workout-analysis`
- implementar `long-run-analysis`
- persistir `SkillExecution`
- expor análises no output do treino realizado

### Fase 3 - Prescrição mais segura

- implementar `training-prescription-guard`
- validar todo plano gerado antes de salvar
- impedir persistência de plano incompatível com constraints
- adicionar testes de regressão para perfis iniciante/intermediário/elite

### Fase 4 - Evolução do atleta

- implementar `athlete-progression-analysis`
- implementar `training-zone-assessment`
- recomendar testes de limiar e atualização de zonas
- criar revisão semanal baseada em resultados das skills

### Fase 5 - Integrações externas

- concluir roadmap Strava
- mapear laps/splits para `EtapaRealizada`
- recalcular skills automaticamente após sync
- usar device metadata, cadência e potência como sinais auxiliares

### Fase 6 - Agent layer

- expor skills selecionadas como tools do Spring AI
- criar chat/review coach-facing
- permitir que o LLM consulte resultados ao explicar decisões

## 10. Testes e Governança

### 10.1 Tipos de teste obrigatórios

- unit tests por skill
- testes com cenários por nível de atleta
- testes de regressão com datasets reais anonimizados
- testes de consistência entre versão antiga e nova da skill
- testes de guarda de prescrição

### 10.2 Governança das regras

Cada skill deve ter:

- versão semântica
- changelog de thresholds
- referência fisiológica/documental
- dataset mínimo de validação
- owner técnico

## 11. Vantagens da Abordagem

- maior auditabilidade das decisões
- menor alucinação do LLM em prescrição
- melhor reaproveitamento de lógica entre fluxos
- evolução incremental sem reescrever tudo
- aderência natural ao domínio esportivo do Menthoros
- melhor aproveitamento de dados granulares de Strava/Garmin
- capacidade real de diferenciar prescrição para iniciante e elite
- facilidade de medir qualidade da decisão por skill

## 12. Desvantagens e Riscos

- aumento de complexidade arquitetural
- necessidade de governança de regras e versionamento
- risco de rigidez excessiva se thresholds forem mal calibrados
- custo inicial de refatoração
- necessidade de mais testes e datasets comparáveis
- parte do valor depende de enriquecer ingestão de dados, especialmente etapas/laps

## 13. Melhor Forma de Usar Skills no Menthoros

A melhor forma de usar skills no Menthoros é:

- tratar skills como **motor clínico-esportivo interno**
- tratar o LLM como **camada de comunicação e composição**
- usar skills primeiro em **análise e guarda de prescrição**, antes de expandir para chat
- priorizar skills que extraem valor de `EtapaRealizada` e do roadmap Strava
- persistir resultados para auditoria e evolução do sistema

### Recomendação final

Entre as abordagens possíveis:

- **somente YAML/configuração**: flexível, mas fraca para um domínio tão sensível
- **somente agent skills com LLM no centro**: moderna, mas arriscada para prescrição
- **modelo híbrido com domain skills + agent skills**: melhor equilíbrio para o Menthoros

Portanto, a recomendação final é:

**O Menthoros deve adotar skills determinísticas de domínio como núcleo da inteligência esportiva, com agent skills do Spring AI apenas como interface operacional do LLM.**

Essa abordagem é a que melhor combina:

- segurança
- assertividade
- explicabilidade
- reaproveitamento de código
- escalabilidade para múltiplos perfis de atleta
- preparação para dados granulares vindos de integrações externas

## 14. Arquivos do projeto diretamente impactados

Arquivos que devem ser os primeiros a evoluir ou ser adaptados:

- `src/main/java/com/menthoros/services/prompt/PlanoTreinoPromptBuilder.java`
- `src/main/java/com/menthoros/services/impl/IaServiceImpl.java`
- `src/main/java/com/menthoros/services/helper/IntervaladoElegibilidadeService.java`
- `src/main/java/com/menthoros/services/impl/MetricasAlertaService.java`
- `src/main/java/com/menthoros/services/helper/TssCalculatorService.java`
- `src/main/java/com/menthoros/services/helper/TreinoHistoricoProvider.java`
- `src/main/java/com/menthoros/entity/TreinoRealizado.java`
- `src/main/java/com/menthoros/entity/EtapaRealizada.java`
- `openspec/changes/strava-integration/*`

## 15. Conclusão

O Menthoros já tem a base certa para dar esse salto. O projeto não parte do zero: ele já possui regras determinísticas valiosas, um pipeline de contexto para IA e modelagem suficiente para suportar análises mais profundas.

O ganho real virá ao formalizar isso como uma plataforma de skills de domínio, reduzir a dependência de interpretação textual pelo LLM e conectar a análise diretamente aos dados granulares do treino. Se a adoção for feita nessa ordem, o resultado tende a ser mais assertivo, mais seguro e mais defensável tecnicamente.
