# DTO Package Refactoring to Standard Pattern

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move 6 DTOs from non-standard package `com.menthoros.api.dtos` to the standard `br.com.menthoros.backend.dto.output` package, maintaining consistency across the codebase.

**Architecture:** The standard DTO structure organizes output DTOs in `br.com.menthoros.backend.dto.output`. All API response DTOs should follow this pattern for maintainability and consistency. The DTOs involved are output models for adherence metrics and Strava status endpoints.

**Tech Stack:** Java 21, Spring Boot 3.5.x, Lombok, Maven

**Affected Files:**
- **DTOs to move:** 6 files from `com/menthoros/api/dtos/` to `br/com/menthoros/backend/dto/output/`
- **Imports to update:** 5 files (3 controllers, 2 services)
- **Tests:** Standard Maven test suite

---

## Task 1: Create Output DTOs (Classes)

**Files:**
- Create: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/dto/output/SemanaAdesaoDto.java`
- Create: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/dto/output/AdesaoSemanalDto.java`
- Create: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/dto/output/StravaStatusGlobalDto.java`

- [ ] **Step 1: Create SemanaAdesaoDto**

```java
package br.com.menthoros.backend.dto.output;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SemanaAdesaoDto {
    private String semana;                    // ISO week string "2026-W18"
    private String dataInicio;                // "2026-05-04"
    private String dataFim;                   // "2026-05-10"
    private Integer treinosPlanejados;
    private Integer treinosRealizados;
    private Double percentualRealizacao;      // 0-100
    private Integer diasComTreino;
}
```

- [ ] **Step 2: Create AdesaoSemanalDto**

```java
package br.com.menthoros.backend.dto.output;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class AdesaoSemanalDto {
    private String atletaId;
    private String nomeAtleta;
    private SemanaAdesaoDto semanaAtual;
    private List<SemanaAdesaoDto> ultimas4Semanas;
    private Double mediaUltimas4Semanas;
}
```

- [ ] **Step 3: Create StravaStatusGlobalDto**

```java
package br.com.menthoros.backend.dto.output;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StravaStatusGlobalDto {
    private Integer totalAtletas;
    private Integer atletasConectados;
    private Double percentualConectado;
}
```

- [ ] **Step 4: Verify files compile**

Run: `cd apps/menthoros-backend && ./mvnw clean compile`
Expected: `BUILD SUCCESS`

- [ ] **Step 5: Commit class-based DTOs**

```bash
cd apps/menthoros-backend
git add src/main/java/br/com/menthoros/backend/dto/output/SemanaAdesaoDto.java
git add src/main/java/br/com/menthoros/backend/dto/output/AdesaoSemanalDto.java
git add src/main/java/br/com/menthoros/backend/dto/output/StravaStatusGlobalDto.java
git commit -m "feat: add adherence and Strava status output DTOs to standard package"
```

---

## Task 2: Create Output DTOs (Records)

**Files:**
- Create: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/dto/output/SemanaAdesaoDiariaDto.java`
- Create: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/dto/output/AdesaoDiariaDto.java`
- Create: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/dto/output/DiaAdesaoDto.java`

- [ ] **Step 1: Create SemanaAdesaoDiariaDto record**

```java
package br.com.menthoros.backend.dto.output;

import java.util.List;

public record SemanaAdesaoDiariaDto(
    String semana,
    String dataInicio,
    String dataFim,
    Double percentualGeral,
    List<DiaAdesaoDto> dias
) {}
```

- [ ] **Step 2: Create AdesaoDiariaDto record**

```java
package br.com.menthoros.backend.dto.output;

import java.util.List;

public record AdesaoDiariaDto(
    String atletaId,
    String nomeAtleta,
    List<SemanaAdesaoDiariaDto> semanas
) {}
```

- [ ] **Step 3: Create DiaAdesaoDto record**

```java
package br.com.menthoros.backend.dto.output;

public record DiaAdesaoDto(
    String data,
    String diaSemana,
    Integer treinosPlanejados,
    Integer treinosRealizados,
    Double percentual
) {}
```

- [ ] **Step 4: Verify files compile**

Run: `cd apps/menthoros-backend && ./mvnw clean compile`
Expected: `BUILD SUCCESS`

- [ ] **Step 5: Commit record-based DTOs**

```bash
cd apps/menthoros-backend
git add src/main/java/br/com/menthoros/backend/dto/output/SemanaAdesaoDiariaDto.java
git add src/main/java/br/com/menthoros/backend/dto/output/AdesaoDiariaDto.java
git add src/main/java/br/com/menthoros/backend/dto/output/DiaAdesaoDto.java
git commit -m "feat: add daily adherence output record DTOs to standard package"
```

---

## Task 3: Update MetricasAdesaoService Imports

