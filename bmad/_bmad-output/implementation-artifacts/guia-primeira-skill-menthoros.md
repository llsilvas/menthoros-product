# Guia Completo: Primeira Skill no Menthoros

**Este é um guia prático para você implementar do zero:**
1. ✅ Configuração Multi-Modelo (4 LLMs)
2. ✅ Sistema de Skills (Spring AI)
3. ✅ Primeira Skill: workout-analyzer
4. ✅ Translation Layer EN→PT
5. ✅ Integração completa

**Tempo estimado:** 1-2 dias  
**Pré-requisito:** Java 21, Maven 3.9+, Spring Boot 3.5.11

---

## 📦 Arquivos que Vou Te Fornecer

Vou criar todos esses arquivos prontos para você usar:

```
/outputs/
├── bmad-config.yaml                    # Configuração BMAD
├── openspec-config.yaml                # Configuração OpenSpec
├── openspec-workout-analyzer-spec.yaml # Spec da primeira skill
├── MultiModelConfig.java               # 4 modelos configurados
├── ModelRouter.java                    # Router inteligente  
├── SkillsConfig.java                   # Config de skills
├── WorkoutAnalysisTranslator.java      # EN→PT
├── WorkoutAnalysisListener.java        # Event listener
├── SKILL.md                            # Skill completa em inglês
├── calculate_execution_delta.py        # Script Python
├── application.yml                     # Configuração Spring
└── README-IMPLEMENTACAO.md             # Este guia
```

---

## 🚀 Passo a Passo de Implementação

### FASE 1: Preparação (15 minutos)

#### 1.1 Adicionar Dependências Maven

Edite seu `pom.xml` e adicione:

```xml
<properties>
    <spring-ai.version>1.0.0-M6</spring-ai.version>
</properties>

<dependencies>
    <!-- Spring AI: OpenAI (já em pom.xml — verificar se presente) -->
    <dependency>
        <groupId>org.springframework.ai</groupId>
        <artifactId>spring-ai-openai-spring-boot-starter</artifactId>
        <version>${spring-ai.version}</version>
    </dependency>

    <!-- Spring AI: Anthropic (ADICIONAR — necessário para Claude Haiku e Sonnet) -->
    <dependency>
        <groupId>org.springframework.ai</groupId>
        <artifactId>spring-ai-anthropic-spring-boot-starter</artifactId>
        <version>${spring-ai.version}</version>
    </dependency>
</dependencies>
```

Execute:
```bash
./mvnw clean install
```

#### 1.2 Configurar API Keys

Crie ou edite `src/main/resources/application.yml`:

```yaml
spring:
  ai:
    anthropic:
      api-key: ${ANTHROPIC_API_KEY}
    openai:
      api-key: ${OPENAI_API_KEY}
```

Configure as variáveis de ambiente:
```bash
export ANTHROPIC_API_KEY="sk-ant-api03-..."
export OPENAI_API_KEY="sk-..."
```

#### 1.3 Criar Estrutura de Diretórios

```bash
cd menthoros-backend

# Criar pacotes Java
mkdir -p src/main/java/br/com/menthoros/backend/config
mkdir -p src/main/java/br/com/menthoros/backend/routing
mkdir -p src/main/java/br/com/menthoros/backend/translation
mkdir -p src/main/java/br/com/menthoros/backend/events/listeners

# Criar estrutura de skills
mkdir -p src/main/resources/skills/analise/workout-analyzer/scripts
mkdir -p src/main/resources/skills/analise/workout-analyzer/references

# Criar diretórios de configuração
mkdir -p .ai
mkdir -p .bmad
mkdir -p .openspec/specs
```

---

### FASE 2: Configuração Multi-Modelo (1 hora)

#### 2.1 Copiar Arquivos de Configuração

Baixe os arquivos que vou fornecer e copie para o projeto:

```bash
# Copiar arquivos Java
cp ~/outputs/MultiModelConfig.java src/main/java/br/com/menthoros/backend/config/
cp ~/outputs/ModelRouter.java src/main/java/br/com/menthoros/backend/routing/
cp ~/outputs/TaskComplexity.java src/main/java/br/com/menthoros/backend/routing/
```

#### 2.2 Testar Configuração

Crie um teste simples:

