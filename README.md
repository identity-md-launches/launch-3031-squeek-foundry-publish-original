# Squeek Foundry

An original factory automation browser game for Squeekchain Genesis Code. Build an ore → plates → pods production line, buffer intermittent electricity, and score pods delivered to a warehouse. The site opens directly in the workshop. It has no accounts, wallet connections, transactions, wagering, token rewards, or shared rankings.

The production site is **`dist/`**, included alongside source and the lockfile. All runtime assets are local and URLs are relative. Requested IMD site label: **`squeek-foundry-75fe`**, subject to availability. Publication URLs and a public repository/commit are assigned outside this worker; none has been invented or claimed here. See [publication handoff](artifacts/publication.md).

## Install, run, and rebuild

Node **22.12+** (Node 24 used for validation), npm, and a modern browser with Web Crypto are required.

```sh
npm ci
npm run dev
npm run typecheck
npm test
npm run build
npm run check:export
npm run preview
```

Serve `dist/` with any static HTTP server, including at an IPFS gateway subpath. Opening `index.html` through `file://` is not supported. HTTPS or localhost enables SHA-256, clipboard access, and service workers. `npm run build` creates the complete export; the host does not need to rebuild it.

Browser checks use Playwright and axe-core, included as development dependencies:

```sh
npx playwright install chromium
npm run test:browser
npm run test:network
npm run test:a11y
```

These bounded scripts start and close their own local HTTP servers. Evidence is written to `test/scratch/browser-evidence/`; that directory is disposable and not a build input. `IMD_PLAYWRIGHT` can name an installed Playwright module and `IMD_AXE` an axe script when running in a managed worker. A clean install/build/test was also exercised without these worker overrides.

## Play

Select a module, then tap an empty square. Select an existing machine to inspect its recipe, input/output buffers, priority, and diagnostic. Rotate with the toolbar or **R**; delete with the tool or **Delete**; undo and redo work before a shift. Credits preview the complete layout cost. The board supports native scroll/swipe pan, zoom controls, and arrow-key navigation with Enter/Space activation.

**Run** freezes layout and rules. **Pause**, **Step**, **1×/2×/4×**, **Restart**, and **Edit again** operate on the same engine. Restart creates a fresh run; Edit again resets to tick zero and restores the fixed initial reserve. No editing, refunds, inventory injection, or rule changes happen inside a scored run. A changed API installation/release requires a new source before another historical run.

The tutorial has three self-paced steps, approximately 30 seconds each, followed by a playable synthetic factory. The three contracts, tutorial, and Practice are explicitly **synthetic**. Historical Shift is a separate API-derived mode. Every mode scores delivered pods.

| Contract | Tested solution | Actual delivered pods | Goal/comparison |
| --- | --- | ---: | --- |
| First Shipment | `blueprints/solution-1.json` | 14 | At least 6 |
| Buffer the Burst | `blueprints/solution-2.json` | 22 | At least 20 |
| Priority Automation | `blueprints/solution-3.json` | 17 | Same layout without rules: 15 |

Removing all batteries from the Buffer solution reduces delivery from **22 to 12**, with curtailment rising from **6 to 289**. The comparison uses identical supply and horizon. The reference blueprint is `blueprints/starter.json`; all comparisons use the same 420-credit ceiling, source, and horizon. Unspent credits remain unspent. Historical results have a simulated reference, not an arbitrary delivery quota.

## Architecture and deterministic phase order

- `src/config.ts`: engine version, integer balance constants, module/rule types.
- `src/engine.ts`: pure `initial`, `step`, `simulate`, inventory and conservation audits. No DOM, timers, random numbers, storage, or network.
- `src/source.ts`: current API adapters, BigInt normalization, batch selection, source validation.
- `src/serialization.ts`: bounded JSON validation, canonical serialization, SHA-256, blueprint/run bundles, recomputation.
- `src/presets.ts`: the starter, three solutions, and labelled synthetic fixtures.
- `src/live.ts`: abortable polling, visibility handling, backoff, and Retry-After.
- `src/App.tsx`, `src/art.tsx`, `src/png.ts`, `src/style.css`: workshop, original SVG machinery, controls, replay, localization, PNG rendering.
- `vite.config.ts`: relative export and asset-specific offline shell cache. API requests are never served from the shell cache.

For tick `t`, with cell ID `y × 12 + x`:

