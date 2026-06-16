# Health Connect Read Layer (Mobile) → `HealthConnectActivityDto`

**Status:** Draft · **Depends on:** `first-party-ingestion-architecture.md`
**Goal:** The on-device side that reads a completed activity from Health Connect (Android), normalizes it, and POSTs the exact `HealthConnectActivityDto` the backend `HealthConnectImporter` expects.

**Why this bypasses the API problem:** Health Connect is a **client-side** store. The athlete grants consent on their own phone, we read locally and send a normalized payload. We never call the Garmin Developer Program or the Strava API — the data is first-party from the moment it enters Menthor.os. (iOS/HealthKit is symmetric and emits the same DTO with `source = HEALTHKIT`.)

Verified against the Health Connect guide for **`androidx.health.connect:connect-client` 1.1.0**.

---

## 1. Gradle
```kotlin
dependencies {
    implementation("androidx.health.connect:connect-client:1.1.0")
}
```

## 2. Manifest — permissions + rationale activity

Health Connect requires an activity that handles the permissions-rationale intent, and it must point at the **same privacy policy** we prepared for the LGPD/Garmin work. This is where that policy gets reused.

```xml
<uses-permission android:name="android.permission.health.READ_EXERCISE"/>
<uses-permission android:name="android.permission.health.READ_HEART_RATE"/>
<uses-permission android:name="android.permission.health.READ_DISTANCE"/>
<uses-permission android:name="android.permission.health.READ_TOTAL_CALORIES_BURNED"/>

<!-- Required: explains why we read health data; links the privacy policy -->
<activity
    android:name=".health.PermissionsRationaleActivity"
    android:exported="true">
    <intent-filter>
        <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE"/>
    </intent-filter>
</activity>

<!-- Android 14+ also surfaces the rationale via the main activity -->
<activity android:name=".MainActivity">
    <intent-filter>
        <action android:name="android.intent.action.VIEW_PERMISSION_USAGE"/>
        <category android:name="android.intent.category.HEALTH_PERMISSIONS"/>
    </intent-filter>
</activity>
```

## 3. Client + availability + permissions

```kotlin
object HealthConnect {

    val PERMISSIONS = setOf(
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(TotalCaloriesBurnedRecord::class),
    )

    fun clientOrNull(context: Context): HealthConnectClient? =
        if (HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE)
            HealthConnectClient.getOrCreate(context) else null
}

// Compose permission request
@Composable
fun rememberHealthPermissionLauncher(onResult: (Boolean) -> Unit) =
    rememberLauncherForActivityResult(
        PermissionController.createRequestPermissionResultContract()
    ) { granted -> onResult(granted.containsAll(HealthConnect.PERMISSIONS)) }
```

> Note: Health Connect only exposes data from **up to 30 days before** permission was granted — so onboard the athlete's consent early.

## 4. Read sessions → DTO

```kotlin
class HealthConnectReader(private val client: HealthConnectClient) {

    /** Read sessions in a window and map each to the backend DTO. */
    suspend fun readSessionsSince(since: Instant): List<HealthConnectActivityDto> {
        val sessions = client.readRecords(
            ReadRecordsRequest(
                recordType = ExerciseSessionRecord::class,
                timeRangeFilter = TimeRangeFilter.between(since, Instant.now())
            )
        ).records
        return sessions.map { toDto(it) }
    }

    private suspend fun toDto(s: ExerciseSessionRecord): HealthConnectActivityDto {
        val window = TimeRangeFilter.between(s.startTime, s.endTime)

        // Aggregate avoids double-counting across data sources for cumulative/statistical metrics.
        val agg = client.aggregate(
            AggregateRequest(
                metrics = setOf(
                    HeartRateRecord.BPM_AVG,
                    HeartRateRecord.BPM_MAX,
                    DistanceRecord.DISTANCE_TOTAL,
                    ExerciseSessionRecord.EXERCISE_DURATION_TOTAL
                ),
                timeRangeFilter = window
            )
        )

        // Raw HR samples for decoupling / zone distribution downstream.
        val hrSamples = client.readRecords(
            ReadRecordsRequest(HeartRateRecord::class, timeRangeFilter = window)
        ).records.flatMap { it.samples }
            .map { HrSampleDto(time = it.time, bpm = it.beatsPerMinute.toInt()) }

        return HealthConnectActivityDto(
            clientRecordId   = s.metadata.clientRecordId ?: s.metadata.id, // stable dedup anchor
            exerciseType     = mapType(s.exerciseType),
            startTime        = s.startTime,
            endTime          = s.endTime,
            activeDurationSeconds = agg[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.seconds,
            distanceMeters   = agg[DistanceRecord.DISTANCE_TOTAL]?.inMeters,
            avgHeartRate     = agg[HeartRateRecord.BPM_AVG]?.toInt(),
            maxHeartRate     = agg[HeartRateRecord.BPM_MAX]?.toInt(),
            heartRateSamples = hrSamples
        )
    }

    private fun mapType(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING            -> "RUNNING"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING             -> "BIKING"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL      -> "SWIMMING_POOL"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER-> "SWIMMING_OPEN_WATER"
        else                                                  -> "OTHER"
    }
}
```

