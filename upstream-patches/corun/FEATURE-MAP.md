# Co-run — upstream feature map

The complete **co-run** feature (an overtake tool shares the Move surface with a
second Schwung UI), for adapting to **Schwung official**. This is the basis for a
**single unified co-run PR** that **supersedes the stalled PR-94** — it carries
the PR-94 framework plus the addressable-view overlay built on top of it.

- **Base** (pre-co-run fork state): `678faae6^` (`759095a6`)
- **Tip**: `b6df6eff`
- **Series**: `series/0001…0019-*.patch` (`src/` + `docs/CORUN.md`, per-commit)
- **One-file**: `corun.series.mbox`

> ⚠️ Fork-relative — re-implement against official using this map, don't `git am`.

---

## Two layers (both belong in the one unified PR)

### Layer 1 — Co-run framework (the PR-94 work)
The host-side mechanism: a tool declares a co-run session; the host splits the
control surface (a `keep_mask` of `CORUN_GRP_*` groups), routes OLED ownership
(`shadow_display_owner`), and exposes `shadow_corun_begin/end/state` to JS.

| Patch | Commit | What |
|-------|--------|------|
| 0001 | `678faae6` | overtake co-run base — share the surface with a second UI |
| 0002 | `220fb001` | collapse to single predicate + `shadow_control.corun` struct + JS API; split `shadow_display_mode` (PR-94 items 1-4) |
| 0003 | `52b52ebe` | Back exits co-run + `CORUN_KEEP_BACK` opt-out (PR-94 item 5) |
| 0004 | `28fb0162` | CC 71-78 per-frame detent coalesce for `move_native` (PR-94 item 6) |
| 0005 | `747fa302` | framework reference `docs/CORUN.md` (PR-94 item 7) |
| 0006 | `7af5a1c5` | chain-edit auto-exits on Back at top-level view |
| 0007 | `b813a933` | `keep_mask`-driven LED strip for `move_native` (was hardcoded) |
| 0008 | `21c3382f` | defensively clear corun state on all tool teardown paths |
| 0009 | `78975ee4` | open preset-less / no-hierarchy modules to a param menu |

### Layer 2 — Addressable-view overlay (built on the framework)
Lets a co-running tool open a **registered** Schwung screen as a temporary
**overlay** over its co-run target and return — the mechanism dAVEBOx uses to open
the FX-bus picker from Move co-run, generalized so any tool can address any
registered view.

| Patch | Commit | What |
|-------|--------|------|
| 0010 | `4f032a53` | addressable-view registry + `shadow_corun_entries()` |
| 0011 | `1712248c` | `shadow_corun_overlay(active, keep_mask)` SHM helper (display owner + mask, **target untouched**) |
| 0012 | `7ea630ca` | `shadow_corun_open/close` overlay verbs |
| 0013 | `52496d18` | route overlay nav in dispatcher + `FX_BUS_PICKER` Back closes overlay |
| 0014 | `e9e9a700` | let Back close overlay before the suspend-keeps-js guard |
| 0015 | `5f4ca5b7` | docs: view-addressing mechanism |
| 0016 | `34585fb9` | restore underlay view on overlay close |
| 0017 | `96381eb7` | **refactor**: overlay reuses the chain-edit dispatch (`coRunView`), not a parallel router — keep `view = OVERTAKE_MODULE`, draw via `coRunView`, so the tool stays addressable (Step-3 exit + LEDs work for free) |
| 0018 | `33c5229e` | docs: final model |
| 0019 | `b6df6eff` | **`coRunWants()`** — one uniform rule for every UI-element intercept guard: an overlay handles exactly the groups the tool KEEPS (chain-edit handles what it CEDES). No per-element special-casing |

> Layers 0010-0019 supersede the earlier ad-hoc approach: read **0017 + 0019**
> for the final architecture; 0013/0014/0016 are intermediate fixes folded into it.

---

## Per-file ownership

| File | Role |
|------|------|
| `src/host/shadow_constants.h` | `corun` struct (target/id/keep_mask + reserved), `CORUN_GRP_*` group bits, `CORUN_TARGET_*`, `shadow_display_owner` enum, `corun_group_for_event`/`corun_event_owner` |
| `src/schwung_shim.c` | the input split — `corun_event_owner` routing, `move_native` suppress-to-peer, Back framework-exit, knob detent coalesce |
| `src/host/shadow_led_queue.c` | co-run LED strip (keep_mask-driven) |
| `src/shadow/shadow_ui.c` | JS bindings: `shadow_corun_begin/end/state` + `shadow_corun_overlay` (the overlay SHM helper) |
| `src/shadow/shadow_ui.js` | **the bulk** — the `onMidi` dispatcher co-run intercept (`coRunUiActive()`/`coRunWants()`/`runCoRunChainEdit`/`coRunView`), the addressable-view registry + `shadow_corun_open/close/entries`, overlay open/close + teardown reconcile |
| `docs/CORUN.md` | framework + view-addressing reference (carry upstream as-is) |

`shadow_ui.js` and `schwung_shim.c` are **shared with the FX bundles**. Classify
each hunk by symbol:

**Co-run** (this feature): `corun`, `coRun`, `CORUN_`, `coRunView`, `coRunWants`,
`coRunUiActive`, `runCoRunChainEdit`, `corunOverlay`, `shadow_corun_*`,
`shadow_display_owner`, `move_native`/`MOVE_NATIVE`, `CORUN_GRP_*`,
`CORUN_TARGET_*`, `keep_mask`, `OVERTAKE_MODULE` co-run handling.

**NOT co-run** (belongs to send-fx/move-fx — leave for those bundles): `send_fx`,
`activeFxBus`, `FX_BUS`, `enterFxBusPicker`, `move_fx`, `moveFx`, etc.

---

## Upstream-adaptation caveats

- **Drop the fork-only registry entry.** The addressable-view registry
  (`CORUN_ENTRIES`, patch 0010) registers `slots` / `chain_editor` / `master_fx` /
  `global_settings` (all upstream-available) **plus** a fork-guarded `fx_picker`
  entry (`if (typeof enterFxBusPicker === 'function')`). `fx_picker` depends on the
  FX-bus picker (a *separate* PR) — **omit it** from the co-run PR; the guard
  already makes it a no-op on builds without the picker.
- **`coRunView` already exists upstream** for the chain editor — the overlay layer
  generalizes the same mechanism (don't re-invent it). The key invariant: the
  outer `view` stays `OVERTAKE_MODULE` so the tool keeps getting pads/steps/
  transport + paints its own LEDs; `coRunView` holds whatever shadow_ui draws.
- **`coRunWants(grp)`** (0019) is the clean generalization worth carrying: chain-edit
  handles the groups the tool *cedes*; an overlay handles the groups the tool
  *keeps*. One predicate drives every guard.
