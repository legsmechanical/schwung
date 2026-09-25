/*
 * Faderfox EC4 live SysEx: text on the display, and what the device reports.
 *
 * Faderfox publishes no spec for this. It is reconstructed from two
 * independent implementations that agree byte for byte:
 *   - Faderfox_Universal_2, Faderfox's own Ableton Live script (consts.py,
 *     faderfox_display_element.py, faderfox_parameter_display.py,
 *     FaderfoxSurface.py)
 *   - DrivenByMoss, the Bitwig extension (controller/faderfox/ec4/controller/
 *     EC4Display.java, EC4ControlSurface.java)
 * and from the EC4 manual V03, which documents that these exist ("Special
 * fixed commands (Sysex)") but not their bytes. None of it is confirmed on
 * hardware yet; that is what tools/ec4 and the ec4-probe tool are for.
 *
 * Wire format. Every message is
 *     F0 00 00 00  4E 2C 1B  <commands>  F7
 * and every command is three bytes, the same nibble encoding the setup dump
 * uses (tools/ec4/ec4_setup.py): 0x4X command, 0x2X high nibble, 0x1X low
 * nibble. `4E 2C 1B` is itself one: the low nibble B is the EC4's device id
 * (0x0B), and FaderfoxSurface.py identifies the device from exactly that byte.
 *
 *   4E 22 1p       select text page p: 0 = the 16 encoder-name cells (64
 *                  chars), 3 = the 4x20 overlay ("total display", 80 chars).
 *                  Pages 1 and 2 are unused by both references -- unknown.
 *   4A 2h 1l       set the write offset within the page
 *   4D 2h 1l       write one character at the offset, which then advances
 *   4E 22 14 / 15  show / hide the overlay
 *
 * Several offset+run pairs may share one message (DrivenByMoss sends its
 * diff that way). Encoder names only show host text where the stored name is
 * '----' (manual V03: "Set encoder names to '----' else the script can't
 * write the names").
 *
 * The one message WITHOUT the device id is the request:
 *     F0 00 00 00 4E 20 10 F7
 * answered with the current setup and group. The same commands arrive
 * unasked when the user changes setup or group, or presses Shift, a user key
 * (FUNC + encoder 1/5/9/13) or Shift + an encoder push:
 *     4E 28 1s        setup s (0-15)
 *     4E 24 1g        group g (0-15)
 *     4E 26 1k        extended key: 1 = Shift, 2-5 = user keys 1-4
 *     4E 2A 1n        shifted push button n (0-15)
 *     4E 2E 1v        state of the key just named: 1 = pressed, 0 = released
 *
 * Message sizes matter here more than anywhere: Move splices its own MIDI into
 * a SysEx that spans SPI frames (docs/E16_REMOTE.md, "The garbling"), and the
 * host places a message of <= 12 USB-MIDI packets whole within one frame. One
 * 4-character cell is 26 bytes / 9 packets and fits; all 64 name characters
 * in one message are 206 bytes / 69 packets and do not.
 */

export const HEADER = [0xF0, 0x00, 0x00, 0x00, 0x4E, 0x2C, 0x1B];
export const DEVICE_ID = 0x0B;

export const PAGE_NAMES = 0;
export const PAGE_TOTAL = 3;
export const NAMES_CHARS = 64;
export const TOTAL_ROWS = 4;
export const TOTAL_COLS = 20;
export const TOTAL_CHARS = TOTAL_ROWS * TOTAL_COLS;

const CMD_FUNC = 0x4E;
const CMD_OFFSET = 0x4A;
const CMD_DATA = 0x4D;

const FUNC_PAGE = 0x22;        /* value 0x10 | page, 0x14 show, 0x15 hide */
const FUNC_SETUP = 0x28;
const FUNC_GROUP = 0x24;
const FUNC_EXT_KEY = 0x26;
const FUNC_SHIFTED_KEY = 0x2A;
const FUNC_KEY_STATE = 0x2E;

const SHOW_TOTAL = 0x14;
const HIDE_TOTAL = 0x15;

export const EXT_KEY_SHIFT = 1;

function nib(v) {
    return [0x20 | ((v >> 4) & 0x0F), 0x10 | (v & 0x0F)];
}

/* The display's character ROM, from consts.py CHARS: 16 rows of 16, so a
 * character's index is its code. It is ASCII for space, digits, A-Z, a-z and
 * most punctuation; '$', '@' (at 0x40) and '[\]' are not where ASCII puts
 * them, and umlauts sit in the 0x5B/0x7B rows. Anything else becomes 0x1F,
 * which is what the Faderfox script sends for an unknown character. */
const ROM = [
    '                ',
    '                ',
    ' !"# %&\'()*+,-./',
    '0123456789:;<=>?',
    ' ABCDEFGHIJKLMNO',
    'PQRSTUVWXYZÄÖ Ü§',
    ' abcdefghijklmno',
    'pqrstuvwxyzäö üà',
    '  ²³            ',
    '          ()    ',
    '@               ',
    '                ',
    '    _           ',
    '                ',
    '                ',
    '          [\\]<|>',
].join('');
/* '(' and ')' appear twice (0x28/0x29 and 0x9A/0x9B). The Python dict in
 * consts.py keeps the LATER index; DrivenByMoss sends plain ASCII, i.e. the
 * earlier one. Earlier wins here: it is ASCII, and it is what the second
 * reference puts on the wire. */
const CODE = new Map();
for (let i = ROM.length - 1; i >= 0; i--) if (ROM[i] !== ' ') CODE.set(ROM[i], i);
CODE.set(' ', 0x20);
/* The full block, 0x1F: a whole bar cell. Photographed on firmware 2.00
 * (every code 0x00-0xFF written to the overlay); Faderfox's script maps no
 * character to it and uses the code only as its "unknown" glyph. */
