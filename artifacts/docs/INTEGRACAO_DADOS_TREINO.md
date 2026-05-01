# Integração de Dados de Treino - Prioridade Estratégica

**Documento de Análise Crítica de Features**
**Data:** 28 de fevereiro de 2026
**Status:** 🔴 CRÍTICO - Bloqueia MVP viável

---

## 🎯 Problema Identificado

```
ATUAL (Sem integração):
├─ Atleta treina (Strava, Garmin, relógio)
├─ Volta para o app
├─ MANUAL: Preencher dados do treino (5-10 min)
│  ├─ Nome do treino
│  ├─ Distância
│  ├─ Tempo
│  ├─ Avg HR, Max HR
│  ├─ Elevation
│  ├─ Sensação percebida
│  └─ Notas
├─ Clica em "Salvar"
└─ Resultado: 90% dos usuários abandona após 1-2 vezes
   "Muito trabalho para usar o app"

DESEJADO (Com integração automática):
├─ Atleta treina e sai (Strava, Garmin, etc)
├─ Menthoros sincroniza automaticamente (background)
├─ App mostra: "Treino sincronizado: 10km em 50 min ✓"
├─ Coach vê automaticamente no dashboard
└─ Resultado: ✅ Aderência >80% (sem abandonos)
```

**Isso é diferencial competitivo contra:**
- TrainingPeaks (paga, interface antiga)
- Garmin Coach (genérico, sem IA)
- Strava (social, sem coaching)

---

## 💥 Impacto no MVP

```
SEM integração de treinos:
├─ Users criam conta
├─ Recebem plano de treino (IA gerada) ✅
├─ Tentam logar treino manualmente
├─ Desistem depois de 1-2x
├─ Churn: >80%
└─ MVP FALHA

COM integração de treinos:
├─ Users criam conta
├─ Recebem plano de treino (IA) ✅
├─ Treinos sincronizam automaticamente
├─ Dashboard atualiza em tempo real
├─ Coach vê progress automático
├─ Churn: <10%
└─ MVP VIÁVEL ✅
```

---

## 📊 Timeline Crítico

```
OPÇÃO 1: Adicionar integração em Sprint 2 (RECOMENDADO)
├─ Sprint 1 (28 FEB - 14 MAR): Auth + Multi-tenancy
├─ Sprint 2 (14 MAR - 28 MAR): Performance + Integrações
│  └─ Strava OAuth
│  └─ Garmin API
│  └─ Apple Health
├─ 28 MAR: Beta com integração pronta
└─ Aderência: ✅ ALTA (>80%)

OPÇÃO 2: Deixar para Sprint 3+ (ARRISCADO)
├─ Sprint 1-2: Auth, performance (sem integrações)
├─ Sprint 3: Tentar adicionar integrações
├─ Problema: Migrar dados retroativos é complexo
├─ Beta users: Recarregar tudo manualmente
└─ Aderência: ❌ BAIXA (<30%)
```

**Recomendação:** Sprint 2 (não deixar para depois)

---

## 🔗 Integrações Necessárias

### 1. Strava (Prioridade 1 - 70% dos users)

```
Fluxo:
1. User clica "Conectar Strava"
2. OAuth flow (user autoriza)
3. Webhook: Strava → Menthoros (novo treino)
4. Parse activity: {distância, tempo, HR, etc}
5. Auto-criar treino_realizado no Menthoros
6. Dashboard atualiza em tempo real

API:
  POST https://www.strava.com/api/v3/oauth/authorize
  GET https://www.strava.com/api/v3/athlete/activities
  Webhook: https://menthoros.com/webhooks/strava

Dados coletados:
  ✅ Distância (km)
  ✅ Tempo (minutos)
  ✅ HR média/máxima
  ✅ Elevation gain
  ✅ Temperatura
  ✅ Tipo de atividade (run, bike, etc)
  ✅ Fotos/rota

Esforço: 12-16h (2 dias)
```

### 2. Garmin (Prioridade 1 - 50% dos users)