1. **Generation/storage.** Inject the pinned `profile[t]`, admit only available capacity and charge rate, and count the remainder as curtailed. Charging uses the previous tick's battery enable flags.
2. **Transfer intents.** Read only previous-state queues and outgoing enable flags. Resolve contenders by ascending source cell ID, reserve only previous-state free capacity, then remove and insert all successful transfers simultaneously. No multi-hop movement occurs. A completely full belt cycle stalls safely; it does not rotate through space it did not have. A splitter alternates forward/right only after a successful transfer.
3. **Rules.** All conditions read one post-transfer, pre-progress snapshot. Reapply base settings, then evaluate up to eight ordered rules. For each setting, the last matching rule wins. Rules affect a module, module-kind group, or all modules. Higher priority gets energy first; equal priorities use ascending cell ID. Tick thresholds are zero-based, segments one-based. Matching actions are reevaluated each tick rather than latched permanently.
4. **Machine progress/scoring.** Disabled modules pause. Warehouses score and remove pods. Existing jobs advance one work tick. Idle machines start only if the complete recipe, energy, and a reserved output slot are available. Energy and inputs are consumed atomically at start. A new job takes one start tick plus its configured work ticks; progress consumes no additional energy. Completed jobs append their output. Warehouses score only real pods received through transfers.

A disabled machine retains its inventory and in-progress job. Transfers into its bounded input can still arrive; outgoing movement follows the previous enable flag because it precedes rules. Batteries represent an aggregate bus: their physical capacity persists when disabled, while their charge/discharge rate contribution stops. This preserves stored energy instead of deleting it.

Every audited tick reconciles:

```text
generated + initialReserve = spent + stored + curtailed
oreMade = storedOre + platesMade + oreInSmelterJobs
platesMade = storedPlates + 2 × podsMade + platesInAssemblerJobs
podsMade = storedPods + deliveredPods
```

Only output queues count as newly made items; recipe materials held by active jobs are included in the conservation audit. Finite simulations end exactly at the horizon.

## Balance constants

All values live in `CONFIG`; imports must match this engine's constants exactly.

| Module | Credits | Work ticks after start | Energy/job | Input capacity | Output capacity |
| --- | ---: | ---: | ---: | ---: | ---: |
| Drill | 45 | 2 | 2 | 0 | 3 |
| Conveyor | 5 | Passive | 0 | 1 | Shared input slot |
| Alternating splitter | 18 | Passive | 0 | 1 | Shared input slot |
| Smelter | 65 | 3 | 3 | 4 ore | 3 plates |
| Assembler | 85 | 4 | 5 | 4 plates | 2 pods |
| Warehouse | 35 | Passive | 0 | 8 pods | Scores arrivals |
| Battery | 35 | Passive | 0 | None | +64 bus storage, +8 rate |

The board is 12×8, budget 420, and initial reserve **8 game energy**. The base bus has capacity 8 and charge/discharge limit 8 per tick. Each enabled battery adds rate 8. Job inputs: drill none → ore; smelter one ore → plate; assembler two plates → pod. A machine has at most one active job. Disabling a battery reduces rate, not physical capacity.

## API mapping and Historical Shift

The following public endpoints were revalidated on **2026-11-06**:

