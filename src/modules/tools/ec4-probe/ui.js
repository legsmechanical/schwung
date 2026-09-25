/*
 * EC4 Probe -- does a Faderfox EC4's live SysEx survive Move's USB-A port?
 *
 * That is the gate for EC4 support. docs/E16_REMOTE.md ("The USB-A
 * limitation"): Move's XMOS carries SysEx only to a single-jack USB-MIDI
 * device, and the E16 was dead until its firmware presented one port. CC and
 * notes cross regardless, so a working knob proves nothing about SysEx.
 *
 * Each direction is observable on its own:
 *   OUT  the EC4's screen changes when a name or overlay message lands
 *   IN   the setup/group request is answered, and changing group or pressing
 *        Shift on the EC4 reports itself unasked
 * and the stress toggle writes one cell ten times a second, which is how the
 * E16's interleave garbling (Move's MIDI spliced into our SysEx) would show.
 *
 * Message bytes come from src/shared/ec4_protocol.mjs, which records where
 * each was reconstructed from. Everything is logged with an "ec4probe:"
 * prefix (touch /data/UserData/schwung/debug_log_on).
 *
 * Set Global Settings -> Ext Surface to Off first: the E16 surface's seek
 * probe would otherwise share the port.
 *
 * Pads, bottom row (left to right):
 *   1 request setup/group        5 overlay: write + show
 *   2 name: next cell            6 overlay: hide
 *   3 all 16 names, ONE message  7 text on page 1 (unknown page)
 *   4 names back to ----         8 text on page 2 (unknown page)
 * Second row:
 *   1 auto-request, 1 Hz (toggle)
 *   2 stress: a cell every 100 ms (toggle)
 */
import { shouldFilterMessage, setLED } from '/data/UserData/schwung/shared/input_filter.mjs';
import { Black, DarkGreen, DullGreen, Blue, Purple, BrightRed } from '/data/UserData/schwung/shared/constants.mjs';
import * as ec4 from '/data/UserData/schwung/shared/ec4_protocol.mjs';

const PAD = {
    QUERY: 68, CELL: 69, ALL_NAMES: 70, CLEAR_NAMES: 71,
    TOTAL_SHOW: 72, TOTAL_HIDE: 73, PAGE1: 74, PAGE2: 75,
    AUTO_QUERY: 76, STRESS: 77,
};
const TOGGLES = [PAD.AUTO_QUERY, PAD.STRESS];

const AUTO_QUERY_MS = 1000;
const STRESS_MS = 100;

/* ==================== state ==================== */

let setup = -1, group = -1;
let queriesSent = 0, repliesSeen = 0, lastQueryAt = 0, lastRttMs = -1;
let txMsgs = 0, txPackets = 0, txRefused = 0;
let rxEc4 = 0, rxOther = 0, rxBroken = 0, rxChannel = 0;
let lastEvent = '-';
let lastAction = 'pads: see ui.js header';
let autoQuery = false, stress = false;
let nextCell = 0, counter = 0;
let lastAutoQuery = 0, lastStress = 0;

function hex(bytes) {
    return bytes.map((b) => (b < 16 ? '0' : '') + b.toString(16)).join(' ');
}

function log(s) {
    console.log('ec4probe: ' + s);
}

/* ==================== send ==================== */

function send(bytes, what) {
    const pkts = ec4.packetize(bytes);
    const ok = move_midi_external_send(pkts);
    txMsgs++;
    txPackets += pkts.length / 4;
    if (!ok) txRefused++;
    lastAction = what + ' ' + (pkts.length / 4) + 'p' + (ok ? '' : ' REFUSED');
    log('tx ' + what + ' (' + bytes.length + 'B/' + (pkts.length / 4) + 'p' +
        (ok ? '' : ', refused') + '): ' + hex(bytes));
    return ok;
}

function query() {
    if (send(ec4.queryMsg(), 'request')) {
        queriesSent++;
        lastQueryAt = Date.now();
    }
}

