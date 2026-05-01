# Visão Geral do Projeto Menthoros

**Autor:** Leandro
**Data:** Março 2026
**Status:** Em elaboração — documento de consolidação

---

## O que é o Menthoros

O Menthoros é uma plataforma de treinamento para corredores que combina análise de métricas fisiológicas com geração de planos semanais por IA. A proposta é ir além de apps como Strava e Runkeeper: em vez de apenas registrar treinos, o sistema interpreta os dados, compara planejado com realizado e prescreve a semana seguinte com o contexto completo do atleta.

A arquitetura central é Spring Boot 3.5.4 / Java 21, com um pipeline de prompt especializado que alimenta modelos LLM (via Spring AI) para gerar planos personalizados. A base de dados é PostgreSQL com pgvector para embeddings.

---

## Situação Atual: O que Precisa Ser Resolvido Antes

Antes de avançar com novas features, existe um débito técnico relevante no pacote `com.menthoros.services` que precisa ser endereçado. O motivo é simples: as novas features descritas neste documento dependem de uma camada de serviços confiável, testada e extensível. Construir em cima de uma base frágil multiplica os problemas.

### O diagnóstico em números

| Problema | Situação atual |
|----------|---------------|
| Maior arquivo do projeto | `PlanoTreinoPromptBuilder.java` com 2.475 linhas |
| Arquivos acima de 500 linhas | 4 arquivos |
| Cobertura de testes | 1 arquivo de teste para todo o pacote |
| Bugs conhecidos (P0) | 4 bugs identificados |
| Tipos de exceção para "não encontrado" | 5 tipos diferentes, sem padrão |
| Violações de princípios SOLID | DIP, ISP e LSP comprometidos |

### Os quatro bugs críticos

**BUG-01 — `IndexOutOfBoundsException` em `TsbServiceImpl`**
O loop `contarDiasConsecutivos` começa em `i=0` mas acessa `dateList.get(i-1)`, gerando índice `-1`. Correção: iniciar em `i=1`.

**BUG-02 — Substituição inútil em `AtletaServiceImpl`**
Código substitui `"["` por `"["` e `"]"` por `"]"` — operação que não faz nada. Deve ser removida ou corrigida.

**BUG-03 — Validação inconsistente em `IaServiceImpl`**
A condição valida `etapas.size() < 6`, mas a mensagem de erro diz "mínimo 8". Os dois valores precisam ser alinhados e extraídos para uma constante.

**BUG-04 — Divisão por zero em `PlanoTreinoPromptBuilder`**
`volumeMedioPorTreino` divide pelo campo `treinosPorSemanaMedio`, que pode ser `0`. É necessário um guard clause antes da divisão.

### O plano de refatoração (8 fases)

A refatoração está organizada de forma que cada fase seja um PR independente, sem mudança de comportamento externo — é refatoração pura.

**Fase 1 — Limpeza imediata (1–2 dias, risco baixo)**
Deletar `SpringAiEnhancedIaServiceImpl_old.java` (536 linhas de código morto), remover métodos que retornam `null` em `TreinoServiceImpl`, corrigir os quatro bugs acima e padronizar o uso de `@Transactional` (4 arquivos usam a anotação errada).

**Fase 2 — Interfaces e exceções (2–3 dias, risco baixo)**
Remover métodos não implementados das interfaces `TreinoService` e `IaService`, que hoje retornam `null` ou ficam vazios. Consolidar as 5 hierarquias de exceção em uma só (`DomainNotFoundException`, `DomainRuleViolationException`, `LLMException`, `TemplateLoadException`). Criar `buscarAtletaOuFalhar()` em `AtletaService` para eliminar o padrão `findById().orElseThrow()` duplicado em 8+ lugares.

**Fase 3 — Decomposição de `IaServiceImpl` (2–3 dias, risco médio)**
Extrair três responsabilidades hoje misturadas em 808 linhas: construção de JSON Schema (`LlmSchemaBuilder`), validação do plano gerado (`PlanoValidator`) e normalização de treinos (`TreinoNormalizer`). O `IaServiceImpl` resultante terá ~180 linhas e função clara de orquestrador.

**Fase 4 — Decomposição de `TsbServiceImpl` (2–3 dias, risco médio)**
Extrair o cálculo de TSS para um `TssCalculator` com Strategy Pattern, separando as três estratégias de cálculo (frequência cardíaca, pace e RPE) em classes independentes e testáveis. O `TsbServiceImpl` cai de 911 para ~500 linhas.

**Fase 5 — Decomposição de `PlanoTreinoPromptBuilder` (3–5 dias, risco alto)**
Esta é a maior refatoração. O arquivo de 2.475 linhas será dividido em 5 classes com responsabilidades claras: `MetricasAnalyzer`, `RecuperacaoAdvisor`, `PeriodizacaoCalculator`, `TreinoVariabilidadeAnalyzer` e um `PromptSectionBuilder`. O builder passa a receber dados via parâmetro em vez de buscar diretamente no banco.