```
Fluxo:
1. User clica "Conectar Garmin"
2. OAuth com Garmin Connect
3. Webhook ou polling: busca treinos
4. Parse TCX/FIT file: dados detalhados
5. Auto-criar treino_realizado
6. Dashboard atualiza

API:
  https://apis.garmin.com/wellness-api
  Health API + Connect API

Dados coletados:
  ✅ Distância, tempo, HR
  ✅ Cadência
  ✅ Ritmo/pace
  ✅ Power (se ciclismo)
  ✅ Terreno
  ✅ Training effect

Esforço: 16-20h (2-3 dias, mais complexo que Strava)
```

### 3. Apple Health (Prioridade 2 - 30% dos users)

```
Fluxo:
1. User permite acesso ao Apple Health
2. Backend: HealthKit framework (iOS only ou via API)
3. Sincronizar workouts
4. Parse dados

Dados coletados:
  ✅ Tipo de workout
  ✅ Duração, calorias
  ✅ HR (se tiver relógio)
  ✅ Steps, elevation

Esforço: 12-16h (precisa iOS app ou API)
```

### 4. Polar (Prioridade 2 - 20% dos users)

```
Similar a Garmin, mais simples
Esforço: 8-12h
```

---

## 🏗️ Arquitetura de Integração

```
┌──────────────────────────────────────────────────┐
│  EXTERNAL PLATFORMS (Strava, Garmin, etc)       │
│  └─ User treina e sincroniza                    │
└────────────────┬─────────────────────────────────┘
                 │
                 ├─ Webhook (push)
                 │  └─ POST /api/v1/webhooks/strava
                 │
                 └─ Polling (pull)
                    └─ Scheduled job: fetch every 30min

┌──────────────────────────────────────────────────┐
│  WEBHOOK HANDLER (em Menthoros)                  │
│  1. Validar signature (segurança)               │
│  2. Parsear dados de treino                     │
│  3. Criar TreinoRealizado                       │
│  4. Calcular métricas (TSS, etc)                │
│  5. Notificar coach                             │
└────────────────┬─────────────────────────────────┘
                 │
┌────────────────▼─────────────────────────────────┐
│  DATABASE                                        │
│  tb_treino_realizado (preenchido auto)          │
│  tb_integracao_config (token Strava, etc)      │
│  tb_sync_log (log de sincronizações)            │
└─────────────────────────────────────────────────┘

┌────────────────┬─────────────────────────────────┐
│  DASHBOARD                                       │
│  Real-time update: novos treinos aparecem       │
│  Coach vê progresso do atleta                   │
└──────────────────────────────────────────────────┘
```

---

## 💾 Database Changes

```sql
-- Nova tabela para configuração de integrações
CREATE TABLE tb_integracao_config (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    usuario_id BIGINT NOT NULL,
    tipo VARCHAR(50) NOT NULL,          -- "STRAVA", "GARMIN", "APPLE_HEALTH"
    access_token TEXT NOT NULL ENCRYPTED,
    refresh_token TEXT ENCRYPTED,
    token_expiry TIMESTAMP,
    status VARCHAR(50) NOT NULL,        -- "CONNECTED", "DISCONNECTED", "REVOKED"
    last_sync TIMESTAMP,
    config JSONB,                       -- Extra config por tipo
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    FOREIGN KEY (tenant_id) REFERENCES tb_tenant(id),
    FOREIGN KEY (usuario_id) REFERENCES tb_usuario(id),
    UNIQUE(tenant_id, usuario_id, tipo)
);

-- Tabela de log de sincronização
CREATE TABLE tb_sync_log (
    id BIGSERIAL PRIMARY KEY,
    tenant_id BIGINT NOT NULL,
    tipo_integracao VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL,        -- "SUCCESS", "FAILED", "PARTIAL"
    mensagem TEXT,
    dados_sincronizados INT,            -- Número de treinos
    started_at TIMESTAMP NOT NULL,
    finished_at TIMESTAMP NOT NULL,

    FOREIGN KEY (tenant_id) REFERENCES tb_tenant(id)
);

-- Índices
CREATE INDEX idx_integracao_tenant ON tb_integracao_config(tenant_id);
CREATE INDEX idx_integracao_tipo ON tb_integracao_config(tipo);
CREATE INDEX idx_sync_log_tenant ON tb_sync_log(tenant_id);
CREATE INDEX idx_sync_log_data ON tb_sync_log(started_at);
```

