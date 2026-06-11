# Send FX + FX-bus picker — upstream feature map

**Intended upstream PR #1.** Two post-fader send buses (A/B), each with its own FX
chain, presets, per-bus return level, per-set persistence, **plus the FX-bus
picker / generic multi-bus editor** that both this and the Move-FX PR build on.
Self-contained: the picker foundation is included here.

- **Base** (pre-FX fork state): `ab82fc58^` (`b097d29c`)
- **Tip**: `51f994aa`
- **Series**: `series/0001…0010-*.patch` (`src/`-scoped, per-commit)
- **One-file**: `send-fx.series.mbox`

> ⚠️ Fork-relative — Master FX exists upstream but its files differ; re-implement
> against official using this map. The commits are **interleaved** with co-run and
> Move-FX in fork history, so the series is an explicit commit list, not a range.

---

## What's in here (and what to exclude)

| Patch | Commit | Content | Upstream? |
|-------|--------|---------|-----------|
| 0001 | `ab82fc58` | **MIXED**: FX-bus picker + send buses + **FX3/FX4 chain slots** | picker+send **yes**; FX3/4 **NO** (fork-only) |
| 0002 | `d2107419` | generic FX-bus editor (Master + Send A/B) — the picker foundation | yes |
| 0003 | `17648598` | set-change freeze/lag fix when a Send FX editor was open | yes |
| 0004 | `7d4f7008` | send presets, per-bus return level, `ui_hierarchy` fallback | yes |
| 0005 | `8022b35f` | send per-set auto-persist + editor fixes | yes |
| 0006 | `70715d3a` | 4th send FX slot per bus (3 → 4) | yes |
| 0007 | `5288dd43` | shared send preset list + save/load fixes | yes |
| 0008 | `c851b795` | cache FX editor bypass + LFO GETs across redraws | yes |
| 0009 | `67dff474` | 4th send-slot editor + per-slot send-level persistence | yes |
| 0010 | `51f994aa` | generalize FX-overview knob editing to **all** buses + bus-keyed knob cache | yes (**shared** with move-fx) |

> **Exclude FX3/FX4** (instrument chain-slot FX expanded 2→4): it's fork daily-driver
> only. It lives **entirely inside patch 0001** — take 0001's picker + send hunks,
> drop its FX3/4 hunks (see "Telling them apart" below). Everything in 0002-0010 is
> send/picker, never FX3/4.

> **Shared picker**: 0001 (picker hunks) + 0002 + 0010 are the picker / generic
> multi-bus editor foundation, **also carried by `move-fx`**. If upstreaming both
> PRs, implement these once.

---

## Per-file ownership

| File | Notes |
|------|-------|
| `src/host/shadow_chain_types.h` | `send_a`/`send_b` per-slot send-level fields |
| `src/host/shadow_chain_mgmt.{c,h}` | `shadow_send_fx_slots[]`, send load/unload, `send_fx:` SET/GET (both handler paths), `shadow_send_return_level[]`, send `ui_hierarchy` `module.json` fallback |
| `src/host/shadow_state.c` | persist `slot_send_a/b` + `send_return_level` |
| `src/schwung_shim.c` | post-fader send accumulation + return mix (all 3 mix paths) |
| `src/shadow/shadow_ui_master_fx.mjs` | genericized into a bus-descriptor-driven editor (Master + Send A/B); bypass/LFO GET caching; **0010** generalizes the home-screen knob branch to all buses + adds a bus tag |
| `src/shadow/shadow_ui_slots.mjs` | `slot:send_a/b` settings, `getSendFxDisplayName` |
| `src/modules/chain/dsp/chain_host.c` | **MIXED** (A+B — see below) |
| `src/shadow/shadow_ui.js` | **MIXED** (A+B + the `buildKnobContextForKnob` FX-bus branch / cache) |

> `src/shadow/shadow_ui_send_fx.mjs` was added in 0001 and **deleted** in 0002 (the
> editor was genericized into `shadow_ui_master_fx.mjs`). Nets to nothing — ignore.

---

## Telling Send FX from FX3/FX4 (the fork-only part) in the MIXED files

In `chain_host.c` and `shadow_ui.js`, classify each hunk:

**Send FX / picker (this PR)** — `send_fx`, `send_a`/`send_b`, `sfx_`, `shadow_send_`,
`SEND_FX_`, `FX_BUS`, `activeFxBus`, `enterFxBusPicker`, `drawFxBusPicker`,
`enterFxBusEditor`, `return_level`, `*send*preset*`, `fxBusPresetName`,
`buildKnobContextForKnob` FX-bus branch.

**FX3/FX4 (EXCLUDE — fork-only)** —
- `chain_host.c`: `inst->fx_count`/`g_fx_count` comparisons (`> 2`, `> 3`),
  `target == "fx3"`/`"fx4"` for the **chain slot's own** FX, `MAX_AUDIO_FX` bump,
  fx3/fx4 in chain-slot knob-mapping / modulation / module-load routing.
- `shadow_ui.js`: the **chain editor's** component list + fx3/fx4 handling
  (config, patch save/load, LFO targets, module browser) for the chain slot —
  distinct from the `FX_BUS`/Master/Send editor.

> ⚠️ `chain_host.c` parses `"fx3:"/"fx4:"` in **both**. `send_fx:<bus>:fxN:`
> (`sfx_`) is Send FX; chain-slot `target`/`fx_count` routing is FX3/4. Match the
> surrounding symbol, not just `fx3`/`fx4`.

---

## Notable design points (carry upstream)

- **Send persistence is two-layer**: per-set chain files (`send_fx_<bus>_<slot>.json`
  + `send_fx_meta.json` for return levels) mirror Master-FX per-set files; presets
  are a separate **shared** store (`presets_send/`, one list for A & B).
- **`json_get_section_bounds` fix** (`chain_host.c`): anchor on the key's colon and
  only read an object when the value *is* one — else a null-valued (empty) FX slot
  grabs the next slot's object, corrupting presets. Also fixed a latent **master**
  preset bug; carry regardless of the send feature.
- **FX editor is an FX-bus component, not a chain slot**: the hierarchy param path
  (`hierEditorIsMasterFx`) builds `${component}:key` via bus-aware helpers —
  required for `send_fx:*` keys to resolve.
- **Bus-keyed knob cache** (0010): the home-screen knob-context cache must key on
  `activeFxBus.id`, or knobs leak params across buses once more than one bus uses
  the FX-overview knob path. Latent the moment a second bus exists upstream.
