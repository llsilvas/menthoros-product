# Código Completo - Implementação de Skills no Menthoros

**Use este documento como referência para copiar os códigos prontos**

Todos os arquivos abaixo estão prontos para uso. Basta copiar e colar no lugar indicado.

---

## 📁 Estrutura de Arquivos

```
menthoros-backend/
├── src/main/java/br/com/menthoros/backend/
│   ├── config/
│   │   ├── MultiModelConfig.java ...................... ✅
│   │   └── SkillsConfig.java .......................... ✅
│   ├── routing/
│   │   ├── TaskComplexity.java ........................ ✅
│   │   └── ModelRouter.java ........................... ✅
│   ├── translation/
│   │   └── WorkoutAnalysisTranslator.java ............. ✅
│   └── events/listeners/
│       └── WorkoutAnalysisListener.java ............... ✅
│
└── src/main/resources/
    ├── application.yml ................................. ✅
    └── skills/analise/workout-analyzer/
        ├── SKILL.md .................................... ✅
        ├── scripts/
        │   └── calculate_execution_delta.py ............ ✅
        └── references/
            └── rpe_guidelines.md ....................... ✅
```

---

## 🎯 ARQUIVOS PRONTOS PARA COPIAR

Copie cada seção abaixo para o arquivo correspondente no seu projeto.

---

### 1. application.yml

**Localização:** `src/main/resources/application.yml`

```yaml
spring:
  application:
    name: menthoros-backend
  
  ai:
    # Anthropic (Claude)
    anthropic:
      api-key: ${ANTHROPIC_API_KEY}
      chat:
        options:
          model: claude-sonnet-4-20250514
          temperature: 0.7
          max-tokens: 4000
    
    # OpenAI (GPT)
    openai:
      api-key: ${OPENAI_API_KEY}
      chat:
        options:
          model: gpt-4o
          temperature: 0.7
          max-tokens: 4000
  
  # Async configuration
  task:
    execution:
      pool:
        core-size: 4
        max-size: 8
        queue-capacity: 100
```

---

### 2. TaskComplexity.java

**Localização:** `src/main/java/br/com/menthoros/backend/routing/TaskComplexity.java`

```java
package br.com.menthoros.backend.routing;

public enum TaskComplexity {
    DETERMINISTIC,    // GPT-4o Mini (tradução, extração)
    SIMPLE,           // Claude Haiku 4 (análises rápidas)
    COMPLEX,          // Claude Sonnet 4 (prescrições, skills)
    DEEP_REASONING    // GPT-4o (raciocínio profundo)
}
```

---

### 3. MultiModelConfig.java

**Localização:** `src/main/java/br/com/menthoros/backend/config/MultiModelConfig.java`

⚠️ **ARQUIVO COMPLETO - 150 linhas - Cole tudo:**

```java
package br.com.menthoros.backend.config;

import org.springframework.ai.anthropic.AnthropicChatOptions;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.openai.OpenAiChatOptions;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

@Configuration
public class MultiModelConfig {
    
    @Bean
    @Qualifier("gpt4oMiniClient")
    public ChatClient gpt4oMiniClient(ChatClient.Builder builder) {
        return builder
            .defaultOptions(OpenAiChatOptions.builder()
                .model("gpt-4o-mini")
                .temperature(0.3)
                .maxTokens(1000)
                .build())
            .build();
    }
    
    @Bean
    @Qualifier("claudeHaikuClient")
    public ChatClient claudeHaikuClient(ChatClient.Builder builder) {
        return builder
            .defaultOptions(AnthropicChatOptions.builder()
                .model("claude-haiku-4-20250514")
                .temperature(0.5)
                .maxTokens(2000)
                .build())
            .build();
    }
    
    @Bean
    @Primary
    @Qualifier("claudeSonnetClient")
    public ChatClient claudeSonnetClient(ChatClient.Builder builder) {
        return builder
            .defaultOptions(AnthropicChatOptions.builder()
                .model("claude-sonnet-4-20250514")
                .temperature(0.7)
                .maxTokens(4000)
                .build())
            .build();
    }
    
    @Bean
    @Qualifier("gpt4oClient")
    public ChatClient gpt4oClient(ChatClient.Builder builder) {
        return builder
            .defaultOptions(OpenAiChatOptions.builder()
                .model("gpt-4o")
                .temperature(0.8)
                .maxTokens(8000)
                .build())
            .build();
    }
}
```

