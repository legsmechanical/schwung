# Hand-off: Send FX (return effects) → upstream-ready, clean Send-FX-only branch

> Paste this whole file as the opening prompt to a fresh local Claude Code session
> running in a clone of **`legsmechanical/schwung`** (the fork — it has the working
> reference code and `upstream-patches/`). You will build and **hardware-test on a
> Move**, which the cloud session could not do.

---

## 1. Mission

Produce a **clean, self-contained "Send FX only" changeset**, hand-written against
the pre-feature base, suitable for upstreaming to **Schwung official**
(`charlesvestal/schwung`). The fork currently has this feature working, but it is
**bundled with a second, unrelated feature** (instrument-slot FX3/FX4) and sits on
top of fork-specific work (dAVEBOx co-run). The goal is to isolate **only the Send
FX feature** so it can become a focused upstream PR.

**Decision already made (do not re-litigate):** hand-write Feature B cleanly against
the base, using the existing working commits as the correctness reference — do **not**
try to mechanically subtract Feature A from the bundled commit, and do **not** carry
any FX3/FX4 / `MAX_AUDIO_FX` changes.

---

## 2. Authoritative references (all already in this repo)

- **`upstream-patches/FEATURE-MAP.md`** — READ THIS FIRST. Per-file ownership of the
  two features, the symbol-based rule for telling Feature A from Feature B in the two
  MIXED files, the commit→feature mapping, and design points to carry. It is correct
  and detailed; this hand-off summarizes and adds the upstream-readiness gaps.
- **`upstream-patches/send-fx-and-chain-fx34.consolidated.diff`** — the whole bundled
  feature set as one diff (Feature A + B). Use as a line-level reference.
- **`upstream-patches/series/0001…0008-*.patch`** — same range as individual commits.

Note: FEATURE-MAP cites the *original* series hashes (`673f166c`→`88b74e61`). In this
fork's current history the same series was re-applied as the commits below.

---

## 3. Base and scope

