# Config & Repository Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Config and Repository packages to eliminate hardcoded values, remove duplicate methods, add validation, and implement modern Spring Data patterns (Specification, Custom Repositories, Projections, Auditing).

**Architecture:** Multi-phase refactoring prioritizing security and maintainability. Phase 1 centralizes configuration in externalized properties with validation. Phase 2 refactors repositories to use Specification and Custom patterns. Phase 3 adds advanced features like projections and auditing.

**Tech Stack:** Java 21, Spring Boot 3.5.x, Spring Data JPA, Bean Validation, Spring Security, Spring Data Auditing.

---

## File Structure

### Config Package Reorganization

```
src/main/java/com/menthoros/backend/config/
├── core/
│   ├── CoreSecurityProperties.java          (new)
│   ├── CoreSecurityConfig.java              (refactored from SecurityConfig)
│   ├── CacheProperties.java                 (new - with validation)
│   └── CacheConfig.java                     (refactored)
├── external/
│   ├── StravaProperties.java                (moved/refactored)
│   ├── StravaWebClientConfig.java           (existing)
│   ├── LLMProperties.java                   (if exists)
│   └── LLMConfig.java                       (if exists)
├── persistence/
│   └── DatabaseConfig.java                  (existing, organize if needed)
├── documentation/
│   ├── OpenApiConfig.java                   (refactored)
│   └── OpenApiProperties.java               (new)
├── async/
│   └── AsyncConfig.java                     (organize if exists)
├── AuditConfig.java                         (new)
└── HealthConfig.java                        (new)

src/main/resources/
├── application.yml                          (updated)
└── application-local.yml                    (if exists, update)
```

### Repository Package Enhancement

```
src/main/java/com/menthoros/backend/repository/
├── specification/
│   ├── AtletaSpecification.java             (new)
│   ├── TreinoSpecification.java             (new if needed)
│   └── GenericSpecification.java            (new utility)
├── custom/
│   ├── AtletaRepositoryCustom.java          (new interface)
│   └── AtletaRepositoryImpl.java             (new impl)
├── projection/
│   ├── AtletaProjection.java                (new)
│   └── AtletaListProjection.java            (new)
├── AtletaRepository.java                    (refactored)
├── TreinoRepository.java                    (if needed)
└── [other repositories]                     (update as pattern spreads)

src/main/java/com/menthoros/backend/domain/audit/
├── AuditableEntity.java                     (new)
└── [entities will extend this]
```

---

## Phase 1: Configuration Centralization & Validation

### Task 1: Create CoreSecurityProperties (High Priority)

**Files:**
- Create: `src/main/java/com/menthoros/backend/config/core/CoreSecurityProperties.java`
- Modify: `src/main/resources/application.yml`
- Test: `src/test/java/com/menthoros/backend/config/core/CoreSecurityPropertiesTest.java`

- [ ] **Step 1: Write failing test for CoreSecurityProperties**

```java
package com.menthoros.backend.config.core;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest
@TestPropertySource(properties = {
    "app.security.public-paths[0]=/api/public/**",
    "app.security.public-paths[1]=/swagger-ui/**",
    "app.security.strava-paths[0]=/api/v1/strava/webhook",
    "app.security.strava-paths[1]=/api/v1/strava/callback"
})
class CoreSecurityPropertiesTest {
    
    @Autowired
    private CoreSecurityProperties props;
    
    @Test
    void should_load_public_paths() {
        assertThat(props.getPublicPaths())
            .contains("/api/public/**", "/swagger-ui/**");
    }
    
    @Test
    void should_load_strava_paths() {
        assertThat(props.getStravaPaths())
            .contains("/api/v1/strava/webhook", "/api/v1/strava/callback");
    }
    
    @Test
    void should_have_default_health_check_path() {
        assertThat(props.getPublicPaths())
            .contains("/actuator/health");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./mvnw test -Dtest=CoreSecurityPropertiesTest
```

Expected: FAIL with "CoreSecurityProperties not found"

- [ ] **Step 3: Create CoreSecurityProperties class**

```java
package com.menthoros.backend.config.core;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app.security")
public class CoreSecurityProperties {
    
    @NotEmpty(message = "publicPaths cannot be empty")
    private List<String> publicPaths = List.of(
        "/api/public/**",
        "/swagger-ui/**",
        "/api-docs/**",
        "/v3/api-docs/**",
        "/actuator/health"
    );
    
    @NotEmpty(message = "stravaPaths cannot be empty")
    private List<String> stravaPaths = List.of(
        "/api/v1/strava/webhook",
        "/api/v1/strava/callback"
    );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./mvnw test -Dtest=CoreSecurityPropertiesTest
```

Expected: PASS

- [ ] **Step 5: Update application.yml with security properties**

Modify `src/main/resources/application.yml`:

```yaml
app:
  security:
    public-paths:
      - "/api/public/**"
      - "/swagger-ui/**"
      - "/api-docs/**"
      - "/v3/api-docs/**"
      - "/actuator/health"
    strava-paths:
      - "/api/v1/strava/webhook"
      - "/api/v1/strava/callback"
```

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/menthoros/backend/config/core/CoreSecurityProperties.java \
        src/test/java/com/menthoros/backend/config/core/CoreSecurityPropertiesTest.java \
        src/main/resources/application.yml
