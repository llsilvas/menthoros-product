# 4 Dashboard Endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 4 new REST endpoints to eliminate hardcoded values in dashboard widgets and fix N+1 query problems, providing global Strava status, weekly adherence metrics, batch race queries, and weekly training summaries.

**Architecture:** 
- Backend: 4 endpoints across Spring Boot controllers + new services + repository query methods + DTOs
- Frontend: New services (MetricasService, updated StravaService, ProvaService, TreinoService) + new/updated widgets + type definitions
- Eliminates 3 hardcoded values: stravaConnected=0, N+1 queries in ProvasProximasWidget
- Query optimization: batch queries for races and metrics across all athletes in assessoria

**Tech Stack:** Spring Boot, JPA/Hibernate, React, TypeScript, Material-UI, OpenAPI generator

---

## Task 1: Create StravaStatusGlobalDto (Backend)

**Files:**
- Create: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/StravaStatusGlobalDto.java`

**Purpose:** DTO for GET /api/v1/strava/status-global response.

- [ ] **Step 1: Create StravaStatusGlobalDto with 3 fields**

```java
package com.menthoros.api.dtos;

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

- [ ] **Step 2: Verify file compiles**

Run: `cd apps/menthoros-backend && ./mvnw clean compile -DskipTests` (from root or backend dir)
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-backend
git add src/main/java/com/menthoros/api/dtos/StravaStatusGlobalDto.java
git commit -m "feat: add StravaStatusGlobalDto for Strava global status endpoint"
```

---

## Task 2: Create StravaStatusService (Backend)

**Files:**
- Create: `apps/menthoros-backend/src/main/java/com/menthoros/services/StravaStatusService.java`
- Reference: `IntegracaoExternaRepository` (should have or add: countActiveStravaConnections(), countAthletesWithActiveStrava())

**Purpose:** Service that queries Strava connection counts and calculates percentual.

- [ ] **Step 1: Create StravaStatusService with getStatusGlobal() method**

```java
package com.menthoros.services;

import com.menthoros.api.dtos.StravaStatusGlobalDto;
import com.menthoros.repositories.IntegracaoExternaRepository;
import com.menthoros.repositories.AtletaRepository;
import org.springframework.stereotype.Service;

@Service
public class StravaStatusService {
    
    private final IntegracaoExternaRepository integracaoExternaRepository;
    private final AtletaRepository atletaRepository;
    
    public StravaStatusService(IntegracaoExternaRepository integracaoExternaRepository,
                               AtletaRepository atletaRepository) {
        this.integracaoExternaRepository = integracaoExternaRepository;
        this.atletaRepository = atletaRepository;
    }
    
    public StravaStatusGlobalDto getStatusGlobal() {
        Integer totalAtletas = Math.toIntExact(atletaRepository.count());
        Integer atletasConectados = integracaoExternaRepository.countAthletesWithActiveStrava();
        
        Double percentualConectado = totalAtletas > 0 
            ? (atletasConectados.doubleValue() / totalAtletas) * 100 
            : 0.0;
        
        return new StravaStatusGlobalDto(totalAtletas, atletasConectados, percentualConectado);
    }
}
```

- [ ] **Step 2: Check IntegracaoExternaRepository has countAthletesWithActiveStrava() method, add if missing**

Verify in `apps/menthoros-backend/src/main/java/com/menthoros/repositories/IntegracaoExternaRepository.java`:
```java
@Query("SELECT COUNT(DISTINCT ie.atleta.id) FROM IntegracaoExterna ie WHERE ie.plataforma = 'STRAVA' AND ie.ativo = true")
Integer countAthletesWithActiveStrava();
```

If missing, add it to the repository.

- [ ] **Step 3: Compile and verify**

Run: `cd apps/menthoros-backend && ./mvnw clean compile -DskipTests`
Expected: BUILD SUCCESS

- [ ] **Step 4: Commit**

```bash
cd apps/menthoros-backend
git add src/main/java/com/menthoros/services/StravaStatusService.java
git add src/main/java/com/menthoros/repositories/IntegracaoExternaRepository.java
git commit -m "feat: add StravaStatusService with global Strava connection metrics"
```

---

## Task 3: Create StravaStatusController endpoint (Backend)

**Files:**
- Create: `apps/menthoros-backend/src/main/java/com/menthoros/api/controllers/StravaStatusController.java`

**Purpose:** Expose GET /api/v1/strava/status-global endpoint.

- [ ] **Step 1: Create StravaStatusController with status-global endpoint**

```java
package com.menthoros.api.controllers;

import com.menthoros.api.dtos.StravaStatusGlobalDto;
import com.menthoros.services.StravaStatusService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/strava")
public class StravaStatusController {
    
    private final StravaStatusService stravaStatusService;
    
    public StravaStatusController(StravaStatusService stravaStatusService) {
        this.stravaStatusService = stravaStatusService;
    }
    
    @GetMapping("/status-global")
    public ResponseEntity<StravaStatusGlobalDto> getStatusGlobal() {
        StravaStatusGlobalDto status = stravaStatusService.getStatusGlobal();
        return ResponseEntity.ok(status);
    }
}
```

- [ ] **Step 2: Compile**

Run: `cd apps/menthoros-backend && ./mvnw clean compile -DskipTests`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-backend
git add src/main/java/com/menthoros/api/controllers/StravaStatusController.java
git commit -m "feat: add GET /api/v1/strava/status-global endpoint"
```

---

## Task 4: Add DTOs and Repository Methods for Adherence Metrics (Backend)

**Files:**
- Create: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/AdesaoSemanalDto.java`
- Create: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/SemanaAdesaoDto.java`
- Modify: `apps/menthoros-backend/src/main/java/com/menthoros/repositories/TreinoPlanejadoRepository.java`
- Modify: `apps/menthoros-backend/src/main/java/com/menthoros/repositories/TreinoRealizadoRepository.java`