function cellText(n) {
    return String(n % 10000).padStart(4, '0');
}

function writeNextCell() {
    counter++;
    send(ec4.nameMsg(nextCell, cellText(counter)), 'cell ' + (nextCell + 1));
    nextCell = (nextCell + 1) % 16;
}

/* ==================== receive ==================== */

/* onMidiMessageExternal hands over 1-3 bytes with the CIN already stripped.
 * A SysEx is reassembled across calls; F7 is the only terminator. */
let asm = null;

function rxSysexByte(b) {
    if (b === 0xF0) {
        if (asm !== null) rxBroken++;
        asm = [0xF0];
        return;
    }
    if (asm === null) return;
    if (b >= 0xF8) return;                     /* realtime may interleave */
    if (b === 0xF7) {
        asm.push(0xF7);
        finishSysex(asm);
        asm = null;
        return;
    }
    if (b >= 0x80) {                           /* anything else cuts it short */
        rxBroken++;
        log('rx sysex interrupted by 0x' + b.toString(16) + ' after ' + asm.length + 'B: ' + hex(asm));
        asm = null;
        return;
    }
    if (asm.length < 1024) asm.push(b);
}

function finishSysex(msg) {
    const events = ec4.parse(msg);
    if (events === null) {
        rxOther++;
        log('rx sysex (not EC4) ' + msg.length + 'B: ' + hex(msg));
        return;
    }
    rxEc4++;
    log('rx ec4 ' + hex(msg) + ' -> ' + JSON.stringify(events));
    let sawSetup = false;
    for (const e of events) {
        if (e.type === 'setup') { setup = e.setup; sawSetup = true; }
        else if (e.type === 'group') group = e.group;
        lastEvent = describe(e);
    }
    /* A setup+group pair after a request is the reply; the same pair can
     * also arrive unasked on a group change, so only time it when one is
     * outstanding. */
    if (sawSetup && lastQueryAt) {
        repliesSeen++;
        lastRttMs = Date.now() - lastQueryAt;
        lastQueryAt = 0;
    }
}

function describe(e) {
    if (e.type === 'setup') return 'setup ' + (e.setup + 1);
    if (e.type === 'group') return 'setup ' + (setup + 1) + ' group ' + (e.group + 1);
    if (e.type === 'key') return e.key + (e.pressed ? ' down' : ' up');
    return 'unknown ' + hex([e.cmd, e.func, e.value]);
}

function channelMessage(data) {
    rxChannel++;
    const st = data[0] & 0xF0, ch = (data[0] & 0x0F) + 1;
    let text;
    if (st === 0xB0) {
        /* relative mode 1: 1..63 up, 127..65 down (two's complement) */
        const v = data[2];
        const delta = v < 64 ? v : v - 128;
        text = 'CC' + data[1] + ' ch' + ch + ' ' + v + ' (' + (delta > 0 ? '+' : '') + delta + ')';
    } else if (st === 0x90 || st === 0x80) {
        text = 'note ' + data[1] + ' ch' + ch + (st === 0x90 && data[2] > 0 ? ' on' : ' off');
    } else {
        text = hex(Array.from(data));
    }
    lastEvent = text;
    log('rx ' + text);
}

/* ==================== lifecycle ==================== */

let ledInitPending = true;
let ledInitIndex = 0;

function padColour(note) {
    if (note === PAD.AUTO_QUERY) return autoQuery ? DullGreen : DarkGreen;
    if (note === PAD.STRESS) return stress ? BrightRed : Purple;
    if (note >= PAD.QUERY && note <= PAD.PAGE2) return Blue;
    return Black;
}

function setupLedBatch() {
    for (let n = 0; n < 8 && ledInitIndex < 32; n++, ledInitIndex++) {
        const note = 68 + ledInitIndex;
        setLED(note, padColour(note));
    }
    if (ledInitIndex >= 32) ledInitPending = false;
}