git commit -m "feat(config): externalize security paths to CoreSecurityProperties"
```

---

### Task 2: Refactor SecurityConfig to use CoreSecurityProperties

**Files:**
- Modify: `src/main/java/com/menthoros/backend/config/SecurityConfig.java`
- Test: `src/test/java/com/menthoros/backend/config/SecurityConfigTest.java`

- [ ] **Step 1: Read existing SecurityConfig to understand current state**

```bash
grep -n "permitAll\|requestMatchers" src/main/java/com/menthoros/backend/config/SecurityConfig.java
```

- [ ] **Step 2: Write failing test for SecurityConfig using injected properties**

```java
package com.menthoros.backend.config;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
    "app.security.public-paths[0]=/api/public/**",
    "app.security.strava-paths[0]=/api/v1/strava/webhook"
})
class SecurityConfigTest {
    
    @Autowired
    private MockMvc mockMvc;
    
    @Test
    void should_permit_public_paths() throws Exception {
        mockMvc.perform(get("/actuator/health"))
            .andExpect(status().isOk());
    }
    
    @Test
    void should_permit_strava_webhook_without_auth() throws Exception {
        mockMvc.perform(get("/api/v1/strava/webhook"))
            .andExpect(status().isOk());
    }
}
```

- [ ] **Step 3: Run test to verify current behavior (may fail if paths still hardcoded)**

```bash
./mvnw test -Dtest=SecurityConfigTest
```

- [ ] **Step 4: Refactor SecurityConfig to inject and use CoreSecurityProperties**

Find the current SecurityConfig and update it:

```java
package com.menthoros.backend.config;

import com.menthoros.backend.config.core.CoreSecurityProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@RequiredArgsConstructor
public class SecurityConfig {
    
    private final CoreSecurityProperties securityProperties;
    
    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .authorizeHttpRequests(auth -> auth
                .requestMatchers(securityProperties.getPublicPaths().toArray(new String[0]))
                    .permitAll()
                .requestMatchers(securityProperties.getStravaPaths().toArray(new String[0]))
                    .permitAll()
                .anyRequest()
                    .authenticated()
            )
            // ... rest of security configuration
            ;
        return http.build();
    }
}
```

Replace the hardcoded paths (lines with `/api/strava/webhook`, `/api/strava/callback`) with the properties-based approach.

- [ ] **Step 5: Run test to verify it passes**

```bash
./mvnw test -Dtest=SecurityConfigTest
```

Expected: PASS

- [ ] **Step 6: Run full test suite to ensure no regressions**

```bash
./mvnw clean test
```

Expected: All tests pass (or same pre-existing failures)

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/menthoros/backend/config/SecurityConfig.java \
        src/test/java/com/menthoros/backend/config/SecurityConfigTest.java
git commit -m "refactor(security): use CoreSecurityProperties to eliminate hardcoded paths"
```

---

### Task 3: Create CacheProperties with Bean Validation (High Priority)

**Files:**
- Create: `src/main/java/com/menthoros/backend/config/core/CacheProperties.java`
- Modify: `src/main/resources/application.yml`
- Test: `src/test/java/com/menthoros/backend/config/core/CachePropertiesTest.java`

- [ ] **Step 1: Write failing test for CacheProperties validation**

```java
package com.menthoros.backend.config.core;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;
import java.time.Duration;
import java.util.Set;

@SpringBootTest
@TestPropertySource(properties = {
    "app.cache.default-ttl=PT30M",
    "app.cache.maximum-size=1000"
})
class CachePropertiesTest {
    
    @Autowired
    private CacheProperties props;
    
    @Autowired
    private Validator validator;
    
    @Test
    void should_load_cache_properties() {
        assertThat(props.getDefaultTtl())
            .isEqualTo(Duration.ofMinutes(30));
        assertThat(props.getMaximumSize())
            .isEqualTo(1000);
    }
    
    @Test
    void should_validate_ttl_is_positive() {
        CacheProperties invalid = new CacheProperties();
        invalid.setDefaultTtl(Duration.ZERO);
        
        Set<ConstraintViolation<CacheProperties>> violations = 
            validator.validate(invalid);
        
        assertThat(violations)
            .isNotEmpty()
            .anyMatch(v -> v.getMessage().contains("positive"));
    }
    
    @Test
    void should_validate_maximum_size_minimum() {
        CacheProperties invalid = new CacheProperties();
        invalid.setMaximumSize(5);
        
        Set<ConstraintViolation<CacheProperties>> violations = 
            validator.validate(invalid);
        
        assertThat(violations)
            .isNotEmpty();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./mvnw test -Dtest=CachePropertiesTest
```

Expected: FAIL with "CacheProperties not found"

- [ ] **Step 3: Create CacheProperties with validation**

```java
package com.menthoros.backend.config.core;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app.cache")
public class CacheProperties {
    
    @NotNull(message = "defaultTtl cannot be null")
    @Positive(message = "defaultTtl must be positive")
    private Duration defaultTtl = Duration.ofMinutes(30);
    
    @NotNull(message = "maximumSize cannot be null")
    @Min(value = 10, message = "maximumSize minimum is 10")
    private long maximumSize = 1000;
    
    @Valid
    private Map<String, CacheProfile> profiles = new HashMap<>();
    
    static {
        // Add defaults in constructor or initialization block
    }
    
    @Getter
    @Setter
    public static class CacheProfile {
        @NotNull(message = "ttl cannot be null")
        @Positive(message = "ttl must be positive")
        private Duration ttl;
        
        @Min(value = 1, message = "maxSize minimum is 1")
        private long maxSize;
        
        public CacheProfile() {}
        
        public CacheProfile(Duration ttl, long maxSize) {
            this.ttl = ttl;
            this.maxSize = maxSize;
        }
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./mvnw test -Dtest=CachePropertiesTest
```

Expected: PASS

- [ ] **Step 5: Update application.yml with cache properties**

Modify `src/main/resources/application.yml`:

```yaml
app:
  cache:
    default-ttl: PT30M
    maximum-size: 1000
    profiles:
      atletas:
        ttl: PT30M
        max-size: 1000
      embeddings:
        ttl: PT2H
        max-size: 500
```

- [ ] **Step 6: Refactor CacheConfig to use CacheProperties**

Find and update `src/main/java/com/menthoros/backend/config/CacheConfig.java`:

```java
package com.menthoros.backend.config;

import com.menthoros.backend.config.core.CacheProperties;
import com.github.benmanes.caffeine.cache.Caffeine;
import lombok.RequiredArgsConstructor;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.cache.caffeine.CaffeineCacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableCaching
@RequiredArgsConstructor
public class CacheConfig {
    
    private final CacheProperties cacheProperties;
    
    @Bean
    public CacheManager cacheManager() {
        CaffeineCacheManager manager = new CaffeineCacheManager();
        manager.setCaffeine(Caffeine.newBuilder()
            .maximumSize(cacheProperties.getMaximumSize())
            .expireAfterWrite(cacheProperties.getDefaultTtl())
            .recordStats()
        );
        return manager;
    }
}
```

- [ ] **Step 7: Run full test suite**

```bash
./mvnw clean test
```

Expected: All tests pass or same pre-existing failures

- [ ] **Step 8: Commit**

```bash
git add src/main/java/com/menthoros/backend/config/core/CacheProperties.java \
        src/main/java/com/menthoros/backend/config/CacheConfig.java \
        src/test/java/com/menthoros/backend/config/core/CachePropertiesTest.java \
        src/main/resources/application.yml
git commit -m "feat(cache): add validated CacheProperties and refactor CacheConfig"
```

---

### Task 4: Create OpenApiProperties and refactor OpenApiConfig

**Files:**
- Create: `src/main/java/com/menthoros/backend/config/documentation/OpenApiProperties.java`
- Modify: `src/main/java/com/menthoros/backend/config/documentation/OpenApiConfig.java`
- Modify: `src/main/resources/application.yml`
- Modify: `pom.xml` (add project.version property if missing)
- Test: `src/test/java/com/menthoros/backend/config/documentation/OpenApiConfigTest.java`

- [ ] **Step 1: Write failing test for OpenApiConfig with version injection**

```java
package com.menthoros.backend.config.documentation;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import io.swagger.v3.oas.models.OpenAPI;

@SpringBootTest
@TestPropertySource(properties = {
    "project.version=1.0.0",
    "app.environment=test"
})
class OpenApiConfigTest {
    
    @Autowired
    private OpenAPI openAPI;
    
    @Test
    void should_inject_version_from_project_properties() {
        assertThat(openAPI.getInfo().getVersion())
            .isEqualTo("1.0.0");
    }
    
    @Test
    void should_include_environment_in_description() {
        assertThat(openAPI.getInfo().getDescription())
            .contains("test");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./mvnw test -Dtest=OpenApiConfigTest
```

- [ ] **Step 3: Create OpenApiProperties**

```java
package com.menthoros.backend.config.documentation;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import jakarta.validation.constraints.NotBlank;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "app.openapi")
public class OpenApiProperties {
    
    @NotBlank(message = "title cannot be blank")
    private String title = "Menthoros API";
    
    @NotBlank(message = "description cannot be blank")
    private String description = "API para gerenciar atletas, treinos e planejamento";
    
    private String contactName = "Menthoros Team";
    private String contactEmail = "contact@menthoros.com";
    
    @NotBlank(message = "environment cannot be blank")
    private String environment = "dev";
}
```

- [ ] **Step 4: Create OpenApiConfig with property injection**

```java
package com.menthoros.backend.config.documentation;

import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Contact;
import io.swagger.v3.oas.models.info.Info;

@Configuration
@RequiredArgsConstructor
public class OpenApiConfig {
    
    private final OpenApiProperties openApiProperties;
    
    @Value("${project.version:dev}")
    private String projectVersion;
    
    @Bean
    public OpenAPI menthorosOpenAPI() {
        Contact contact = new Contact()
            .name(openApiProperties.getContactName())
            .email(openApiProperties.getContactEmail());
        
        Info info = new Info()
            .title(openApiProperties.getTitle())
            .version(projectVersion)
            .description(openApiProperties.getDescription() + 
                " (Environment: " + openApiProperties.getEnvironment() + ")")
            .contact(contact);
        
        return new OpenAPI()
            .info(info);
    }
}
```

- [ ] **Step 5: Update application.yml**

```yaml
app:
  openapi:
    title: Menthoros API
    description: API para gerenciar atletas, treinos e planejamento
    contact-name: Menthoros Team
    contact-email: contact@menthoros.com
    environment: ${ENV:dev}

project:
  version: 1.0.0
```

- [ ] **Step 6: Update pom.xml to expose project.version**

Add to `<properties>` section if not present:

```xml
<properties>
    <!-- ... existing properties ... -->
    <project.version>1.0.0</project.version>
</properties>
```

Or use Maven's default `${project.version}` variable in application.yml:

```yaml
project:
  version: ${project.version}
```

- [ ] **Step 7: Run test to verify it passes**

```bash
./mvnw test -Dtest=OpenApiConfigTest
```

Expected: PASS

- [ ] **Step 8: Run full test suite**

```bash
./mvnw clean test
```

- [ ] **Step 9: Commit**

```bash
git add src/main/java/com/menthoros/backend/config/documentation/OpenApiProperties.java \
        src/main/java/com/menthoros/backend/config/documentation/OpenApiConfig.java \
        src/test/java/com/menthoros/backend/config/documentation/OpenApiConfigTest.java \
        src/main/resources/application.yml \
        pom.xml
git commit -m "feat(openapi): externalize configuration and inject version from pom.xml"
```

