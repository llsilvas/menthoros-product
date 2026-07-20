# Design: Strava Sync Manual (90 Dias)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                   FRONTEND (React)                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  AtletasList.tsx                                            │
│  ├─ Mostra status Strava para cada atleta                  │
│  │                                                         │
│  │  [Strava: Desconectado]                                 │
│  │  └─ Button "Conectar"                                  │
│  │                                                         │
│  │  [Strava: Conectado ✅]                                 │
│  │  ├─ Button "Sincronizar 90 Dias" ← NEW                │
│  │  └─ Button "Gerar Plano" (disabled until sync)         │
│  │                                                         │
│  └─ SyncStravaButton.tsx                                  │
│     ├─ onClick: POST /api/strava/sync/{atletaId}          │
│     ├─ Polling: GET /api/strava/sync-status/{atletaId}    │
│     │  (every 2s while syncing=true)                       │
│     ├─ Shows: "Sincronizando... 23/90 atividades"         │
│     └─ Shows error if failed                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
            ↓ HTTP POST                 ↓ HTTP GET (polling)
┌─────────────────────────────────────────────────────────────┐
│                     BACKEND (Spring)                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  POST /api/strava/sync/{atletaId}                           │
│  ├─ stravaActivityService.syncActivities()                 │
│  │  ├─ Fetch /athlete/activities (30/página)              │
│  │  ├─ Loop até activities.isEmpty()                      │
│  │  ├─ Para cada: mapToTreinoRealizado()                  │
│  │  ├─ fetchActivityLaps() → EtapaRealizada               │
│  │  └─ Salva em DB                                        │
│  │                                                         │
│  ├─ Handle rate limit → throw StravaRateLimitException    │
│  └─ Update IntegracaoExterna.ultimaSincronizacao          │
│                                                             │
│  GET /api/strava/sync-status/{atletaId}                    │
│  ├─ Read from IntegracaoExterna:                           │
│  │  ├─ syncing: boolean (heurística)                      │
│  │  ├─ imported: int (count)                              │
│  │  ├─ lastError: string (se falhou)                      │
│  │  └─ connected: boolean                                 │
│  └─ Return JSON response                                  │
│                                                             │
│  [Long-running sync]                                       │
│  └─ Happens in request thread (tolerável < 30s)           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
                    [Database]
              tb_integracao_externa
              tb_treino_realizado
              tb_etapa_realizada
```

---

## Database Schema Changes

### Table: `tb_integracao_externa`

**New Columns (if not already exist):**

```sql
-- Timestamp quando última sync completou
ALTER TABLE tb_integracao_externa 
  ADD COLUMN ultima_sincronizacao TIMESTAMPTZ;  -- Pode já existir

-- Quantas atividades foram importadas na última sync
ALTER TABLE tb_integracao_externa 
  ADD COLUMN sync_activity_count INT DEFAULT 0;

-- Mensagem de erro se última sync falhou
ALTER TABLE tb_integracao_externa 
  ADD COLUMN last_sync_error VARCHAR(500);