**Fase 6 — Desacoplamento com Spring Events (1–2 dias, risco baixo)**
O método `addTreino()` em `TreinoServiceImpl` hoje faz 5 chamadas sequenciais acopladas. A proposta é publicar um evento `TreinoRegistradoEvent` e mover cada pós-processamento para um `@EventListener` independente — mais fácil de testar e de estender.

**Fase 7 — Eliminação de duplicações (1–2 dias, risco baixo)**
Consolidar três grupos de código duplicado: `filtrarDiasValidos` (em 2 classes), `calcularDataTreino` (em 2 classes) e código compartilhado entre as duas implementações de `IaService`.

**Fase 8 — Testes (contínuo, paralelo às outras fases)**
Prioridade: `TssCalculator` e `PlanoValidator` (P0), `TsbServiceImpl` e `TreinoNormalizer` (P1). O objetivo é sair de 1 arquivo de teste para 8+, cobrindo todas as classes críticas.

**Resultado esperado após as 8 fases:**

| Métrica | Antes | Depois |
|---------|-------|--------|
| Maior arquivo | 2.475 linhas | ~500 linhas |
| Arquivos > 500 linhas | 4 | 0–1 |
| Bugs conhecidos | 4 | 0 |
| Tipos de exceção para "não encontrado" | 5 | 1 |
| Classes seguindo SRP | ~40% | ~90% |
| Arquivos de teste | 1 | 8+ |

---

## Evolução da Arquitetura de Dados

Paralelamente à refatoração, está em análise uma mudança importante no modelo de dados de treinos realizados.

**Hoje**, o sistema armazena apenas dados agregados por treino: pace médio, FC média, distância total. Isso é suficiente para registrar o que aconteceu, mas insuficiente para analisar *como* aconteceu.

**A proposta** é um modelo hierárquico em três níveis: **Treino → Etapas → Repetições**. Em vez de saber que "o atleta correu 10 km em 45 min", o sistema passa a saber que na etapa de intervalados, a repetição 1 foi feita em 4:15/km com FC 168 e a recuperação levou a FC 142 em 90 segundos — e que na repetição 8, a FC de recuperação já estava em 158, indicando fadiga acumulada.

Essa granularidade abre análises que hoje são impossíveis: decaimento de pace no intervalo, consistência entre repetições (coeficiente de variação), eficiência de recuperação cardíaca, drift cardíaco em longões e comparação detalhada por etapa entre planejado e realizado.

O impacto em infraestrutura é negligenciável (de ~120 MB/ano para ~700 MB/ano com 1.000 usuários ativos). A migração é incremental: novas tabelas criadas sem remover as atuais, dual write por um sprint, migração de histórico e cutover.

Em termos de posicionamento, essa mudança coloca o Menthoros no mesmo patamar do TrainingPeaks e Garmin Connect em termos de capacidade analítica — e à frente do Strava e Runkeeper.

---

## Roadmap de Features

As features abaixo foram especificadas com arquitetura, entidades e algoritmos definidos. Nenhuma delas exige reescrita da arquitetura atual — cada uma é uma fatia vertical (entidade → repositório → serviço → formatter de prompt → controller).

A ordem de prioridade sugerida leva em conta dependências técnicas e valor percebido pelo atleta.

### Feature 6 — Macrociclo Auto-gerado por Prova (Prioridade Alta)

**Problema:** O sistema gera planos semanais de forma isolada, sem visão longitudinal. O LLM não sabe se está na semana 2 ou na semana 18 de uma preparação — e esse contexto muda completamente a prescrição.

**Solução:** Ao cadastrar uma prova alvo, o sistema gera automaticamente um macrociclo completo com fases (BASE → BUILD → ESPECÍFICO → TAPER → SEMANA_PROVA), CTL-alvo por semana e volume-alvo por semana. Cada geração semanal pelo LLM consulta esse mapa antes de qualquer outra coisa — os alvos funcionam como restrições hard.

O algoritmo de distribuição de fases é determinístico, construído de trás para frente a partir da data da prova (TAPER e SEMANA_PROVA nunca são cortados). O ramp rate é validado: máximo de +3 CTL/semana. Se a janela de preparação for insuficiente (abaixo dos mínimos de Daniels/Pfitzinger), um alerta é gerado mas o macrociclo é criado assim mesmo.

Esta é a feature com maior impacto na qualidade dos planos gerados.

### Feature 1 — Check-in Diário de Prontidão (Readiness Score)

**Problema:** O TSB captura fadiga acumulada, mas não captura sinais subjetivos do atleta — sono ruim, dores musculares, humor baixo — que frequentemente precedem a queda de performance em 24–48 horas.

**Solução:** Um check-in diário rápido (qualidade do sono, dores musculares, humor, motivação, escala 1–10) gera um `readinessScore` ponderado que combina TSB com percepção subjetiva. O score define automaticamente se o treino do dia segue como planejado, tem intensidade reduzida em 15% ou é substituído por regenerativo.

