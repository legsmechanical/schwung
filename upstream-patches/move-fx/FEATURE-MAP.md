# Move-track insert FX — upstream feature map

**Intended upstream PR #2.** Per-Move-track insert-FX mini-buses — each Move track
(channel) gets its own audio-FX insert chain, surfaced in the FX-bus picker beside
the sends. **Self-contained**: includes the FX-bus picker / generic multi-bus
editor foundation, so it can be upstreamed independently of (or alongside) the
Send-FX PR.

- **Base** (pre-FX fork state): `ab82fc58^` (`b097d29c`)
- **Tip**: `51f994aa`
- **Series**: `series/0001…0007-*.patch` (`src/`-scoped, per-commit)
- **One-file**: `move-fx.series.mbox`

> ⚠️ Fork-relative — re-implement against official using this map. The commits are
> interleaved with co-run and send-fx in fork history; this is an explicit list.

---

## What's in here

| Patch | Commit | Content | Notes |
|-------|--------|---------|-------|
| 0001 | `ab82fc58` | **MIXED**: FX-bus picker + send buses + FX3/FX4 | take **only the picker hunks** — drop send + FX3/4 |
| 0002 | `d2107419` | generic FX-bus editor (Master + Send A/B) — picker foundation | shared |
| 0003 | `08172e31` | **Move-track channel strips — independent Move FX slots** | the core feature |
| 0004 | `ab5ec6da` | raise Move FX to 4 insert blocks per slot | |
| 0005 | `baff3258` | Move FX mute/solo, idle gating, per-set strip reset | |
| 0006 | `f9ea099b` | keep Move FX strip independent of synth-slot mute/solo | |
| 0007 | `51f994aa` | generalize FX-overview knob editing to **all** buses + bus-keyed cache | shared with send-fx |

> **Shared foundation**: 0001 (picker hunks) + 0002 + 0007 are the FX-bus picker /
> generic editor, **also in `send-fx`**. If upstreaming both PRs, implement the
> picker **once** and stack Move-FX (0003-0006) on it. The move buses are built
> programmatically into the same `FX_BUS` registry the picker iterates.
>
> **Not in the series**: `96073458` (docs: "Move FX known follow-ups") — a tracking
> note with no `src/` changes. Its deferred items are worth a glance before
> finalizing the PR, but there's no code to port.

---

## Per-file ownership

| File | Notes |
|------|-------|
| `src/host/shadow_chain_types.h` | Move-FX per-slot fields |
| `src/host/shadow_chain_mgmt.{c,h}` | Move-FX insert slots: load/unload, `move_fx:<slot>:fxN:` SET/GET, per-strip state |
| `src/host/shadow_state.c` | per-set Move-FX strip persistence |
| `src/schwung_shim.c` | Move-track insert-FX processing in the mix path; mute/solo + idle gating |
| `src/shadow/shadow_ui_master_fx.mjs` | the generic editor renders Move buses (same bus-descriptor path as Master/Send); **0007** all-bus knob branch |
| `src/shadow/shadow_ui_slots.mjs` | Move-FX strip display/settings |
| `src/shadow/shadow_ui.js` | the `FX_BUS` registry's programmatic Move buses (`for mvSlot … FX_BUS["moveFx"+n]`), `enterMoveFxHierarchyEditor`, picker entries for Move slots |
| `src/modules/chain/dsp/chain_host.c` | (picker-hunk only, via 0001) |

`shadow_ui.js` / `schwung_shim.c` / `chain_host.c` are **shared**. Symbols:

**Move FX (this PR)**: `move_fx`, `moveFx`, `MOVE_FX`, `isMoveFx`, `moveSlot`,
`MOVE_FX_BLOCKS_JS`, `MOVE_FX_SLOTS_JS`, `enterMoveFxHierarchyEditor`, "Move FX"
strip / mute / solo.

**Picker foundation (shared, keep)**: `FX_BUS`, `FX_BUS_PICKER`, `enterFxBusPicker`,
`drawFxBusPicker`, `activeFxBus`, the generic bus editor, `buildKnobContextForKnob`
FX-bus branch + cache.

**Send FX (leave for send-fx PR)**: `send_fx`, `send_a`/`send_b`, `sfx_`,
`shadow_send_`, `return_level`, `*send*preset*`.

**FX3/FX4 (EXCLUDE — fork-only)**: chain-slot `fx_count`/`target=="fx3"/"fx4"`,
`MAX_AUDIO_FX`, chain-editor fx3/4 — only in 0001; not needed for Move FX.

---

## Notable design points

- **Move buses are built programmatically** (`for mvSlot in 1..MOVE_FX_SLOTS_JS`)
  into the same `FX_BUS` map the picker/editor iterate, with per-component
  `paramPrefix = "move_fx:<slot>:fxN:"`. Raising `MOVE_FX_BLOCKS_JS` needs no
  further UI edits — the generic editor adapts.
- **Audio-FX-only mini-buses**: no presets/LFO; the settings page exposes volume +
  Send A/B routing. Move-FX strips are kept **independent of the synth slot's
  mute/solo** (0006) and idle-gated (0005) so an unused strip costs nothing.
- **Depends on the generic FX-bus editor** (Feature from send-fx). Move FX is "add
  more buses to the picker", so it cannot land upstream without the picker — hence
  the picker is bundled here too.