**Files:**
- Modify: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/MetricasAdesaoService.java`

- [ ] **Step 1: Read the file to see current imports**

Run: `grep -n "import.*com\.menthoros\.api\.dtos" apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/MetricasAdesaoService.java`
Expected: Shows old package imports

- [ ] **Step 2: Update imports in MetricasAdesaoService**

Replace:
```java
import com.menthoros.api.dtos.SemanaAdesaoDto;
import com.menthoros.api.dtos.AdesaoSemanalDto;
```

With:
```java
import br.com.menthoros.backend.dto.output.SemanaAdesaoDto;
import br.com.menthoros.backend.dto.output.AdesaoSemanalDto;
```

- [ ] **Step 3: Verify service compiles**

Run: `cd apps/menthoros-backend && ./mvnw clean compile`
Expected: `BUILD SUCCESS`

- [ ] **Step 4: Commit service imports update**

```bash
cd apps/menthoros-backend
git add src/main/java/br/com/menthoros/backend/services/MetricasAdesaoService.java
git commit -m "refactor: update MetricasAdesaoService imports to standard DTO package"
```

---

## Task 4: Update StravaStatusService Imports

**Files:**
- Modify: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/StravaStatusService.java`

- [ ] **Step 1: Read the file to see current imports**

Run: `grep -n "import.*com\.menthoros\.api\.dtos" apps/menthoros-backend/src/main/java/br/com/menthoros/backend/services/StravaStatusService.java`
Expected: Shows old package imports

- [ ] **Step 2: Update imports in StravaStatusService**

Replace:
```java
import com.menthoros.api.dtos.StravaStatusGlobalDto;
```

With:
```java
import br.com.menthoros.backend.dto.output.StravaStatusGlobalDto;
```

- [ ] **Step 3: Verify service compiles**

Run: `cd apps/menthoros-backend && ./mvnw clean compile`
Expected: `BUILD SUCCESS`

- [ ] **Step 4: Commit service imports update**

```bash
cd apps/menthoros-backend
git add src/main/java/br/com/menthoros/backend/services/StravaStatusService.java
git commit -m "refactor: update StravaStatusService imports to standard DTO package"
```

---

## Task 5: Update MetricasController Imports

**Files:**
- Modify: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/MetricasController.java`

- [ ] **Step 1: Read the file to see current imports**

Run: `grep -n "import.*com\.menthoros\.api\.dtos" apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/MetricasController.java`
Expected: Shows old package imports

- [ ] **Step 2: Update imports in MetricasController**

Replace imports like:
```java
import com.menthoros.api.dtos.AdesaoDiariaDto;
import com.menthoros.api.dtos.SemanaAdesaoDiariaDto;
import com.menthoros.api.dtos.DiaAdesaoDto;
```

With:
```java
import br.com.menthoros.backend.dto.output.AdesaoDiariaDto;
import br.com.menthoros.backend.dto.output.SemanaAdesaoDiariaDto;
import br.com.menthoros.backend.dto.output.DiaAdesaoDto;
```

- [ ] **Step 3: Verify controller compiles**

Run: `cd apps/menthoros-backend && ./mvnw clean compile`
Expected: `BUILD SUCCESS`

- [ ] **Step 4: Commit controller imports update**

```bash
cd apps/menthoros-backend
git add src/main/java/br/com/menthoros/backend/controller/MetricasController.java
git commit -m "refactor: update MetricasController imports to standard DTO package"
```

---

## Task 6: Update StravaStatusController Imports

**Files:**
- Modify: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/StravaStatusController.java`

- [ ] **Step 1: Read the file to see current imports**

Run: `grep -n "import.*com\.menthoros\.api\.dtos" apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/StravaStatusController.java`
Expected: Shows old package imports

- [ ] **Step 2: Update imports in StravaStatusController**

Replace:
```java
import com.menthoros.api.dtos.StravaStatusGlobalDto;
```

With:
```java
import br.com.menthoros.backend.dto.output.StravaStatusGlobalDto;
```

- [ ] **Step 3: Verify controller compiles**

Run: `cd apps/menthoros-backend && ./mvnw clean compile`
Expected: `BUILD SUCCESS`

- [ ] **Step 4: Commit controller imports update**

```bash
cd apps/menthoros-backend
git add src/main/java/br/com/menthoros/backend/controller/StravaStatusController.java
git commit -m "refactor: update StravaStatusController imports to standard DTO package"
```

---

## Task 7: Update AssessoriaMetricasController Imports

**Files:**
- Modify: `apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/AssessoriaMetricasController.java`

- [ ] **Step 1: Read the file to see current imports**

Run: `grep -n "import.*com\.menthoros\.api\.dtos" apps/menthoros-backend/src/main/java/br/com/menthoros/backend/controller/AssessoriaMetricasController.java`
Expected: Shows old package imports