export const BLOCK = '\u2588';
CODE.set(BLOCK, 0x1F);
export const UNKNOWN_CHAR = 0x1F;

export function charCode(ch) {
    const c = CODE.get(ch);
    return c === undefined ? UNKNOWN_CHAR : c;
}

/* runs: [{offset, text}] on one page. Offsets are character positions within
 * the page: cell n of the names page starts at n * 4, row r of the overlay at
 * r * 20. */
export function textMsg(page, runs, opts) {
    const out = HEADER.slice();
    out.push(CMD_FUNC, FUNC_PAGE, 0x10 | (page & 0x0F));
    for (const run of runs) {
        out.push(CMD_OFFSET, ...nib(run.offset));
        for (const ch of run.text) out.push(CMD_DATA, ...nib(charCode(ch)));
    }
    if (opts && opts.show) out.push(CMD_FUNC, FUNC_PAGE, SHOW_TOTAL);
    out.push(0xF7);
    return out;
}

function pad(s, n) {
    return (String(s) + ' '.repeat(n)).slice(0, n);
}

/* One encoder's 4-character name: the unit that fits one SPI frame. */
export function nameMsg(cell, text) {
    return textMsg(PAGE_NAMES, [{ offset: cell * 4, text: pad(text, 4) }]);
}

/* All 16 names in one message. 69 packets: see the header on why a driver
 * should send cells instead. Kept because the probe measures exactly that. */
export function allNamesMsg(names) {
    let text = '';
    for (let i = 0; i < 16; i++) text += pad(names[i] || '', 4);
    return textMsg(PAGE_NAMES, [{ offset: 0, text }]);
}

/* Overlay text, optionally shown in the same message (as the Faderfox script
 * does). rows: up to 4 strings, each padded to 20. */
export function totalMsg(rows, opts) {
    let text = '';
    for (let r = 0; r < TOTAL_ROWS; r++) text += pad((rows && rows[r]) || '', TOTAL_COLS);
    return textMsg(PAGE_TOTAL, [{ offset: 0, text }], opts);
}

export function showTotalMsg() {
    return HEADER.concat([CMD_FUNC, FUNC_PAGE, SHOW_TOTAL, 0xF7]);
}

export function hideTotalMsg() {
    return HEADER.concat([CMD_FUNC, FUNC_PAGE, HIDE_TOTAL, 0xF7]);
}

/* Current setup and group. No device id: FaderfoxSurface.py and
 * EC4ControlSurface.java both send exactly these eight bytes. */
export function queryMsg() {
    return [0xF0, 0x00, 0x00, 0x00, CMD_FUNC, 0x20, 0x10, 0xF7];
}

/* msg: a whole SysEx, F0..F7. Returns null if it is not from an EC4,
 * otherwise a list of events:
 *   {type: 'setup', setup}      0-15
 *   {type: 'group', group}      0-15
 *   {type: 'key', key, pressed} key: 'shift' | 'user1'..'user4' | 'push0'..'push15'
 *                               (push = Shift + encoder push)
 *   {type: 'unknown', cmd, func, value}  a well-formed command we do not know
 * The walk mirrors EC4ControlSurface.handleSysexCommandsController: a key
 * state names whichever key the same message named before it. */
export function parse(msg) {
    if (!msg || msg.length < HEADER.length + 1) return null;
    for (let i = 0; i < HEADER.length; i++) if (msg[i] !== HEADER[i]) return null;
    if (msg[msg.length - 1] !== 0xF7) return null;
    const body = msg.slice(HEADER.length, msg.length - 1);
    const events = [];
    let extKey = -1, shiftedKey = -1;
    for (let i = 0; i < body.length; i += 3) {
        const cmd = body[i], func = body[i + 1], value = body[i + 2];
        if (i + 3 > body.length) { events.push({ type: 'unknown', cmd, func, value }); break; }
        if (cmd !== CMD_FUNC || (value & 0xF0) !== 0x10) {
            events.push({ type: 'unknown', cmd, func, value });
            continue;
        }
        const v = value & 0x0F;
        if (func === FUNC_SETUP) events.push({ type: 'setup', setup: v });
        else if (func === FUNC_GROUP) events.push({ type: 'group', group: v });
        else if (func === FUNC_EXT_KEY) extKey = v;
        else if (func === FUNC_SHIFTED_KEY) shiftedKey = v;
        else if (func === FUNC_KEY_STATE) {
            const pressed = v === 1;
            if (shiftedKey >= 0) events.push({ type: 'key', key: 'push' + shiftedKey, pressed });
            else if (extKey === EXT_KEY_SHIFT) events.push({ type: 'key', key: 'shift', pressed });
            else if (extKey >= 2 && extKey <= 5) events.push({ type: 'key', key: 'user' + (extKey - 1), pressed });
            else events.push({ type: 'unknown', cmd, func, value });
        } else events.push({ type: 'unknown', cmd, func, value });
    }
    return events;
}

/* Wire bytes -> USB-MIDI packets for move_midi_external_send. Same framing as
 * the E16's; kept local so this module has no E16 dependency. */
export function packetize(bytes) {
    const out = [];
    let i = 0;
    while (bytes.length - i > 3) {
        out.push(0x04, bytes[i], bytes[i + 1], bytes[i + 2]);
        i += 3;
    }
    const left = bytes.length - i;
    const cin = { 1: 0x05, 2: 0x06, 3: 0x07 }[left];
    out.push(cin, bytes[i] || 0, bytes[i + 1] || 0, bytes[i + 2] || 0);
    return out;
}

export function packetCount(bytes) {
    return Math.ceil(bytes.length / 3);
}