| | Commit | Meaning |
|---|---|---|
| **Base** | `b097d29` | Pre-feature fork state (== FEATURE-MAP's `673f166c` tree). Build against this. |
| **Clean tip** | `c851b79` | Last pure Send-FX commit. **Stop here** — everything after is NOT this feature. |

**Commit range that contains the feature** (`git log --oneline b097d29..c851b79`):

```
c851b79 perf(fx): cache FX editor bypass + LFO GETs across periodic redraws   [B]
5288dd4 feat(fx): shared send preset list + preset save/load fixes            [B]
70715d3 feat(fx): add a 4th send FX slot per bus (3 -> 4)                     [B]
8022b35 feat(fx): send FX per-set auto-persist + editor fixes                 [B]
7d4f700 feat(fx): send FX presets, per-bus return level, ui_hierarchy fallback[B]
1764859 fix(fx): set-change no longer freezes/lags when a Send FX editor open [B]
d210741 feat(fx): generic FX bus editor serving Master + Send A/B            [B]
ab82fc5 feat: FX3/FX4 chain slots, send effects (2 buses × 3 FX), FX bus picker [A+B BUNDLED]
```

**EXCLUDE entirely** (not part of Send FX):
- Feature A — instrument-slot FX3/FX4 (lives only inside `ab82fc5`; see §5).
- `2eb2030` (the `upstream-patches/` docs commit) and `78975ee` (corun param-menu) —
  unrelated; they are on top of `c851b79`.

---

## 4. Per-file implementation plan (Feature B only)

Line counts are base→clean-tip deltas; they include Feature A in the two MIXED files.

| File | Δ (B+A) | Feature B work to port |
|---|---|---|
| `src/host/shadow_chain_types.h` | +2 | Add `float send_a, send_b;` to the chain-slot struct. |
| `src/host/shadow_chain_mgmt.h` | +26 | `SEND_BUS_COUNT 2`, `SEND_FX_SLOTS 4`; `extern shadow_send_fx_slots[][]`, `extern shadow_send_return_level[]`; `static inline shadow_send_fx_bus_active(int bus)`. |
| `src/host/shadow_chain_mgmt.c` | +398 | `shadow_send_fx_slots[][]`, `shadow_send_return_level[]` defs; `shadow_send_fx_slot_load/unload`, `_unload_all`; the `send_fx:` SET handler **and** GET handler (both param paths); send `ui_hierarchy`→`module.json` fallback (mirror master's). Defaults: `send_a/send_b = 0` in `shadow_chain_defaults()`. |
| `src/host/shadow_state.c` | +74 | Persist/load `slot_send_a`, `slot_send_b`, `send_return_level` (clamped; missing key ⇒ keep defaults). Mirror the existing per-slot array style. |
| `src/schwung_shim.c` | +59 | RT mix: `accumulate_sends()` post-fader tap per active slot in **all three** mix paths; per-bus return loop (clamp→`process_block` per non-bypassed FX→sum at `return_level` into `me_full`+`me_unity`, plus mailbox under `rebuild_from_la`); add `any_send_fx` to the fast-path bypass guard. |
| `src/shadow/shadow_ui_slots.mjs` | +29 | `slot:send_a` / `slot:send_b` settings rows + `getSendFxDisplayName`. |
| `src/shadow/shadow_ui_master_fx.mjs` | +67/−38 | The genericization: a **bus-descriptor-driven** editor serving Master + Send A/B; bypass/LFO GET caching. |
| `src/modules/chain/dsp/chain_host.c` | +597 (MIXED) | **Feature B parts only:** `send_fx:<bus>:fxN:*` parse; send presets (`PRESETS_SEND_DIR "/data/UserData/schwung/presets_send"`, `MAX_SEND_PRESETS 64`, `scan/save/update/delete/load_send_preset`, `build_send_preset_json`); GET keys `send_preset_count` / `send_preset_name_<i>` / `send_preset_json_<i>`; SET keys `save/update/delete_send_preset`. **Carry the `json_get_section_bounds` fix regardless** (see §6). |
| `src/shadow/shadow_ui.js` | +629 (MIXED) | **Feature B parts only:** `FX_BUS` descriptors (master/sendA/sendB), `SEND_FX_COMPONENTS_A/B` with `paramPrefix: "send_fx:a:fxN:"`, `activeFxBus`, `fxBusPresetName`, `enterFxBusEditor`, `drawFxBusPicker` (`VIEW.FX_BUS_PICKER`), `saveSendFxChainConfig`/`restoreSendFxFromFiles`, per-set send persistence. |

**Working method:** for each file, `git show c851b79:<path>` (or diff `b097d29 c851b79 -- <path>`)
as the reference, then re-create the Send-FX hunks against the base file, omitting any
Feature A hunk. In the two MIXED files, classify every hunk with §5 before keeping it.

---

## 5. Feature A — DO NOT CARRY (exclusion rules)

Feature A = expanding each **chain (instrument) slot's** own audio-FX chain from 2→4.
It is heavily entangled (`MAX_AUDIO_FX` bumped 2→4, ~245 ref sites in `chain_host.c`,
~70 in `shadow_ui.js`). Skip all of it. Identify A by symbol:

- `chain_host.c`: `MAX_AUDIO_FX` value bump; `inst->fx_count`/`g_fx_count` `> 2`/`> 3`
  comparisons; `target == "fx3"/"fx4"` for the **chain slot**; fx3/fx4 in the chain
  slot's knob-mapping / modulation-target / component_ui_mode / module-load routing.
- `shadow_ui.js`: the **chain editor's** component list and its fx3/fx4 handling
  (config, patch save/load, LFO targets, display-name polling, module browser).

⚠️ Both features contain `"fx3:"/"fx4:"` string parses. The `send_fx:<bus>:fxN:` /
`sfx_` parser is **Feature B (keep)**; the chain-slot `target`/`fx_count` routing is
**Feature A (drop)**. Match on the surrounding symbol, not just `fx3`/`fx4`.

Feature B does **not** depend on A (it uses its own `SEND_FX_SLOTS`/`shadow_send_fx_slots[]`),
so dropping A must not break B.

---

## 6. Design points to preserve (from FEATURE-MAP §"Notable design points")

- **Two-layer persistence:** per-set chain files (`send_fx_<bus>_<slot>.json` +
  `send_fx_meta.json` for return levels) mirror Master-FX per-set files; presets are a
  separate **shared** store (`presets_send/`, one list for both A & B).
- **`json_get_section_bounds` fix** (`chain_host.c`): anchor on the key's colon and
  only read an object when the value *is* one — otherwise a null-valued (empty) FX slot
  grabs the next slot's object, corrupting presets with gaps. This also fixes a latent
  **master**-preset bug — carry it regardless.
- **Send `ui_hierarchy` GET must fall back to `module.json`** (like master's), or
  modules that declare their hierarchy in `module.json` but not via live `get_param`
  (e.g. dissolver) can't open their param editor on a send.
- **FX editor is an FX-bus component, not a chain slot:** the hierarchy-editor param
  path builds `${component}:key` via bus-aware helpers, required to resolve `send_fx:*`.

---

## 7. Upstream-readiness gaps to CLOSE (from the cloud-session assessment)

These are the reasons the feature was judged "code is good, but not yet PR-ready."

**A. Documentation — the main blocker (CLAUDE.md Release Checklist item 4).** None of
these currently mention Send FX; update them:
- `MANUAL.md` — user-facing: send buses A/B, per-slot send level, per-bus return level,
  the FX bus picker, send presets, and how to reach them.
- `docs/API.md` — the `send_fx:<bus>:fxN:*` and `send_fx:<bus>:return_level` param
  namespace; new persistence keys (`slot_send_a/b`, `send_return_level`).
- `docs/MODULES.md` / `CLAUDE.md` architecture — where Send FX sits in the gain
  staging / shadow mix, and the `presets_send/` + per-set send file layout.
- Add a `docs/plans/<date>-send-fx-design.md` design doc (comparable features have one,
  e.g. `docs/plans/2026-03-12-master-fx-lfo.md`) — upstream review will expect rationale.

**B. Code nits (small, do during the port):**
1. `shadow_state.c` uses `extern float shadow_send_return_level[2]` — tie the `2` to
   `SEND_BUS_COUNT` (comment or static_assert) so it can't drift.
2. `schwung_shim.c` rebuild-mode return loop recomputes `lroundf(send_buf[i]*rl)` twice
   — hoist into one local. Micro-perf only.
3. `shadow_send_fx_bus_active()` ignores `bypassed`, so a bus with all FX bypassed
   still returns the dry accumulated send at `return_level`. "Bypass = passthrough" is
   defensible — make it intentional and document it.

**C. Version / catalog:** bump `src/host/version.txt`; check whether
`module-catalog.json` `min_host_version` needs to move for anything depending on sends.

---

## 8. RT-safety constraints (CLAUDE.md "Realtime Safety")

- The send mix runs in `shadow_inprocess_mix_from_buffer()` — this is **post-ioctl**,
  the same context where Master FX already calls `process_block`, so calling send-FX
  `process_block` there is consistent. Keep it that way.
- In the accumulator / mix path: **no** `unified_log()`, `fprintf`, `fopen`, file I/O,
  allocation, or non-RT locks. Use stack buffers and int16 clamping (as the reference does).
- Send-FX slot load/unload (`dlopen`/`dlclose`/`destroy_instance`) happens on the param
  thread, read in the mix path — this inherits Master FX's existing lockless model. Do
  not add new sharing beyond that pattern. Flag it in the PR as a known assumption.
- Verify gain staging under `rebuild_from_la` + **Latency Comp** on hardware: returns
  are added to the mailbox at unity, pre-MFX, before master volume is applied in that path.

---

## 9. Build & test

```bash
./scripts/build.sh                                          # Docker cross-compile (ARM64)
./scripts/install.sh local --skip-modules --skip-confirmation   # deploy to Move; never scp files
ssh ableton@move.local "touch /data/UserData/schwung/debug_log_on"
ssh ableton@move.local "tail -f /data/UserData/schwung/debug.log"
```

**Hardware test checklist:**
- Set a slot's Send A/B level > 0; confirm wet return is audible and tracks the slot fader (post-fader).
- Per-bus return level scales the return; `return_level = 0` mutes the return.
- Load/save/update/delete a send preset; presets shared across A & B (`presets_send/`).
- Per-set persistence: switch sets, send FX + levels restore; bypass per FX works.
- Master volume tracking, including with **Latency Comp ON** (`rebuild_from_la`).
- Regression: confirm the **chain (instrument) slots still only show 2 audio-FX slots**
  (Feature A correctly absent) and patches/presets load without gaps.

---

## 10. Suggested branch & commit plan

1. `git checkout -b send-fx-upstream b097d29`
2. Port Feature B file-by-file per §4 (host C first, then shim RT path, then JS UI),
   building between logical groups.
3. Apply the §7B nits as you go.
4. Separate commits, e.g.: `feat(fx): send buses A/B with per-bus FX chain`,
   `feat(fx): send presets (shared store) + per-set persistence`,
   `feat(fx): generic FX-bus editor (Master + Send A/B)`,
   `fix(fx): json_get_section_bounds null-slot fix`, `docs: send FX`.
5. Verify `git diff b097d29..send-fx-upstream` contains **zero** Feature A symbols
   (`MAX_AUDIO_FX` change, chain-slot fx3/fx4) — grep to confirm.
6. Build, hardware-test (§9), then open the PR against `charlesvestal/schwung` —
   noting (as FEATURE-MAP says) that fork-relative diffs won't apply cleanly, so this is
   re-implemented against official's files.

---

## 11. Constants quick-reference

- `SEND_BUS_COUNT = 2` (A, B); `SEND_FX_SLOTS = 4` per bus.
- Param namespace: `send_fx:a|b:fx1..4:<module|bypassed|param>`, `send_fx:a|b:return_level`.
- Per-slot send: `slot:send_a`, `slot:send_b` (0.0–1.0). Return level default `1.0`.
- Presets: `/data/UserData/schwung/presets_send/`, `MAX_SEND_PRESETS = 64`.
- Per-set files: `send_fx_<bus>_<slot>.json`, `send_fx_meta.json`.
- Persisted state keys: `slot_send_a[4]`, `slot_send_b[4]`, `send_return_level[2]`.