- [ ] **Step 2: Update imports in AssessoriaMetricasController**

Replace imports of old DTOs with standard package imports (adjust based on what the file actually imports)

- [ ] **Step 3: Verify controller compiles**

Run: `cd apps/menthoros-backend && ./mvnw clean compile`
Expected: `BUILD SUCCESS`

- [ ] **Step 4: Commit controller imports update**

```bash
cd apps/menthoros-backend
git add src/main/java/br/com/menthoros/backend/controller/AssessoriaMetricasController.java
git commit -m "refactor: update AssessoriaMetricasController imports to standard DTO package"
```

---

## Task 8: Verify No Remaining References

**Files:**
- Verify: All Java files in project

- [ ] **Step 1: Search for any remaining old package references**

Run: `cd apps/menthoros-backend && grep -r "com\.menthoros\.api\.dtos" src/main/java --include="*.java" | grep -v "\.class"`
Expected: No output (zero matches)

- [ ] **Step 2: Run full compilation test**

Run: `cd apps/menthoros-backend && ./mvnw clean compile`
Expected: `BUILD SUCCESS`

- [ ] **Step 3: Run unit tests**

Run: `cd apps/menthoros-backend && ./mvnw test`
Expected: All existing tests pass (or fail for pre-existing reasons documented in memory)

- [ ] **Step 4: Commit verification**

```bash
cd apps/menthoros-backend
git commit --allow-empty -m "chore: verify no remaining old DTO package references"
```

---

## Task 9: Delete Old DTO Files

**Files:**
- Delete: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/SemanaAdesaoDto.java`
- Delete: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/AdesaoSemanalDto.java`
- Delete: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/SemanaAdesaoDiariaDto.java`
- Delete: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/AdesaoDiariaDto.java`
- Delete: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/DiaAdesaoDto.java`
- Delete: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/StravaStatusGlobalDto.java`

- [ ] **Step 1: Delete old DTOs using git**

```bash
cd apps/menthoros-backend
git rm src/main/java/com/menthoros/api/dtos/SemanaAdesaoDto.java
git rm src/main/java/com/menthoros/api/dtos/AdesaoSemanalDto.java
git rm src/main/java/com/menthoros/api/dtos/SemanaAdesaoDiariaDto.java
git rm src/main/java/com/menthoros/api/dtos/AdesaoDiariaDto.java
git rm src/main/java/com/menthoros/api/dtos/DiaAdesaoDto.java
git rm src/main/java/com/menthoros/api/dtos/StravaStatusGlobalDto.java
```

- [ ] **Step 2: Verify compilation after deletion**

Run: `cd apps/menthoros-backend && ./mvnw clean compile`
Expected: `BUILD SUCCESS`

- [ ] **Step 3: Commit deletion**

```bash
cd apps/menthoros-backend
git commit -m "chore: remove old DTO package com.menthoros.api.dtos (migrated to standard package)"
```

---

## Task 10: Final Validation and Update Workspace Submodule

**Files:**
- Verify: Backend compilation and tests
- Update: Workspace root submodule reference

- [ ] **Step 1: Run full test suite one final time**

Run: `cd apps/menthoros-backend && ./mvnw clean test`
Expected: All tests pass (or expected failures as per memory records)

- [ ] **Step 2: Check for any remaining issues**

Run: `cd apps/menthoros-backend && ./mvnw verify`
Expected: `BUILD SUCCESS`

- [ ] **Step 3: Verify package structure is now clean**

Run: `find apps/menthoros-backend/src/main/java/br/com/menthoros/backend/dto/output -name "*AdesaoDto" -o -name "*StravaStatusGlobalDto"`
Expected: 6 files found in output/ package

- [ ] **Step 4: Update workspace root submodule pointer**

```bash
cd /Users/leandrosilva/dev/workspace/menthoros-workspace
git add apps/menthoros-backend
git commit -m "chore: update menthoros-backend submodule reference after DTO package refactoring"
```

- [ ] **Step 5: Final verification**

Run: `cd apps/menthoros-backend && ./mvnw clean test`
Expected: `BUILD SUCCESS`

---

## Testing Strategy

**Pre-migration baseline:** The project has 203 unit tests passing and 43 Spring context tests failing (pre-existing issue unrelated to DTOs). This test status should not change after refactoring.

**After each import update:** Run `./mvnw clean compile` to ensure no broken references.

**Final validation:** Run `./mvnw clean test` to ensure tests still pass and no new failures introduced.

---

## Risk Assessment

**Low Risk** — This is a pure refactoring:
- DTOs moved to standard package following established conventions
- Imports updated in 5 files
- No business logic changes
- No API contract changes (same DTOs, same fields, same behavior)
- All changes are syntax/package organization only

**Rollback:** If needed, revert commits up to Task 2 to restore old package DTOs (git remains pristine).
