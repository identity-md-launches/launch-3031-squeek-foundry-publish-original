# Squeek Foundry design system

## Overview

Squeek Foundry is a hands-on factory automation game. Its visual idea is a copper machine bench inside an ink-blue workshop, with cyan reserved for electricity and pods. The playable grid is the main surface; there is no marketing hero. The product, shift selector, Run action, budget and electricity are above the board. Controls are grouped by purpose: build tools, simulation, cell inspection, rules, source, and files.

Source of truth: `src/style.css`, `src/art.tsx`, and the interface patterns in `src/App.tsx`. PNG export is implemented in `src/png.ts`. English and Simplified Chinese share one layout and all product controls are translated; protocol names, numeric identifiers, hashes, and API enums remain source data.

## Colors

The implemented theme is deliberately dark, with a flat hex token system in `:root`:

| Token | Value | Use |
| --- | --- | --- |
| `--page` | `#0c1723` | Page, inputs, recessed controls |
| `--surface` | `#12212e` | Command bar, inspector, dialogs |
| `--raised` | `#1b2c3a` | Neutral button and secondary surfaces |
| `--board` | `#142532` | Factory floor base |
| `--border` | `#304350` | Structural divisions, input boundaries |
| `--text` | `#e4e9e9` | Primary text |
| `--muted` | `#a1b2be` | Supporting text, captions, secondary labels |
| `--amber` | `#ecc08b` | Run action, selection, delivered score |
| `--cyan` | `#87e0df` | Electricity, pods, links |
| `--focus` | `#d0fbf0` | 2px keyboard perimeter |

Selected tools use `#3b3229` / `#a77f57`, machine selection uses a 2px amber inset outline, and starvation uses an explicit `!`. Blockage has `×`; disabled machines have `Ⅱ`. All important states also have named text in the inspector and accessible cell labels.

Machine artwork has its own copper palette (`#735344`, `#d6a16b`, `#e4ad70`) and teal battery housing (`#244c55`, `#69d6df`). It is illustrative art rather than interactive text. The board's restrained radial lighting is confined to the workshop floor. Text contrast measurements and gradient/art limitations are documented in `artifacts/validation.md`; a token declaration alone is not a rendered contrast measurement.

## Typography

Use the existing system stack: `Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif`. No font download is required. Inter is only a preferred installed face; fallback is intentional. The implementation requests regular 400 and semibold 600.

The six-size scale is `--xs:12px`, `--sm:14px`, `--base:16px`, `--lg:20px`, `--xl:28px`, `--display:48px`. Captions, source metadata, and toolbar data use 12px. Desktop body/UI uses 14px; ordinary inspector headings use 16px; product title 20px; workshop heading 28px; results score 48px. On small screens the product title becomes 16px and workshop heading 20px. Mobile numeric/select inputs are 16px to avoid iOS input zoom; the JSON code area uses 14px on mobile.

Headings use line-height 1.25 and balanced wrapping; body copy uses 1.5–1.6. The product/workshop headings use modest negative tracking, with natural case throughout. Scores and changing values use tabular numbers. Only JSON/code uses the system monospace stack. Critical hashes and installation IDs wrap with `overflow-wrap:anywhere`; they are not ellipsized.

## Layout

The page has a 1,600px maximum content width and 32px desktop gutters. Spacing follows 4/8/12/16/20/24/32px increments. Buttons generally use 8px×12px padding and a 40px desktop minimum height. Primary mobile controls use 44px.

At desktop, `.factory-layout` is `176px minmax(0,1fr) 260px`: palette, board, inspector. Beyond 1,550px the side columns become 192/280px. At 1,160px, gutters reduce to 20px and side columns to 150/240px. At 1,000px, the inspector becomes a fixed drawer; the board retains its flexible column. At 650px, gutters become 12px, the palette becomes a horizontal scroller above the board, stats remain four columns, simulation controls wrap, file actions move below, and footer content stacks.

The factory is always a 12×8 square grid with a base cell size of 56px. Zoom changes that size from 75% to 150%; it does not stretch cells. The board has its own scroll container with native swipe/scroll panning and contained overscroll. At small widths its viewport is 340px high. The page itself does not pan horizontally. Column/row labels remain inside the board's coordinate system. The board's empty space is available building area, not an advertising panel.

