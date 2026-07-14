# fit-workout-export Specification

> Delta desta change: capability nova (não existe spec canônica anterior). Cobre o contrato dos
> endpoints binários de export, a autorização (padrão `/me`, design D4), a fidelidade do encode
> (D1/D2/D3) e a semântica do ZIP. CA0 (validação do canal de entrega) e CA8 (suítes verdes) são
> gates de processo em `tasks.md`, não comportamento de runtime — sem cenário aqui.

## New Requirements

### Requirement: Individual planned workout downloads as a valid FIT workout file (CA1)

The system SHALL expose `GET /api/v1/planos/treinos/{treinoPlanejadoId}/fit` returning the
planned workout encoded as a FIT workout file (`FileIdMesg` type=WORKOUT with non-zero
`serialNumber` and `product` set, `WorkoutMesg`, N × `WorkoutStepMesg`), with
`Content-Type: application/octet-stream` and a `Content-Disposition: attachment` header carrying
a human-readable filename.

#### Scenario: Approved workout downloads with round-trip-stable structure
- **Given** a `TreinoPlanejado` with `EtapaTreino` steps belonging to an approved `PlanoSemanal`
- **When** the owner requests the individual FIT endpoint
- **Then** the response SHALL be a FIT file whose round-trip decode with the FIT SDK reproduces
  the steps, durations, targets, and repeat structure
- **And** the `Content-Disposition` filename SHALL follow `treino-<data>-<tipo>.fit`

### Requirement: Encoded structure is faithful to the prescription (CA2)

The system SHALL map `EtapaTreino` to `WorkoutStepMesg` preserving order, mapping
AQUECIMENTO/DESAQUECIMENTO/RECUPERACAO to the corresponding FIT intensities (any other
`tipoEtapa` value defaults to ACTIVE), and choosing duration as distance when `distanciaKm` is
present, else time from `duracaoMin`, else an open step.

#### Scenario: Expanded repeat block is de-expanded to N×, never N²
- **Given** a workout whose block was persisted expanded as N identical windows sharing
  `blocoId` with `blocoRepeticoes = N`
- **When** the encoder emits the FIT steps
- **Then** it SHALL emit one iteration of the window plus a repeat step targeting N laps
- **And** the round-trip decode SHALL execute the window exactly N times

#### Scenario: Inconsistent block falls back to expanded steps without repeat
- **Given** a workout whose `blocoId` windows are not identical (e.g., edited by the coach after
  expansion)
- **When** the encoder emits the FIT steps
- **Then** it SHALL emit the steps individually without any repeat step
- **And** the export SHALL NOT fail

### Requirement: Target parsing is best-effort and never blocks the export (CA3)

The system SHALL parse the canonical planner target formats (`"M:SS-M:SS/km"` pace ranges and
`"NNN-NNN bpm"` heart-rate ranges) plus the documented tolerant variants into FIT step targets,
applying the pace→speed inversion and the +100 offset for absolute bpm. Any unparseable target
string SHALL produce an open-target step, preserving the original text in the step notes,
without raising errors or per-occurrence warning logs.

#### Scenario: Canonical pace range becomes a speed target with inverted bounds
- **Given** an `EtapaTreino` with `ritmoAlvo = "5:30-5:45/km"`
- **When** the step is encoded
- **Then** the step target SHALL be SPEED with the slower pace (5:45) as speed low and the
  faster pace (5:30) as speed high, both in m/s

#### Scenario: Unknown target string exports as an open step
- **Given** an `EtapaTreino` whose `ritmoAlvo` matches no known pattern
- **When** the step is encoded
- **Then** the step SHALL have `targetType = OPEN`
- **And** the original string SHALL be preserved in the step notes
- **And** no error SHALL be raised or logged

### Requirement: Workout without steps exports as a single-step workout (CA4)

The system SHALL export a `TreinoPlanejado` that has no `EtapaTreino` as a single-step workout
using the workout-level duration or distance, the workout `zonaAlvo` as target when parseable,
and the workout description in the step notes.

#### Scenario: Step-less workout still produces an importable file
- **Given** an approved `TreinoPlanejado` with no `EtapaTreino`
- **When** the owner requests the individual FIT endpoint
- **Then** the response SHALL be a FIT workout with exactly one step derived from the
  workout-level fields

