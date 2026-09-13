# Observer Logistics — Vertical Slice GDD

Status: Context Lock / Vertical Slice
Canonical project rule: GAME_DEV_MASTER_RULES v1.3

## 1. Context Lock
- Platform: iPhone Safari / PWA-first web, PC browser secondary
- Region / audience: global-capable, Japanese prototype UI, casual-to-midcore management/simulation players
- Genre: 3D management sim / logistics colony-lite / automation observer
- Core loop: issue priorities -> autonomous workers move goods -> observe bottlenecks -> change priorities / buy upgrades -> throughput and profit rise
- Meta loop: more workers -> faster handling -> larger racks -> faster packing -> conveyor automation -> denser facility
- Session: 5–15 minutes for prototype
- Orientation / input: responsive portrait-landscape; tap, drag/orbit, pinch zoom; no virtual joystick
- Offline / online: offline single-player prototype
- Monetization: none in prototype; decision deferred until product proof
- LiveOps: none in prototype
- Device tier: recent mid-range iPhone and above; low-poly stylized 3D; target stable interactive frame rate over visual complexity
- Save: localStorage with schema_version; backend not required for vertical slice
- Privacy class: no account, no PII, no external analytics in prototype

## 2. Success Definition
- Repeat action: set policy, inspect the flow, remove bottlenecks, buy the next throughput upgrade.
- Satisfaction: the facility visibly clears queues and becomes more efficient because of the player's decisions.
- Growth: worker count, walking speed, rack capacity, packing speed, automation level, cash and shipments.
- Return reason: unlock the next automation layer and see a larger autonomous facility operate.
- Monetization point: intentionally undecided until retention and session appeal are proven.
- Shared category expectations: pause / 1x / 2x / 4x, readable bottlenecks, autonomous agents, visible production flow, meaningful upgrades.
- Differentiation: compact mobile-first 3D logistics simulation where physical overflow and autonomous behavior make operational problems visible rather than abstract.

## 3. Vertical Slice
### Facility
- Inbound dock
- Rack storage
- Packing station
- Outbound dock
- 3 autonomous workers

### Flow
Inbound box -> worker stores box -> rack -> order arrives -> worker picks box -> packing -> worker ships packed box -> cash

### Player directives
- BALANCE: balanced intake and shipping
- INBOUND: prioritize clearing inbound backlog
- SHIP: prioritize orders and outbound flow

### Time controls
Pause / 1x / 2x / 4x

### Upgrades
- Hire worker
- Worker speed
- Rack capacity
- Packing speed
- Conveyor automation

### Bottlenecks surfaced to player
- Inbound queue full
- Rack capacity full
- Pending orders rising
- Packed goods waiting for outbound

### Physics use
Rapier is limited to visible overflow parcels / incidental physical chaos when inbound is clogged. Core economy and task assignment do not depend on nondeterministic physics.

## 4. Non-goals for this slice
- Character customization
- Large building editor
- Complex pathfinding/navmesh
- Multiple product SKUs
- Staff needs/moods
- Cloud save, accounts, multiplayer
- Monetization, ads, store release

## 5. Acceptance Criteria
- The player can understand what is entering, stored, packing, and shipping without controlling an avatar.
- Workers continuously find and execute valid tasks without player micromanagement.
- Changing policy visibly changes worker behavior within several seconds.
- Money and shipment count increase only after successful outbound delivery.
- At least one bottleneck can emerge naturally and be improved by an upgrade or directive change.
- Pause / speed controls work on iPhone.
- Camera orbit / zoom works with touch and does not require a virtual joystick.
- Save restores progression fields safely with schema_version.
- No critical interaction depends on hover.

## 6. Tech Decision
- Rendering: Three.js
- Camera: OrbitControls
- Physics: Rapier WASM, capped decorative overflow bodies only
- Simulation: deterministic JavaScript domain state separated from rendering
- Persistence: localStorage, versioned snapshot
- Hosting: GitHub Pages static /docs; no Replit or always-on server required

## 7. Next Gate
Do not expand content until the slice proves: directive -> autonomous response -> bottleneck visibility -> upgrade -> measurable throughput improvement.
