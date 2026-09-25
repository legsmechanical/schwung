#!/usr/bin/env bash
# The EC4 surface, end to end against an emulated device.
#
# The emulator below decodes what the surface SENDS (USB-MIDI packets ->
# SysEx -> page/offset/character commands) onto a model of the EC4 screen, so
# every assertion is about what the device would show, not about what the
# surface believes it showed. The properties, each silent on hardware:
#
#   - nothing is written to a setup that is not Schwung's: its '----' cells
#     would show our text, and its encoders are the user's own
#   - no message is longer than one SPI frame places whole (12 packets):
#     a longer one is spliced by Move's own MIDI and lands damaged
#   - leaving Schwung's setup and coming back rewrites the screen, since the
#     device redrew its own names while we were away
#   - Shift is SysEx on the EC4, and Shift + push is too; both reach the
#     E16 navigator as its own events
#   - turning the setting off gives the device its "----" names back
# No apostrophes in this file (the node program is single-quoted).
set -euo pipefail
cd "$(dirname "$0")/../.."
if ! command -v node >/dev/null 2>&1; then echo "FAIL: node required" >&2; exit 1; fi

node --input-type=module -e '
import { createEc4Surface, DEFAULT_SETUP, OVERLAY_HOLD_MS, LOSS_MS } from "./src/shared/ec4_surface.mjs";
import { PAGE_KNOBS } from "./src/shared/param_pages/page_plan.mjs";
import { MAP_SHOW_DELAY_MS } from "./src/shared/e16_surface.mjs";

let fails = 0;
const eq = (n, g, w) => { const a = JSON.stringify(g), b = JSON.stringify(w);
  if (a !== b) { console.log("FAIL " + n + "\n  got  " + a + "\n  want " + b); fails++; } else console.log("ok   " + n); };
const ok = (n, c) => eq(n, !!c, true);

/* ---- the emulated EC4 ---- */
const dev = { names: "----".repeat(16), total: " ".repeat(80), overlay: false, queries: 0, msgs: [], maxPackets: 0 };
function devMessage(m) {
  dev.msgs.push(m);
  if (m.length === 8 && m[4] === 0x4E && m[5] === 0x20) { dev.queries++; return; }
  let page = 0, off = 0;
  for (let i = 7; i + 2 < m.length; i += 3) {
    const cmd = m[i], v = ((m[i + 1] & 0x0F) << 4) | (m[i + 2] & 0x0F);
    if (cmd === 0x4E && v === 0x20 + 0x00) page = 0;
    if (cmd === 0x4E && (m[i + 1] & 0x0F) === 2) {
      const f = m[i + 2] & 0x0F;
      if (f <= 3) page = f; else if (f === 4) dev.overlay = true; else if (f === 5) dev.overlay = false;
    } else if (cmd === 0x4A) off = v;
    else if (cmd === 0x4D) {
      const ch = String.fromCharCode(v);
      if (page === 0) { dev.names = dev.names.slice(0, off) + ch + dev.names.slice(off + 1); off++; }
      if (page === 3) { dev.total = dev.total.slice(0, off) + ch + dev.total.slice(off + 1); off++; }
    }
  }
}
let asm = null;
function send(pkts) {
  let msgBytes = 0;
  for (let i = 0; i < pkts.length; i += 4) {
    const cin = pkts[i] & 0x0F, n = cin === 0x05 ? 1 : cin === 0x06 ? 2 : 3;
    for (let k = 1; k <= n; k++) {
      const b = pkts[i + k];
      if (b === 0xF0) asm = [b]; else if (asm) { asm.push(b); if (b === 0xF7) { devMessage(asm); asm = null; } }
    }
  }
  dev.maxPackets = Math.max(dev.maxPackets, pkts.length / 4);
  return true;
}
const HDR = [0xF0, 0x00, 0x00, 0x00, 0x4E, 0x2C, 0x1B];
const report = (setup, group) => HDR.concat([0x4E, 0x28, 0x10 | setup, 0x4E, 0x24, 0x10 | group, 0xF7]);
const key = (k, down) => HDR.concat([0x4E, 0x26, 0x10 | k, 0x4E, 0x2E, down ? 0x11 : 0x10, 0xF7]);
const shiftedPush = (n, down) => HDR.concat([0x4E, 0x2A, 0x10 | n, 0x4E, 0x2E, down ? 0x11 : 0x10, 0xF7]);

