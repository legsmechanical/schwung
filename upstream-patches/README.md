# upstream-patches

Standalone patch artifacts for two **general Schwung features** developed on this
fork (`legsmechanical/schwung`) and intended for upstreaming to Schwung official
(`charlesvestal/schwung`). These are *not* the dAVEBOx co-run dependency — they're
mixer features that stand on their own.

- **`FEATURE-MAP.md`** — start here. Per-file ownership of the two features
  (instrument-slot FX3/FX4 vs send FX), how to tell the interwoven hunks apart,
  the commit→feature mapping, and upstream-adaptation caveats.
- **`send-fx-and-chain-fx34.consolidated.diff`** — the whole feature set as one
  diff, base → tip (`673f166c` → `88b74e61`), `src/` only.
- **`series/0001…0008-*.patch`** — the same range as the original commit series
  (with messages), `git am`-applyable onto `673f166c`.

## Regenerate

```sh
# base = fork/main immediately before the feature work
git diff 673f166c 88b74e61 -- src/ > upstream-patches/send-fx-and-chain-fx34.consolidated.diff
git format-patch 673f166c..88b74e61 -o upstream-patches/series
```

> These are **fork-relative**. Official's versions of the touched files differ
> from the fork's, so the diffs will not apply cleanly upstream — use
> `FEATURE-MAP.md` to re-implement each feature against official.
