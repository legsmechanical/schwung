# Schwung Patches (legsmechanical fork)

Local patches maintained on top of upstream Schwung to support the
[**dAVEBOx**](https://github.com/legsmechanical/schwung-davebox) tool
module on Ableton Move.

## What's here

| File | Purpose |
|------|---------|
| `davebox-local.patch` | Unified patch of all local changes vs the current upstream base. Regenerated whenever new commits land on `main`. |

## Current base

Generated against **upstream v0.9.13** (`ef51938b`). The patch reapplies
cleanly onto a fresh `v0.9.13` checkout.

```sh
git checkout v0.9.13
git apply patches/davebox-local.patch
```

## What the patch contains (at a glance)

The patch is now narrowly scoped to the **co-run features** — earlier
inject-race, `EXT_MIDI_REMAP_BLOCK`, and cable-2 routing patches were
upstreamed into Schwung v0.9.13 (PRs #76 / #77 / #78 plus maintainer
follow-up `62a04135`) and are no longer carried locally.

- **Chain-edit co-run** — new `shadow_control->corun_chain_edit_slot`
  field, two JS bindings (`shadow_set_corun_chain_edit` /
  `shadow_get_corun_chain_edit`), and `shadow_ui.js` plumbing that lets
  the chain editor render and accept input while a tool module is still
  loaded and ticking. Allows dAVEBOx users to edit slot patches without
  leaving the sequencer.
- **Move-native co-run** — sibling feature: new `corun_move_native_track`
  field, two JS bindings (`shadow_set_corun_move_native` /
  `shadow_get_corun_move_native`), and shim-side input/display split so
  Move firmware's preset browser and device-edit pages render alongside
  a tool keeping pads + transport. Lets dAVEBOx users audition presets
  against the playing pattern.

## Full documentation

The architecture, contract with tool modules, and per-feature commit
references live in the dAVEBOx repo:

- [**docs/SCHWUNG_PATCHES.md**](https://github.com/legsmechanical/schwung-davebox/blob/main/docs/SCHWUNG_PATCHES.md)
  — patch table with commits + descriptions, plus "Co-run architecture"
  and "Move-native co-run architecture" sections covering design,
  tool-side contract, and known limitations.

## Regenerating the patch

After landing new commits on `main`, regenerate the unified patch:

```sh
git diff v0.9.13..main -- src/ > patches/davebox-local.patch
git add patches/davebox-local.patch
git commit -m "chore: regenerate davebox-local.patch"
```

## Why fork rather than upstream?

These changes are narrowly designed for the dAVEBOx use case and aren't
candidates for upstream as-is — see the "Why this isn't suitable for
upstream" note in the dAVEBOx-side architecture doc.
