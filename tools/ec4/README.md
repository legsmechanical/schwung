# Faderfox EC4 support — bench tools

Probe-first: nothing in Schwung drives an EC4 yet. These tools answer the
questions that decide whether and how it can.

## What is verified, and against what

| fact | source | status |
|---|---|---|
| setup dump format (addresses, 3-byte nibble encoding, page CRC, padding) | `privatepublic-de/faderfox-editor` `doc/faderfox sysex data format EC4 V2.txt` | verified: `ec4_setup.py` round-trips the factory dump byte for byte |
| EC4 device id `0x0B` in the dump framing | same repo, `faderfox sysex format general.txt` + factory dump | verified |
| relative mode 1 sends 1 / 127 | same doc | documented, not yet seen on the wire |
| host can write encoder names only where the name is `----` | EC4 Manual V03, "Ableton Live Setups" | documented: *"Set encoder names to '----' else the script can't write the names"* |
| Faderfox's script is meant for setups 13–16 | same | documented; whether the *device* refuses text in 1–12 is **untested** |
| setup/group selects, Shift, 4 user keys and Shift+push report as SysEx | same, "Special fixed commands (Sysex)" | documented; **byte format not in the manual** |
| incoming MIDI updates encoder values and the display ("feedback") | same, "Controller mode" | documented; which types it applies to (absolute only?) **untested** |
| live display messages (names, 4×20 overlay, setup/group query) | Faderfox_Universal_2 Ableton script | **unverified** — script not read yet |
| SysEx both ways over Move's USB-A | — | **unknown**; see `docs/E16_REMOTE.md` "The USB-A limitation": Move carries SysEx only to single-jack devices |

## ec4_setup.py

Writes a "Schwung" setup into an all-setups dump, leaving the other fifteen
alone. Per group it mirrors the E16's remote-mode map — CC 1-16 relative
(1/127) and notes 0-15 on one channel — so the existing E16 input decoder reads
it unchanged. Encoder names are `----` so the host can write them (see the
table); use slot 13 or 14, since 15 and 16 hold the factory Ableton setups.

```bash
# start from your own dump (preferred) or the factory file in faderfox-editor
python3 ec4_setup.py my-backup.syx schwung.syx --slot 13 --channel 1
python3 ec4_setup.py schwung.syx --show 13
```

The output is a full "all setups" dump (~229 KB, one SysEx). Send it from a
computer (faderfox-editor, or any SysEx librarian at a slow rate), not through
Move.

## Bench questions

1. **How does the EC4 enumerate?** On a computer, count the MIDI ports it
   presents (macOS: Audio MIDI Setup → the device → its ports). One port is
   the hopeful case; more than one predicts no SysEx over Move's USB-A.
2. **Does SysEx reach the EC4 and come back, from a computer?** Needs the
   display messages from the Faderfox script.
3. **Same, over Move's USB-A.**
4. **Does the EC4 take text in setups 1–12 too, or only 13–16?**
5. **What bytes do group/setup selects and Shift send?** The manual says they
   are SysEx; capture them with the Schwung setup loaded.