```

**Existing Column Usage:**
- `ativo`: Boolean (false se integração falhou, true se ativa)
- `ultimaSincronizacao`: Usado como heurística para saber se está sincronizando

**Reasoning:**
- `ultima_sincronizacao`: Indica "última sync bem-sucedida"
- `sync_activity_count`: Progress bar para usuário
- `last_sync_error`: Debug + mostrar erro na UI

---

## Code Structure

### 1. Backend: New Endpoint Method

**File:** `com.menthoros.controller.StravaActivityController`

```java
@GetMapping("/sync-status/{atletaId}")
@Operation(summary = "Status da última/atual sincronização")
public ResponseEntity<Map<String, Object>> getSyncStatus(
        @PathVariable UUID atletaId) {
    
    UUID tenantId = TenantContext.getRequiredTenantId();
    
    IntegracaoExterna integracao = integracaoExternaRepository
            .findActiveByAtletaIdAndPlataformaAndTenantId(atletaId, STRAVA, tenantId)
            .orElseThrow(() -> new ResourceNotFoundException("Integração não encontrada"));

    // Heurística: se foi atualizado recentemente, está syncing
    // (sync leva ~20-30s, se ultimaSincronizacao < 1 min, ainda pode estar rodando)
    boolean syncing = integracao.getUltimaSincronizacao() != null &&
            Instant.now().minus(Duration.ofMinutes(1)).isBefore(integracao.getUltimaSincronizacao()) &&
            integracao.isAtivo() == false; // Se falhou, não está mais syncing

    return ResponseEntity.ok(Map.of(
            "connected", integracao.isAtivo(),
            "syncing", syncing,
            "imported", integracao.getSyncActivityCount() != null ? 
                    integracao.getSyncActivityCount() : 0,
            "lastError", integracao.getLastSyncError(),
            "lastSync", integracao.getUltimaSincronizacao(),
            "externalAthleteId", integracao.getExternalAthleteId()
    ));
}
```

**Response Example:**
```json
{
  "connected": true,
  "syncing": true,
  "imported": 45,
  "lastError": null,
  "lastSync": "2026-04-28T20:10:00Z",
  "externalAthleteId": "123456789"
}
```

### 2. Modificação: POST /api/strava/sync

**File:** `com.menthoros.controller.StravaActivityController` (existing method)

```java
@PostMapping("/sync/{atletaId}")
@Operation(summary = "Dispara sincronização manual de atividades")
public ResponseEntity<Map<String, Object>> sync(@PathVariable UUID atletaId) {
    UUID tenantId = TenantContext.getRequiredTenantId();
    
    // Validação: só permite 1 sync simultânea
    IntegracaoExterna integracao = integracaoExternaRepository
            .findActiveByAtletaIdAndPlataformaAndTenantId(atletaId, STRAVA, tenantId)
            .orElseThrow(() -> new IllegalStateException("Atleta sem integração Strava ativa"));
    
    // Se última sync foi há < 30 seg, nega (em progress)
    if (integracao.getUltimaSincronizacao() != null &&
        Instant.now().minus(Duration.ofSeconds(30)).isBefore(integracao.getUltimaSincronizacao())) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of(
            "error", "Sincronização já em progresso. Aguarde conclusão."
        ));
    }
    
    try {
        int imported = stravaActivityService.syncActivities(atletaId);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "imported", imported,
                "message", imported + " atividades importadas com sucesso"
        ));
    } catch (StravaRateLimitException e) {
        // Rate limit: não marca como inativo, será retentado
        return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(Map.of(
            "error", "Limite de requisições Strava atingido. Tente novamente em alguns minutos."
        ));
    } catch (Exception e) {
        // Erro: marca integração como inativa
        integracao.setAtivo(false);
        integracao.setLastSyncError(e.getMessage());
        integracaoExternaRepository.save(integracao);
        
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR).body(Map.of(
            "error", "Falha ao sincronizar: " + e.getMessage()
        ));
    }
}
```

---

## Frontend Components

### 1. StravaService (API Client)

**Location:** `src/api/services/StravaService.ts`

```typescript
export class StravaService {
  static async triggerSync(atletaId: string): Promise<SyncResponse> {
    return __request(OpenAPI, {
      method: 'POST',
      url: '/strava/sync/{atletaId}',
      path: { 'atletaId': atletaId },
      errors: {
        409: 'Sincronização já em progresso',
        429: 'Limite de requisições Strava atingido',
        500: 'Erro ao sincronizar',
      },
    });
  }

  static async getSyncStatus(atletaId: string): Promise<SyncStatus> {
    return __request(OpenAPI, {
      method: 'GET',
      url: '/strava/sync-status/{atletaId}',
      path: { 'atletaId': atletaId },
    });
  }
}

type SyncResponse = { success: boolean; imported: number; message: string };
type SyncStatus = { 
  connected: boolean; 
  syncing: boolean; 
  imported: number; 
  lastError?: string;
  lastSync: string;
};
```

### 2. useStravaSync Hook

**Location:** `src/hooks/features/useStravaSync.ts`

```typescript
export function useStravaSync(atletaId: string) {
  const [state, setState] = useState<{
    syncing: boolean;
    imported: number;
    error: string | null;
    lastSync: string | null;
  }>({
    syncing: false,
    imported: 0,
    error: null,
    lastSync: null,
  });

  const [polling, setPolling] = useState<NodeJS.Timeout | null>(null);

  // Disparar sync
  const triggerSync = async () => {
    try {
      await StravaService.triggerSync(atletaId);
      setState(prev => ({ ...prev, syncing: true, error: null }));
      startPolling();
    } catch (err) {
      setState(prev => ({ 
        ...prev, 
        error: err.message || 'Erro ao iniciar sincronização' 
      }));
    }
  };

  // Polling
  const startPolling = () => {
    const timer = setInterval(async () => {
      const status = await StravaService.getSyncStatus(atletaId);
      setState(prev => ({
        ...prev,
        syncing: status.syncing,
        imported: status.imported,
        error: status.lastError || null,
        lastSync: status.lastSync,
      }));

      if (!status.syncing) {
        clearInterval(timer);
      }
    }, 2000); // Poll every 2 seconds

    setPolling(timer);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (polling) clearInterval(polling);
    };
  }, [polling]);

  return {
    ...state,
    triggerSync,
  };
}
```

### 3. SyncStravaButton Component

**Location:** `src/components/features/strava/SyncStravaButton.tsx`

```typescript
interface Props {
  atletaId: string;
  connected: boolean;
  onSyncComplete?: () => void;
}