The first screen at 390px contains the product, Run action, status, credits, tools, and a visible active factory row. Observed widths and screenshots are listed in validation. The interface is LTR for both supported languages; RTL is not a product variant.

## Elevation & Depth

The main workshop uses tonal layers and structural borders, without card shadows. Machine shadows are SVG illustration. The inspector drawer uses a lateral shadow to separate it from the workshop. Native dialogs use a dark, blurred backdrop and a single border, without an additional box shadow. There are no nested marketing cards, gradient text, or page-load entrances.

The build produces a static page; loading/error/retry behavior belongs to real API reads. Live observations have a text status beside the dot. Source metadata and detailed batch records use disclosure instead of overwhelming the main board.

## Shapes

Buttons and fields use 5–6px corners; the command frame uses 8px upper corners; dialogs use 12px, reduced to 10px on small screens. Grid cells stay square. Machine housings have their own bolted, clipped copper forms in the SVG art. Ore, plates, and pods have different silhouettes as well as colors.

Decorative SVGs have `aria-hidden` and do not intercept pointer events. Native buttons define hit areas. Selection, focus, hover, disabled and pressed treatments are separate; disabled controls keep their labels visible.

## Components

- **Brand:** `BrandMark` in `src/art.tsx` plus `.brand`. Original hamster/foundry emblem, product title and one short line. Utilities stay opposite the brand.
- **Simulation controls:** `.command-bar`, `.run-actions`, `.speed-control`. One amber primary action changes between Run, Pause, Resume and Results. Speed is an accessible group with pressed states. Edit controls lock during a shift.
- **Build palette:** `.tool` with `MachineArt`. Click/tap selection, cost, selected background and disabled state. Horizontal overflow is limited to the palette on mobile.
- **Factory grid:** `.board-grid`, `.board-row`, `.grid-cell`. ARIA grid → eight rows → twelve cells. One roving tab stop, arrow navigation, Enter/Space activation, R/Delete shortcuts, full descriptive labels and a visible inset focus outline. Item sprites and progress bars represent engine state.
- **Inspector:** `.inspector` / `.inspector-tabs`. Desktop complementary panel, mobile dialog-like drawer with inert background, focus trap/return and Escape close. Inspect, Rules and Power are ordinary labeled buttons. Text diagnostics supplement art and color.
- **Rule editor:** `.rule`, `.field`, `.condition-fields`. Native selects and number inputs, up/down ordering, delete, eight-rule cap and immediate validation. Last matching rule is visible.
- **Source profile:** `.energy-profile`, `.mini-profile`, `.source-metadata`, `.batch-record`. Bars always represent actual pinned segment energies; numeric totals and metadata are available. The compact profile has a textual accessible description. Source trust and synthetic modes are explicit.
- **Dialogs:** local `Modal` component uses native `<dialog>`, named heading, Escape, close button and focus restoration. Tutorial, shift selection, JSON and results share this pattern.
- **Files/results:** `.comparison`, `.result-counters`, `.replay-bar`, `.json-text`. Stable comparison columns, visible energy ledger, local-only best, tick scrubber, safe text, real Blob downloads, and clipboard/manual-copy fallback.
- **Feedback:** `.status-message` is beside the board controls; `.modal-message` repeats relevant feedback inside the active modal/drawer, where background content is inert. Errors remain dismissible rather than timing out.

Motion is opt-in inside `prefers-reduced-motion:no-preference`: 120ms control feedback and a subtle active-machine brightness pulse. Reduced motion receives the same icons/text/progress without endless animation. Forced-colors focus uses `Highlight`.

## Do's and Don'ts

Reuse the ink-blue shell, copper primary action and cyan power semantics. Start new game panels from `.field`, `.key-values`, the existing native dialog, or inspector patterns. Keep the board first and disclose long metadata. Keep all new user-facing strings paired in English/Chinese and describe data provenance at the point of use.

Preserve square cells, readable source identifiers, and visible focus. Do not move essential controls into hover-only interactions, add external runtime assets, introduce competing type scales, or imply global/official rankings. A new source panel must use the same validators and keep live data outside the pinned engine specification.
