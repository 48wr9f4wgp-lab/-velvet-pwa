# Observer Management Benchmark Pack — 2026-09-13

Status: Live benchmark refresh before major design pass
Scope: 3D observer management / logistics / automation / mobile-first interaction
Canonical rule: GAME_DEV_MASTER_RULES v1.3

## Selection logic
Final benchmark set is deliberately multi-source. We extract transferable principles, not layouts, copy, characters, iconography or branded content.

## Final benchmark pack

### 1. Factorio
Why benchmark: automation, visible throughput, bottleneck diagnosis, progressive replacement of manual work, programmable rules.
Adopt:
- production-flow readability
- throughput as a primary metric
- automation rules that can react to thresholds
- milestone-driven unlocks
- upgrades that change the operating model, not only numeric output
Avoid:
- desktop-density UI
- recipe explosion in the vertical slice

### 2. Timberborn
Why benchmark: autonomous workers, workplace priorities, status warnings, visible logistics, 3D observer play.
Adopt:
- per-workstream priority control
- explicit staffing / queue warnings
- worker assignment should be understandable from the world view
- expansion from manual labor to automation
- bottleneck diagnosis before raw content growth
Avoid:
- deep survival/needs simulation before logistics loop proves fun

### 3. Against the Storm
Why benchmark: short strategic runs, orders with choices, perks that alter strategy, readable pressure and risk.
Adopt:
- choose-one-of-several contracts
- timed and non-timed operational objectives
- rewards that alter strategy rather than only add cash
- rising operational pressure that creates decisions
Avoid:
- roguelite meta complexity until the basic session loop proves retention

### 4. shapez 2
Why benchmark: pure visual automation, low-stress optimization, milestones, satisfying improvement of reusable systems.
Adopt:
- clean visual flow
- clear milestones
- no need for combat or forced failure to create challenge
- progressive automation layers
- success should be visible in the facility itself
Avoid:
- large multi-layer factory construction in the first mobile slice

### 5. Mini Motorways
Why benchmark: mobile-native management, emergent congestion, minimal input, clear failure/bottleneck language, time controls.
Adopt:
- simple touch interaction
- congestion emerges from demand instead of arbitrary timers
- pause / 1x / 2x / 4x
- one glance should reveal what is going wrong
- milestones can present constrained upgrade choices
Avoid:
- irreversible collapse with no recovery path in the main mode

## Secondary references

### Oxygen Not Included
Use for: diagnostic overlays, task priority language, system-status visibility, autonomous-agent observability.

### Two Point Museum
Use for: staff personality/traits, side expeditions, collection/meta progression, readable staff action states, playful incidents.

### Satisfactory
Use for: visual "automation spectacle", conveyors as reward, facility growth that becomes impressive to watch.

### Idle Office Tycoon / mobile idle-tycoon pattern
Use for: compact upgrade cards, milestone rewards, strong sense of economic escalation. Do not import ad/IAP pressure or passive waiting as core play.

## Strong conventions found across 3+ benchmarks
1. Autonomous agents/machines execute the plan; the player changes policy, layout or priorities.
2. Bottlenecks are the content: queues, shortages, capacity and travel time should be legible.
3. Time controls are mandatory for observer management.
4. Upgrade effects must visibly change flow.
5. The player needs a clear next objective/milestone.
6. Automation should replace tedious manual work over time.
7. Problems should be recoverable; failure should teach what to change.
8. Information layers/overlays are important once the system becomes dense.

## Adopted for the current vertical slice
### A. Fine-grained work priorities
Store / Pick-Pack / Ship each gain a 1–5 priority in addition to high-level policies.

### B. Contract board
Offer 3 operational contracts. Player picks one. Examples:
- Ship N parcels before the timer expires
- Keep inbound queue below a threshold for a duration
- Sustain a minimum throughput for a duration
Contracts pay cash and Research Points.

### C. Research / perk choice
Research Points unlock one of several lightweight operating perks. Perks are generic and stack-limited.

### D. Bottleneck director
Continuously calculate the dominant bottleneck and show:
- cause
- severity
- recommended action
- station saturation

### E. Diagnostic overlay
Toggle between Normal and Flow view. Flow view shows worker task lines and station saturation colors.

### F. Milestone cadence
Every shipment milestone grants a choose-one bonus instead of only passive cash.

### G. Recovery-first design
No sudden hard game over in the default mode. Severe congestion reduces efficiency and creates visible chaos, but the player can recover by changing priorities, pausing intake or buying capacity.

## Deferred until the slice proves fun
- full building placement/editor
- multiple SKUs/recipes
- staff needs/moods
- expeditions as a side loop
- randomized incidents/events
- offline earnings
- prestige/reset economy
- complex circuit logic

## Success gate after this pass
The slice is worth expanding only if all are true:
1. Player can identify the bottleneck within 3–5 seconds.
2. A directive/priority change visibly changes behavior within 5 seconds.
3. First contract can complete within the first session.
4. First upgrade changes throughput measurably.
5. Watching the autonomous facility is entertaining without constant tapping.