## 5. DTO contract (mirrors the backend record exactly)

```kotlin
@Serializable
data class HealthConnectActivityDto(
    val clientRecordId: String,
    val exerciseType: String,
    @Serializable(InstantSerializer::class) val startTime: Instant,
    @Serializable(InstantSerializer::class) val endTime: Instant,
    val activeDurationSeconds: Long?,
    val distanceMeters: Double?,
    val avgHeartRate: Int?,
    val maxHeartRate: Int?,
    val heartRateSamples: List<HrSampleDto>
)

@Serializable
data class HrSampleDto(
    @Serializable(InstantSerializer::class) val time: Instant,
    val bpm: Int
)
```

## 6. Upload to backend

```kotlin
interface MenthorosApi {
    @POST("api/v1/workouts/import/health-connect")
    suspend fun importHealthConnect(@Body dto: HealthConnectActivityDto): ImportResultDto
}

// orchestration
suspend fun syncHealthConnect(reader: HealthConnectReader, api: MenthorosApi, since: Instant) {
    reader.readSessionsSince(since).forEach { dto ->
        runCatching { api.importHealthConnect(dto) }
            .onFailure { /* queue for retry; backend dedup makes re-send safe */ }
    }
}
```

The backend's cross-source dedup (`external_id = "hc:" + clientRecordId`, plus the fuzzy `dedupKey`) makes re-sends and FIT/Health-Connect overlap idempotent — so the client can retry freely.

---

## 7. Incremental sync (production) — Changes API instead of time windows

For steady-state, replace the time-window read with the Changes token so you only pull deltas and avoid rate limits.

```kotlin
suspend fun initToken(client: HealthConnectClient): String =
    client.getChangesToken(ChangesTokenRequest(setOf(ExerciseSessionRecord::class)))

suspend fun pullChanges(client: HealthConnectClient, token: String): Pair<List<ExerciseSessionRecord>, String> {
    val response = client.getChanges(token)
    val upserts = response.changes
        .filterIsInstance<UpsertionChange>()
        .mapNotNull { it.record as? ExerciseSessionRecord }
    return upserts to response.nextChangesToken // persist for next run
}
```

Persist `nextChangesToken` per athlete; on `changesTokenExpired`, fall back to a one-off 30-day window read and re-issue a token.

---

## 8. Acceptance criteria (Gherkin)
```gherkin
Feature: Health Connect ingestion (mobile)

  Scenario: Consent gates all reads
    Given the athlete has not granted Health Connect permissions
    When a sync is attempted
    Then no records are read and the app prompts for consent

  Scenario: A completed run is normalized and uploaded
    Given granted permissions and a running ExerciseSessionRecord with HR samples
    When the reader maps the session
    Then a HealthConnectActivityDto is produced with clientRecordId, distance, avg/max HR and HR samples
    And it is POSTed to the backend import endpoint

  Scenario: Re-sync is idempotent
    Given a session already uploaded
    When the same session is read and uploaded again
    Then the backend returns "deduplicated" and creates nothing new

  Scenario: Incremental sync uses a changes token
    Given a stored changes token
    When a sync runs
    Then only upserted sessions since the token are pulled
    And the next token is persisted
```

---

## 9. If the athlete shell is React Native
This Kotlin lives in a native module exposing `readSessionsSince`/`syncHealthConnect` over the RN bridge, or use the community `react-native-health-connect` wrapper and keep the same DTO mapping in JS. The DTO contract and backend endpoint are unchanged. iOS uses HealthKit (`HKWorkout` + `HKQuantityTypeIdentifier.heartRate`) producing the identical DTO with `source = HEALTHKIT`.