**Purpose:** Create DTOs for adherence response and add repository query methods for planned/realized trainings.

- [ ] **Step 1: Create SemanaAdesaoDto (single week structure)**

```java
package com.menthoros.api.dtos;

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

- [ ] **Step 2: Create AdesaoSemanalDto (main response)**

```java
package com.menthoros.api.dtos;

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

- [ ] **Step 3: Add query methods to TreinoPlanejadoRepository**

In `apps/menthoros-backend/src/main/java/com/menthoros/repositories/TreinoPlanejadoRepository.java`, add:

```java
@Query("SELECT COUNT(tp) FROM TreinoPlanejado tp WHERE tp.atleta.id = :atletaId AND WEEK(tp.dataPlanejada) = WEEK(:startDate) AND YEAR(tp.dataPlanejada) = YEAR(:startDate)")
Integer countPlannedTrainings(@Param("atletaId") String atletaId, @Param("startDate") LocalDate startDate);
```

- [ ] **Step 4: Add query methods to TreinoRealizadoRepository**

In `apps/menthoros-backend/src/main/java/com/menthoros/repositories/TreinoRealizadoRepository.java`, add:

```java
@Query("SELECT COUNT(tr) FROM TreinoRealizado tr WHERE tr.atleta.id = :atletaId AND WEEK(tr.dataRealizacao) = WEEK(:startDate) AND YEAR(tr.dataRealizacao) = YEAR(:startDate)")
Integer countRealizedTrainings(@Param("atletaId") String atletaId, @Param("startDate") LocalDate startDate);

@Query("SELECT tr FROM TreinoRealizado tr WHERE tr.atleta.id = :atletaId AND WEEK(tr.dataRealizacao) = WEEK(:startDate) AND YEAR(tr.dataRealizacao) = YEAR(:startDate) ORDER BY tr.dataRealizacao ASC")
List<TreinoRealizado> findRealizedTrainingsByWeek(@Param("atletaId") String atletaId, @Param("startDate") LocalDate startDate);
```

- [ ] **Step 5: Compile and verify**

Run: `cd apps/menthoros-backend && ./mvnw clean compile -DskipTests`
Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
cd apps/menthoros-backend
git add src/main/java/com/menthoros/api/dtos/AdesaoSemanalDto.java
git add src/main/java/com/menthoros/api/dtos/SemanaAdesaoDto.java
git add src/main/java/com/menthoros/repositories/TreinoPlanejadoRepository.java
git add src/main/java/com/menthoros/repositories/TreinoRealizadoRepository.java
git commit -m "feat: add adherence metrics DTOs and repository query methods"
```

---

## Task 5: Create MetricasAdesaoService (Backend)

**Files:**
- Create: `apps/menthoros-backend/src/main/java/com/menthoros/services/MetricasAdesaoService.java`

**Purpose:** Service that calculates weekly adherence metrics for a single athlete.

- [ ] **Step 1: Create MetricasAdesaoService**

```java
package com.menthoros.services;

import com.menthoros.api.dtos.AdesaoSemanalDto;
import com.menthoros.api.dtos.SemanaAdesaoDto;
import com.menthoros.entities.Atleta;
import com.menthoros.repositories.AtletaRepository;
import com.menthoros.repositories.TreinoPlanejadoRepository;
import com.menthoros.repositories.TreinoRealizadoRepository;
import org.springframework.stereotype.Service;
import java.time.LocalDate;
import java.time.temporal.IsoFields;
import java.time.temporal.WeekFields;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

@Service
public class MetricasAdesaoService {
    
    private final AtletaRepository atletaRepository;
    private final TreinoPlanejadoRepository treinoPlanejadoRepository;
    private final TreinoRealizadoRepository treinoRealizadoRepository;
    
    public MetricasAdesaoService(AtletaRepository atletaRepository,
                                 TreinoPlanejadoRepository treinoPlanejadoRepository,
                                 TreinoRealizadoRepository treinoRealizadoRepository) {
        this.atletaRepository = atletaRepository;
        this.treinoPlanejadoRepository = treinoPlanejadoRepository;
        this.treinoRealizadoRepository = treinoRealizadoRepository;
    }
    
    public AdesaoSemanalDto getAdesaoSemanal(String atletaId) {
        Atleta atleta = atletaRepository.findById(atletaId)
            .orElseThrow(() -> new RuntimeException("Atleta not found: " + atletaId));
        
        LocalDate hoje = LocalDate.now();
        
        // Get current week
        SemanaAdesaoDto semanaAtual = calcularSemana(atleta, hoje);
        
        // Get last 4 weeks
        List<SemanaAdesaoDto> ultimas4Semanas = new ArrayList<>();
        for (int i = 1; i <= 4; i++) {
            LocalDate semanaData = hoje.minusWeeks(i);
            ultimas4Semanas.add(calcularSemana(atleta, semanaData));
        }
        
        // Calculate average
        double mediaUltimas4Semanas = ultimas4Semanas.stream()
            .mapToDouble(s -> s.getPercentualRealizacao() != null ? s.getPercentualRealizacao() : 0.0)
            .average()
            .orElse(0.0);
        
        return new AdesaoSemanalDto(
            atleta.getId(),
            atleta.getNome(),
            semanaAtual,
            ultimas4Semanas,
            mediaUltimas4Semanas
        );
    }
    
