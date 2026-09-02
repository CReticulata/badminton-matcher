## MODIFIED Requirements

### Requirement: Users can restart a participant fairness period without rewriting history
The system SHALL provide a per-participant secondary action in the active-session participant interface to reset play rate. The action MUST require confirmation and MUST create a new fairness period without changing completed matches, daily appearance totals, session participation, Rating state, or Rating replay. A reset for a player in a live match MUST be queued until that match completes or is cancelled; otherwise it MUST take effect immediately. The live-match overlay MUST NOT expose a post-match reset menu or per-participant fairness-reset controls.

#### Scenario: Idle participant is reset
- **WHEN** the user confirms a reset for a participant who is not in a live match
- **THEN** a new fairness period begins immediately with zero appearances and zero eligible time

#### Scenario: Playing participant is reset
- **WHEN** the user opens the active-session participant controls and confirms a reset for a participant in the live match
- **THEN** the UI indicates a pending reset and the old period remains active until that match completes or is cancelled

#### Scenario: Live-match overlay omits reset controls
- **WHEN** a live match is displayed
- **THEN** the overlay shows no post-match reset menu and no per-participant fairness-reset control

#### Scenario: Reset does not alter history or Rating
- **WHEN** a fairness period reset takes effect
- **THEN** the participant's completed matches, daily total, Rating, RD, volatility, activity summary, and Rating replay results remain unchanged