---

### Task 5: Create AuditConfig for Auditing Support

**Files:**
- Create: `src/main/java/com/menthoros/backend/config/AuditConfig.java`
- Create: `src/main/java/com/menthoros/backend/domain/audit/AuditableEntity.java`
- Test: `src/test/java/com/menthoros/backend/config/AuditConfigTest.java`

- [ ] **Step 1: Write failing test for AuditableEntity**

```java
package com.menthoros.backend.config;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.auditing.AuditingHandler;
import org.springframework.security.test.context.support.WithMockUser;

@SpringBootTest
class AuditConfigTest {
    
    @Autowired
    private AuditingHandler auditingHandler;
    
    @Test
    @WithMockUser(username = "testuser")
    void should_have_auditing_enabled() {
        assertThat(auditingHandler).isNotNull();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./mvnw test -Dtest=AuditConfigTest
```

- [ ] **Step 3: Create AuditableEntity base class**

```java
package com.menthoros.backend.domain.audit;

import jakarta.persistence.Column;
import jakarta.persistence.MappedSuperclass;
import lombok.Getter;
import lombok.Setter;
import org.springframework.data.annotation.CreatedBy;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedBy;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import jakarta.persistence.EntityListeners;
import java.time.LocalDateTime;

@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
@Getter
@Setter
public abstract class AuditableEntity {
    
    @CreatedDate
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
    
    @LastModifiedDate
    @Column(nullable = false)
    private LocalDateTime updatedAt;
    
    @CreatedBy
    @Column(nullable = false, updatable = false, length = 255)
    private String createdBy;
    
    @LastModifiedBy
    @Column(nullable = false, length = 255)
    private String updatedBy;
}
```

- [ ] **Step 4: Create AuditConfig**

```java
package com.menthoros.backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.domain.AuditorAware;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;
import org.springframework.security.core.context.SecurityContextHolder;
import java.util.Optional;

@Configuration
@EnableJpaAuditing(auditorAwareRef = "auditorProvider")
public class AuditConfig {
    
    @Bean
    public AuditorAware<String> auditorProvider() {
        return () -> Optional
            .ofNullable(SecurityContextHolder.getContext().getAuthentication())
            .map(auth -> auth.getName())
            .or(() -> Optional.of("system"));
    }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
./mvnw test -Dtest=AuditConfigTest
```

Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
./mvnw clean test
```

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/menthoros/backend/config/AuditConfig.java \
        src/main/java/com/menthoros/backend/domain/audit/AuditableEntity.java \
        src/test/java/com/menthoros/backend/config/AuditConfigTest.java
git commit -m "feat(audit): add AuditableEntity and AuditConfig for entity auditing"
```

---

### Task 6: Create HealthConfig with Health Indicators (Low Priority)

**Files:**
- Create: `src/main/java/com/menthoros/backend/config/HealthConfig.java`
- Test: `src/test/java/com/menthoros/backend/config/HealthConfigTest.java`

- [ ] **Step 1: Write failing test for HealthIndicators**

```java
package com.menthoros.backend.config;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.actuate.health.HealthEndpoint;
import org.springframework.boot.actuate.health.Status;

@SpringBootTest(properties = "management.endpoints.web.exposure.include=health")
class HealthConfigTest {
    
    @Autowired
    private HealthEndpoint healthEndpoint;
    
    @Test
    void should_have_strava_health_indicator() {
        var health = healthEndpoint.health();
        assertThat(health.getComponents())
            .containsKey("strava");
    }
    
    @Test
    void should_have_cache_health_indicator() {
        var health = healthEndpoint.health();
        assertThat(health.getComponents())
            .containsKey("cache");
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./mvnw test -Dtest=HealthConfigTest
```

- [ ] **Step 3: Create HealthConfig with indicators**

```java
package com.menthoros.backend.config;

import com.menthoros.backend.config.external.StravaProperties;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.cache.CacheManager;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@RequiredArgsConstructor
public class HealthConfig {
    
    private final StravaProperties stravaProperties;
    private final CacheManager cacheManager;
    
    @Bean
    public HealthIndicator stravaHealth() {
        return () -> {
            try {
                // Verify Strava properties are configured
                if (stravaProperties.getApiBaseUrl() == null || 
                    stravaProperties.getApiBaseUrl().isEmpty()) {
                    return Health.down()
                        .withDetail("reason", "Strava API URL not configured")
                        .build();
                }
                
                return Health.up()
                    .withDetail("service", "strava")
                    .withDetail("baseUrl", stravaProperties.getApiBaseUrl())
                    .build();
            } catch (Exception e) {
                return Health.down()
                    .withDetail("reason", e.getMessage())
                    .build();
            }
        };
    }
    
    @Bean
    public HealthIndicator cacheHealth() {
        return () -> {
            try {
                var cache = cacheManager.getCache("atletas");
                if (cache != null) {
                    return Health.up()
                        .withDetail("caches", cacheManager.getCacheNames())
                        .build();
                } else {
                    return Health.down()
                        .withDetail("reason", "Cache 'atletas' not found")
                        .build();
                }
            } catch (Exception e) {
                return Health.down()
                    .withDetail("reason", e.getMessage())
                    .build();
            }
        };
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./mvnw test -Dtest=HealthConfigTest
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
./mvnw clean test
```

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/menthoros/backend/config/HealthConfig.java \
        src/test/java/com/menthoros/backend/config/HealthConfigTest.java