    private SemanaAdesaoDto calcularSemana(Atleta atleta, LocalDate data) {
        LocalDate startOfWeek = data.with(WeekFields.of(Locale.ENGLISH).dayOfWeek(), 1);
        LocalDate endOfWeek = startOfWeek.plusDays(6);
        
        int week = data.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
        int year = data.get(IsoFields.WEEK_BASED_YEAR);
        
        Integer planejados = treinoPlanejadoRepository.countPlannedTrainings(atleta.getId(), startOfWeek);
        Integer realizados = treinoRealizadoRepository.countRealizedTrainings(atleta.getId(), startOfWeek);
        
        double percentual = planejados > 0 ? (realizados.doubleValue() / planejados) * 100 : 0.0;
        
        return new SemanaAdesaoDto(
            String.format("%04d-W%02d", year, week),
            startOfWeek.toString(),
            endOfWeek.toString(),
            planejados,
            realizados,
            percentual,
            Math.toIntExact(treinoRealizadoRepository.findRealizedTrainingsByWeek(atleta.getId(), startOfWeek)
                .stream()
                .map(tr -> tr.getDataRealizacao().getDayOfWeek())
                .distinct()
                .count())
        );
    }
}
```

- [ ] **Step 2: Compile**

Run: `cd apps/menthoros-backend && ./mvnw clean compile -DskipTests`
Expected: BUILD SUCCESS

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-backend
git add src/main/java/com/menthoros/services/MetricasAdesaoService.java
git commit -m "feat: add MetricasAdesaoService for weekly adherence calculation"
```

---

## Task 6: Create Batch Provas Endpoint (Backend) — ALL STUDENTS, NEXT 15 DAYS

**Files:**
- Create: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/ProvaProximaDto.java`
- Create: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/ProvasProximasResponseDto.java`
- Modify: `apps/menthoros-backend/src/main/java/com/menthoros/repositories/ProvaRepository.java`
- Modify: `apps/menthoros-backend/src/main/java/com/menthoros/api/controllers/ProvaController.java`

**Purpose:** GET /api/v1/provas/proximas returns ALL races from ALL students in assessoria for next 15 days, ordered by closest date.

**Key requirement:** Retrieve all races regardless of athlete, for the entire assessoria, next 15 days, ordered by date ascending.

- [ ] **Step 1: Create ProvaProximaDto**

```java
package com.menthoros.api.dtos;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProvaProximaDto {
    private String id;
    private String atletaId;
    private String nomeAtleta;
    private String nomeProva;
    private String dataProva;           // ISO date format "2026-05-15"
    private String tipoProva;
    private String distancia;           // Can be string like "10KM" or numeric
    private Double distanciaKm;
    private String objetivo;
    private String statusProva;
    private Integer diasFaltando;
}
```

- [ ] **Step 2: Create ProvasProximasResponseDto**

```java
package com.menthoros.api.dtos;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ProvasProximasResponseDto {
    private List<ProvaProximaDto> provas;
    private Integer total;
    private String dataConsulta;        // ISO datetime when query was made
}
```

- [ ] **Step 3: Add query to ProvaRepository**

In `apps/menthoros-backend/src/main/java/com/menthoros/repositories/ProvaRepository.java`, add:

```java
@Query("SELECT p FROM Prova p WHERE p.dataProva BETWEEN CURRENT_TIMESTAMP AND CURRENT_TIMESTAMP + 15 DAY ORDER BY p.dataProva ASC")
List<Prova> findUpcomingProvasNext15Days();
```

- [ ] **Step 4: Add endpoint to ProvaController**

In `apps/menthoros-backend/src/main/java/com/menthoros/api/controllers/ProvaController.java`, add:

```java
@GetMapping("/proximas")
public ResponseEntity<ProvasProximasResponseDto> getProvasProximas() {
    List<Prova> provas = provaRepository.findUpcomingProvasNext15Days();
    
    List<ProvaProximaDto> dto = provas.stream()
        .map(p -> {
            LocalDate dataProva = p.getDataProva().toLocalDate();
            long diasFaltando = ChronoUnit.DAYS.between(LocalDate.now(), dataProva);
            
            return new ProvaProximaDto(
                p.getId(),
                p.getAtleta().getId(),
                p.getAtleta().getNome(),
                p.getNome(),
                p.getDataProva().toString(),
                p.getTipo(),
                p.getDistancia() != null ? p.getDistancia().toString() : null,
                p.getDistanciaKm(),
                p.getObjetivo(),
                p.getStatus(),
                Math.toIntExact(diasFaltando)
            );
        })
        .collect(Collectors.toList());
    
    ProvasProximasResponseDto response = new ProvasProximasResponseDto(
        dto,
        dto.size(),
        LocalDateTime.now().toString()
    );
    
    return ResponseEntity.ok(response);
}
```

Note: Add `import java.time.temporal.ChronoUnit;` and `import java.util.stream.Collectors;` if missing.

- [ ] **Step 5: Compile**

Run: `cd apps/menthoros-backend && ./mvnw clean compile -DskipTests`
Expected: BUILD SUCCESS

- [ ] **Step 6: Commit**

```bash
cd apps/menthoros-backend
git add src/main/java/com/menthoros/api/dtos/ProvaProximaDto.java
git add src/main/java/com/menthoros/api/dtos/ProvasProximasResponseDto.java
git add src/main/java/com/menthoros/repositories/ProvaRepository.java
git add src/main/java/com/menthoros/api/controllers/ProvaController.java
git commit -m "feat: add GET /api/v1/provas/proximas endpoint for all upcoming races in next 15 days"
```

---

## Task 7: Create Weekly Training Summary Endpoint (Backend)

