# Send FX + Instrument-slot FX3/FX4 — upstream feature map

Generated from `legsmechanical/schwung` (fork) for adapting these features to
**Schwung official** (`charlesvestal/schwung`).

- **Base** (pre-feature fork state): `673f166c`
- **Tip**: `88b74e61`
- **Consolidated diff**: `send-fx-and-chain-fx34.consolidated.diff` (base → tip, all files)
- **Commit series**: `series/0001…0008-*.patch` (same range, with messages)

> ⚠️ **Upstream caveat.** These diffs are *fork-relative*. All touched files exist
> in official, but official's versions differ from the fork's `673f166c`, so the
> diffs will **not apply cleanly** to official — use this map to re-implement each
> feature against official's code. Treat it as a guide, not a drop-in patch.

---

## The two features

This work bundles **two independent features**. They do not depend on each other
(send FX uses its own `shadow_send_fx_slots[]`; it does not require the chain-slot
FX expansion), so either can be upstreamed alone.

### Feature A — Instrument-slot FX3/FX4 (chain slots 2 → 4 FX)
Expands each chain (instrument) slot's audio-FX chain from 2 slots to 4.

### Feature B — Send FX (2 send buses A/B, each up to 4 FX) + FX bus picker
Post-fader sends from each chain slot to two return buses, each with its own FX
chain, presets, per-bus return level, per-set persistence, and a Master/Send FX
bus picker. This is the bulk of the diff.

---

## Per-file ownership

| File | Feature(s) | Notes |
|------|-----------|-------|
| `src/host/shadow_chain_types.h` | **B** | `send_a`/`send_b` per-slot send-level fields |
| `src/host/shadow_chain_mgmt.{c,h}` | **B** | `shadow_send_fx_slots[]`, send load/unload, `send_fx:` SET/GET (both handler paths), `shadow_send_return_level[]`, send `ui_hierarchy` module.json fallback |
| `src/host/shadow_state.c` | **B** | persist `slot_send_a/b` + `send_return_level` |
| `src/schwung_shim.c` | **B** | post-fader send accumulation + return mix (all 3 mix paths) |
| `src/shadow/shadow_ui_master_fx.mjs` | **B** | genericized into a bus-descriptor-driven editor (Master + Send A/B); bypass/LFO GET caching |
| `src/shadow/shadow_ui_slots.mjs` | **B** | `slot:send_a/b` settings, `getSendFxDisplayName` |
| `src/modules/chain/dsp/chain_host.c` | **A + B** | **MIXED** — see below |
| `src/shadow/shadow_ui.js` | **A + B** | **MIXED** — see below |

> `src/shadow/shadow_ui_send_fx.mjs` was added in commit 0001 and **deleted** in
> 0002 (the editor was genericized into `shadow_ui_master_fx.mjs`). It nets to
> nothing in the consolidated diff — ignore it for upstreaming.

---

## Telling the two features apart in the MIXED files

In `chain_host.c` and `shadow_ui.js`, classify each hunk by symbol:

**Feature B (Send FX)** — anything matching:
`send_fx`, `send_a`/`send_b`, `sfx_`, `shadow_send_`, `SEND_FX_`, `FX_BUS`,
`activeFxBus`, `enterFxBusEditor`, `drawFxBusPicker`, `*send*preset*`,
`build_send_preset_json`, `scan_send_presets`, `return_level`,
`saveSendFxChainConfig`, `restoreSendFxFromFiles`, `fxBusPresetName`.

**Feature A (Instrument FX3/FX4)** — anything matching:
- `chain_host.c`: `inst->fx_count` / `g_fx_count` comparisons (`> 2`, `> 3`),
  `target == "fx3"`/`"fx4"` (chain-slot FX targets), MAX_AUDIO_FX bump,
  fx3/fx4 in knob-mapping / modulation-target / component_ui_mode / module-load
  routing for the **chain slot's own** FX.
- `shadow_ui.js`: the chain editor's component list and its fx3/fx4 handling
  (config, patch save/load, LFO targets, display-name polling, module browser)
  for the **chain slot** — distinct from the `FX_BUS`/Master/Send editor.

> ⚠️ Watch out: `chain_host.c` has `"fx3:"/"fx4:"` string parses in **both**
> features. The `sfx_slot` send-slot parser (`send_fx:<bus>:fxN:`) is Feature B;
> the chain-slot `target`/`fx_count` routing is Feature A. Match on the
> surrounding symbol (`sfx_`/`send_fx` ⇒ B), not just `fx3`/`fx4`.

---

## Commit series → feature

| Patch | Commit | Feature |
|-------|--------|---------|
| 0001 | `ee0acc86` FX3/FX4 chain slots + send effects + picker | **A + B** (bundled — the only mixed commit) |
| 0002 | `20e38fca` generic FX bus editor (Master + Send A/B) | B |
| 0003 | `e3aa8dfc` set-change crash/lag fix | B |
| 0004 | `24639a4c` send presets, per-bus return level, ui_hierarchy fallback | B |
| 0005 | `4880b6f2` send per-set auto-persist + dissolver + picker-Back | B |
| 0006 | `cd8ff4ea` 4th send FX slot per bus (3 → 4) | B |
| 0007 | `c719a9a7` shared send preset list + preset save/load fixes | B |
| 0008 | `88b74e61` cache FX editor bypass + LFO GETs | B |

So **Feature A lives entirely inside patch 0001**; everything else is Feature B.
To extract Feature A alone: take only the `fx_count`/`target`/chain-editor hunks
from patch 0001. To extract Feature B alone: take patch 0001's send hunks +
patches 0002–0008 in full.

---

## Notable design points worth carrying upstream

- **Send FX persistence is two-layer**: per-set chain files (`send_fx_<bus>_<slot>.json`
  + `send_fx_meta.json` for return levels) mirror the Master-FX per-set files;
  presets are a separate **shared** store (`presets_send/`, one list for A & B).
- **`json_get_section_bounds` fix** (chain_host.c): must anchor on the key's colon
  and only read an object when the value *is* one — otherwise a null-valued (empty)
  FX slot grabs the next slot's object, corrupting presets with gaps. This also
  fixed a latent bug in **master** presets; carry it regardless of the send feature.
- **Send `ui_hierarchy` GET** must fall back to `module.json` (like master's), or
  modules that declare their hierarchy there but not via live `get_param`
  (e.g. dissolver) can't open their param editor on a send.
- **FX editor is an FX-bus component, not a chain slot**: the hierarchy editor
  param engine path (`hierEditorIsMasterFx`) builds `${component}:key` and uses
  bus-aware helpers — required for send param editing to resolve `send_fx:*` keys.