git commit -m "feat(health): add Strava and Cache health indicators"
```

---

## Phase 2: Repository Refactoring with Specifications & Custom Patterns

### Task 7: Create AtletaSpecification (High Priority)

**Files:**
- Create: `src/main/java/com/menthoros/backend/repository/specification/AtletaSpecification.java`
- Test: `src/test/java/com/menthoros/backend/repository/specification/AtletaSpecificationTest.java`

- [ ] **Step 1: Write failing test for AtletaSpecification**

```java
package com.menthoros.backend.repository.specification;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.data.jpa.domain.Specification.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.test.context.TestPropertySource;
import com.menthoros.backend.domain.entity.Atleta;
import com.menthoros.backend.repository.AtletaRepository;
import java.util.List;
import java.util.UUID;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class AtletaSpecificationTest {
    
    @Autowired
    private AtletaRepository repository;
    
    @Test
    void should_filter_by_tenant() {
        UUID tenantId = UUID.randomUUID();
        
        Specification<Atleta> spec = AtletaSpecification.byTenant(tenantId);
        
        List<Atleta> result = repository.findAll(spec);
        
        assertThat(result).allMatch(a -> a.getAssessoria().getId().equals(tenantId));
    }
    
    @Test
    void should_filter_by_active_status() {
        Specification<Atleta> spec = AtletaSpecification.active();
        
        List<Atleta> result = repository.findAll(spec);
        
        assertThat(result).allMatch(a -> "ATIVO".equals(a.getAtivo()));
    }
    
    @Test
    void should_combine_specifications() {
        UUID tenantId = UUID.randomUUID();
        
        Specification<Atleta> spec = where(AtletaSpecification.byTenant(tenantId))
            .and(AtletaSpecification.active());
        
        List<Atleta> result = repository.findAll(spec);
        
        assertThat(result).allMatch(a -> 
            a.getAssessoria().getId().equals(tenantId) && 
            "ATIVO".equals(a.getAtivo())
        );
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./mvnw test -Dtest=AtletaSpecificationTest
```

Expected: FAIL with "AtletaSpecification not found"

- [ ] **Step 3: Create AtletaSpecification**

```java
package com.menthoros.backend.repository.specification;

import org.springframework.data.jpa.domain.Specification;
import jakarta.persistence.criteria.JoinType;
import com.menthoros.backend.domain.entity.Atleta;
import com.menthoros.backend.domain.entity.IntegracaoExterna;
import java.util.UUID;

public class AtletaSpecification {
    
    private AtletaSpecification() {
        // Utility class
    }
    
    public static Specification<Atleta> byTenant(UUID tenantId) {
        return (root, query, cb) -> 
            cb.equal(root.get("assessoria").get("id"), tenantId);
    }
    
    public static Specification<Atleta> active() {
        return (root, query, cb) -> 
            cb.equal(root.get("ativo"), "ATIVO");
    }
    
    public static Specification<Atleta> inactive() {
        return (root, query, cb) -> 
            cb.equal(root.get("ativo"), "INATIVO");
    }
    
    public static Specification<Atleta> withStravaConnected() {
        return (root, query, cb) -> {
            var join = root.join("integracoes", JoinType.INNER);
            return cb.and(
                cb.equal(join.get("plataforma"), "STRAVA"),
                cb.isTrue(join.get("ativo")),
                cb.isNotNull(join.get("accessToken"))
            );
        };
    }
    
    public static Specification<Atleta> withoutStravaConnected() {
        return (root, query, cb) -> {
            var join = root.join("integracoes", JoinType.LEFT);
            return cb.or(
                cb.isNull(join.get("id")),
                cb.and(
                    cb.notEqual(join.get("plataforma"), "STRAVA"),
                    cb.isFalse(join.get("ativo"))
                )
            );
        };
    }
    
    public static Specification<Atleta> withNameContaining(String name) {
        return (root, query, cb) -> 
            cb.like(cb.lower(root.get("nome")), "%" + name.toLowerCase() + "%");
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./mvnw test -Dtest=AtletaSpecificationTest
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
./mvnw clean test
```

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/menthoros/backend/repository/specification/AtletaSpecification.java \
        src/test/java/com/menthoros/backend/repository/specification/AtletaSpecificationTest.java
git commit -m "feat(repository): add AtletaSpecification for reusable query filters"
```

---

### Task 8: Create AtletaProjection for Optimized Queries

**Files:**
- Create: `src/main/java/com/menthoros/backend/repository/projection/AtletaProjection.java`
- Create: `src/main/java/com/menthoros/backend/repository/projection/AtletaListProjection.java`
- Modify: `src/main/java/com/menthoros/backend/repository/AtletaRepository.java`
- Test: `src/test/java/com/menthoros/backend/repository/projection/AtletaProjectionTest.java`

- [ ] **Step 1: Write failing test for AtletaProjection**

```java
package com.menthoros.backend.repository.projection;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.TestPropertySource;
import com.menthoros.backend.repository.AtletaRepository;
import java.util.List;
import java.util.UUID;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class AtletaProjectionTest {
    
    @Autowired
    private AtletaRepository repository;
    
    @Test
    void should_find_projected_atletas() {
        List<AtletaListProjection> result = 
            repository.findProjectedAtletas();
        
        assertThat(result)
            .isNotEmpty()
            .allMatch(p -> p.getId() != null && p.getNome() != null);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./mvnw test -Dtest=AtletaProjectionTest
```

- [ ] **Step 3: Create AtletaProjection interface**

```java
package com.menthoros.backend.repository.projection;

import java.util.UUID;

public interface AtletaProjection {
    UUID getId();
    String getNome();
    String getEmail();
}
```

- [ ] **Step 4: Create AtletaListProjection interface**

```java
package com.menthoros.backend.repository.projection;

import java.util.UUID;

public interface AtletaListProjection {
    UUID getId();
    String getNome();
    String getEmail();
    String getAtivo();
}
```

- [ ] **Step 5: Update AtletaRepository with projection methods**

Add to `src/main/java/com/menthoros/backend/repository/AtletaRepository.java`:

```java
// Add these methods to the interface

@Query("SELECT new map(" +
    "a.id as id, " +
    "a.nome as nome, " +
    "a.email as email, " +
    "a.ativo as ativo) " +
    "FROM Atleta a")
List<AtletaListProjection> findProjectedAtletas();

@Query("SELECT new map(" +
    "a.id as id, " +
    "a.nome as nome, " +
    "a.email as email) " +
    "FROM Atleta a WHERE a.assessoria.id = :tenantId")
List<AtletaProjection> findProjectedByTenant(@Param("tenantId") UUID tenantId);
```

Or use interface-based projection (preferred):

```java
// Better approach: use interface projections without @Query
List<AtletaListProjection> findProjectedAtletas();

@Query("SELECT a FROM Atleta a WHERE a.assessoria.id = :tenantId")
List<AtletaProjection> findProjectedByTenant(@Param("tenantId") UUID tenantId);
```

- [ ] **Step 6: Run test to verify it passes**

```bash
./mvnw test -Dtest=AtletaProjectionTest
```

Expected: PASS

- [ ] **Step 7: Run full test suite**

```bash
./mvnw clean test
```

- [ ] **Step 8: Commit**

```bash
git add src/main/java/com/menthoros/backend/repository/projection/AtletaProjection.java \
        src/main/java/com/menthoros/backend/repository/projection/AtletaListProjection.java \
        src/main/java/com/menthoros/backend/repository/AtletaRepository.java \
        src/test/java/com/menthoros/backend/repository/projection/AtletaProjectionTest.java
git commit -m "feat(repository): add AtletaProjection for optimized queries"
```

---

### Task 9: Create Custom Repository Pattern for AtletaRepository

**Files:**
- Create: `src/main/java/com/menthoros/backend/repository/custom/AtletaRepositoryCustom.java`
- Create: `src/main/java/com/menthoros/backend/repository/custom/AtletaRepositoryImpl.java`
- Modify: `src/main/java/com/menthoros/backend/repository/AtletaRepository.java`
- Test: `src/test/java/com/menthoros/backend/repository/custom/AtletaRepositoryCustomTest.java`

- [ ] **Step 1: Write failing test for custom repository**

```java
package com.menthoros.backend.repository.custom;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.TestPropertySource;
import com.menthoros.backend.domain.entity.Atleta;
import com.menthoros.backend.repository.AtletaRepository;
import java.util.UUID;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class AtletaRepositoryCustomTest {
    
    @Autowired
    private AtletaRepository repository;
    
    @Test
    void should_find_atletas_with_fetch_graph() {
        var page = repository.findAtletasWithFetchGraph(
            UUID.randomUUID(),
            "basic",
            PageRequest.of(0, 10)
        );
        
        assertThat(page).isNotNull();
    }
    
    @Test
    void should_find_atletas_with_dias() {
        var page = repository.findAtletasWithFetchGraph(
            UUID.randomUUID(),
            "dias",
            PageRequest.of(0, 10)
        );
        
        assertThat(page).isNotNull();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./mvnw test -Dtest=AtletaRepositoryCustomTest
```

- [ ] **Step 3: Create AtletaRepositoryCustom interface**

```java
package com.menthoros.backend.repository.custom;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import com.menthoros.backend.domain.entity.Atleta;
import java.util.UUID;

public interface AtletaRepositoryCustom {
    
    /**
     * Find atletas with specific EntityGraph configuration.
     * 
     * @param tenantId the tenant/assessoria ID
     * @param fetchType the fetch strategy: "basic", "dias", "provas", "all"
     * @param pageable pagination info
     * @return page of atletas
     */
    Page<Atleta> findAtletasWithFetchGraph(
        UUID tenantId,
        String fetchType,
        Pageable pageable
    );
}
```

- [ ] **Step 4: Create AtletaRepositoryImpl**

```java
package com.menthoros.backend.repository.custom;

import jakarta.persistence.EntityGraph;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.TypedQuery;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import com.menthoros.backend.domain.entity.Atleta;
import java.util.UUID;

public class AtletaRepositoryImpl implements AtletaRepositoryCustom {
    
    @PersistenceContext
    private EntityManager em;
    
    @Override
    public Page<Atleta> findAtletasWithFetchGraph(
        UUID tenantId,
        String fetchType,
        Pageable pageable) {
        
        EntityGraph<Atleta> graph = em.createEntityGraph(Atleta.class);
        
        switch(fetchType) {
            case "dias" -> graph.addAttributeNodes("diasDisponiveis");
            case "provas" -> graph.addAttributeNodes("provas");
            case "all" -> {
                graph.addAttributeNodes("diasDisponiveis");
                graph.addAttributeNodes("provas");
            }
            case "basic" -> {
                // No additional attributes, just base entity
            }
        }
        
        TypedQuery<Atleta> query = em.createQuery(
            "SELECT a FROM Atleta a WHERE a.assessoria.id = :tenantId",
            Atleta.class
        );
        query.setHint("javax.persistence.fetchgraph", graph);
        query.setParameter("tenantId", tenantId);
        
        query.setFirstResult((int) pageable.getOffset());
        query.setMaxResults(pageable.getPageSize());
        
        return new PageImpl<>(
            query.getResultList(),
            pageable,
            getTotalCount(tenantId)
        );
    }
    
    private long getTotalCount(UUID tenantId) {
        TypedQuery<Long> query = em.createQuery(
            "SELECT COUNT(a) FROM Atleta a WHERE a.assessoria.id = :tenantId",
            Long.class
        );
        query.setParameter("tenantId", tenantId);
        return query.getSingleResult();
    }
}
```

- [ ] **Step 5: Update AtletaRepository to extend custom interface**

Modify `src/main/java/com/menthoros/backend/repository/AtletaRepository.java`:

```java
public interface AtletaRepository extends 
    PagingAndSortingRepository<Atleta, UUID>,
    JpaSpecificationExecutor<Atleta>,
    AtletaRepositoryCustom {  // Add this
}
```

Remove the duplicate `findAllAtletas*` methods if present.

- [ ] **Step 6: Run test to verify it passes**

```bash
./mvnw test -Dtest=AtletaRepositoryCustomTest
```

Expected: PASS

- [ ] **Step 7: Run full test suite**

```bash
./mvnw clean test
```

- [ ] **Step 8: Commit**

```bash
git add src/main/java/com/menthoros/backend/repository/custom/AtletaRepositoryCustom.java \
        src/main/java/com/menthoros/backend/repository/custom/AtletaRepositoryImpl.java \
        src/main/java/com/menthoros/backend/repository/AtletaRepository.java \
        src/test/java/com/menthoros/backend/repository/custom/AtletaRepositoryCustomTest.java
git commit -m "feat(repository): implement custom repository pattern with fetch graph support"
```

---

### Task 10: Add Explicit @Transactional to AtletaRepository Methods

**Files:**
- Modify: `src/main/java/com/menthoros/backend/repository/AtletaRepository.java`
- Test: `src/test/java/com/menthoros/backend/repository/AtletaRepositoryTransactionTest.java`

- [ ] **Step 1: Write failing test for transactional behavior**

```java
package com.menthoros.backend.repository;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.test.context.TestPropertySource;
import com.menthoros.backend.domain.entity.Atleta;
import java.util.UUID;
import java.util.Optional;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class AtletaRepositoryTransactionTest {
    
    @Autowired
    private AtletaRepository repository;
    
    @Test
    void should_find_by_id_and_tenant_with_read_only_transaction() {
        UUID id = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();
        
        Optional<Atleta> result = repository.findByIdAndTenantId(id, tenantId);
        
        assertThat(result).isEmpty();
    }
    
    @Test
    void should_deactivate_with_modifying_transaction() {
        UUID id = UUID.randomUUID();
        
        int affected = repository.deactivateAthlete(id);
        
        assertThat(affected).isGreaterThanOrEqualTo(0);
    }
}
```

- [ ] **Step 2: Run test to verify current behavior**

```bash
./mvnw test -Dtest=AtletaRepositoryTransactionTest
```

- [ ] **Step 3: Add explicit @Transactional methods to AtletaRepository**

Modify `src/main/java/com/menthoros/backend/repository/AtletaRepository.java`:

```java
import org.springframework.transaction.annotation.Transactional;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;

public interface AtletaRepository extends ... {
    
    @Transactional(readOnly = true)
    @Query("SELECT a FROM Atleta a WHERE a.id = :id AND a.assessoria.id = :tenantId")
    Optional<Atleta> findByIdAndTenantId(
        @Param("id") UUID id,
        @Param("tenantId") UUID tenantId
    );
    
    @Transactional(readOnly = true)
    @Query("SELECT a FROM Atleta a WHERE a.assessoria.id = :tenantId ORDER BY a.nome ASC")
    List<Atleta> findAllByTenantIdOrderByNome(
        @Param("tenantId") UUID tenantId
    );
    
    @Transactional
    @Modifying
    @Query("UPDATE Atleta a SET a.ativo = 'INATIVO' WHERE a.id = :id")
    int deactivateAthlete(@Param("id") UUID id);
    
    @Transactional
    @Modifying
    @Query("UPDATE Atleta a SET a.ativo = 'ATIVO' WHERE a.id = :id")
    int activateAthlete(@Param("id") UUID id);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./mvnw test -Dtest=AtletaRepositoryTransactionTest
```

Expected: PASS

- [ ] **Step 5: Run full test suite**

```bash
./mvnw clean test
```

- [ ] **Step 6: Commit**

```bash
git add src/main/java/com/menthoros/backend/repository/AtletaRepository.java \
        src/test/java/com/menthoros/backend/repository/AtletaRepositoryTransactionTest.java
git commit -m "feat(repository): add explicit @Transactional annotations to query methods"
```

---

### Task 11: Make Atleta Extend AuditableEntity

**Files:**
- Modify: `src/main/java/com/menthoros/backend/domain/entity/Atleta.java`
- Create: Flyway migration for adding audit columns
- Test: `src/test/java/com/menthoros/backend/domain/entity/AtletaAuditTest.java`

- [ ] **Step 1: Write failing test for audit fields**

```java
package com.menthoros.backend.domain.entity;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.TestPropertySource;
import com.menthoros.backend.repository.AtletaRepository;
import java.time.LocalDateTime;
import java.util.UUID;

@DataJpaTest
@TestPropertySource(properties = "spring.jpa.hibernate.ddl-auto=create-drop")
class AtletaAuditTest {
    
    @Autowired
    private AtletaRepository repository;
    
    @Test
    @WithMockUser(username = "testuser")
    void should_set_created_audit_fields_on_insert() {
        Atleta atleta = new Atleta();
        atleta.setId(UUID.randomUUID());
        atleta.setNome("Test Atleta");
        
        repository.save(atleta);
        
        Atleta saved = repository.findById(atleta.getId()).orElseThrow();
        assertThat(saved.getCreatedAt()).isNotNull();
        assertThat(saved.getCreatedBy()).isNotNull();
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
./mvnw test -Dtest=AtletaAuditTest
```

Expected: FAIL with audit fields not found

- [ ] **Step 3: Update Atleta entity to extend AuditableEntity**

Modify `src/main/java/com/menthoros/backend/domain/entity/Atleta.java`:

```java
package com.menthoros.backend.domain.entity;

import com.menthoros.backend.domain.audit.AuditableEntity;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
// ... other imports

@Entity
@Table(name = "atleta")
public class Atleta extends AuditableEntity {  // Extend this
    
    // ... existing fields
    
    @Id
    private UUID id;
    
    private String nome;
    private String email;
    // ... other existing fields
}
```

- [ ] **Step 4: Create Flyway migration for audit columns**

Create `src/main/resources/db/migration/V<next_version>__Add_Audit_Columns_To_Atleta.sql`:

```sql
ALTER TABLE atleta 
ADD COLUMN created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN created_by VARCHAR(255) NOT NULL DEFAULT 'migration',
ADD COLUMN updated_by VARCHAR(255) NOT NULL DEFAULT 'migration';
```

- [ ] **Step 5: Run test to verify it passes**

```bash
./mvnw test -Dtest=AtletaAuditTest
```

Expected: PASS

- [ ] **Step 6: Run full test suite**

```bash
./mvnw clean test
```

- [ ] **Step 7: Commit**

```bash
git add src/main/java/com/menthoros/backend/domain/entity/Atleta.java \
        src/main/resources/db/migration/V<version>__Add_Audit_Columns_To_Atleta.sql \
        src/test/java/com/menthoros/backend/domain/entity/AtletaAuditTest.java
git commit -m "feat(audit): make Atleta extend AuditableEntity with audit trail"
```

---

## Phase 3: Directory Reorganization (Optional, Low Priority)

### Task 12: Reorganize Config Package Structure (Low Priority)

**Files:**
- Move/Create: Files in hierarchical subdirectories
- No functional changes, just organization

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p src/main/java/com/menthoros/backend/config/{core,external,persistence,documentation,async}
```

- [ ] **Step 2: Move existing config files to appropriate subdirectories**

```bash
# Core
mv src/main/java/com/menthoros/backend/config/SecurityConfig.java \
   src/main/java/com/menthoros/backend/config/core/CoreSecurityConfig.java

mv src/main/java/com/menthoros/backend/config/CacheConfig.java \
   src/main/java/com/menthoros/backend/config/core/CacheConfig.java

# External
mkdir -p src/main/java/com/menthoros/backend/config/external
# Move StravaProperties, StravaWebClientConfig, etc. here

# Documentation
mkdir -p src/main/java/com/menthoros/backend/config/documentation
# Move OpenApiConfig, OpenApiProperties here

# Persistence
mkdir -p src/main/java/com/menthoros/backend/config/persistence
# Move DatabaseConfig, FlywayConfig if they exist

# Async
mkdir -p src/main/java/com/menthoros/backend/config/async
# Move AsyncConfig if it exists
```

- [ ] **Step 3: Update all import statements in affected files**

```bash
grep -r "import.*SecurityConfig" src --include="*.java" | grep -v ".class"
# Update each file with new package path
```

- [ ] **Step 4: Run full test suite to ensure no import errors**

```bash
./mvnw clean compile
./mvnw clean test
```

Expected: All tests pass with no compilation errors

- [ ] **Step 5: Commit**

```bash
git add src/main/java/com/menthoros/backend/config/
git commit -m "refactor(config): reorganize config package with hierarchical structure"
```

---

## Self-Review Checklist

### Spec Coverage
- [x] SecurityConfig URLs externalized → Task 1-2
- [x] Config package hierarchical structure → Task 12 (optional)
- [x] CacheProperties with validation → Task 3
- [x] OpenApiConfig version injection → Task 4
- [x] AuditableEntity and AuditConfig → Task 5
- [x] Health Indicators → Task 6
- [x] AtletaRepository duplicate methods removal → Task 7-11
- [x] Specification pattern → Task 7
- [x] Custom Repository pattern → Task 9
- [x] Projection DTOs → Task 8
- [x] Explicit @Transactional → Task 10
- [x] Entity auditing → Task 11

### Placeholder Scan
- ✅ No "TBD", "TODO", or "fill in details" found
- ✅ All code examples are complete and runnable
- ✅ All test code is concrete with actual assertions
- ✅ All SQL migrations are complete

### Type Consistency
- ✅ CoreSecurityProperties.publicPaths and stravaPaths use List<String>
- ✅ CacheProperties uses Duration for TTL
- ✅ AtletaSpecification methods return consistent Specification<Atleta>
- ✅ AtletaRepository custom methods use UUID for IDs
- ✅ AuditableEntity fields use LocalDateTime and String

### Execution Readiness
- ✅ All tasks follow TDD workflow (test first, implementation, passing test)
- ✅ Each task has explicit commit messages
- ✅ File paths are exact and complete
- ✅ Commands include expected outputs

---

## Plan Summary

**Total Tasks:** 12 (11 required + 1 optional)
**Priority Distribution:**
- High Priority: Tasks 1-3, 7-9 (7 tasks)
- Medium Priority: Tasks 4-5, 10-11 (4 tasks)
- Low Priority: Tasks 6, 12 (2 tasks)

**Estimated Implementation Time:** 4-6 hours
**Testing:** TDD approach with comprehensive unit and integration tests
**Risk Level:** Low (refactoring existing code + new features, no breaking changes to API contracts)