---

## 🛠️ Backend Implementation

### 1. IntegrationService (Nova)

```java
@Service
@RequiredArgsConstructor
public class IntegrationService {

    @Autowired
    private IntegracaoConfigRepository integracaoRepository;

    @Autowired
    private TreinoRealizadoRepository treinoRepository;

    @Autowired
    private SyncLogRepository syncLogRepository;

    /**
     * Conectar Strava (OAuth callback)
     */
    public void connectStrava(String code, String state, Long usuarioId) {
        // 1. Trocar code por access_token
        StravaOAuthResponse response = stravaClient.exchangeCode(code);

        // 2. Salvar integração
        IntegracaoConfig config = new IntegracaoConfig();
        config.setUsuarioId(usuarioId);
        config.setTipo("STRAVA");
        config.setAccessToken(response.getAccessToken());
        config.setRefreshToken(response.getRefreshToken());
        config.setTokenExpiry(response.getExpireAt());
        config.setStatus("CONNECTED");

        integracaoRepository.save(config);

        // 3. Buscar atividades existentes (catch-up)
        syncStravaActivities(usuarioId);
    }

    /**
     * Sincronizar treinos do Strava
     */
    @Transactional
    public void syncStravaActivities(Long usuarioId) {
        IntegracaoConfig config = integracaoRepository
            .findByUsuarioIdAndTipo(usuarioId, "STRAVA")
            .orElseThrow();

        SyncLog syncLog = new SyncLog();
        syncLog.setTipoIntegracao("STRAVA");
        syncLog.setStartedAt(LocalDateTime.now());

        try {
            // 1. Buscar atividades do Strava
            List<StravaActivity> activities = stravaClient
                .getActivities(config.getAccessToken());

            // 2. Para cada atividade, criar TreinoRealizado
            int count = 0;
            for (StravaActivity activity : activities) {
                if (!treinoRepository.existsByStravaId(activity.getId())) {
                    TreinoRealizado treino = new TreinoRealizado();
                    treino.setTenantId(TenantContextHolder.getTenantId());
                    treino.setUsuarioId(usuarioId);
                    treino.setStravaId(activity.getId());
                    treino.setData(activity.getStartDate());
                    treino.setDistancia(activity.getDistance());
                    treino.setTempo(activity.getElapsedTime());
                    treino.setFcMedia(activity.getAverageHeartrate());
                    treino.setFcMaxima(activity.getMaxHeartrate());
                    treino.setTipo(mapearTipo(activity.getType()));

                    // 3. Calcular métricas
                    if (activity.getAverageHeartrate() != null) {
                        calculateAndSetTSS(treino);
                    }

                    treinoRepository.save(treino);
                    count++;
                }
            }

            syncLog.setStatus("SUCCESS");
            syncLog.setDadosSincronizados(count);

        } catch (Exception e) {
            log.error("Erro sincronizando Strava", e);
            syncLog.setStatus("FAILED");
            syncLog.setMensagem(e.getMessage());
        }

        syncLog.setFinishedAt(LocalDateTime.now());
        syncLogRepository.save(syncLog);

        // 4. Atualizar last_sync
        config.setLastSync(LocalDateTime.now());
        integracaoRepository.save(config);
    }

    /**
     * Webhook de Strava (quando user termina treino)
     */
    public void handleStravaWebhook(StravaWebhookEvent event) {
        if (event.getObjectType().equals("activity") &&
            event.getAspectType().equals("create")) {

            // 1. Buscar configuração de integração
            IntegracaoConfig config = integracaoRepository
                .findByStravaAthleteId(event.getOwnerId())
                .orElseThrow();

            // 2. Buscar detalhe da atividade
            StravaActivity activity = stravaClient
                .getActivity(event.getObjectId(), config.getAccessToken());

            // 3. Criar treino realizado
            TreinoRealizado treino = new TreinoRealizado();
            treino.setTenantId(config.getTenantId());
            treino.setUsuarioId(config.getUsuarioId());
            treino.setStravaId(activity.getId());
            // ... mapear dados

            treinoRepository.save(treino);

            // 4. Notificar coach em tempo real (WebSocket ou push)
            notificationService.notifyCoach(
                config.getTenantId(),
                "Novo treino sincronizado: " + activity.getName()
            );
        }
    }

    /**
     * Desconectar Strava
     */
    public void disconnectStrava(Long usuarioId) {
        IntegracaoConfig config = integracaoRepository
            .findByUsuarioIdAndTipo(usuarioId, "STRAVA")
            .orElseThrow();

        config.setStatus("DISCONNECTED");
        integracaoRepository.save(config);

        log.info("Strava desconectado para user {}", usuarioId);
    }
}
```