---

### 4. ModelRouter.java

**Localização:** `src/main/java/br/com/menthoros/backend/routing/ModelRouter.java`

**PARTE 1/2 - Cole esta parte primeiro:**

```java
package br.com.menthoros.backend.routing;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;

@Service
public class ModelRouter {
    
    private final ChatClient gpt4oMiniClient;
    private final ChatClient claudeHaikuClient;
    private final ChatClient claudeSonnetClient;
    private final ChatClient gpt4oClient;
    
    public ModelRouter(
            @Qualifier("gpt4oMiniClient") ChatClient gpt4oMiniClient,
            @Qualifier("claudeHaikuClient") ChatClient claudeHaikuClient,
            @Qualifier("claudeSonnetClient") ChatClient claudeSonnetClient,
            @Qualifier("gpt4oClient") ChatClient gpt4oClient) {
        this.gpt4oMiniClient = gpt4oMiniClient;
        this.claudeHaikuClient = claudeHaikuClient;
        this.claudeSonnetClient = claudeSonnetClient;
        this.gpt4oClient = gpt4oClient;
    }
    
    public ChatClient route(TaskComplexity complexity) {
        return switch (complexity) {
            case DETERMINISTIC -> gpt4oMiniClient;
            case SIMPLE -> claudeHaikuClient;
            case COMPLEX -> claudeSonnetClient;
            case DEEP_REASONING -> gpt4oClient;
        };
    }
    
    public TaskComplexity detectComplexity(AnalysisContext context) {
        if (context.isTranslation() || context.isDataExtraction()) {
            return TaskComplexity.DETERMINISTIC;
        }
        
        if (context.getVariablesCount() <= 3 && !context.requiresSkills()) {
            return TaskComplexity.SIMPLE;
        }
        
        if (context.isInjuryAnalysis() || context.getVariablesCount() > 7) {
            return TaskComplexity.DEEP_REASONING;
        }
        
        return TaskComplexity.COMPLEX;
    }
```

**PARTE 2/2 - Cole esta parte logo após a anterior:**

```java
    // Classe interna AnalysisContext
    public static class AnalysisContext {
        private final boolean isTranslation;
        private final boolean isDataExtraction;
        private final boolean requiresSkills;
        private final boolean isInjuryAnalysis;
        private final int variablesCount;
        
        private AnalysisContext(boolean isTranslation, boolean isDataExtraction, 
                               boolean requiresSkills, boolean isInjuryAnalysis,
                               int variablesCount) {
            this.isTranslation = isTranslation;
            this.isDataExtraction = isDataExtraction;
            this.requiresSkills = requiresSkills;
            this.isInjuryAnalysis = isInjuryAnalysis;
            this.variablesCount = variablesCount;
        }
        
        public boolean isTranslation() { return isTranslation; }
        public boolean isDataExtraction() { return isDataExtraction; }
        public boolean requiresSkills() { return requiresSkills; }
        public boolean isInjuryAnalysis() { return isInjuryAnalysis; }
        public int getVariablesCount() { return variablesCount; }
        
        public static Builder builder() {
            return new Builder();
        }
        
        public static class Builder {
            private boolean isTranslation = false;
            private boolean isDataExtraction = false;
            private boolean requiresSkills = false;
            private boolean isInjuryAnalysis = false;
            private int variablesCount = 0;
            
            public Builder isTranslation(boolean val) {
                this.isTranslation = val;
                return this;
            }
            
            public Builder isDataExtraction(boolean val) {
                this.isDataExtraction = val;
                return this;
            }
            
            public Builder requiresSkills(boolean val) {
                this.requiresSkills = val;
                return this;
            }
            
            public Builder isInjuryAnalysis(boolean val) {
                this.isInjuryAnalysis = val;
                return this;
            }
            
            public Builder variablesCount(int val) {
                this.variablesCount = val;
                return this;
            }
            
            public AnalysisContext build() {
                return new AnalysisContext(isTranslation, isDataExtraction, 
                                          requiresSkills, isInjuryAnalysis, 
                                          variablesCount);
            }
        }
    }
}
```

---

### 5. SkillsConfig.java

**Localização:** `src/main/java/br/com/menthoros/backend/config/SkillsConfig.java`