globalThis.init = function () {
    ledInitPending = true;
    ledInitIndex = 0;
    log('start');
};

globalThis.onMidiMessageInternal = function (data) {
    if (shouldFilterMessage(data)) return;
    if ((data[0] & 0xF0) !== 0x90 || data[2] === 0) return;
    switch (data[1]) {
        case PAD.QUERY: query(); break;
        case PAD.CELL: writeNextCell(); break;
        case PAD.ALL_NAMES: {
            const names = [];
            for (let i = 0; i < 16; i++) names.push('N' + String(i + 1).padStart(2, '0'));
            send(ec4.allNamesMsg(names), 'all names');
            break;
        }
        case PAD.CLEAR_NAMES: send(ec4.allNamesMsg(Array(16).fill('----')), 'names ----'); break;
        case PAD.TOTAL_SHOW:
            send(ec4.totalMsg(['SCHWUNG EC4 PROBE', 'overlay row 2', 'row 3: 0123456789',
                               'row 4: ' + cellText(++counter)], { show: true }), 'overlay');
            break;
        case PAD.TOTAL_HIDE: send(ec4.hideTotalMsg(), 'hide overlay'); break;
        case PAD.PAGE1: send(ec4.textMsg(1, [{ offset: 0, text: 'PG1 ' }]), 'page 1'); break;
        case PAD.PAGE2: send(ec4.textMsg(2, [{ offset: 0, text: 'PG2 ' }]), 'page 2'); break;
        case PAD.AUTO_QUERY:
            autoQuery = !autoQuery;
            setLED(PAD.AUTO_QUERY, padColour(PAD.AUTO_QUERY));
            log('auto-request ' + (autoQuery ? 'on' : 'off'));
            break;
        case PAD.STRESS:
            stress = !stress;
            setLED(PAD.STRESS, padColour(PAD.STRESS));
            log('stress ' + (stress ? 'on' : 'off'));
            break;
    }
};

globalThis.onMidiMessageExternal = function (data) {
    const b0 = data[0];
    if (b0 >= 0x80 && b0 < 0xF0) {
        /* A channel message inside a SysEx cuts it short -- the E16's garble
         * signature -- and is still a message in its own right. */
        if (asm !== null) {
            rxBroken++;
            log('rx sysex interrupted by 0x' + b0.toString(16) + ' after ' + asm.length + 'B: ' + hex(asm));
            asm = null;
        }
        channelMessage(data);
        return;
    }
    for (let i = 0; i < data.length; i++) rxSysexByte(data[i]);
};

globalThis.tick = function () {
    if (ledInitPending) { setupLedBatch(); return; }
    const now = Date.now();
    if (autoQuery && now - lastAutoQuery >= AUTO_QUERY_MS) {
        lastAutoQuery = now;
        query();
    }
    if (stress && now - lastStress >= STRESS_MS) {
        lastStress = now;
        writeNextCell();
    }
    draw();
};

function draw() {
    clear_screen();
    const sg = setup < 0 ? 'no reply' : 'S' + (setup + 1) + ' G' + (group < 0 ? '?' : group + 1);
    print(0, 0, 'EC4 Probe  ' + sg, 1);
    draw_line(0, 9, 127, 9, 1);
    print(0, 11, 'req ' + repliesSeen + '/' + queriesSent +
                 (lastRttMs >= 0 ? ' ' + lastRttMs + 'ms' : ''), 1);
    print(0, 21, 'tx ' + txMsgs + ' ' + txPackets + 'p' + (txRefused ? ' ref ' + txRefused : ''), 1);
    print(0, 31, 'rx ec4 ' + rxEc4 + ' cc ' + rxChannel +
                 (rxOther ? ' oth ' + rxOther : '') + (rxBroken ? ' BAD ' + rxBroken : ''), 1);
    print(0, 41, lastEvent.slice(0, 21), 1);
    print(0, 51, lastAction.slice(0, 21), 1);
}
