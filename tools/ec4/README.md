# Faderfox EC4 support: bench tools

Probe first. Nothing in Schwung drives an EC4 yet. These tools answer the
questions that decide whether it can, and how.

Research material (the EC4 manual and firmware, Faderfox's Ableton script, the
faderfox-editor and DrivenByMoss reference code) and the full hand-off notes
live in the private repo `legsmechanical/schwung-ec4-research`. They are kept
out of this public repo because the Faderfox files are not ours to
redistribute.

## Sources, and how far each is trusted

| fact | source | status |
|---|---|---|
| setup dump format (addresses, 3-byte nibble encoding, page CRC, padding) | `privatepublic-de/faderfox-editor`, `doc/faderfox sysex data format EC4 V2.txt` | verified: `ec4_setup.py` round-trips the factory dump byte for byte, and parses DrivenByMoss's shipped setup |
| live SysEx: text pages, overlay show/hide, setup/group request, key reports | Faderfox_Universal_2 (Faderfox's Ableton script) **and** DrivenByMoss (`controller/faderfox/ec4`) | two independent implementations agree byte for byte. **Verified on hardware from a Mac (2026-09-25, firmware 2.00):** setup/group request and reply, unprompted setup/group reports, Shift and user keys 1–4, one-cell and 16-name writes (including a 206-byte single message), overlay show/hide. Shift + push: not yet seen |
| host text shows only where the stored encoder name is `----` | EC4 Manual V03, "Ableton Live Setups" | documented |
| text works outside setups 13–16 | DrivenByMoss uses setup 1 by default | **verified:** names and overlay display on setup 11. The 13–16 gate is only in Faderfox's script (`DEVICE_DISPLAY_SETUPS`) |
| incoming MIDI updates encoder values and the display | manual, "Controller mode" | documented; whether it applies to relative types is **untested** |
| every live message is acknowledged | bench, not in either reference | the EC4 answers each host message with a bare header, `F0 00 00 00 4E 2C 1B F7`, within ~10–90 ms. A driver can use it to confirm each write arrived |
| USB enumeration | macOS System Information, `ec4_probe.py` | **one** USB-MIDI port each way (VID 0x2256, PID 0x2010), which is the case that can carry SysEx over Move's USB-A |
| SysEx both ways over Move's USB-A | EC4 Probe on Move (stock 1.4.0 host), 2026-09-25 | **verified.** Outbound: every message acknowledged; names and overlay display. Inbound: request reply, unprompted group reports, Shift, user key 1 and encoder CCs all arrive whole |
| the generated Schwung setup, on hardware | bench, 2026-09-25 (loaded into slot 12 from a computer) | **verified:** encoders send CC 1-16 ch 1 as `01` / `7F` (relative, what `e16_input.decode` reads); a push sends note 0-15 with no note-off (a note command with lower value 0 suppresses it, firmware 2.0); Shift sends its SysEx report and Shift + turn still sends the plain CC between the Shift reports; Shift + push sends the shifted-push SysEx (`4E 2A`) and no note; FUNC + encoder 1 is user key 1 (`4E 26 12`) |
| the EC4 blanks a cell while its encoder turns | bench, 2026-09-25 | the EC4's own automatic value display (manual V03: "after turning an encoder, you can see the value ... for a short while") has no value to show for a relative encoder, so the name cell goes blank. **SHIFT + NAME on the EC4 suppresses it** (verified). Whether that survives a power cycle is not yet checked |
| long outbound messages are damaged through Move | same bench | the 206-byte all-names message arrived with cells 12–14 wrong (still acknowledged, so the frame survived and the middle did not); the same message is clean from a computer. 26-byte one-cell writes were clean. **Write one cell per message**, as `docs/E16_REMOTE.md` predicts for Move's interleave |

The wire format is written up in the header of `src/shared/ec4_protocol.mjs`,
and `tests/host/test_ec4_protocol.sh` pins it to vectors copied from both
references.

## Installing the Schwung setup on an EC4

The repo ships no `.syx` (assets are never tracked; `test_no_bundled_assets.sh`),
so make the file once, from Faderfox's factory dump in the MIT-licensed
[faderfox-editor](https://github.com/privatepublic-de/faderfox-editor):

```bash
curl -sLO https://raw.githubusercontent.com/privatepublic-de/faderfox-editor/master/ec4-v2/EC4-setup-all-factory-V20.syx
python3 tools/ec4/ec4_setup.py EC4-setup-all-factory-V20.syx schwung-setup-13.syx --slot 13
```

That puts the Schwung setup ("SCHW") in **setup 13**, the slot the surface
looks for by default, beside 15 factory setups. Sending it as it stands would
overwrite all 16, so merge just setup 13 with the web editor at
<https://www.privatepublic.de/faderfox-editor/ec4-v2/> (Chrome; Web MIDI):

1. Connect the EC4 to the computer and pick it as the editor's input and output.
2. **Receive from EC4**, then on the EC4 hold FUNC and push encoder 4 (setup
   mode) and push encoder 10 (send all setups). In the dialog that follows,
   select all and **Import selected**: the editor now holds your setups.
3. **Load file** -> `schwung-setup-13.syx`. The same dialog opens: select only
   setup 13 ("SCHW") and **Import selected**. Import is by position, so
   nothing else changes.
4. To use another slot: select setup 13, **Copy Setup**, select the slot you
   want, **Paste Setup**, and tell the Move which one it is
   (`echo <1-16> > /data/UserData/schwung/ec4_setup`).
5. **Send to EC4**, with the EC4 in receive mode (setup mode, push encoder 14).

Then on the Move, Global Settings -> System -> **Ext Surface = EC4**, put the
EC4 on that setup, and press SHIFT + NAME once on the EC4 (see below).

The editor steps are read from its source (`ec4.js`: a file load and a device
receive both open the same merge dialog, and a merge copies setups to the same
position); the Schwung setup itself is verified on hardware (loaded into
slot 12 from a computer). The editor route as a whole has not been run yet.

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
