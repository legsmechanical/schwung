# Schwung Patches (legsmechanical fork)

Local patches maintained on top of upstream Schwung to support the
[**dAVEBOx**](https://github.com/legsmechanical/schwung-davebox) tool
module on Ableton Move.

## What's here

| File | Purpose |
|------|---------|
| `seq8-local.patch` | Unified patch of all local changes vs the current upstream base. Regenerated whenever new commits land on `main`. |

## Current base

Generated against **upstream v0.9.11** (`62529d77`). The patch reapplies
cleanly onto a fresh `v0.9.11` checkout.

```sh
git checkout v0.9.11
git apply patches/seq8-local.patch
```

## What the patch contains (at a glance)

- **External MIDI isolation** — `EXT_MIDI_REMAP_BLOCK` and cable-2
  passthrough fixes so dAVEBOx's external MIDI handling doesn't crash
  Move on non-`ROUTE_MOVE` tracks.
- **Cable-2 routing** — forwarding cable-2 to Move + Schwung chain slots
  when no tool is active; removing the THRU-slot gate that was silently
  blocking re-channelization.
- **Inject-race fixes** — several `shadow_midi.c` deferrals to prevent
  `SIGABRT` in ROUTE_MOVE MIDI monitoring.
- **Chain-edit co-run** — new `shadow_control->corun_chain_edit_slot`
  field, two JS bindings (`shadow_set_corun_chain_edit` /
  `shadow_get_corun_chain_edit`), and `shadow_ui.js` plumbing that lets
  the chain editor render and accept input while a tool module is still
  loaded and ticking. Allows dAVEBOx users to edit slot patches without
  leaving the sequencer.

## Full documentation

The architecture, contract with tool modules, and per-feature commit
references live in the dAVEBOx repo:

- [**docs/SCHWUNG_PATCHES.md**](https://github.com/legsmechanical/schwung-davebox/blob/main/docs/SCHWUNG_PATCHES.md)
  — patch table with commits + descriptions, plus a "Co-run
  architecture" section covering the design, the tool-side contract,
  and known limitations.

## Regenerating the patch

After landing new commits on `main`, regenerate the unified patch:

```sh
git diff v0.9.11..main -- src/ > patches/seq8-local.patch
git add patches/seq8-local.patch
git commit -m "chore: regenerate seq8-local.patch"
```

## Why fork rather than upstream?

These changes are narrowly designed for the dAVEBOx use case and aren't
candidates for upstream as-is — see the "Why this isn't suitable for
upstream" note in the dAVEBOx-side architecture doc.