```bash
./mvnw test -Dtest=MultiModelConfigTest
```

Se der erro de API key:
- ✅ Verifique que as variáveis de ambiente estão configuradas
- ✅ Reinicie o IDE para carregar as variáveis

---

### FASE 3: Setup de Skills (30 minutos)

#### 3.1 Copiar Arquivos de Skills

```bash
# Configuração Spring
cp ~/outputs/SkillsConfig.java src/main/java/br/com/menthoros/backend/config/

# Skill completa
cp ~/outputs/SKILL.md src/main/resources/skills/analise/workout-analyzer/

# Scripts Python
cp ~/outputs/calculate_execution_delta.py \
   src/main/resources/skills/analise/workout-analyzer/scripts/

# Referências
cp ~/outputs/rpe_guidelines.md \
   src/main/resources/skills/analise/workout-analyzer/references/
```

#### 3.2 Testar Skill Localmente

```bash
cd src/main/resources/skills/analise/workout-analyzer/scripts

# Teste do script Python
echo '{
  "planned": {"distance_km": 18, "expected_rpe": 4},
  "actual": {"distance_km": 17.8, "rpe": 7}
}' | python calculate_execution_delta.py
```

Deve retornar:
```json
{
  "distance_delta_km": -0.2,
  "distance_delta_percent": -1.1,
  "rpe_delta": 3,
  "pace_delta_seconds": null,
  "hr_zone_match": null
}
```

#### 3.3 Validar com OpenSpec

```bash
# Instalar OpenSpec CLI
pip install openspec-cli

# Validar skill
openspec validate \
  --skill src/main/resources/skills/analise/workout-analyzer/SKILL.md
```

---

### FASE 4: Translation Layer (45 minutos)

#### 4.1 Copiar Translator

```bash
cp ~/outputs/WorkoutAnalysisTranslator.java \
   src/main/java/br/com/menthoros/backend/translation/
```

#### 4.2 Testar Tradução

Crie um teste unitário:

```java
@Test
void deveT raduzirResumo() {
    String enSummary = "Execution harder than expected";
    String ptSummary = translator.translate(enSummary);
    
    assertThat(ptSummary).isEqualTo("Execução mais difícil que o esperado");
}
```

---

### FASE 5: Integração com Eventos (1-2 horas)

#### 5.1 Copiar Listener

```bash
cp ~/outputs/WorkoutAnalysisListener.java \
   src/main/java/br/com/menthoros/backend/events/listeners/
```

#### 5.2 Verificar Dependências

O listener precisa de:
- ✅ Evento `TreinoRegistradoEvent` (já existe?)
- ✅ Repositório `AiWorkoutAnalysisRepository`
- ✅ Entidade `TreinoRealizado`

Se algum não existir, você precisará criar.

#### 5.3 Configurar @Async

No `Application.java` ou em `@Configuration`:

```java
@EnableAsync
@SpringBootApplication
public class MenthorosApplication {
    // ...
}
```

---

### FASE 6: Teste End-to-End (1 hora)

#### 6.1 Criar Teste de Integração

```java
@SpringBootTest
@Transactional
class WorkoutAnalysisE2ETest {
    
    @Autowired
    private TreinoService treinoService;
    
    @Autowired
    private AiWorkoutAnalysisRepository analysisRepository;
    
    @Test
    void registrarTreino_ComRPE_DeveGerarAnalise() throws Exception {
        // Arrange
        TreinoRequest request = TreinoRequest.builder()
            .atletaId(1L)
            .data(LocalDate.now())
            .tipo(TipoTreino.LONGAO)
            .distancia(18.0)
            .rpe(7)  // Mais difícil que esperado
            .build();
        
        // Act
        TreinoRealizado treino = treinoService.registrar(request);
        
        // Aguardar processamento assíncrono
        await().atMost(30, SECONDS).until(() -> 
            analysisRepository.findByTreinoId(treino.getId()).isPresent()
        );
        
        // Assert
        AiWorkoutAnalysis analysis = analysisRepository
            .findByTreinoId(treino.getId())
            .orElseThrow();
        
        assertThat(analysis.getResumo()).isNotBlank();
        assertThat(analysis.getScoreExecucao()).isBetween(1, 10);
        assertThat(analysis.getTags()).isNotEmpty();
        
        // Verificar que está em português
        assertThat(analysis.getResumo()).doesNotContain("Execution");
    }
}
```