### 2. Webhook Controller

```java
@RestController
@RequestMapping("/api/v1/webhooks")
public class WebhookController {

    @Autowired
    private IntegrationService integrationService;

    /**
     * Webhook Strava callback
     */
    @PostMapping("/strava")
    public ResponseEntity<Void> stravaWebhook(@RequestBody StravaWebhookEvent event) {
        // 1. Validar signature (segurança)
        if (!validateStravaSignature(event)) {
            throw new SecurityException("Invalid Strava signature");
        }

        // 2. Processar async (não bloquear webhook)
        integrationService.handleStravaWebhook(event);

        return ResponseEntity.ok().build();
    }

    /**
     * Garmin callback
     */
    @PostMapping("/garmin")
    public ResponseEntity<Void> garminWebhook(@RequestBody GarminWebhookEvent event) {
        // Similar a Strava
        return ResponseEntity.ok().build();
    }

    private boolean validateStravaSignature(StravaWebhookEvent event) {
        // Validar signature usando STRAVA_WEBHOOK_SECRET
        String signature = event.getSignature();
        // ... validar
        return true;
    }
}
```

### 3. OAuth Controller

```java
@RestController
@RequestMapping("/api/v1/oauth")
public class OAuthController {

    @Autowired
    private IntegrationService integrationService;

    /**
     * Strava OAuth callback
     */
    @GetMapping("/strava/callback")
    public ResponseEntity<?> stravaCallback(
            @RequestParam String code,
            @RequestParam String state) {

        try {
            // 1. Obter user ID do state
            Long usuarioId = decodeState(state);

            // 2. Conectar Strava
            integrationService.connectStrava(code, state, usuarioId);

            // 3. Redirect para dashboard
            return ResponseEntity.status(302)
                .location(URI.create("/dashboard?connected=strava"))
                .build();

        } catch (Exception e) {
            log.error("Erro conectando Strava", e);
            return ResponseEntity.status(302)
                .location(URI.create("/settings?error=strava_connection_failed"))
                .build();
        }
    }
}
```

---

## 📱 Frontend Implementation

### 1. Settings Page com Integrações

```typescript
// pages/settings/IntegrationsPage.tsx

export const IntegrationsPage: React.FC = () => {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const fetchIntegrations = async () => {
    const response = await axios.get('/api/v1/integrations');
    setIntegrations(response.data);
  };

  const connectStrava = () => {
    const state = encodeState(currentUserId);
    window.location.href =
      `https://www.strava.com/oauth/authorize?` +
      `client_id=${STRAVA_CLIENT_ID}&` +
      `redirect_uri=${STRAVA_REDIRECT_URI}&` +
      `response_type=code&` +
      `scope=activity:read_all&` +
      `state=${state}`;
  };

  const disconnectStrava = async () => {
    await axios.delete('/api/v1/integrations/strava');
    await fetchIntegrations();
  };

  return (
    <Container>
      <Typography variant="h4">Integrações</Typography>

      <Card sx={{ mt: 2 }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="h6">Strava</Typography>
              <Typography variant="body2" color="textSecondary">
                {integrations.find(i => i.tipo === 'STRAVA')?.status === 'CONNECTED'
                  ? '✅ Conectado'
                  : '❌ Desconectado'}
              </Typography>
            </Box>
            <Button
              variant="contained"
              onClick={
                integrations.find(i => i.tipo === 'STRAVA')?.status === 'CONNECTED'
                  ? disconnectStrava
                  : connectStrava
              }
            >
              {integrations.find(i => i.tipo === 'STRAVA')?.status === 'CONNECTED'
                ? 'Desconectar'
                : 'Conectar'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Similar para Garmin, Apple Health, etc */}
    </Container>
  );
};
```

### 2. Real-Time Sync Status

```typescript
// components/SyncStatus.tsx