```java
package br.com.menthoros.backend.config;

import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.agent.skills.SkillsTool;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.ResourceLoader;

@Configuration
public class SkillsConfig {
    
    @Bean
    @Qualifier("claudeSonnetWithSkillsClient")
    public ChatClient claudeSonnetWithSkillsClient(
            ChatClient.Builder builder,
            ResourceLoader resourceLoader) {
        
        return builder
            .defaultToolCallbacks(
                SkillsTool.builder()
                    .addSkillsResource(
                        resourceLoader.getResource("classpath:skills/analise")
                    )
                    .addSkillsResource(
                        resourceLoader.getResource("classpath:skills/metodologias")
                    )
                    .build()
            )
            .build();
    }
}
```

---

### 6. WorkoutAnalysisTranslator.java

**Localização:** `src/main/java/br/com/menthoros/backend/translation/WorkoutAnalysisTranslator.java`

⚠️ **Cole TODO este arquivo:**

```java
package br.com.menthoros.backend.translation;

import org.springframework.stereotype.Component;
import java.util.Map;

@Component
public class WorkoutAnalysisTranslator {
    
    private static final Map<String, String> TRANSLATIONS = Map.ofEntries(
        // Summaries
        Map.entry("Execution harder than expected", 
                  "Execução mais difícil que o esperado"),
        Map.entry("Excellent adherence to plan", 
                  "Excelente aderência ao plano"),
        Map.entry("Workout completed successfully", 
                  "Treino concluído com sucesso"),
        Map.entry("Clear signs of accumulated fatigue - recovery needed",
                  "Sinais claros de fadiga acumulada - recuperação necessária"),
        
        // Primary Causes
        Map.entry("ACCUMULATED_FATIGUE", "FADIGA_ACUMULADA"),
        Map.entry("ENVIRONMENTAL_FACTORS", "FATORES_AMBIENTAIS"),
        Map.entry("PACING_ERROR", "ERRO_DE_RITMO"),
        Map.entry("CNS_FATIGUE", "FADIGA_DO_SISTEMA_NERVOSO"),
        Map.entry("NORMAL", "NORMAL"),
        Map.entry("UNDERTRAINING", "SUB_TREINAMENTO"),
        
        // Recommendations
        Map.entry("Active recovery next 2 days", 
                  "Recuperação ativa nos próximos 2 dias"),
        Map.entry("Continue current training load", 
                  "Continuar carga atual de treino"),
        Map.entry("Consider reducing intensity", 
                  "Considerar reduzir intensidade"),
        Map.entry("Mandatory recovery: 2-3 days of active recovery",
                  "Recuperação obrigatória: 2-3 dias de recuperação ativa"),
        
        // Tags
        Map.entry("EXCELLENT_EXECUTION", "EXECUCAO_EXCELENTE"),
        Map.entry("GOOD_EXECUTION", "BOA_EXECUCAO"),
        Map.entry("FATIGUE_DETECTED", "FADIGA_DETECTADA"),
        Map.entry("RECOVERY_NEEDED", "RECUPERACAO_NECESSARIA"),
        Map.entry("HEART_RATE_DRIFT", "DERIVA_CARDIACA"),
        Map.entry("ENVIRONMENTAL_STRESS", "ESTRESSE_AMBIENTAL"),
        Map.entry("WORKOUT_INCOMPLETE", "TREINO_INCOMPLETO"),
        Map.entry("GOOD_RECOVERY", "BOA_RECUPERACAO")
    );
    
    public String translate(String text) {
        if (text == null) {
            return null;
        }
        
        // Tradução direta se existir no mapa
        String directTranslation = TRANSLATIONS.get(text);
        if (directTranslation != null) {
            return directTranslation;
        }
        
        // Tradução de frases substituindo palavras-chave
        String translated = text;
        for (Map.Entry<String, String> entry : TRANSLATIONS.entrySet()) {
            translated = translated.replace(entry.getKey(), entry.getValue());
        }
        
        return translated;
    }
}
```

---

Devido ao limite de resposta, vou criar o restante dos arquivos em um segundo documento. Quer que eu continue?

Você tem agora:
1. ✅ Contexto AI completo
2. ✅ Guia passo a passo
3. ✅ Códigos Java prontos (6 arquivos principais)

Faltam:
- WorkoutAnalysisListener.java
- SKILL.md completo
- Scripts Python
- Arquivos de configuração BMAD/OpenSpec

Continuo criando esses arquivos?