**Files:**
- Create: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/ResumoDetalhesDto.java`
- Create: `apps/menthoros-backend/src/main/java/com/menthoros/api/dtos/ResumoSemanalTreinoDto.java`
- Modify: `apps/menthoros-backend/src/main/java/com/menthoros/api/controllers/TreinoRealizadoController.java`

**Purpose:** GET /api/v1/treinos/realizados/resumo-semana returns weekly training aggregates (volume, TSS, duration, days breakdown).

- [ ] **Step 1: Create ResumoDetalhesDto for day-of-week breakdown**

```java
package com.menthoros.api.dtos;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ResumoDetalhesDto {
    private Integer treinos;
    private Double km;
    private Double tss;
}
```

- [ ] **Step 2: Create ResumoSemanalTreinoDto**

```java
package com.menthoros.api.dtos;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ResumoSemanalTreinoDto {
    private String atletaId;
    private String nomeAtleta;
    private String semana;                        // "2026-W18"
    private String dataInicio;                    // "2026-05-04"
    private String dataFim;                       // "2026-05-10"
    private Resumo resumo;
    
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Resumo {
        private Integer totalTreinos;
        private Double volumeTotalKm;
        private Double tssTotalSemana;
        private Double tempoTotalMinutos;
        private Integer diasComTreino;
        private Integer diasSemTreino;
        private String ultimoTreino;              // "2026-05-08"
        private Map<String, ResumoDetalhesDto> diasDaSemana;  // key: "SEGUNDA", "TERCA", etc.
    }
}
```

- [ ] **Step 3: Add endpoint to TreinoRealizadoController**

In `apps/menthoros-backend/src/main/java/com/menthoros/api/controllers/TreinoRealizadoController.java`, add:

```java
@GetMapping("/resumo-semana")
public ResponseEntity<ResumoSemanalTreinoDto> getResumoSemanal(
    @RequestParam String atletaId,
    @RequestParam(required = false) String semana) {
    
    Atleta atleta = atletaRepository.findById(atletaId)
        .orElseThrow(() -> new RuntimeException("Atleta not found"));
    
    LocalDate targetDate = semana != null ? LocalDate.parse(semana) : LocalDate.now();
    LocalDate startOfWeek = targetDate.with(WeekFields.of(Locale.ENGLISH).dayOfWeek(), 1);
    LocalDate endOfWeek = startOfWeek.plusDays(6);
    
    List<TreinoRealizado> treinos = treinoRealizadoRepository.findRealizedTrainingsByWeek(atletaId, startOfWeek);
    
    Map<String, ResumoDetalhesDto> diasDaSemana = new HashMap<>();
    for (DayOfWeek day : DayOfWeek.values()) {
        diasDaSemana.put(day.toString(), new ResumoDetalhesDto(0, 0.0, 0.0));
    }
    
    double totalKm = 0;
    double totalTss = 0;
    double totalMinutos = 0;
    LocalDate ultimoTreino = null;
    int diasComTreino = 0;
    
    Map<LocalDate, List<TreinoRealizado>> treinosPorDia = treinos.stream()
        .collect(Collectors.groupingBy(TreinoRealizado::getDataRealizacao));
    
    for (Map.Entry<LocalDate, List<TreinoRealizado>> entry : treinosPorDia.entrySet()) {
        diasComTreino++;
        double km = entry.getValue().stream().mapToDouble(t -> t.getDistanciaKm() != null ? t.getDistanciaKm() : 0).sum();
        double tss = entry.getValue().stream().mapToDouble(t -> t.getTss() != null ? t.getTss() : 0).sum();
        double minutos = entry.getValue().stream().mapToDouble(t -> t.getDuracaoMinutos() != null ? t.getDuracaoMinutos() : 0).sum();
        
        totalKm += km;
        totalTss += tss;
        totalMinutos += minutos;
        
        String dayName = entry.getKey().getDayOfWeek().toString();
        diasDaSemana.put(dayName, new ResumoDetalhesDto(entry.getValue().size(), km, tss));
        
        if (ultimoTreino == null || entry.getKey().isAfter(ultimoTreino)) {
            ultimoTreino = entry.getKey();
        }
    }
    
    int week = targetDate.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR);
    int year = targetDate.get(IsoFields.WEEK_BASED_YEAR);
    
    ResumoSemanalTreinoDto.Resumo resumo = new ResumoSemanalTreinoDto.Resumo(
        treinos.size(),
        totalKm,
        totalTss,
        totalMinutos,
        diasComTreino,
        7 - diasComTreino,
        ultimoTreino != null ? ultimoTreino.toString() : null,
        diasDaSemana
    );
    
    ResumoSemanalTreinoDto response = new ResumoSemanalTreinoDto(
        atletaId,
        atleta.getNome(),
        String.format("%04d-W%02d", year, week),
        startOfWeek.toString(),
        endOfWeek.toString(),
        resumo
    );
    
    return ResponseEntity.ok(response);
}
```

Note: Add necessary imports for `WeekFields`, `IsoFields`, `DayOfWeek`, `Collectors`, `HashMap`.

- [ ] **Step 4: Compile**

Run: `cd apps/menthoros-backend && ./mvnw clean compile -DskipTests`
Expected: BUILD SUCCESS

- [ ] **Step 5: Commit**

```bash
cd apps/menthoros-backend
git add src/main/java/com/menthoros/api/dtos/ResumoDetalhesDto.java
git add src/main/java/com/menthoros/api/dtos/ResumoSemanalTreinoDto.java
git add src/main/java/com/menthoros/api/controllers/TreinoRealizadoController.java
git commit -m "feat: add GET /api/v1/treinos/realizados/resumo-semana endpoint for weekly training summary"
```

---

## Task 8: Create Frontend Metricas Types (Frontend)

**Files:**
- Create: `apps/menthoros-front/src/types/Metricas.ts`

**Purpose:** TypeScript interfaces for metrics responses and widgets.

- [ ] **Step 1: Create Metricas.ts with all type definitions**

```typescript
export interface SemanaAdesao {
  semana: string;
  dataInicio: string;
  dataFim: string;
  treinosPlanejados: number;
  treinosRealizados: number;
  percentualRealizacao: number;
  diasComTreino: number;
}

export interface AdesaoSemanal {
  atletaId: string;
  nomeAtleta: string;
  semanaAtual: SemanaAdesao;
  ultimas4Semanas: SemanaAdesao[];
  mediaUltimas4Semanas: number;
}

export interface ResumoDetalhes {
  treinos: number;
  km: number;
  tss: number;
}