export default function SyncStravaButton({ atletaId, connected, onSyncComplete }: Props) {
  const { syncing, imported, error, triggerSync } = useStravaSync(atletaId);

  if (!connected) {
    return null; // Só mostra se conectado
  }

  const handleSync = async () => {
    await triggerSync();
  };

  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      {syncing && <CircularProgress size={20} />}
      
      <Button
        variant="contained"
        onClick={handleSync}
        disabled={syncing}
      >
        {syncing ? `Sincronizando (${imported}/90)...` : 'Sincronizar 90 Dias'}
      </Button>

      {error && (
        <Alert severity="error" sx={{ flex: 1 }}>
          {error}
        </Alert>
      )}

      {!syncing && imported > 0 && (
        <Typography variant="body2" color="success.main">
          ✅ {imported} atividades importadas
        </Typography>
      )}
    </Box>
  );
}
```

### 4. Integration em AtletasList

**File:** `src/pages/atletas/AtletasList.tsx` (modification)

```typescript
// Adicionar coluna no table:
<TableCell>
  {atleta.stravaConnected ? (
    <>
      <Chip label="✅ Conectado" color="success" size="small" />
      <SyncStravaButton 
        atletaId={atleta.id} 
        connected={true}
        onSyncComplete={() => refetch()}
      />
    </>
  ) : (
    <Button size="small" onClick={() => initiateStravaAuth(atleta.id)}>
      Conectar Strava
    </Button>
  )}
</TableCell>
```

---

## Error Scenarios

### Scenario 1: Rate Limit

```
Professor clica "Sincronizar"
  ↓
POST /api/strava/sync retorna 429 (TOO_MANY_REQUESTS)
  ↓
Frontend mostra: "Limite de requisições atingido. Tente em alguns minutos."
  ↓
Professor espera 15 minutos e clica novamente
```

### Scenario 2: Network Error

```
POST /api/strava/sync throws IOException
  ↓
Backend catches → marca ativo=false, set lastSyncError
  ↓
Frontend polling vê syncing=false, lastError="Connection timeout"
  ↓
Mostra alerta: "Falha ao sincronizar. Reconecte ao Strava."
```

### Scenario 3: Duplicate Click

```
Professor clica "Sincronizar" 2x rapidamente
  ↓
2º clique vê ultimaSincronizacao < 30s → retorna 409 CONFLICT
  ↓
Frontend mostra: "Sincronização já em progresso."
```

---

## Testing Strategy

### Unit Tests

```java
// StravaActivityControllerTest
- getSyncStatus() returns correct format
- sync() rejects if ultima_sincronizacao < 30s (duplicate protection)
- sync() handles rate limit exception
- sync() handles network error
```

### Integration Tests

```java
// StravaActivityControllerIT
- POST /sync/{atletaId} creates TreinoRealizado entries
- GET /sync-status returns syncing=true while running
- GET /sync-status returns syncing=false after completion
- Multi-tenant: Athlete A sync doesn't touch B
- Rate limit during sync shows in lastError
```

### Frontend Tests

```typescript
// SyncStravaButton.test.tsx
- Button visible when connected=true
- Button disabled while syncing=true
- Shows progress "23/90"
- Shows error message on failure
- Polling stops when syncing=false
```

---

## Deployment Checklist

- [ ] New columns in `tb_integracao_externa` migrated (Flyway)
- [ ] getSyncStatus() endpoint implemented
- [ ] sync() endpoint enhanced with duplicate prevention
- [ ] StravaService.ts created
- [ ] useStravaSync hook created
- [ ] SyncStravaButton component created
- [ ] AtletasList integration done
- [ ] Tests written and passing
- [ ] Verify multi-tenant isolation
- [ ] Load test: concurrent syncs

---

**Status:** Ready for Task Planning