| Endpoint | Observed schema | Used fields |
| --- | ---: | --- |
| [Status](https://api.squeekchain.com/v1/status) | 1 | installationId, revision, observedAt, freshness, coreStatus, rpmMilli, staleAfterSeconds |
| [Economy](https://api.squeekchain.com/v1/economy/state) | 3 | installationId, release identity/revisions, chain identity, indexing and safety metadata |
| [24-hour settlements](https://api.squeekchain.com/v1/settlements?range=24h) | 3 | installationId, chain, generatedAt, recentSettlements |

Observed chain: **Sepolia, 11155111**. No contract address, ABI, method, reward, or mainnet assumption is required. Adapters validate consumed fields and supported schema versions while tolerating additive fields. Unsupported versions/errors remain visible; they never become invented history.

Select the latest available **2–12 distinct safe settlement batches** with matching installation/chain, bounded by both API safety blocks. Duplicates use block/log and transaction/log identity. Sort by `ethereumBlockNumber`, then `logIndex`, using BigInt. The API currently returns ten recent records; requesting twelve can therefore pin fewer than twelve, but never fewer than two. The actual count, horizon, profile, timestamps, source work, round interval, confirmations, safe block/hash/time, indexing boundary, release, installation, and transaction links are inspectable.

For the selected records:

```text
M = max(1, max(workAdded))
E_i = floor(160 × workAdded_i / M)
profile[32i + t] = floor((t+1) × E_i / 32) − floor(t × E_i / 32)
horizon = 32 × batchCount
```

Decimal-string counters stay BigInt until the normalized segment energy is bounded to 0–160. Zero work gives zero external energy. Input decimal strings are bounded to 100 digits for resource safety. A batch can span multiple rounds; the game does not reconstruct missing rounds or precise wheel timing. This normalization is **game electricity, not protocol power or token rewards**. Every run discloses the same 8-unit initial reserve.

API snapshots are **not independently verified onchain**. Imported/offline sources are labelled untrusted. Live observations are provisional and cannot alter the pinned profile of a scored shift. Status polling is at least 15 seconds; economy/settlements at least 60 seconds, with 10-second timeouts, no per-resource overlap, hidden-tab suppression, exponential backoff up to 15 minutes, and bounded Retry-After handling. IDLE, stale, and offline remain distinct states.

Insufficient safe records leave the existing source intact and offer explicit synthetic Practice. There is no production fixture fallback masquerading as a live API response.

## Files, replay, persistence, and offline use

Blueprint format v1 contains engine version, complete constants, layout, and ordered rules. Imports validate byte size (128 KiB), enums, integer bounds, duplicate cells, budget, rule targets, thresholds, and rule count. Text is rendered through React text nodes. Run bundle v1 additionally contains the pinned source records/metadata, rebuilt profile, horizon, score, and SHA-256 source/final-state fingerprints. Import recomputes the full simulation and rejects mismatched profile, score, or fingerprints.

Fingerprints identify local reproducibility. They do **not** authenticate provenance, prevent cheating, or establish official verification. The source fingerprint excludes only the transport-trust label so imported data can be compared without claiming it is trusted. Results include tick replay, shipment log, energy/starvation/curtailment counters, actual reference and no-rules comparisons, JSON download and manual-copy fallback, and a real 1200×1000 PNG using the factory's SVG sprites and actual counters.

Blueprints persist locally. Best scores are separated by mode, source kind/fingerprint, and engine version; they exist only in the current browser. Storage failures keep gameplay usable and explicitly recommend export. There is no server or upload. After the first successful service-worker cache, the production shell, tutorial, Practice, and imported replay work offline. Historical acquisition still needs the APIs; an already exported historical run can be reproduced offline.

## Two-minute reviewer walkthrough

1. **0:00** Open the workshop, select 4×, and Run. Pause/Step, then inspect a machine. Edit again returns to tick zero. Place a conveyor in an empty cell, rotate it, and undo/redo.
2. **0:25** Open the shift selector. Load the First Shipment solution and run it. Results show 14 delivered pods. Load Buffer the Burst to see storage preserve output through zero-supply segments.
3. **0:55** Load Priority Automation's solution. Its 17 pods beat the identical no-rules layout's 15. Inspect its three rules and the last-fired display.
4. **1:15** Open Power and select six latest safe batches. Inspect work-to-energy mapping, chain, installation, round intervals, and transaction links. If acquisition is unavailable, use the explicit synthetic Practice button.
5. **1:35** Finish a shift, export its run JSON, import it, and scrub the replay. Changing its score causes a visible rejection. Export the factory/results PNG.
6. **1:50** Switch to 简体中文. At 390px, pan/zoom the board and open/close the inspector. After “Offline workshop ready,” disconnect and reload to use tutorial/Practice or import a run offline.

## Validation and limitations

Actual commands, results, screenshots, six-domain design review, discovered defects and fixes are in [artifacts/validation.md](artifacts/validation.md). The worker ran 17 engine/import tests, a 20-check browser journey, five polling/source checks, the pinned 16-check design probe, and axe audits; subsequent final evidence is recorded there.

Direct browser requests to the live API host returned `net::ERR_EMPTY_RESPONSE` in this sandbox. The endpoints were fetched successfully through the machine's HTTP tooling; browser integration used the **actual captured responses** in `test/fixtures/api-snapshot.json`, never a production substitute. WebKit downloaded but could not launch because host system libraries are absent. Native Safari/iPhone, screen-reader use, and independent human/agent review are not claimed. The pinned probe and axe provide independent automated checks, not network certification. Public hosting, repository URL, and commit remain a publication handoff.

## Design and attribution

[DESIGN.md](DESIGN.md) records the implemented tokens, type scale, components, and responsive behavior. Original machine sprites and the hamster foundry mark are in `src/art.tsx`. Better Interface guidance is adapted from Jakub Krehel (MIT), with documentation guidance from Paul Bakaus's Impeccable (Apache-2.0). Notices and the provided licenses are retained in [artifacts/NOTICE.md](artifacts/NOTICE.md) and [artifacts/design-guidance-LICENSE.txt](artifacts/design-guidance-LICENSE.txt).