/* ---- a fake page controller, as test_e16_skipped_pages.sh builds one ---- */
const page = (name, keys) => ({ kind: PAGE_KNOBS, name, level: name, keys });
const writes = [];
const ctl = {
  pages: [page("Main", ["cutoff", "reso"]), page("Env", ["attack", "decay"]), page("Mod", ["rate"])],
  pageIndex: 0,
  state: { values: { cutoff: "0.5", reso: "0.1", attack: "0.2", decay: "0.3", rate: "0.4" } },
  load() {}, tick() {},
  goToPage(i) { this.pageIndex = i; },
  onKnobTurn(slot, dir) { writes.push([this.pages[this.pageIndex].name, slot, dir]); },
};

let t = 1000;
const s = createEc4Surface({ now: () => t, send,
  chainOf: () => ({ slots: [{ synth: "obxd", fx: ["freeverb"] }, {}, {}, {}] }),
  makeController: () => ctl });
const run = (ms) => { for (let i = 0; i < ms / 16; i++) { t += 16; s.tick(); } };

run(500);
eq("off: nothing is sent", dev.msgs.length, 0);

s.setEnabled(true);
run(2500);
ok("on, unanswered: it asks which setup", dev.queries >= 2);
eq("on, unanswered: no text is written", dev.names, "----".repeat(16));

s.feedMidi(report(10, 0));   /* setup 11, the user one */
run(1000);
eq("a setup that is not ours is never written", dev.names, "----".repeat(16));
eq("...and is not active", s.present, false);
s.feedMidi([0xB0, 0x01, 0x01]);
eq("...and its encoders are ignored", writes.length, 0);

s.feedMidi(report(DEFAULT_SETUP, 0));
run(1000);
eq("setup 13: active", s.present, true);
eq("setup 13: the knob page is on the names", dev.names.slice(0, 16), "CUTORESO        ");
eq("...the page below it on the second half", dev.names.slice(32, 40), "ATTADECA");
ok("every message fits one SPI frame (12 packets)", dev.maxPackets <= 12);

s.feedMidi([0xB0, 0x01, 0x01]);   /* encoder 1, one detent clockwise */
eq("a turn reaches the controller", writes, [["Main", 0, 1]]);
run(200);
eq("...and puts the reading on the overlay", dev.overlay, true);
eq("...naming the module and the parameter", [dev.total.slice(0, 20).trim(), dev.total.slice(40, 60).trim()], ["obxd", "cutoff"]);
run(OVERLAY_HOLD_MS + 500);
eq("the overlay goes after the hold", dev.overlay, false);

s.feedMidi(key(1, true));          /* Shift down, as SysEx */
s.feedMidi([0xB0, 0x02, 0x01]);    /* Shift + turn pages */
s.feedMidi(key(1, false));
run(300);
eq("Shift (SysEx) + turn steps the page pair (by two, as the E16)", dev.names.slice(0, 16), "RATE            ");

s.feedMidi(key(1, true));
run(MAP_SHOW_DELAY_MS + 200);
eq("holding Shift shows the map on the names", dev.names.slice(0, 16), ">1  2   3   4   ");
eq("...with the slot components below", dev.names.slice(16, 24), "OBXDFREE");
s.feedMidi(shiftedPush(5, true));  /* Shift + push encoder 6: freeverb */
s.feedMidi(shiftedPush(5, false));
s.feedMidi(key(1, false));
eq("Shift + push (SysEx) picks from the map", [s.nav.slot, s.nav.component], [0, "fx1"]);

s.feedMidi(report(10, 0));
run(300);
eq("leaving for another setup: inactive", s.present, false);
const before = dev.msgs.length;
run(1000);
ok("...and only queries go out", dev.msgs.slice(before).every((m) => m.length === 8));
dev.names = "----".repeat(16);    /* the device redrew its own setup */
s.feedMidi(report(DEFAULT_SETUP, 0));
run(1000);
ok("coming back rewrites the screen", dev.names !== "----".repeat(16));

run(LOSS_MS + 500);
eq("silent for LOSS_MS: gone", s.present, false);
s.feedMidi(report(DEFAULT_SETUP, 0));
run(500);
eq("...and back on the next answer", s.present, true);

s.setEnabled(false);
run(2000);
eq("off: the device gets its ---- names back", dev.names, "----".repeat(16));
eq("...and no overlay", dev.overlay, false);
ok("no message was ever longer than one frame", dev.maxPackets <= 12);

console.log(fails ? "FAILED " + fails : "PASS");
process.exit(fails ? 1 : 0);
'
