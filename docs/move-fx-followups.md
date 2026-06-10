# Move FX — known follow-ups

Tracked, intentionally-deferred items for the Move-track channel-strips / Move FX
feature (Move>Slot toggle + per-channel Move FX slots). None is an active bug in
live audio. All apply to **both** the upstream 2-effect build (`MOVE_FX_BLOCKS=2`)
and the fork 4-effect build (`MOVE_FX_BLOCKS=4`).

## Design rule (do not "fix")

The Move FX strip is **fully independent** of the synth slot on the same channel —
that independence is the entire point of Move>Slot. The Move FX strip uses its own
volume only; it is deliberately **not** gated by the synth slot's mute/solo/fade.
(A review pass once coupled them; that was reverted.) To silence a Move track, use
the Move FX strip's own volume, or Move's native track mute.

## Deferred — correctness (capture-only, pre-existing)

- **Resample double-count under `rebuild_from_la`.** When Sample Src = "Schwung Mix"
  (`NATIVE_RESAMPLE_BRIDGE_OVERWRITE`) and **no Master FX** is loaded, the bridge
  reconstructs the capture as `Move-audio ÷ master-vol + Schwung-ME-bus`
  (`shadow_resample.c:457-468`). A routed Move track appears in **both** terms (in
  Move's audio and, via Move FX, in `me_full`), so it is summed twice (~+6 dB /
  clip) in the capture only. **Never affects live audio**, and **does not** affect
  Schwung's own Quantized Sampler or Skipback (those read the clean `unity_view`
  snapshot). Only Move's native Sample/resample via the Schwung-Mix bridge.
  - Pre-existing: also triggers with the default **Move>Slot=On** (synth+Move
    summed into `me_full`). Move>Slot=Off just adds another trigger.
  - Workarounds: load any Master FX (flips to the clean copy path), or set
    Sample Src = "Native".
  - Gate: `shadow_master_fx_chain_active()` (`shadow_chain_mgmt.h`) ignores Move/send
    FX slots.
  - Proper fix (when wanted): under `rebuild_from_la`, skip the `move + ME`
    reconstruction and use the already-clean `unity_view` src — fixes both On and
    Off, removes the disjoint-halves assumption.

## Deferred — design / altitude (latent; would bite a future change)

- **`hierEditorIsMasterFx` overloaded for Move FX.** The Move FX param editor reuses
  the Master-FX "is master" flag for key construction. A future master-only action
  gated on that flag (e.g. assign-to-Master-LFO, which Move buses lack) would become
  reachable from the Move FX editor. A dedicated `hierEditorFxBusId` would be cleaner.
- **ME-N per-slot publish.** With Move>Slot=Off on an active slot, ME channel N
  publishes synth-only (the Move track is excluded from that per-slot Link Audio
  channel). Documented limitation; only matters to a downstream ME-N consumer.

## Deferred — cleanup (no behavior change)

- **Divergent duplicate `move_fx:` key parser.** The slot/block/strip-level parse
  exists in both `shadow_direct_set_param` and `shadow_inprocess_handle_param_request`
  (`shadow_chain_mgmt.c`), written *differently*. Factor a shared
  `parse_move_fx_key()`.
- **Loaders + save/restore are near-verbatim Send FX clones.** `shadow_move_fx_slot_load`
  (~108 lines) mirrors `shadow_send_fx_slot_load`; `saveMoveFxChainConfig` /
  `restoreMoveFxFromFiles` mirror the send versions; `getMoveFxDisplayName` mirrors
  `getSendFxDisplayName`. Idiomatic (master→send already clones), but the loader is
  the strongest shared-helper candidate.

## Deferred — latent robustness / single-sourcing (fine at current constants)

- **Slot/block counts not single-sourced.** `MOVE_FX_SLOTS` (C),
  `MOVE_FX_SLOTS_JS` + `MOVE_FX_BLOCKS_JS` (`shadow_ui.js`), `MOVE_FX_SLOT_ROWS`
  (`shadow_ui_slots.mjs`), and a hardcoded `i <= 4` in `getMoveFxDisplayName`. Raising
  the count touches several spots, not a single `#define`.
- **`fxN` parser is single-digit** — breaks if `MOVE_FX_BLOCKS > 9`.
- **`s < MOVE_FX_SLOTS` couples to `SHADOW_CHAIN_INSTANCES`** — a Move>Slot=Off track
  on a high slot would drop if those constants ever diverge (both 4 today).

## Deferred — minor UX

- **FX bus *picker* shows blank** for Move (and Send) rows, though
  `getMoveFxDisplayName` exists and the *slots list* uses it — so the picker can't
  show which Move buses are populated. Cheap to wire up.