export interface ResumoSemanalTreino {
  atletaId: string;
  nomeAtleta: string;
  semana: string;
  dataInicio: string;
  dataFim: string;
  resumo: {
    totalTreinos: number;
    volumeTotalKm: number;
    tssTotalSemana: number;
    tempoTotalMinutos: number;
    diasComTreino: number;
    diasSemTreino: number;
    ultimoTreino: string | null;
    diasDaSemana: Record<string, ResumoDetalhes>;
  };
}

export interface StravaStatusGlobal {
  totalAtletas: number;
  atletasConectados: number;
  percentualConectado: number;
}

export interface ProvaProxima {
  id: string;
  atletaId: string;
  nomeAtleta: string;
  nomeProva: string;
  dataProva: string;
  tipoProva: string;
  distancia: string | null;
  distanciaKm: number | null;
  objetivo: string;
  statusProva: string;
  diasFaltando: number;
}

export interface ProvasProximasResponse {
  provas: ProvaProxima[];
  total: number;
  dataConsulta: string;
}
```

- [ ] **Step 2: Verify no TypeScript errors**

Run: `cd apps/menthoros-front && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-front
git add src/types/Metricas.ts
git commit -m "feat: add Metricas TypeScript type definitions"
```

---

## Task 9: Create MetricasService (Frontend)

**Files:**
- Create: `apps/menthoros-front/src/services/MetricasService.ts`

**Purpose:** Frontend service for metrics endpoints.

- [ ] **Step 1: Create MetricasService.ts**

```typescript
import { OpenAPI } from '../api/core/OpenAPI';
import type { AdesaoSemanal, ResumoSemanalTreino } from '../types/Metricas';

export class MetricasService {
  static async getAdesaoSemanal(atletaId: string): Promise<AdesaoSemanal> {
    const response = await fetch(
      `${OpenAPI.BASE}/api/v1/atletas/${atletaId}/metricas/adesao-semanal`,
      {
        headers: {
          'Authorization': `Bearer ${await OpenAPI.TOKEN()}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch adherence metrics: ${response.statusText}`);
    }

    return response.json();
  }

  static async getResumoSemanal(
    atletaId: string,
    semana?: string
  ): Promise<ResumoSemanalTreino> {
    const params = new URLSearchParams({ atletaId });
    if (semana) {
      params.append('semana', semana);
    }

    const response = await fetch(
      `${OpenAPI.BASE}/api/v1/treinos/realizados/resumo-semana?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${await OpenAPI.TOKEN()}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch weekly summary: ${response.statusText}`);
    }

    return response.json();
  }
}
```

- [ ] **Step 2: Type check**

Run: `cd apps/menthoros-front && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-front
git add src/services/MetricasService.ts
git commit -m "feat: add MetricasService for adherence and training summary endpoints"
```

---

## Task 10: Update StravaService.getStatusGlobal() (Frontend)

**Files:**
- Modify: `apps/menthoros-front/src/services/StravaService.ts`

**Purpose:** Add getStatusGlobal() method to fetch global Strava connection status.

- [ ] **Step 1: Add getStatusGlobal() method to StravaService**

```typescript
import type { StravaStatusGlobal } from '../types/Metricas';

export class StravaService {
  // ... existing methods ...

  static async getStatusGlobal(): Promise<StravaStatusGlobal> {
    const response = await fetch(
      `${OpenAPI.BASE}/api/v1/strava/status-global`,
      {
        headers: {
          'Authorization': `Bearer ${await OpenAPI.TOKEN()}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch Strava status: ${response.statusText}`);
    }

    return response.json();
  }
}
```

- [ ] **Step 2: Type check**

Run: `cd apps/menthoros-front && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-front
git add src/services/StravaService.ts
git commit -m "feat: add getStatusGlobal method to StravaService"
```

---

## Task 11: Update ProvaService.listarProximas() (Frontend)

**Files:**
- Modify: `apps/menthoros-front/src/services/ProvaService.ts`

**Purpose:** Add/update listarProximas() to fetch batch of upcoming races for all students.

- [ ] **Step 1: Add/update listarProximas() method**

```typescript
import type { ProvasProximasResponse } from '../types/Metricas';

export class ProvaService {
  // ... existing methods ...

  static async listarProximas(dias: number = 15): Promise<ProvasProximasResponse> {
    const params = new URLSearchParams({ dias: dias.toString() });

    const response = await fetch(
      `${OpenAPI.BASE}/api/v1/provas/proximas?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${await OpenAPI.TOKEN()}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch upcoming races: ${response.statusText}`);
    }

    return response.json();
  }
}
```

- [ ] **Step 2: Type check**

Run: `cd apps/menthoros-front && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-front
git add src/services/ProvaService.ts
git commit -m "feat: add listarProximas method to ProvaService for batch race queries"
```

---

## Task 12: Update StravaStatusWidget (Frontend)

**Files:**
- Modify: `apps/menthoros-front/src/pages/home/components/StravaStatusWidget.tsx`

**Purpose:** Replace hardcoded stravaConnected=0 with real data from getStatusGlobal().

- [ ] **Step 1: Update StravaStatusWidget to fetch real data**

In `apps/menthoros-front/src/pages/home/components/StravaStatusWidget.tsx`, replace:

```typescript
import { useEffect, useState } from 'react';
import { Box, CircularProgress, Paper, Typography } from '@mui/material';
import { StravaService } from '../../../services/StravaService';
import type { StravaStatusGlobal } from '../../../types/Metricas';
import { glassAzulSx, glassAzulSxHover, transitions } from '../../../theme/tokens';

