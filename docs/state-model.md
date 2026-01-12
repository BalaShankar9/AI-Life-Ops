# State Model

All states are explicit, with failure states that have a defined recovery path. States are listed with primary transitions.

## Auth (JWT session)
States:
- Unauthenticated
- Authenticating
- Authenticated
- TokenExpired
- AuthError (failure)

Transitions:
- AppStart -> Unauthenticated
- Unauthenticated -> Authenticating (login/register)
- Authenticating -> Authenticated (login/register success)
- Authenticating -> AuthError (login/register failure)
- Authenticated -> TokenExpired (token TTL exceeded)
- TokenExpired -> Unauthenticated (re-auth required)
- Any -> AuthError (auth service failure)

Recovery:
- AuthError -> Unauthenticated (retry after backoff)

## Onboarding (stub)
States:
- NotStarted
- InProgressStub
- Completed
- Skipped
- OnboardingError (failure)

Transitions:
- Authenticated -> NotStarted
- NotStarted -> InProgressStub (user starts)
- InProgressStub -> Completed (save)
- InProgressStub -> Skipped (user opts out)
- InProgressStub -> OnboardingError (save failure)

Recovery:
- OnboardingError -> InProgressStub (retry)
- OnboardingError -> Skipped (user opts out)

## Daily check-in
States:
- NotStarted
- InProgress
- Submitted
- Skipped
- ValidationError (failure)
- SaveError (failure)

Transitions:
- DayStart -> NotStarted
- NotStarted -> InProgress (user opens)
- InProgress -> Submitted (valid submit)
- InProgress -> ValidationError (invalid or missing required fields)
- InProgress -> SaveError (persist failure)
- NotStarted -> Skipped (user opts out)

Recovery:
- ValidationError -> InProgress (fix inputs)
- SaveError -> InProgress (retry)

## Schedule-aware planning
States:
- CalendarUnavailable (no busy blocks)
- CalendarLoaded (busy blocks present)
- FreeWindowsDerived
- ConflictsDetected
- CompressionApplied

Transitions:
- CheckInSubmitted -> CalendarLoaded (busy blocks available)
- CheckInSubmitted -> CalendarUnavailable (no busy blocks)
- CalendarLoaded -> FreeWindowsDerived
- CalendarUnavailable -> FreeWindowsDerived (use wake/sleep bounds)
- FreeWindowsDerived -> ConflictsDetected (no window fits)
- ConflictsDetected -> CompressionApplied (auto-compress)
- FreeWindowsDerived -> Proposed (schedule plan ready)
- CompressionApplied -> Proposed (schedule plan ready with compression notes)

Recovery:
- ConflictsDetected -> CompressionApplied (auto-compress) or -> Proposed (manual accept)

## Today plan
States:
- NotStarted
- Generating
- Proposed
- Edited
- Accepted
- Saved
- EngineError (failure)
- SaveError (failure)

Transitions:
- CheckInSubmitted -> Generating
- Generating -> Proposed (engine success)
- Generating -> EngineError (engine failure or timeout)
- Proposed -> Accepted (user accepts)
- Proposed -> Edited (user edits)
- Edited -> Accepted (user saves)
- Accepted -> Saved (persist success)
- Accepted -> SaveError (persist failure)

Recovery:
- EngineError -> Generating (retry) or -> Edited (manual plan)
- SaveError -> Accepted (retry)

## History
States:
- Loading
- Ready
- Empty
- LoadError (failure)

Transitions:
- HistoryViewOpen -> Loading
- Loading -> Ready (records found)
- Loading -> Empty (no records)
- Loading -> LoadError (fetch failure)

Recovery:
- LoadError -> Loading (retry)

## Weekly review
States:
- LoadingLatest
- NotStarted
- Generating
- Ready
- GenerateError (failure)

Transitions:
- ReviewViewOpen -> LoadingLatest
- LoadingLatest -> Ready (stored report found)
- LoadingLatest -> NotStarted (no stored report)
- NotStarted -> Generating (generate summary)
- Generating -> Ready (success)
- Generating -> GenerateError (failure)

Recovery:
- GenerateError -> Generating (retry)

## Connectors
States:
- Disconnected
- SyncQueued
- Syncing
- Connected
- Error

Transitions:
- ViewConnectors -> Disconnected (no tokens)
- Disconnected -> SyncQueued (sync requested)
- SyncQueued -> Syncing (job starts)
- Syncing -> Connected (sync success with tokens)
- Syncing -> Error (sync failure)
- Error -> SyncQueued (retry)

Recovery:
- Error -> SyncQueued (manual retry)

## Scenario simulation
States:
- PackListLoading
- PackListReady
- EditingPack
- SavingPack
- Comparing
- ResultsReady
- PackSaveError (failure)
- CompareError (failure)

Transitions:
- SimulateViewOpen -> PackListLoading
- PackListLoading -> PackListReady (packs loaded)
- PackListReady -> EditingPack (new pack or load pack)
- EditingPack -> SavingPack (save pack)
- SavingPack -> PackListReady (save success)
- SavingPack -> PackSaveError (save failure)
- EditingPack -> Comparing (compare scenarios)
- Comparing -> ResultsReady (comparison success)
- Comparing -> CompareError (engine failure or timeout)

Recovery:
- PackSaveError -> EditingPack (retry or edit)
- CompareError -> EditingPack (retry or modify scenarios)

Constraints:
- Cannot compare with 0 scenarios
- Cannot save pack without name
- Max 6 scenarios per pack
- Baseline must be valid (no crisis risk)
- Engine timeout: 60s

## PDF export
States:
- ReadyToExport
- Generating
- Generated
- ExportError (failure)

Transitions:
- ReviewReady -> ReadyToExport
- ReadyToExport -> Generating (export request)
- Generating -> Generated (success)
- Generating -> ExportError (generation failure)

Recovery:
- ExportError -> Generating (retry)
- ExportError -> ReadyToExport (cancel)
