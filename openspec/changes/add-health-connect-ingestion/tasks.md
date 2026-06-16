## Pré-requisitos
- [ ] 0.1 `first-party-ingestion-architecture` mergeada (define `HealthConnectImporter`, DTO, endpoint, dedup). Sem ela, parar.
- [ ] 0.2 **Decisão de produto:** existe (ou está no roadmap) um shell mobile Android/iOS/React Native? O read layer on-device depende disso. Se não, entregar só o lado backend (já no parent) e adiar o mobile.

## 1. Backend (entregável sem mobile — habilita testes)
- [ ] 1.1 Confirmar endpoint `POST /api/v1/workouts/import/health-connect` + `HealthConnectImporter` (do parent); testar com payload `HealthConnectActivityDto` real (curl/fixture).
- [ ] 1.2 Confirmar dedup idempotente (`external_id = "hc:" + clientRecordId` + fuzzy) com re-envio.

## 2. Mobile — Android (Health Connect) [gated na decisão 0.2]
- [ ] 2.1 Gradle: `androidx.health.connect:connect-client:1.1.0`.
- [ ] 2.2 Manifest: permissões `READ_EXERCISE/HEART_RATE/DISTANCE/CALORIES` + `PermissionsRationaleActivity` ligada à privacy policy LGPD; `VIEW_PERMISSION_USAGE` (Android 14+).
- [ ] 2.3 `HealthConnect` (client/availability/permissions) + launcher Compose de permissão.
- [ ] 2.4 `HealthConnectReader.readSessionsSince` → `aggregate` (evita double-count) + amostras de FC brutas → `HealthConnectActivityDto`.
- [ ] 2.5 `mapType` dos `EXERCISE_TYPE_*`; `InstantSerializer`.
- [ ] 2.6 Upload via Retrofit + retry (dedup torna re-envio seguro).

## 3. Sync incremental
- [ ] 3.1 Changes token: `getChangesToken` / `getChanges`; persistir `nextChangesToken` por atleta.
- [ ] 3.2 Fallback em `changesTokenExpired` → leitura de janela 30d + reemissão do token.
- [ ] 3.3 Onboard do consentimento cedo (janela de 30 dias do Health Connect).

## 4. iOS / React Native (se aplicável)
- [ ] 4.1 iOS: HealthKit (`HKWorkout` + HR) emitindo o mesmo DTO com `source = HEALTHKIT`.
- [ ] 4.2 RN: native module expondo `readSessionsSince`/`sync`, ou `react-native-health-connect`, mesmo contrato de DTO.

## 5. Validação final
- [ ] 5.1 Cenários Gherkin do `design.md`: consentimento gateia leitura; run normalizado e enviado; re-sync idempotente; sync incremental por token.
- [ ] 5.2 `/qa` + suíte verde no que for backend; smoke do fluxo mobile→import.
- [ ] 5.3 Atualizar `tasks.md`; `/ship`.