export const SyncStatus: React.FC = () => {
  const [lastSync, setLastSync] = useState<SyncLog | null>(null);

  useEffect(() => {
    // Polling every 30 seconds
    const interval = setInterval(async () => {
      const response = await axios.get('/api/v1/sync/last');
      setLastSync(response.data);
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  if (!lastSync) return null;

  return (
    <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
      <Typography variant="caption">
        Última sincronização: {formatTime(lastSync.finishedAt)}
      </Typography>
      {lastSync.status === 'SUCCESS' && (
        <Typography variant="caption" color="success.main">
          ✓ {lastSync.dadosSincronizados} treinos sincronizados
        </Typography>
      )}
    </Box>
  );
};
```

---

## 📊 Impacto em Métricas de Produto

```
SEM integração:
├─ Sign-ups: 500 no 1º mês
├─ Ativo após 1 mês: 150 (30%)
├─ Motivo para sair: "Muito trabalho preencher"
└─ Churn: -80%/mês

COM integração (Sprint 2):
├─ Sign-ups: 500 no 1º mês
├─ Ativo após 1 mês: 400 (80%) ✅
├─ Motivo para ficar: "Automático, sem trabalho"
└─ Churn: -5%/mês ✅

DIFERENÇA EM 6 MESES:
├─ Sem integração: 500 → 150 → 45 → 13 usuários (morte lenta)
├─ Com integração: 500 → 400 → 350 → 320+ usuários (crescimento)
└─ IMPACTO: +2000% em retention!
```

---

## 🎯 Sprint 2 Reorganizado

```
Sprint 2 Original (Performance):
├─ Paginação (4 dias)
├─ N+1 optimization (3 dias)
├─ DB indexes (0.5 dia)
└─ Caching (2 dias)
Total: 10 dias

Sprint 2 Novo (Performance + Integrações):
├─ [KEEP] Paginação (4 dias)
├─ [KEEP] N+1 optimization (3 dias)
├─ [KEEP] DB indexes (0.5 dia)
├─ [KEEP] Caching (2 dias)
├─ [NEW] Integrações (8-10 dias!)
│  ├─ Strava OAuth + sync (3 dias)
│  ├─ Garmin API + sync (3 dias)
│  ├─ Webhooks (1.5 dias)
│  ├─ Real-time notifications (1.5 dias)
│  └─ Testes (2 dias)
└─ Total: 18-20 dias (3 semanas)

PROBLEMA: Sprint 2 cresce muito!

SOLUÇÃO:
├─ Fazer Sprint 2 em 2 semanas (performance)
├─ Fazer Sprint 2.5 NEW (integrações) em 1.5 semanas
└─ Ou: Paralelizar 2 devs (um performance, um integrações)
```

---

## 🚀 Recomendação Final

### Opção 1: Integrações em Sprint 2 (RECOMENDADO)

```
Timeline Ajustado:
├─ Sprint 1 (28 FEV - 14 MAR): Auth + Multi-tenancy (1.5 semanas)
├─ Sprint 2A (14 MAR - 28 MAR): Performance (2 semanas)
├─ Sprint 2B (28 MAR - 11 ABR): Integrações (2 semanas)
├─ Sprint 3 (11 ABR - 25 ABR): Billing + Onboarding (2 semanas)
└─ 28 ABR: MVP 2.1 BETA com tudo pronto ✅

Impacto no roadmap:
├─ Versão 1.0: 14 MAR (auth ready)
├─ Versão 1.1: 28 ABR (beta pronto + integrações!)
└─ Versão 2.0: 31 JUL (público) - ainda no prazo!

Benefício:
  ✅ Beta users têm experiência 10x melhor
  ✅ Aderência alta (80%+)
  ✅ PMF validado com integrações
  ✅ Ainda lança público em JUL
```

### Opção 2: Integrações Depois (ARRISCADO)

```
Timeline:
├─ Sprint 1-4: Sem integrações (MVP incompleto)
├─ Sprint 5-6: Adicionar integrações (retrofit)
├─ Problema: Beta users já esperando feature
├─ Resultado: PMF falha

❌ NÃO RECOMENDADO
```

---

## ✅ Checklist de Implementação

```
Sprint 2 - Integrações:

BACKEND:
  [ ] IntegrationService.java
  [ ] IntegracaoConfigRepository
  [ ] WebhookController (Strava, Garmin)
  [ ] OAuthController
  [ ] StravaClient (HTTP wrapper)
  [ ] GarminClient (HTTP wrapper)
  [ ] Migrations: tb_integracao_config, tb_sync_log
  [ ] Scheduled job: hourly sync (se não webhook)
  [ ] Tests: IntegrationServiceTest

FRONTEND:
  [ ] IntegrationsPage (settings)
  [ ] ConnectStravaButton
  [ ] DisconnectButton
  [ ] SyncStatus component
  [ ] Real-time notifications
  [ ] OAuth callback handling

INFRASTRUCTURE:
  [ ] Webhook secrets (env vars)
  [ ] OAuth credentials (Strava, Garmin)
  [ ] HTTPS for webhooks (production)
  [ ] Firewall rules para webhooks

DOCUMENTATION:
  [ ] Setup guide para users
  [ ] FAQ: "Por que sincronizar?"
  [ ] Troubleshooting: conexão falhou
```

---

## 💰 Custo-Benefício

```
IMPLEMENTAR INTEGRAÇÕES:

Custo:
  • +8-10 dias de desenvolvimento (Sprint 2B)
  • +R$ 3-4k em desenvolvimento
  • +R$ 500 em Strava + Garmin API costs
  • Total: R$ 3.5-4.5k

Benefício (imediato):
  ✅ +50% de user aderência (150 → 400 usuários)
  ✅ -75% de churn (80% → 5%)
  ✅ +5-6k MRR em beta (50 users × R$ 100-200)
  ✅ Diferenciação competitiva clara

Benefício (longo prazo):
  ✅ Product-market fit mais fácil
  ✅ Retenção 10x melhor
  ✅ Menos suporte (sem "como faço para...")
  ✅ Mais features viáveis em cima

NET VALUE: +R$ 20-30k em benefícios!
ROI: 5-7x em 12 meses
```

---

## 🎯 Decisão Recomendada

**ADICIONAR INTEGRAÇÕES EM SPRINT 2**

**Motivo:**
- MVP sem integrações = morte lenta (churn 80%)
- MVP com integrações = crescimento (churn 5%)
- +8-10 dias de trabalho valem 20x em resultado
- Ainda cumpre timeline de público em JUL

**Ação:**
1. Aprovar integração em Sprint 2 (hoje)
2. Alocar Dev para Sprint 2B (integrações)
3. Começar com Strava (70% dos usuários)
4. Garmin como segundo (50%)
5. Apple Health + Polar como nice-to-have

**Timeline Ajustado:**
```
Sprint 1: 28 FEV - 14 MAR  (Auth + Multi-tenancy)
Sprint 2A: 14 MAR - 28 MAR (Performance)
Sprint 2B: 28 MAR - 11 ABR (Integrações)
Sprint 3: 11 ABR - 25 ABR  (Billing + Onboarding)
Sprint 4: 25 ABR - 09 MAI   (Beta Polish)
Beta Launch: 09 MAI (em vez de 31 MAI, mas com integrações!)
```

---

**Status:** 🟢 PRONTO PARA DECISÃO

**Seu call:** Adicionar integrações em Sprint 2? SIM ✅