export default function StravaStatusWidget({ atletas }: { atletas: Atleta[] }) {
  const [status, setStatus] = useState<StravaStatusGlobal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    StravaService.getStatusGlobal()
      .then(setStatus)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <CircularProgress />;
  }

  if (!status) {
    return null;
  }

  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 1,
        ...glassAzulSx,
        '&:hover': glassAzulSxHover,
        transition: transitions.default,
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          color: '#ffffff',
          mb: 2,
          fontSize: '1rem',
        }}
      >
        Status Strava
      </Typography>

      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1.5 }}>
        <Box sx={{ textAlign: 'center' }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              color: '#b1e92d',
              mb: 0.5,
            }}
          >
            {status.totalAtletas}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.75rem',
            }}
          >
            Total Atletas
          </Typography>
        </Box>

        <Box sx={{ textAlign: 'center' }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              color: '#b1e92d',
              mb: 0.5,
            }}
          >
            {status.atletasConectados}
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.75rem',
            }}
          >
            Conectados
          </Typography>
        </Box>

        <Box sx={{ textAlign: 'center' }}>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              color: '#b1e92d',
              mb: 0.5,
            }}
          >
            {status.percentualConectado.toFixed(1)}%
          </Typography>
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '0.75rem',
            }}
          >
            Taxa
          </Typography>
        </Box>
      </Box>
    </Paper>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd apps/menthoros-front && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-front
git add src/pages/home/components/StravaStatusWidget.tsx
git commit -m "feat: update StravaStatusWidget to fetch real Strava connection data"
```

---

## Task 13: Create TaxaAdesaoWidget (Frontend)

**Files:**
- Create: `apps/menthoros-front/src/pages/home/components/TaxaAdesaoWidget.tsx`

**Purpose:** Widget displaying weekly adherence rate with progress bars.

- [ ] **Step 1: Create TaxaAdesaoWidget component**

```typescript
import { useEffect, useState } from 'react';
import { Box, CircularProgress, LinearProgress, Paper, Stack, Typography } from '@mui/material';
import { MetricasService } from '../../../services/MetricasService';
import type { AdesaoSemanal } from '../../../types/Metricas';
import { glassAzulSx, glassAzulSxHover, transitions } from '../../../theme/tokens';

interface TaxaAdesaoWidgetProps {
  atletaId: string;
  atletaNome: string;
}