O `ReadinessScore` também atua como portão para elegibilidade de treinos intervalados — antes de qualquer outra avaliação.

### Feature 2 — Análise Pós-Treino por IA (AI Debrief)

**Problema:** O sistema olha apenas para frente (gerar a próxima semana). Não oferece ao atleta interpretação do que o treino que ele acabou de fazer significou no contexto do plano.

**Solução:** Após cada treino registrado com RPE preenchido, um processo assíncrono aciona um prompt especializado que analisa o delta entre planejado e realizado, o contexto de fadiga no dia e a tendência dos últimos 14 dias. O retorno é estruturado: resumo em uma frase, interpretação técnica, recomendação para o próximo treino, tags (ex: `SUPERCOMPENSACAO`, `RITMO_ALTO`) e score de execução de 1 a 10.

### Feature 3 — Predição de Tempo de Prova

**Problema:** O atleta não tem visibilidade sobre se o treinamento está evoluindo na direção do objetivo. Os relógios Garmin fazem predição, mas não consideram o contexto completo de treinamento.

**Solução:** Usando as fórmulas de Riegel (predição cruzada de distâncias) e VDOT (Jack Daniels), o sistema estima o tempo de prova atual com base nos treinos recentes. O gap entre a predição atual e o objetivo é exibido no prompt de geração de plano, junto com o ramp de CTL necessário para fechá-lo.

### Feature 4 — Testes Protocolados com Atualização de Dados Fisiológicos

**Problema:** `fcLimiar` e `paceLimiar` do atleta envelhecem. O sistema já tem fallbacks implementados porque sabe que esses dados ficam desatualizados — mas o problema não é tratado na raiz.

**Solução:** O sistema passa a sugerir protocolos de teste periodicamente (a cada 90 dias) e processa os resultados automaticamente para atualizar FC de limiar, pace de limiar e VO2máx estimado. Os tipos de teste suportados são: Limiar 20 minutos, Cooper 12 minutos, Pace fácil 2 km (calibração de Z2) e Progressivo 5×1 km.

### Feature 5 — Dashboard de Aderência ao Plano

**Problema:** Não há visibilidade sobre quão bem o atleta está seguindo o plano ao longo do tempo. Um coach acompanha isso semanalmente para ajustar a abordagem.

**Solução:** Um endpoint retorna taxa de aderência por semana (treinos realizados vs. planejados), TSS realizado vs. planejado, tipo de treino mais pulado e insights gerados pela IA. Semana a semana, com janela configurável.

### Feature 7 — Rastreamento de Equipamento

**Problema:** Tênis desgastados acima de 700–800 km são a principal causa de lesões por overuse. Nenhum app rastreia isso de forma confiável sem integração com e-commerce.

**Solução:** O atleta cadastra seu equipamento e associa a cada treino registrado. O sistema atualiza os km acumulados automaticamente e gera alerta quando o equipamento atinge 80% do limite recomendado. O alerta também aparece no prompt de geração de plano, influenciando a prescrição de treinos longos.

### Feature 8 — Ajuste de Pace por Condições Climáticas

**Problema:** Prescrever "5:30/km" em um dia de 34°C com 80% de umidade é tecnicamente inadequado. O sistema ignora o ambiente externo.

**Solução:** Integração com OpenMeteo (API gratuita, sem chave) para buscar a previsão da semana para a cidade do atleta. Um algoritmo baseado nas diretrizes da ACSM calcula o ajuste de pace por temperatura e umidade (+2,5 seg/km por grau acima de 15°C, +0,3 seg/km por ponto percentual de umidade acima de 40%). Essa seção é injetada no prompt com instruções explícitas para o LLM ajustar os paces prescritos.

---

## Próximos Passos Sugeridos

A sequência recomendada, considerando dependências e risco:

1. **Executar a Fase 1 da refatoração** — baixo risco, elimina bugs críticos e dead code. Feito em 1–2 dias.
2. **Executar as Fases 2 a 4 da refatoração** — consolida contratos e divide os arquivos mais problemáticos.
3. **Aprovar e implementar o novo modelo de dados** (Feature Arquitetura) — feito em paralelo à Fase 5 da refatoração.
4. **Implementar o Macrociclo** (Feature 6) — maior impacto na qualidade dos planos, depende de base de serviços limpa.
5. **Implementar Readiness Score** (Feature 1) — complementa o Macrociclo, enriquece o contexto do LLM.
6. **Executar Fases 5 a 8 da refatoração** — decomposição do PromptBuilder e cobertura de testes.
7. **Features 2 a 5 e 7–8** — em ordem de prioridade a definir com base no feedback de usuários.

---

*Documento gerado a partir de: `roadmap-features-produto.md`, `plano_refatoracao_services.md`, `comparacao_arquitetura.md`*
