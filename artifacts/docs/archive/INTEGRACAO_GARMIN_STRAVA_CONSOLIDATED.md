# Integração Garmin + Strava - Consolidado

**Documento Unificado de Integração**
**Data:** Consolidado em 08 de maio de 2026
**Status:** ✅ ENTREGUE

---

## 📑 Índice

1. Análise do Modelo de Integração
2. Especificação Técnica
3. Guia de Implementação
4. Checklist de Integração

---

## 📋 SEÇÃO 1: Análise do Modelo de Integração

### Garmin vs Strava

**Garmin Connect:**
- Principal fonte de dados de atletas em treinamento
- Oferece: treinos planejados, treinos realizados, métricas detalhadas
- API: REST + OAuth2
- Frequência de sync: Real-time quando possível

**Strava:**
- Rede social de atletas (secundária)
- Oferece: atividades, performance análise
- API: REST com rate limiting
- Frequência de sync: Sob demanda ou webhook

### Por Que Ambas?

```
Garmin:
├─ Treinos planejados (coach)
├─ Execução (atleta)
├─ Métricas fisiológicas (HR, cadência, etc)
└─ Análise detalhada

Strava:
├─ Validação de atividades
├─ Compartilhamento social
├─ Leaderboards
└─ Comunidade
```

---

## 🔧 SEÇÃO 2: Especificação Técnica

### Endpoints Garmin

```
GET /wellness
POST /wellness/{id}
GET /activities
GET /activities/{activityId}
GET /activities/{activityId}/metrics
GET /heartrate
```

### Endpoints Strava

```
GET /activities
GET /activities/{activityId}
POST /activities/{activityId}/streams
GET /segments
```

### Fluxo de Sincronização

```
Usuario faz login via OAuth2 Garmin
    ↓
Token armazenado no banco (encriptado)
    ↓
Sync scheduler roda a cada 30 minutos
    ↓
Busca atividades novas no Garmin
    ↓
Valida contra Strava (se conectado)
    ↓
Salva em menthoros-db/menthoros-multi
    ↓
Atualiza dashboard
```

---

## 📚 SEÇÃO 3: Guia de Implementação

### Setup Garmin

1. Criar aplicação em developer.garmin.com
2. Configurar OAuth2 redirect URI
3. Adicionar credenciais ao .env
4. Implementar GarminAuthService
5. Criar migração para tb_garmin_token

### Setup Strava

1. Criar aplicação em developers.strava.com
2. Configurar webhook
3. Adicionar credenciais ao .env
4. Implementar StravaAuthService
5. Criar GarminStravaSync task

### Código de Exemplo

```java
@Service
public class GarminIntegrationService {
    public void syncGarminActivities(Long userId) {
        User user = userRepository.findById(userId);
        String token = decryptToken(user.getGarminToken());
        
        List<Activity> activities = garminClient.getActivities(token);
        for (Activity activity : activities) {
            if (!activityRepository.existsByGarminId(activity.getId())) {
                Activity mentorosActivity = mapGarminToMenthoros(activity);
                activityRepository.save(mentorosActivity);
            }
        }
    }
}
```

---

## ✅ Checklist de Integração

Backend:
- [ ] GarminAuthService
- [ ] StravaAuthService
- [ ] GarminIntegrationService
- [ ] StravaIntegrationService
- [ ] Database migrations
- [ ] Token encryption/decryption
- [ ] Sync scheduler
- [ ] Tests

Frontend:
- [ ] OAuth2 login flows
- [ ] Activity list
- [ ] Activity detail view
- [ ] Sync status indicator
- [ ] Tests

---

**Status:** ✅ ENTREGUE - Consolida ANALISE_MODELO_INTEGRACAO_STRAVA + integracao-garmin-strava + STRAVA_INTEGRATION_GUIDE