#### 6.2 Rodar Teste

```bash
./mvnw test -Dtest=WorkoutAnalysisE2ETest
```

**Se passar:** ✅ Skill funcionando perfeitamente!

---

## 🎯 Checklist Final

Antes de considerar concluído, verifique:

### Configuração
- [ ] 4 modelos LLM configurados (Mini, Haiku, Sonnet, GPT-4o)
- [ ] Router funcionando corretamente
- [ ] API keys configuradas

### Skills
- [ ] Diretório `skills/` criado
- [ ] SKILL.md validado com OpenSpec
- [ ] Scripts Python funcionando
- [ ] Skills carregadas no Spring

### Translation
- [ ] Translator implementado
- [ ] Mapa EN→PT completo
- [ ] Testes passando

### Integração
- [ ] Listener criado
- [ ] @Async configurado
- [ ] Evento publicado corretamente
- [ ] Análise salva no banco

### Testes
- [ ] Unit tests >70% coverage
- [ ] Integration test passando
- [ ] E2E test validado

---

## 🐛 Troubleshooting Comum

### Problema 1: Skill não é carregada

**Sintoma:**
```
WARN SkillsTool - No skills found
```

**Solução:**
1. Verificar path: `classpath:skills/analise` está correto?
2. SKILL.md está no lugar certo?
3. Rebuild projeto: `./mvnw clean install`

---

### Problema 2: Tradução não funciona

**Sintoma:** Análise retorna em inglês

**Solução:**
1. Verificar se `WorkoutAnalysisTranslator` está sendo injetado
2. Adicionar log para debug:
```java
log.info("Traduzindo: {}", enSummary);
String ptSummary = translator.translate(enSummary);
log.info("Traduzido: {}", ptSummary);
```

---

### Problema 3: Listener não é chamado

**Sintoma:** Treino salvo mas análise não gerada

**Solução:**
1. Verificar `@EnableAsync` está presente
2. Verificar evento está sendo publicado:
```java
log.info("Publicando evento: {}", new TreinoRegistradoEvent(treino));
eventPublisher.publishEvent(new TreinoRegistradoEvent(treino));
```

3. Verificar listener tem `@EventListener`:
```java
@EventListener
@Async
@Transactional(propagation = Propagation.REQUIRES_NEW)
public void onTreinoRegistrado(TreinoRegistradoEvent event) {
```

---

### Problema 4: Custo alto de API

**Sintoma:** Conta da API crescendo rápido

**Solução:**
1. Verificar que router está funcionando:
```java
// Deve usar Haiku para análises simples
log.info("Usando modelo: {}", complexity);
```

2. Monitorar uso por modelo:
```java
// Adicionar métricas
meterRegistry.counter("llm.calls", "model", "haiku").increment();
```

---

## 📊 Métricas de Sucesso

Após implementação completa, você deve ter:

| Métrica | Meta | Como Medir |
|---------|------|------------|
| **Redução de tokens** | -65% | Comparar logs antes/depois |
| **Custo por análise** | R$ 0,027 | Log de chamadas + pricing |
| **Latência p95** | <5s | Tempo entre evento e save |
| **Assertividade** | >85% | Review manual de 50 análises |
| **Taxa de uso Haiku** | >60% | Contador por modelo |

---

## 🎓 Próximos Passos

Após implementar com sucesso:

1. **Adicionar 2ª skill:** `recovery-assessment`
2. **Adicionar 3ª skill:** `periodization-calculator`
3. **Implementar caching** de skills
4. **Dashboard de custos** (monitor uso por modelo)
5. **A/B test** com 50 atletas

---

## 📚 Recursos Adicionais

- [Spring AI Documentation](https://docs.spring.io/spring-ai/reference/)
- [Anthropic Claude API](https://docs.anthropic.com/)
- [OpenAI API](https://platform.openai.com/docs/)
- [Documentação OpenSpec](https://github.com/openspec/cli)

---

**Pronto para começar? Os arquivos completos estão em `/outputs/`!**

Qualquer dúvida durante a implementação, consulte este guia ou o contexto em `.ai/context.md`.