export default function TaxaAdesaoWidget({ atletaId, atletaNome }: TaxaAdesaoWidgetProps) {
  const [adesao, setAdesao] = useState<AdesaoSemanal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    MetricasService.getAdesaoSemanal(atletaId)
      .then(setAdesao)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [atletaId]);

  if (loading) {
    return <CircularProgress />;
  }

  if (!adesao) {
    return null;
  }

  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 1,
        ...glassAzulSx,
        '&:hover': glassAzulSxHover,
        transition: transitions.default,
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          color: '#ffffff',
          mb: 2,
          fontSize: '1rem',
        }}
      >
        Taxa de Adesão - {atletaNome}
      </Typography>

      <Stack spacing={2}>
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              Semana Atual
            </Typography>
            <Typography variant="caption" sx={{ color: '#b1e92d', fontWeight: 700 }}>
              {adesao.semanaAtual.percentualRealizacao.toFixed(1)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={adesao.semanaAtual.percentualRealizacao}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: 'rgba(177, 233, 45, 0.2)',
              '& .MuiLinearProgress-bar': {
                backgroundColor: '#b1e92d',
              },
            }}
          />
          <Typography
            variant="caption"
            sx={{
              color: 'rgba(255, 255, 255, 0.5)',
              fontSize: '0.7rem',
              mt: 0.5,
            }}
          >
            {adesao.semanaAtual.treinosRealizados} de {adesao.semanaAtual.treinosPlanejados} treinos
          </Typography>
        </Box>

        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
            <Typography variant="caption" sx={{ color: 'rgba(255, 255, 255, 0.7)' }}>
              Média Últimas 4 Semanas
            </Typography>
            <Typography variant="caption" sx={{ color: '#b1e92d', fontWeight: 700 }}>
              {adesao.mediaUltimas4Semanas.toFixed(1)}%
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={Math.min(adesao.mediaUltimas4Semanas, 100)}
            sx={{
              height: 8,
              borderRadius: 4,
              backgroundColor: 'rgba(177, 233, 45, 0.2)',
              '& .MuiLinearProgress-bar': {
                backgroundColor: '#b1e92d',
              },
            }}
          />
        </Box>

        {adesao.ultimas4Semanas.length > 0 && (
          <Stack spacing={1}>
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.75rem',
                mt: 1,
              }}
            >
              Últimas 4 Semanas
            </Typography>
            {adesao.ultimas4Semanas.map((semana) => (
              <Box key={semana.semana} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'rgba(255, 255, 255, 0.6)',
                    minWidth: 50,
                    fontSize: '0.7rem',
                  }}
                >
                  {semana.semana}
                </Typography>
                <LinearProgress
                  variant="determinate"
                  value={semana.percentualRealizacao}
                  sx={{
                    flex: 1,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: 'rgba(177, 233, 45, 0.2)',
                    '& .MuiLinearProgress-bar': {
                      backgroundColor: '#b1e92d',
                    },
                  }}
                />
                <Typography
                  variant="caption"
                  sx={{
                    color: '#b1e92d',
                    minWidth: 40,
                    textAlign: 'right',
                    fontSize: '0.7rem',
                    fontWeight: 700,
                  }}
                >
                  {semana.percentualRealizacao.toFixed(0)}%
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd apps/menthoros-front && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-front
git add src/pages/home/components/TaxaAdesaoWidget.tsx
git commit -m "feat: add TaxaAdesaoWidget for adherence rate display with progress bars"
```

---

## Task 14: Create ResumoSemanalWidget (Frontend)

**Files:**
- Create: `apps/menthoros-front/src/pages/home/components/ResumoSemanalWidget.tsx`

**Purpose:** Widget displaying training summary: total trainings, volume, TSS, duration, days breakdown.

- [ ] **Step 1: Create ResumoSemanalWidget component**

```typescript
import { useEffect, useState } from 'react';
import { Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { MetricasService } from '../../../services/MetricasService';
import type { ResumoSemanalTreino } from '../../../types/Metricas';
import { glassAzulSx, glassAzulSxHover, transitions } from '../../../theme/tokens';

interface ResumoSemanalWidgetProps {
  atletaId: string;
  atletaNome: string;
}

export default function ResumoSemanalWidget({ atletaId, atletaNome }: ResumoSemanalWidgetProps) {
  const [resumo, setResumo] = useState<ResumoSemanalTreino | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    MetricasService.getResumoSemanal(atletaId)
      .then(setResumo)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [atletaId]);

  if (loading) {
    return <CircularProgress />;
  }

  if (!resumo) {
    return null;
  }

  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 1,
        ...glassAzulSx,
        '&:hover': glassAzulSxHover,
        transition: transitions.default,
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          color: '#ffffff',
          mb: 2,
          fontSize: '1rem',
        }}
      >
        Resumo Semanal - {atletaNome}
      </Typography>

      <Stack spacing={2}>
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1.5 }}>
          <Box sx={{ textAlign: 'center' }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                color: '#b1e92d',
                mb: 0.5,
              }}
            >
              {resumo.resumo.totalTreinos}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.75rem',
              }}
            >
              Treinos
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                color: '#b1e92d',
                mb: 0.5,
              }}
            >
              {resumo.resumo.volumeTotalKm.toFixed(1)}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.75rem',
              }}
            >
              KM
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                color: '#b1e92d',
                mb: 0.5,
              }}
            >
              {resumo.resumo.tssTotalSemana.toFixed(0)}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.75rem',
              }}
            >
              TSS
            </Typography>
          </Box>

          <Box sx={{ textAlign: 'center' }}>
            <Typography
              variant="h5"
              sx={{
                fontWeight: 700,
                color: '#b1e92d',
                mb: 0.5,
              }}
            >
              {Math.round(resumo.resumo.tempoTotalMinutos / 60)}h
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.75rem',
              }}
            >
              Horas
            </Typography>
          </Box>
        </Box>

        {resumo.resumo.ultimoTreino && (
          <Box sx={{ pt: 1, borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '0.75rem',
              }}
            >
              Último treino: {resumo.resumo.ultimoTreino}
            </Typography>
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd apps/menthoros-front && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-front
git add src/pages/home/components/ResumoSemanalWidget.tsx
git commit -m "feat: add ResumoSemanalWidget for weekly training summary display"
```

---

## Task 15: Update ProvasProximasWidget to use batch endpoint (Frontend)

**Files:**
- Modify: `apps/menthoros-front/src/pages/home/components/ProvasProximasWidget.tsx`

**Purpose:** Replace N+1 pattern with batch query using listarProximas().

- [ ] **Step 1: Update ProvasProximasWidget to fetch all races at once**

Replace the component with:

```typescript
import { useEffect, useState } from 'react';
import { Box, CircularProgress, Paper, Stack, Typography } from '@mui/material';
import { ProvaService } from '../../../services/ProvaService';
import type { ProvaProxima } from '../../../types/Metricas';
import { glassAzulSx, glassAzulSxHover, transitions } from '../../../theme/tokens';

interface ProvasProximasWidgetProps {
  atletas?: any[];
}

export default function ProvasProximasWidget({ atletas }: ProvasProximasWidgetProps) {
  const [provas, setProvas] = useState<ProvaProxima[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    ProvaService.listarProximas(15)
      .then((response) => setProvas(response.provas))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <CircularProgress />;
  }

  if (provas.length === 0) {
    return (
      <Paper
        sx={{
          p: 2.5,
          borderRadius: 1,
          ...glassAzulSx,
        }}
      >
        <Typography
          variant="h6"
          sx={{
            fontWeight: 700,
            color: '#ffffff',
            mb: 2,
            fontSize: '1rem',
          }}
        >
          Próximas Provas
        </Typography>
        <Typography
          variant="body2"
          sx={{
            color: 'rgba(255, 255, 255, 0.6)',
          }}
        >
          Nenhuma prova nos próximos 15 dias
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      sx={{
        p: 2.5,
        borderRadius: 1,
        ...glassAzulSx,
        '&:hover': glassAzulSxHover,
        transition: transitions.default,
      }}
    >
      <Typography
        variant="h6"
        sx={{
          fontWeight: 700,
          color: '#ffffff',
          mb: 2,
          fontSize: '1rem',
        }}
      >
        Próximas Provas ({provas.length})
      </Typography>

      <Stack spacing={1.5}>
        {provas.map((prova) => (
          <Box
            key={prova.id}
            sx={{
              p: 1.5,
              borderRadius: 1,
              backgroundColor: 'rgba(177, 233, 45, 0.05)',
              borderLeft: '3px solid #b1e92d',
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Box sx={{ flex: 1 }}>
                <Typography
                  variant="subtitle2"
                  sx={{
                    fontWeight: 700,
                    color: '#ffffff',
                    mb: 0.5,
                  }}
                >
                  {prova.nomeProva}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    display: 'block',
                    mb: 0.5,
                  }}
                >
                  {prova.nomeAtleta}
                </Typography>
                {prova.distanciaKm && (
                  <Typography
                    variant="caption"
                    sx={{
                      color: 'rgba(255, 255, 255, 0.6)',
                      fontSize: '0.7rem',
                    }}
                  >
                    {prova.distanciaKm} km
                  </Typography>
                )}
              </Box>
              <Box sx={{ textAlign: 'right' }}>
                <Typography
                  variant="h6"
                  sx={{
                    fontWeight: 700,
                    color: '#b1e92d',
                    mb: 0.5,
                  }}
                >
                  {prova.diasFaltando}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{
                    color: 'rgba(255, 255, 255, 0.7)',
                    fontSize: '0.7rem',
                  }}
                >
                  dias
                </Typography>
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd apps/menthoros-front && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd apps/menthoros-front
git add src/pages/home/components/ProvasProximasWidget.tsx
git commit -m "feat: update ProvasProximasWidget to use batch endpoint, eliminate N+1 queries"
```

---

## Task 16: Integrate new widgets into HomePage (Frontend)

**Files:**
- Modify: `apps/menthoros-front/src/pages/home/HomePage.tsx`

**Purpose:** Import and integrate new TaxaAdesaoWidget and ResumoSemanalWidget into the dashboard layout.

- [ ] **Step 1: Add imports for new widgets**

At the top of HomePage.tsx, add:

```typescript
import TaxaAdesaoWidget from './components/TaxaAdesaoWidget';
import ResumoSemanalWidget from './components/ResumoSemanalWidget';
```

- [ ] **Step 2: Add widgets to the layout**

In the JSX (after ProvasProximasWidget or in an appropriate location), add:

```typescript
{/* Adherence and Training Summary */}
{atletas.length > 0 && atletas.slice(0, 1).map((atleta) => (
  <Box key={`metrics-${atleta.id}`} sx={{ px: 3 }}>
    <Stack spacing={2}>
      <TaxaAdesaoWidget atletaId={atleta.id} atletaNome={atleta.nome} />
      <ResumoSemanalWidget atletaId={atleta.id} atletaNome={atleta.nome} />
    </Stack>
  </Box>
))}
```

Note: This shows metrics for the first athlete. Adjust based on your UX requirements (all athletes, specific athlete, etc.).

- [ ] **Step 3: Type check**

Run: `cd apps/menthoros-front && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
cd apps/menthoros-front
git add src/pages/home/HomePage.tsx
git commit -m "feat: integrate TaxaAdesaoWidget and ResumoSemanalWidget into HomePage"
```

---

## Task 17: Build Backend

**Files:**
- No file changes; validation step

**Purpose:** Ensure all backend changes compile and run successfully.

- [ ] **Step 1: Full backend build with tests**

Run from root:
```bash
cd apps/menthoros-backend && ./mvnw clean compile
```

Or with tests (if you want to validate):
```bash
cd apps/menthoros-backend && ./mvnw clean test
```

Expected: BUILD SUCCESS (or tests pass)

- [ ] **Step 2: If build fails, fix errors**

Fix any compilation errors. Common issues:
- Missing imports
- Type mismatches in DTOs
- Repository method signatures

Re-run: `./mvnw clean compile`

- [ ] **Step 3: Commit if any fixes were needed**

```bash
cd apps/menthoros-backend
git add .
git commit -m "fix: backend compilation issues from endpoint implementation"
```

---

## Task 18: Build Frontend

**Files:**
- No file changes; validation step

**Purpose:** Ensure all frontend changes compile and build successfully.

- [ ] **Step 1: Frontend full build**

Run:
```bash
cd apps/menthoros-front && npm run build
```

Expected: Build completes successfully, no errors

- [ ] **Step 2: If build fails, fix errors**

Fix any TypeScript or build errors. Common issues:
- Missing imports
- Type mismatches in components
- Service method signatures

Re-run: `npm run build`

- [ ] **Step 3: Commit if any fixes were needed**

```bash
cd apps/menthoros-front
git add .
git commit -m "fix: frontend build issues from endpoint implementation"
```

---

## Task 19: Final Integration Test and Documentation

**Files:**
- No file changes; integration validation step

**Purpose:** Verify all endpoints work end-to-end and document changes.

- [ ] **Step 1: Verify backend endpoints with curl or Postman**

Test each endpoint:

```bash
# 1. Strava Status Global
curl -X GET http://localhost:8080/api/v1/strava/status-global \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Adherence Metrics
curl -X GET http://localhost:8080/api/v1/atletas/{atletaId}/metricas/adesao-semanal \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Upcoming Provas
curl -X GET http://localhost:8080/api/v1/provas/proximas \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Weekly Training Summary
curl -X GET "http://localhost:8080/api/v1/treinos/realizados/resumo-semana?atletaId={atletaId}" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Expected: All endpoints return 200 with correct JSON response structure.

- [ ] **Step 2: Test frontend widgets in browser**

Start dev server:
```bash
cd apps/menthoros-front && npm run dev
```

Verify:
- StravaStatusWidget displays real connection numbers
- ProvasProximasWidget shows upcoming races without slowness (batch query working)
- TaxaAdesaoWidget displays adherence rates with progress bars
- ResumoSemanalWidget shows training summary (if integrated)
- No console errors

- [ ] **Step 3: Document changes in codebase (optional)**

If your project uses a CHANGELOG or documentation:
- Update README or CHANGELOG with new endpoints
- Add API documentation comment blocks to controllers

- [ ] **Step 4: Final commit (if documentation added)**

```bash
git add .
git commit -m "docs: update documentation for 4 new dashboard endpoints"
```

---

## Summary

This plan implements 4 new REST endpoints to enhance the Menthoros dashboard:

1. **GET /api/v1/strava/status-global** — Global Strava connection metrics (replaces hardcoded 0)
2. **GET /api/v1/atletas/{atletaId}/metricas/adesao-semanal** — Weekly adherence rates (current + last 4 weeks)
3. **GET /api/v1/provas/proximas** — Batch query for all upcoming races in next 15 days (eliminates N+1)
4. **GET /api/v1/treinos/realizados/resumo-semana** — Weekly training summary (volume, TSS, duration, days)

**Backend:** 7 tasks covering DTOs, services, controllers, repository methods
**Frontend:** 8 tasks covering types, services, widget components, and integration
**Validation:** 2 tasks for build verification and endpoint testing

Total tasks: 19. Follow in order for clean incremental progress.