### Requirement: Weekly ZIP bundles the exportable workouts of the plan (CA5)

The system SHALL expose `GET /api/v1/planos/semanas/{planoSemanalId}/fit` returning
`application/zip` containing one `.fit` entry per exportable workout of the approved weekly
plan, excluding rest days and workouts with no exportable content, with unique human-readable
entry names (`treino-<data>-<tipo>[-<n>].fit`).

#### Scenario: Name collision inside the ZIP is disambiguated
- **Given** an approved weekly plan with two workouts producing the same base filename
- **When** the weekly ZIP endpoint is requested
- **Then** the ZIP SHALL contain both entries with a numeric disambiguation suffix
- **And** the download SHALL NOT fail

#### Scenario: Approved week with no exportable workout returns a curated error
- **Given** an approved weekly plan whose workouts are all rest days or have no exportable
  content
- **When** the weekly ZIP endpoint is requested
- **Then** the response SHALL be `422` with an actionable message
- **And** an empty ZIP SHALL NOT be returned

### Requirement: Export authorization follows the `/me` pattern across the three axes (CA6)

The system SHALL authorize both export endpoints as follows: the tenant guard applies first
(cross-tenant resources behave as nonexistent); an ATLETA resolves their own `atletaId` from
the token and may only access their own resources; TECNICO/ADMIN may only access athletes of
their own assessoria; and both roles require the enclosing `PlanoSemanal.reviewStatus` to be
approved. Ownership failures SHALL return `404` (anti-enumeration); an unapproved plan SHALL
return `403` with an actionable message.

#### Scenario: ATLETA cannot download another athlete's workout in the same tenant
- **Given** an ATLETA authenticated in tenant T
- **And** a workout belonging to a different athlete of the same tenant T
- **When** the ATLETA requests either export endpoint for that resource
- **Then** the response SHALL be `404`

#### Scenario: TECNICO cannot download outside their assessoria
- **Given** a TECNICO authenticated in tenant T
- **And** a workout belonging to an athlete of another assessoria
- **When** the TECNICO requests either export endpoint for that resource
- **Then** the response SHALL be `404`

#### Scenario: Unapproved plan is refused with an actionable message
- **Given** a workout whose `PlanoSemanal.reviewStatus` is not approved
- **When** the resource owner (ATLETA) or their coach requests either export endpoint
- **Then** the response SHALL be `403`
- **And** the body SHALL carry an actionable message (plan awaiting coach approval)

### Requirement: Filename is readable cross-origin via CORS (CA7)

The system SHALL expose the `Content-Disposition` header in the CORS configuration so that the
frontend can read the server-provided filename on cross-origin downloads.

#### Scenario: Frontend reads the server filename
- **Given** a cross-origin request from the frontend to either export endpoint
- **When** the download response is received
- **Then** the `Content-Disposition` header SHALL be readable by the client JavaScript

### Requirement: Download is stateless

The system SHALL NOT mutate `TreinoPlanejado.exportadoPara` or `statusSincronizacao` (reserved
for future push sync) as a result of export downloads; downloads are repeatable and adoption is
measured via structured logs only.

#### Scenario: Repeated downloads leave the workout untouched
- **Given** an exportable workout
- **When** its FIT file is downloaded multiple times
- **Then** `exportadoPara` and `statusSincronizacao` SHALL remain unchanged
- **And** each download SHALL emit a structured log entry (endpoint, atletaId, treinoId)

### Requirement: Export actions are visible only for approved plans (CA7, frontend)

The frontend SHALL render the per-workout download button and the weekly ZIP button only when
the plan is approved, SHALL not invoke the weekly endpoint without a present `PlanoSemanal.id`,
and SHALL surface the backend's curated `403`/`422` messages instead of swallowing them.

#### Scenario: Unapproved plan hides the export actions
- **Given** an athlete or coach viewing a plan whose `reviewStatus` is not approved
- **When** the plan page renders
- **Then** no FIT download button SHALL be rendered

#### Scenario: Backend refusal surfaces its curated message
- **Given** a download attempt that the backend refuses with `403` or `422`
- **When** the frontend handles the response
- **Then** the backend's message SHALL be shown to the user
