# Co-run

Co-run lets an overtake tool share Move's control surface with a second UI for
the duration of a single user-driven session — e.g. a sequencer keeps the
pads + steps + transport while the Schwung chain editor takes the OLED + jog,
or while the Move firmware's native preset/synth editor takes its knobs.

Two co-run targets ship today:

| Target                    | Peer UI                                 |
| ------------------------- | --------------------------------------- |
| `CORUN_TARGET_CHAIN_EDIT` | Schwung shadow_ui's chain-slot editor   |
| `CORUN_TARGET_MOVE_NATIVE`| Move firmware's native preset / synth editor |

Both targets share the same default split, encoded as `CORUN_KEEP_DEFAULT =
PADS | STEPS | TRANSPORT | MENU` — the tool keeps those control-surface
groups and cedes everything else (OLED, jog, track buttons, knobs 71-78,
master CC 79, Shift, touch notes 0-9) to the peer. Back is framework-reserved
as the exit gesture by default; see [Exit gesture](#exit-gesture). Tools can
override by passing an explicit `keep_mask` to `shadow_corun_begin()`.

## Exit gesture

**Back exits co-run by default.** This matches the rest of Move's "Back pops
one layer" semantics. The framework intercepts Back from the user, calls
`shadow_corun_end()`, and never lets the event reach either the tool or the
peer. (`menu` keeps its existing duties outside co-run: tap-dismisses shadow
UI; Shift+Vol+Menu opens Master FX. While a co-run is active, Menu is
forwarded to the tool by default via `CORUN_KEEP_DEFAULT` so the tool can use
it as its own affordance.)

### Opting out — `CORUN_KEEP_BACK`

Tools that need Back free for in-session peer navigation (sub-view pop in
the chain editor, native back-navigation inside Move firmware) set
`CORUN_KEEP_BACK` in `keep_mask`:

```js
shadow_corun_begin(CORUN_TARGET_CHAIN_EDIT, slot,
                   CORUN_KEEP_DEFAULT | CORUN_KEEP_BACK);
```

When this bit is set, the framework leaves Back alone: Back routes per the
normal `keep_mask` rules (cedes to peer unless `CORUN_GRP_BACK` is also kept).
For `CORUN_TARGET_CHAIN_EDIT`, shadow_ui's own Back handler still ends the
session when the chain editor is at its top-level view (`CHAIN_EDIT`) — it
owns the view stack and can tell, so it provides Charles's "Back exits at
top, navigates within" UX for free even under the opt-out. For other
targets like `CORUN_TARGET_MOVE_NATIVE`, the peer UI's depth isn't
observable from the framework, so the tool is responsible for its own
exit gesture (typically Menu, which is tool-routed under the default
keep-mask) and for calling `shadow_corun_end()` itself.

`CORUN_KEEP_BACK` lives in the high half of `keep_mask` (bit 15) so it doesn't
collide with any `CORUN_GRP_*` bit.

## JS API

Exposed on the global object in shadow_ui's JS runtime:

```js
shadow_corun_begin(target, id, keep_mask)
  // target: CORUN_TARGET_CHAIN_EDIT | CORUN_TARGET_MOVE_NATIVE
  // id:     chain slot 0-3 (CHAIN_EDIT) or tool track 0-7 (MOVE_NATIVE)
  // keep_mask: bitfield of CORUN_GRP_* the tool KEEPS; 0 = default split

shadow_corun_end()
  // Tear down co-run. Called by the framework on Back, or by the tool to
  // exit programmatically (e.g. on track-mode change).

shadow_corun_state()
  // Returns { target, id, keep_mask } or null when no co-run is active.
  // Tools poll this each frame to detect framework-driven exit and to
  // reconcile their own mirror state.
```

Enum constants are registered as JS globals: `CORUN_TARGET_NONE`,
`CORUN_TARGET_CHAIN_EDIT`, `CORUN_TARGET_MOVE_NATIVE`, plus
`CORUN_GRP_OLED` ... `CORUN_GRP_TOUCH`, `CORUN_KEEP_DEFAULT`, and
`CORUN_KEEP_BACK` (matching `shadow_constants.h`).

### Capability gate

Tools that want to ship from a single branch against both stock and patched
Schwung should gate the user-facing entry on the API's presence:

```js
const corunAvailable = typeof shadow_corun_begin === "function";
```

## View addressing — overlays over a co-run target

The two co-run *targets* above are fixed destinations a session points at for
its whole lifetime. **View addressing** is a layer on top: while a co-run is
active, a tool can ask Schwung to show one of its *other* screens — the FX
picker, Global Settings, the slots list — as a temporary **overlay**, then
return to the underlying target. The overlay borrows the OLED + the nav inputs
it needs and hands them back on close; the co-run target itself is never
changed, so the consumer tool's state machine is undisturbed.

The mechanism is **view-agnostic and upstreamable**; the *catalog* of
addressable screens varies per build (see [Catalog](#catalog) below).

### The three verbs

Defined on the global object in shadow_ui's JS runtime (same place as
`shadow_corun_begin` et al.), since shadow_ui and the overtake tool share one
QuickJS context:

```js
shadow_corun_entries()
  // Returns an array of string ids this Schwung build can open as overlays.
  // Discovery call: a tool reads this to learn the catalog and capability-gate
  // its entry points, so build divergence (fork adds a screen) is a non-issue.

shadow_corun_open(id, keep_mask, args)
  // Open the registered screen `id` as an overlay over the current co-run
  // target. Flips the OLED owner to SCHWUNG_UI and applies `keep_mask` (the nav
  // groups the overlay needs — typically jog/click/Back/Menu) WITHOUT changing
  // the co-run target, then runs the screen's enter-function. Returns false for
  // an unknown id (graceful no-op). `args` is passed to the enter-function.

shadow_corun_close()
  // Dismiss the overlay: restore the underlay's display owner (e.g. MOVE_FIRMWARE
  // for a Move-native underlay) and keep_mask. Back at the overlay's top level
  // calls this.
```

`open`/`close` are pure JS reusing the existing screen enter-functions; the only
C is one SHM helper, `shadow_corun_overlay(active, keep_mask)`, because JS can't
write `shadow_control`'s display-owner / keep_mask fields directly.
`shadow_corun_open` calls that helper, then invokes the entry's `enter(args)`.

### The registry — `CORUN_ENTRIES`

A curated table in `shadow_ui.js` mapping a stable string id to an existing
screen enter-function:

```js
// id -> { enter: fn(args), keepDefault: <mask>, overlay: bool }
const CORUN_ENTRIES = {
  slots:           { enter: () => { view = VIEWS.SLOTS; }, ... },
  chain_editor:    { enter: (a) => enterChainEdit(a.slot), ... },
  master_fx:       { enter: () => enterMasterFxSettings(), ... },
  global_settings: { enter: () => enterGlobalSettings(), ... },
  // fork-only (registered in a fork-guarded block):
  fx_picker:       { enter: () => enterFxBusPicker(), overlay: true, ... },
};
```

Entries are added one reviewed item at a time — the registry is **never**
auto-derived from the `VIEWS` enum. Most `VIEWS` entries are context-dependent
sub-views or wizard steps that require preloaded state and are not addressable
destinations; launchers (`tools` / `overtake_menu` / `store`) are deliberately
excluded. Each enter-function establishes its own prerequisite state.

### Overlay model

While an overlay is open:

- OLED owner = `SCHWUNG_UI`; shadow_ui draws the view.
- The declared `keep_mask` keeps the overlay's nav inputs at the tool process,
  where shadow_ui's `onMidi` gets first crack and routes them into the view
  (extends the chain-edit intercept with an overlay-aware branch).
- `corun.target` is **untouched** → the consumer tool still sees its original
  target via `shadow_corun_state()` and does not run its teardown.
- Back at the overlay's top level applies `shadow_corun_close()` semantics
  (restore the underlay). Back gating keeps the framework's exit-on-Back from
  ending the whole co-run while an overlay is up.

This is what lets the FX picker open over a `MOVE_NATIVE` session and return to
the same synth screen, and it generalizes to "any registered view, over any
co-run target."

### Catalog

The mechanism is upstreamable; the registered screens differ by build:

| | Upstream Schwung | dAVEBOx fork |
|---|---|---|
| Mechanism (`entries`/`open`/`close`, overlay, registry table) | ✅ ships it | same code |
| Registered screens | `slots`, `chain_editor`, `master_fx`, `global_settings` | same **+ `fx_picker`** |

Because tools discover the catalog at runtime via `shadow_corun_entries()`, a
build lacking a screen simply doesn't expose that affordance — no breakage
across the gap.

### Consumer contract

A tool that uses an overlay is expected to:

- Discover availability with `shadow_corun_entries()` and capability-gate its
  entry point on the id it wants (e.g. `'fx_picker'`).
- Pass a `keep_mask` that keeps the overlay's nav group (jog/click, Back, Menu)
  at the tool while the overlay is open — the first dAVEBOx consumer keeps the
  jog group for the whole time the FX picker is up.
- Leave its co-run target alone: opening/closing an overlay does not change
  `shadow_corun_state()`, so the tool keeps pads/steps/transport throughout, the
  same as ordinary chain-edit co-run.

## Move-firmware coupling

`CORUN_TARGET_MOVE_NATIVE` runs as a pure shim-level split: Move firmware
reads the shadow MIDI_IN buffer directly (separate process), so there's no
JS-side intercept or host-API swap to manage. `shadow_swap_display`
early-returns when `shadow_display_owner == DISPLAY_OWNER_MOVE_FIRMWARE`,
handing the OLED to Move's framebuffer while `shadow_display_mode` stays
armed.

**Why the bypass exists:** the obvious alternative — setting
`shadow_display_mode = 0` to expose Move's framebuffer — also disables the
MIDI filter at the `sh_midi` sync site, which would let the tool's pads,
step buttons, and transport leak through to Move firmware. Splitting
"session active" (`shadow_display_mode`) from "who renders"
(`shadow_display_owner`) lets us yield the OLED without tearing down input
gating.

One Move-specific accommodation lives in the shim: **CC 71-78 detents are
coalesced per audio frame** before being forwarded to Move firmware. Move
spends ~900µs per knob CC on a synth-param write plus OLED redraw; multiple
detents in a single frame stack their cost and overrun the SPI frame budget,
manifesting as sequencer stutter while the user spins a knob. The shim sums
incoming detents per knob within each frame and emits one consolidated CC,
clamped to the one-byte signed delta range (±63 — leftover spills naturally
to the next frame's accumulator). Tools that keep `CORUN_GRP_KNOBS` in their
own `keep_mask` are unaffected (knob CCs never reach Move in that case).

Per-frame collapse is the framework's contract. Tools that generate unusually
heavy concurrent MIDI traffic (e.g. simultaneous pad fire, step LEDs, and
automation lanes during transport) may still see residual stutter on very
fast knob spins because the per-frame consolidated CC plus the rest of the
tool's MIDI is enough to pressure Move's SPI window. That's a tool-side
characteristic worth documenting in the consumer's manual; pushing the
coalesce to multi-frame intervals trades knob latency for a problem most
tools won't hit.

### LED ownership

For symmetry with input routing, Move's LED writes are gated by `keep_mask`
during `CORUN_TARGET_MOVE_NATIVE`: Move's outbound CC / note-on / note-off
LED messages for any surface group the tool **keeps** (per `keep_mask`) are
stripped before reaching hardware, so the tool's own LED rendering on those
surfaces stays uncontested. Surfaces the tool **cedes** pass through —
Move's LEDs reach the buttons / pads / knob rings directly. Sysex LED writes
aren't classified by group and pass through unchanged; the framework leaves
sysex (and the palette entries it carries for knob-ring + master colors,
idx 71-79) alone.

## Single source of truth

A single predicate, `corun_event_owner(ctrl, type, d1) -> {TOOL, PEER, BOTH,
NONE}` in `shadow_constants.h`, decides which side any given control-surface
event belongs to right now. Both the sh_midi let-through filter (forward to
Move) and the forward-to-shadow_ui suppress filter (forward to tool) call this
helper and switch on the result, so the two routes cannot drift apart. Adding
a new target = extend this function; no mirror checks elsewhere.
