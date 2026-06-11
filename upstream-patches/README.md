# upstream-patches

Standalone patch artifacts for the **general Schwung features** developed on this
fork (`legsmechanical/schwung`) and intended for upstreaming to Schwung official
(`charlesvestal/schwung`). Each feature is a self-contained bundle so it can be
re-implemented against official independently.

> ⚠️ **These are fork-relative guides, not drop-in patches.** Official's versions
> of the touched files differ from the fork's, so the diffs/series will **not**
> `git am`/`git apply` cleanly upstream. Use each bundle's `FEATURE-MAP.md` to
> re-implement the feature against official's code. The `series/` patches carry
> the real commit messages + diffs; the `*.series.mbox` is the same series as one
> file.

## Bundles → intended upstream PRs

| Bundle | Intended upstream PR | Notes |
|--------|----------------------|-------|
| **`corun/`** | **One unified co-run PR** (supersedes the stalled PR-94) | The complete co-run feature: framework (PR-94 items) + the addressable-view overlay built on top. Close PR-94 and open this as the new unified PR. |
| **`send-fx/`** | **PR #1 — Send FX + FX-bus picker** | Two post-fader send buses (A/B), each with its own FX chain/presets, + the FX-bus picker / generic multi-bus editor. **Self-contained** (carries the picker). |
| **`move-fx/`** | **PR #2 — Move-track insert FX** | Per-Move-track insert-FX mini-buses. **Self-contained** (also carries the picker), so it can be upstreamed independently of (or alongside) send-fx. |

## NOT for upstream (fork daily-driver only)

- **Instrument-slot FX3/FX4** (chain slots' own audio-FX chain expanded 2→4). This
  rides inside `send-fx/series/0001` and `move-fx/series/0001` (commit `ab82fc58`,
  which bundled it with the picker) — **exclude it** when upstreaming. Each FX
  bundle's `FEATURE-MAP.md` says exactly which hunks of `0001` are FX3/FX4 vs
  picker/send. Kept here only because it's entangled in that commit.

## The shared picker

`send-fx` and `move-fx` **both** include the FX-bus picker + generic
multi-bus editor (commits `ab82fc58` picker hunks + `d2107419`, and the all-bus
overview-knob fix `51f994aa`). If you upstream both PRs, implement the picker
foundation **once** and stack send + move on it; if you upstream only one, it's
already complete on its own.

## Regenerate

Series are per-commit `git format-patch`, `src/`-scoped (co-run also keeps
`docs/CORUN.md`). Because the features are **interleaved** in history (co-run and
FX commits alternate, and `ab82fc58` bundles picker+send+FX3/4), the series are
generated from explicit commit lists, not contiguous ranges:

```sh
# example: co-run series (run from fork tip)
for sha in <co-run SHAs in order>; do
  git format-patch -1 --start-number=$n -o upstream-patches/corun/series $sha -- src/ docs/CORUN.md
done
```

See each bundle's `FEATURE-MAP.md` for its exact commit list, base, per-file
ownership, and symbol-based hunk classification for the shared files.
