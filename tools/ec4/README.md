# Faderfox EC4 support: bench tools

Probe first. Nothing in Schwung drives an EC4 yet. These tools answer the
questions that decide whether it can, and how.

## Sources, and how far each is trusted

| fact | source | status |
|---|---|---|
| setup dump format (addresses, 3-byte nibble encoding, page CRC, padding) | `privatepublic-de/faderfox-editor`, `doc/faderfox sysex data format EC4 V2.txt` | verified: `ec4_setup.py` round-trips the factory dump byte for byte, and parses DrivenByMoss's shipped setup |
| live SysEx: text pages, overlay show/hide, setup/group request, key reports | Faderfox_Universal_2 (Faderfox's Ableton script) **and** DrivenByMoss (`controller/faderfox/ec4`) | two independent implementations agree byte for byte; **not yet seen on hardware** |
| host text shows only where the stored encoder name is `----` | EC4 Manual V03, "Ableton Live Setups" | documented |
| text works outside setups 13–16 | DrivenByMoss uses setup 1 by default | the 13–16 gate in Faderfox's script is the script's own (`DEVICE_DISPLAY_SETUPS`); **untested** |
| incoming MIDI updates encoder values and the display | manual, "Controller mode" | documented; whether it applies to relative types is **untested** |
| SysEx both ways over Move's USB-A | — | **unknown**; see `docs/E16_REMOTE.md`, "The USB-A limitation" |

The wire format is written up in the header of `src/shared/ec4_protocol.mjs`,
and `tests/host/test_ec4_protocol.sh` pins it to vectors copied from both
references.

## ec4_setup.py

Writes a "Schwung" setup into an all-setups dump and leaves the other 15
setups alone. Every group mirrors the E16's remote-mode map: CC 1-16 relative
(1/127) and notes 0-15 on one channel. Encoder names are `----` so the host
can write them. Use slot 13 or 14, because 15 and 16 hold the factory Ableton
setups.

```bash
# start from your own dump (preferred) or the factory file in faderfox-editor
python3 ec4_setup.py my-backup.syx schwung.syx --slot 13 --channel 1
python3 ec4_setup.py schwung.syx --show 13
```

The output is a full "all setups" dump (~229 KB, one SysEx). Send it from a
computer (faderfox-editor, or any SysEx librarian at a slow rate), not through
Move. On the EC4: FUNC + encoder 4 opens setup mode, then encoder 14 starts
receive mode.

## The bench session

**0. Back up.** In setup mode, press encoder 10 ("Send all setups") into
a SysEx librarian. That dump is also the input for `ec4_setup.py`.

**1. From a computer** (`pip install python-rtmidi`):

```bash
python3 ec4_probe.py            # lists ports: how many are the EC4's?
python3 ec4_probe.py EC4        # the sequence, then 30 s of monitoring
```

Watch the EC4's screen during steps 2–5, then change group, press Shift and
turn encoders while it monitors. Save the terminal output.

**2. On Move, over USB-A.** The probe is a test fixture, so build it in
explicitly:

```bash
SCHWUNG_BUILD_TEST_MODULES=1 ./scripts/build.sh
./scripts/install.sh local --skip-modules --skip-confirmation
ssh ableton@move.local "touch /data/UserData/schwung/debug_log_on"
```

Set Global Settings → Ext Surface to **Off**. Plug the EC4 into USB-A and
open Tools → **EC4 Probe**.

Pads, bottom row left to right:

| pad | what it sends | what to look for |
|---|---|---|
| 1 | setup/group request | top line shows `S13 G1`; `req 1/1` |
| 2 | next encoder name ← a counter | the number appears on the EC4 |
| 3 | all 16 names in ONE message (69 packets) | intact, or garbled? |
| 4 | names back to `----` | |
| 5 | overlay text + show | 4 rows of text on the EC4 |
| 6 | hide overlay | |
| 7 / 8 | text on pages 1 / 2 | unknown pages: note whatever happens |

Second row: pad 1 turns on a request every second (does `req n/n` keep up?).
Pad 2 turns on the stress test, which writes one cell every 100 ms. Play a
Move track while it runs to see whether Move's notes garble the text.

The screen counts `rx ec4` (SysEx from the EC4), `cc` (channel messages) and
`BAD` (a SysEx cut short). Everything is also in
`/data/UserData/schwung/debug.log` under `ec4probe:`.

## What each outcome means

- **Nothing SysEx works on Move, but it does from the computer:** the USB-A
  jack limit. Input-only EC4 support is still possible (CC/notes cross), but
  there's no text and no group reports.
- **SysEx works on Move:** a full driver is on. Per-cell writes (9 packets)
  fit in one SPI frame; the stress test tells us whether that's enough.
- **Pad 3 garbles but pads 2 and stress don't:** confirms the one-cell-per-
  message design.
