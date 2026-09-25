#!/usr/bin/env bash
# Pins src/shared/ec4_protocol.mjs against the two references it was
# reconstructed from. Every expected vector below is copied from one of them,
# not derived from our own builder:
#   FF  = Faderfox_Universal_2 (Faderfox's Ableton script): consts.py
#         HIDE_TOTAL_DISPLAY / CLEAR_MAIN_DISPLAY, faderfox_display_element.py
#         get_message_header, faderfox_parameter_display.py get_display_msg,
#         FaderfoxSurface.py SYSEX_REQUEST_SETUP_REQUEST and its reply matcher
#   DBM = DrivenByMoss EC4Display.java / EC4ControlSurface.java
# Neither is hardware ground truth; when the bench confirms or corrects a
# byte, update the vector here and say which capture it came from.
set -euo pipefail
cd "$(dirname "$0")/../.."

node --input-type=module -e '
import * as p from "./src/shared/ec4_protocol.mjs";

let fails = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log("FAIL " + name + "\n  got  " + g + "\n  want " + w); fails++; }
  else console.log("ok   " + name);
};
const H = [0xF0, 0, 0, 0, 0x4E, 0x2C, 0x1B];
const rep = (n, triple) => Array.from({ length: n }, () => triple).flat();

// FF consts.HIDE_TOTAL_DISPLAY
eq("hide overlay (FF)", p.hideTotalMsg(), [...H, 0x4E, 0x22, 0x15, 0xF7]);
// DBM setTotalDisplayVisible(true)
eq("show overlay (DBM)", p.showTotalMsg(), [...H, 0x4E, 0x22, 0x14, 0xF7]);
// FF consts.CLEAR_MAIN_DISPLAY: 64 x "-" from offset 0 on page 0x10
eq("names cleared to ---- (FF)",
   p.allNamesMsg(Array(16).fill("----")),
   [...H, 0x4E, 0x22, 0x10, 0x4A, 0x20, 0x10, ...rep(64, [0x4D, 0x22, 0x1D]), 0xF7]);
// FF get_message_header(offset): charoffset = offset * 4
eq("cell 5 header (FF)", p.nameMsg(5, "AB").slice(0, 13),
   [...H, 0x4E, 0x22, 0x10, 0x4A, 0x21, 0x14]);
eq("cell 15 header (FF)", p.nameMsg(15, "").slice(10, 13), [0x4A, 0x23, 0x1C]);
eq("cell text padded to 4", p.nameMsg(0, "AB").slice(13, 25),
   [0x4D, 0x24, 0x11, 0x4D, 0x24, 0x12, 0x4D, 0x22, 0x10, 0x4D, 0x22, 0x10]);
// FF get_display_msg(text, 0): page 0x13, text, then 4E 22 14 in the same message
const tot = p.totalMsg(["HI"], { show: true });
eq("overlay prefix (FF)", tot.slice(0, 13), [...H, 0x4E, 0x22, 0x13, 0x4A, 0x20, 0x10]);
eq("overlay first chars", tot.slice(13, 19), [0x4D, 0x24, 0x18, 0x4D, 0x24, 0x19]);
eq("overlay 80 chars then show (FF)", tot.length, 7 + 3 + 3 + 80 * 3 + 3 + 1);
eq("overlay trailer (FF)", tot.slice(-4), [0x4E, 0x22, 0x14, 0xF7]);
eq("overlay without show", p.totalMsg(["HI"]).slice(-4, -1), [0x4D, 0x22, 0x10]);
// DBM EC4Display.writeLine: several offset runs in one message
eq("two runs in one message (DBM)",
   p.textMsg(3, [{ offset: 21, text: "A" }, { offset: 79, text: "B" }]),
   [...H, 0x4E, 0x22, 0x13, 0x4A, 0x21, 0x15, 0x4D, 0x24, 0x11,
    0x4A, 0x24, 0x1F, 0x4D, 0x24, 0x12, 0xF7]);
// FF SYSEX_REQUEST_SETUP_REQUEST, DBM requestDeviceInfo -- identical, no device id
eq("setup/group request (FF, DBM)", p.queryMsg(),
   [0xF0, 0x00, 0x00, 0x00, 0x4E, 0x20, 0x10, 0xF7]);

// FF _is_ec4_sysex_setup_response: 14 bytes, [7:9]=4E 28, [10:12]=4E 24;
// setup = [9] & 0x0F, group = [12] & 0x0F. DBM: value - 0x10.
eq("setup/group reply",
   p.parse([...H, 0x4E, 0x28, 0x1C, 0x4E, 0x24, 0x12, 0xF7]),
   [{ type: "setup", setup: 12 }, { type: "group", group: 2 }]);
// FF EC4_SYSEX_BUTTON_IDENTIFIER + EC4_SYSEX_SHIFT_BUTTON, then the value;
// FaderfoxSysexButtonElement: pressed iff value == 0x11
eq("shift press (FF)", p.parse([...H, 0x4E, 0x26, 0x11, 0x4E, 0x2E, 0x11, 0xF7]),
   [{ type: "key", key: "shift", pressed: true }]);
eq("shift release (FF)", p.parse([...H, 0x4E, 0x26, 0x11, 0x4E, 0x2E, 0x10, 0xF7]),
   [{ type: "key", key: "shift", pressed: false }]);
eq("user key 3 (FF 26 14)", p.parse([...H, 0x4E, 0x26, 0x14, 0x4E, 0x2E, 0x11, 0xF7]),
   [{ type: "key", key: "user3", pressed: true }]);
// FF get_ec4_bp_sysex_button(i) = 2A 1i
eq("shift + push 5 (FF 2A 15)", p.parse([...H, 0x4E, 0x2A, 0x15, 0x4E, 0x2E, 0x11, 0xF7]),
   [{ type: "key", key: "push5", pressed: true }]);
eq("unknown command kept, not dropped",
   p.parse([...H, 0x4E, 0x2F, 0x13, 0xF7]),
   [{ type: "unknown", cmd: 0x4E, func: 0x2F, value: 0x13 }]);
eq("not an EC4 (the E16 ENTER ack)", p.parse([0xF0, 0x00, 0x21, 0x5B, 0x02, 0x01, 0x53, 0xF7]), null);
eq("a truncated message is not parsed", p.parse([...H, 0x4E, 0x28]), null);

// consts.py CHARS
eq("ASCII letters/digits", ["A", "z", "0", "-", " "].map(p.charCode), [0x41, 0x7A, 0x30, 0x2D, 0x20]);
eq("underscore is not ASCII on the EC4", p.charCode("_"), 0xC4);
eq("umlaut", p.charCode("ä"), 0x7B);
eq("unknown -> 0x1F (FF)", p.charCode("$"), 0x1F);

// the frame-atomic budget: <= 12 packets is placed whole (ui_midi_out_carry.h)
eq("one cell fits one SPI frame", p.packetCount(p.nameMsg(3, "CUTO")), 9);
eq("all names do not", p.packetCount(p.allNamesMsg([])), 69);
eq("packetize length", p.packetize(p.nameMsg(3, "CUTO")).length, 9 * 4);
eq("packetize tail CIN", p.packetize([0xF0, 1, 2, 3, 0xF7]).slice(4), [0x06, 3, 0xF7, 0]);

if (fails) { console.log(fails + " failure(s)"); process.exit(1); }
'
echo "PASS: test_ec4_protocol"
