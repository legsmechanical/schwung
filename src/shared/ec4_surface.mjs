/*
 * ec4_surface.mjs -- a Faderfox EC4 as Schwung's external control surface.
 *
 * THE SAME SURFACE AS THE E16, ON DIFFERENT HARDWARE. Navigation, paging, the
 * slot map and the Mixer are the E16's own components, imported unchanged:
 * createNav (gestures), buildView / applyTurn / applyClick (the knob pages),
 * buildMap (the map) and createMixer (the Mixer model). What is EC4-specific
 * is only what the device forces:
 *
 *   - PRESENCE. The EC4 has no remote mode to enter and acknowledge. It is
 *     "ours" while it answers the setup/group request AND the setup it reports
 *     is the one holding Schwung's map. Any other setup belongs to the user:
 *     nothing is written to it, and its encoders are not ours to act on.
 *   - SHIFT IS SYSEX. The Shift key and Shift + encoder push arrive as SysEx
 *     reports, not notes, and are translated into the nav's own events.
 *   - THE SCREEN IS TEXT. Sixteen 4-character names (the E16's LABELS, and
 *     the same abbrev4) plus a 4x20 overlay that carries the reading -- what
 *     the E16's title line carried -- shown while a knob moves.
 *
 * THE INPUT MAP IS THE E16's, ON PURPOSE. tools/ec4/ec4_setup.py writes a
 * setup whose every group sends CC 1-16 relative and notes 0-15 on channel 1,
 * which is exactly the E16's remote-mode map. So e16_input.decode reads it
 * as-is, and the shim's claim (src/host/e16_claim.h) already keeps those
 * messages away from Move and the CC Map.
 *
 * EVERY MESSAGE FITS ONE SPI FRAME. Move splices its own MIDI into a SysEx
 * that spans frames (docs/E16_REMOTE.md, "The garbling"), and the host places
 * a message of <= 12 USB-MIDI packets whole within one. Measured on the EC4
 * over Move's USB-A (tools/ec4/README.md): a 206-byte write lost three cells
 * in its middle, 26-byte writes did not. So text goes out as runs of at most
 * TEXT_CHUNK characters -- one encoder cell is one message -- and a slow
 * round-robin restates the screen so a message that was damaged anyway heals
 * without anybody noticing it went.
 *
 * Pure: every host call is injected, so tests/host drives the whole path.
 */
import { createNav, createSysexAssembler } from "./e16_surface.mjs";
import { decode } from "./e16_input.mjs";
import { buildView, labelsFor, applyTurn, applyClick, pageHasKnobs, abbrev4, ENCODERS,
         ringAmount, RING_MAX } from "./e16_view.mjs";
import { buildMap } from "./e16_map.mjs";
import { createMixer } from "./e16_mixer.mjs";
import { displayValue } from "./param_pages/render_page_movy.mjs";
import * as ec4 from "./ec4_protocol.mjs";

/* Setup 13, 0-based as the device reports it. Slots 15 and 16 hold the
 * factory Ableton setups, and 13 is what ec4_setup.py is told in the README. */
export const DEFAULT_SETUP = 12;

/* Asking "which setup?" -- every QUERY_MS until answered, then KEEPALIVE_MS.
 * The EC4 also reports a setup or group change unasked, so the keepalive is
 * only there to notice a device that has gone. */
export const QUERY_MS = 1000;
export const KEEPALIVE_MS = 2000;
/* Nothing heard from the EC4 for this long: it is gone. Every write is
 * acknowledged, so a surface in use hears from it constantly. */
export const LOSS_MS = 5000;

/* Characters per text message: 7 header + 3 page + 3 offset + 3 per character
 * + F7 is 35 bytes, 12 packets -- the most one SPI frame places whole. */
export const TEXT_CHUNK = 7;
/* Messages per tick. The carry drains ~3 packets a frame, so two 12-packet
 * messages a tick keep the queue moving without building one up. */
export const MSGS_PER_TICK = 2;
/* With nothing owed, one chunk of the screen is resent this often, so the
 * whole names page is restated every ~2.5 s. */
export const RESTATE_MS = 250;
/* The overlay stays up this long after the last turn. */
export const OVERLAY_HOLD_MS = 1500;

const NAMES_LEN = ec4.NAMES_CHARS;
const TOTAL_LEN = ec4.TOTAL_CHARS;
const pad = (s, n) => (String(s == null ? "" : s) + " ".repeat(n)).slice(0, n);

/* 7-bit ASCII the EC4's character ROM can show, plus the bar's block:
 * accents folded, the rest dropped. */
function ascii(s) {
    return String(s == null ? "" : s)
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/[^\x20-\x7E█]/g, "");
}

/*
 * A VALUE BAR, one overlay row of whole blocks: 20 cells, so 5% a step.
 *
 * Whole blocks only. The ROM does hold partial-width bar glyphs (0xD0-0xD4
 * short, 0xD6-0xD9 tall), but in two heights that line up neither with each
 * other nor with the full block, so a bar ending in one read as ragged rather
 * than finer. A bipolar value fills from the centre, which is marked when the
 * value sits on it -- an empty row would read as "no value".
 */
export function barRow(frac, bipolar, width) {
    const w = width || ec4.TOTAL_COLS;
    const f = Math.max(0, Math.min(1, Number(frac) || 0));
    const pos = Math.round(f * w);
    if (!bipolar) return ec4.BLOCK.repeat(pos) + " ".repeat(w - pos);
    const mid = w / 2;
    let out = "";
    for (let i = 0; i < w; i++) {
        out += (i >= Math.min(mid, pos) && i < Math.max(mid, pos)) ? ec4.BLOCK : " ";
    }
    if (pos === mid) out = out.slice(0, mid) + "|" + out.slice(mid + 1);
    return out;
}

/*
 * THE TEXT WRITER: what the device should show, what it was last told, and
 * the smallest messages that close the gap.
 *
 * `shown` is a BELIEF about the device, and null means "unknown": a device
 * that has just become ours may be showing anything, so the first pass writes
 * all of it rather than diffing against a guess.
 */
function createPage(page, len) {
    let want = " ".repeat(len);
    let shown = null;
    let restateAt = 0;
    return {
        set(text) { want = pad(text, len); },
        forget() { shown = null; },
        get synced() { return shown === want; },
        /* The next message that brings the device closer, or null. */
        next() {
            if (shown === want) return null;
            let i = 0;
            if (shown !== null) while (i < len && shown[i] === want[i]) i++;
            const n = Math.min(TEXT_CHUNK, len - i);
            return { page, offset: i, text: want.slice(i, i + n) };
        },
        /* The next chunk of the round-robin restate. */
        restate() {
            const offset = restateAt;
            restateAt = (restateAt + TEXT_CHUNK) % len;
            return { page, offset, text: want.slice(offset, offset + Math.min(TEXT_CHUNK, len - offset)) };
        },
        /* The message went out: the device holds these characters now. */
        sent(run) {
            /* From "unknown", only the characters just sent are known: the
             * rest are marked with a byte no text contains, so the next diff
             * carries on from here rather than believing the whole page. */
            const base = shown === null ? "\u0000".repeat(len) : shown;
            shown = base.slice(0, run.offset) + run.text + base.slice(run.offset + run.text.length);
        },
    };
}

export function createEc4Surface(io) {
    const o = io || {};
    const now = o.now || (() => Date.now());
    const send = o.send || (() => false);
    const chainOf = o.chainOf || (() => ({ slots: [] }));
    const followFocusOf = o.followFocusOf || (() => null);
    const makeController = o.makeController || null;
    const setupOf = o.setupOf || (() => DEFAULT_SETUP);
    const log = o.log || (() => {});

    let enabled = false;
    /* The device's own report; null until it has answered. */
    let reportedSetup = null;
    let heardAt = -Infinity;
    let queriedAt = -Infinity;
    let wasActive = false;
    /* A goodbye owed: the names put back to "----" and the overlay hidden,
     * sent after the setting goes off. */
    let goodbye = false;

    const names = createPage(ec4.PAGE_NAMES, NAMES_LEN);
    const total = createPage(ec4.PAGE_TOTAL, TOTAL_LEN);
    let wantOverlay = false;
    /* null = unknown, so the first decision is always sent. */
    let shownOverlay = null;
    let lastRestateAt = -Infinity;
    let restateTurn = 0;
    let acks = 0, sentMsgs = 0;

    /* The reading on the overlay, and until when. */
    let overlayRows = null;
    let overlayUntil = -Infinity;

    const mixer = o.mixer ? createMixer(o.mixer) : null;
    let ctl = null;
    let loaded = null;
    const focus = {
        get slot() { return nav ? nav.slot : 0; },
        get component() { return nav ? nav.component : "synth"; },
    };
    const metaOf = (key) => (ctl && ctl.metaIndex ? ctl.metaIndex.getOrGuess(key) : null);
    const valueOf = (key) => (ctl && ctl.state && ctl.state.values ? ctl.state.values[key] : undefined);
    /* Only pages with a knob on them, as on the E16 -- and a cell's page is
     * mapped back to the controller's own index, or a skipped page shifts
     * which page a knob drives (test_e16_skipped_pages.sh). */
    const knobPages = () => (ctl && ctl.pages ? ctl.pages.filter(pageHasKnobs) : []);
    const controllerPageOf = (j) => {
        if (!ctl || !ctl.pages) return j;
        let seen = -1;
        for (let i = 0; i < ctl.pages.length; i++) {
            if (pageHasKnobs(ctl.pages[i]) && ++seen === j) return i;
        }
        return j;
    };
    const viewNow = () =>
        buildView(knobPages(), nav ? nav.pageIndex : 0, { metaOf, valueOf, pageIndexOf: controllerPageOf });

    /* The module's name, not its position id ("synth", "fx1" is an address). */
    const moduleNameFor = (slot, component) => {
        const sl = ((chainOf() || {}).slots || [])[slot] || {};
        if (component === "synth") return sl.synth || "";
        let m = /^fx(\d+)$/.exec(component);
        if (m) return (sl.fx || [])[Number(m[1]) - 1] || "";
        m = /^midi_fx(\d+)$/.exec(component);
        if (m) return (sl.midiFx || [])[Number(m[1]) - 1] || "";
        m = /^bus(\d+)$/.exec(component);
        if (m) return (sl.buses || [])[Number(m[1]) - 1] || "";
        return component || "";
    };
    const slotEmpty = () => !buildMap(chainOf(), { slot: nav.slot }).cells.slice(4).some(Boolean);

    /* The nav's display is the E16's; the EC4 re-derives its screen every
     * tick instead, so there is nothing for an invalidate to do. */
    const nav = createNav({
        display: { invalidate() {} },
        chainOf,
        followFocusOf,
        pageCountOf: () => Math.max(1, knobPages().length),
        renderMixer: mixer ? () => {} : null,
        onFocus: () => {},
    });

    /* ---- what the screen should say ---- */

    function namesNow(t) {
        const cells = new Array(ENCODERS).fill("");
        if (nav.mapVisible(t)) {
            /* The map as names: a slot number or a module, the current slot
             * marked '>' -- the E16's LABELS map, cell for cell. */
            const m = buildMap(chainOf(), { slot: nav.slot, page: nav.mapPage, showBuses: nav.showBuses });
            for (let i = 0; i < ENCODERS; i++) {
                const c = m.cells[i];
                if (!c) continue;
                const name = c.kind === "slot" ? String(c.slot + 1) : abbrev4(c.label || "");
                cells[i] = ((c.current ? ">" : "") + name).slice(0, 4);
            }
        } else if (nav.mixer && mixer) {
            for (let e = 0; e < ENCODERS; e++) cells[e] = mixer.cell(e).label || "";
        } else if (!slotEmpty()) {
            const l = labelsFor(viewNow(), { metaOf });
            for (let e = 0; e < ENCODERS; e++) cells[e] = l.labels[e];
        }
        return cells.map((c) => pad(ascii(c), 4)).join("");
    }

    function showReading(rows, t) {
        overlayRows = rows.map((r) => pad(ascii(r), ec4.TOTAL_COLS));
        overlayUntil = t + OVERLAY_HOLD_MS;
    }

    function paramReading(enc, t) {
        const view = viewNow();
        const c = view.cells[enc];
        if (!c) return;
        const h = view.headers[c.half];
        const page = h ? String(h.name || "") : "";
        /* A bar only for a value that has one: an enum or a text value has
         * no position between min and max to fill to. */
        const numeric = isFinite(Number(c.value)) && c.max > c.min;
        showReading([
            moduleNameFor(nav.slot, nav.component) + (page ? " / " + page : ""),
            String(c.label || c.key),
            displayValue(c.value, metaOf(c.key) || {}),
            numeric ? barRow(ringAmount(c) / RING_MAX, c.bipolar) : "",
        ], t);
    }

    function pageReading(t) {
        const view = viewNow();
        const hs = view.headers.filter(Boolean).map((h) => String(h.name || ""));
        showReading([moduleNameFor(nav.slot, nav.component),
                     "Page " + (nav.pageIndex + 1) + "/" + Math.max(1, view.pageCount),
                     hs[0] || "", hs[1] || ""], t);
    }

    function mixerReading(enc, t) {
        const c = mixer.cell(enc);
        const r = mixer.ringFor(enc);
        showReading(["Mixer: " + mixer.nameOf(enc % 4), c.label || "",
                     (c.value || "") + (c.off ? " (off)" : ""),
                     barRow(r.amount / RING_MAX, r.bipolar)], t);
    }

    function overlayNow(t) {
        if (nav.mapVisible(t)) return null;
        if (!nav.mixer && slotEmpty()) return ["Slot " + (nav.slot + 1), "empty", "", "Shift: pick a module"];
        return t < overlayUntil ? overlayRows : null;
    }

    /* ---- the wire ---- */

    const emit = (bytes) => {
        let ok = false;
        try { ok = send(ec4.packetize(bytes)) !== false; } catch (e) { ok = false; }
        if (ok) sentMsgs++;
        return ok;
    };

    const active = () => enabled && reportedSetup === setupOf() && now() - heardAt < LOSS_MS;

    function onDevice(events, t) {
        heardAt = t;
        /* The bare header is the acknowledgement every write gets. */
        if (events.length === 0) { acks++; return; }
        for (const ev of events) {
            if (ev.type === "setup") reportedSetup = ev.setup;
            else if (ev.type === "key" && active()) {
                if (ev.key === "shift") nav.handle({ type: "shift", down: ev.pressed }, t);
                else if (/^push\d+$/.test(ev.key)) {
                    const enc = Number(ev.key.slice(4));
                    route(nav.handle(ev.pressed ? { type: "push", enc } : { type: "release", enc }, t), t);
                } else log("ec4: " + ev.key + (ev.pressed ? " down" : " up"));
            }
        }
    }

    const asm = createSysexAssembler({
        onMessage: (body) => {
            const events = ec4.parse([0xF0].concat(body, [0xF7]));
            if (events) onDevice(events, now());
        },
    });

    function ensureController() {
        if (ctl || !makeController) return ctl;
        ctl = makeController(focus);
        return ctl;
    }

    function syncFocus() {
        if (!ensureController()) return;
        const sig = nav.slot + ":" + nav.component;
        if (sig === loaded) return;
        loaded = sig;
        ctl.load({ slot: nav.slot, component: nav.component, prefix: nav.component });
    }

    /* What a nav action does beyond the nav itself -- the E16's feedMidi
     * branches, with a reading on the overlay where the E16 lit a ring. */
    function route(act, t) {
        if (!act) return act;
        if (mixer && act.action === "mixer") {
            if (act.on) mixer.load();
            return act;
        }
        if (mixer && (act.action === "mixerTurn" || act.action === "mixerPush")) {
            const changed = act.action === "mixerTurn"
                ? mixer.turn(act.enc, act.ticks, act.shift)
                : mixer.push(act.enc, act.shift);
            if (changed) mixerReading(act.enc, t);
            return act;
        }
        if (act.action === "page") { pageReading(t); return act; }
        if (act.action === "focus") {
            showReading([moduleNameFor(act.slot, act.component), "Slot " + (act.slot + 1), "", ""], t);
            return act;
        }
        if (!ctl) return act;
        if (act.action === "turn") {
            if (applyTurn(viewNow(), ctl, act.enc, act.ticks, t)) paramReading(act.enc, t);
            return act;
        }
        if (act.action === "click") {
            const before = ctl.pageIndex;
            const hit = applyClick(viewNow(), ctl, act.enc);
            if (ctl.pageIndex === before && hit) paramReading(act.enc, t);
            return act;
        }
        return act;
    }

    /* One tick's worth of messages: overlay visibility first when hiding (a
     * stale reading over the names is the worse screen), text next, showing
     * last so an overlay appears whole. */
    function drain(t, budget) {
        let n = 0;
        const out = (bytes) => { if (n >= budget) return false; if (!emit(bytes)) { n = budget; return false; } n++; return true; };
        if (shownOverlay !== false && !wantOverlay) {
            if (out(ec4.hideTotalMsg())) shownOverlay = false;
        }
        for (const p of wantOverlay ? [total, names] : [names]) {
            let run;
            while (n < budget && (run = p.next())) {
                if (!out(ec4.textMsg(run.page, [run]))) return n;
                p.sent(run);
            }
        }
        if (wantOverlay && shownOverlay !== true && total.synced) {
            if (out(ec4.showTotalMsg())) shownOverlay = true;
        }
        if (n === 0 && t - lastRestateAt >= RESTATE_MS) {
            lastRestateAt = t;
            /* Every fourth restate is the overlay's visibility, the rest are
             * text: a lost hide would otherwise strand a reading on screen. */
            restateTurn = (restateTurn + 1) % 4;
            if (restateTurn === 0) out(wantOverlay ? ec4.showTotalMsg() : ec4.hideTotalMsg());
            else {
                const run = (wantOverlay && restateTurn === 2) ? total.restate() : names.restate();
                out(ec4.textMsg(run.page, [run]));
            }
        }
        return n;
    }

    return {
        setEnabled(on) {
            on = !!on;
            if (on === enabled) return;
            const wasOurs = active();
            enabled = on;
            if (on) { goodbye = false; queriedAt = -Infinity; return; }
            /* Only a device showing OUR text is owed its names back: another
             * setup was never written to. */
            goodbye = wasOurs;
            if (goodbye) { names.set("----".repeat(16)); wantOverlay = false; }
        },

        setFollow(on) { nav.setFollow(!!on, now()); },

        noteParamWrite(slot, key, value) {
            if (!enabled || !ctl || !ctl.state || !ctl.state.values) return;
            if ((slot | 0) !== nav.slot) return;
            const k = String(key);
            for (const cell of viewNow().cells) {
                if (cell && (k === cell.key || k === nav.component + ":" + cell.key)) {
                    ctl.state.values[cell.key] = String(value);
                }
            }
        },

        feedMidi(data) {
            asm.feed(data);
            if (!active()) return null;
            const ev = decode(data);
            if (!ev) return null;
            const t = now();
            return route(nav.handle(ev, t), t);
        },

        tick() {
            const t = now();
            if (goodbye) {
                drain(t, MSGS_PER_TICK);
                if (names.synced && shownOverlay === false) goodbye = false;
                return;
            }
            if (!enabled) return;
            /* Seeking (never answered, or silent a while) asks faster. */
            const seeking = reportedSetup === null || t - heardAt >= KEEPALIVE_MS * 2;
            if (t - queriedAt >= (seeking ? QUERY_MS : KEEPALIVE_MS)) {
                if (emit(ec4.queryMsg())) queriedAt = t;
            }
            const isActive = active();
            if (isActive !== wasActive) {
                wasActive = isActive;
                log("ec4: " + (isActive ? "active on setup " + (reportedSetup + 1)
                                        : "inactive (setup " + (reportedSetup === null ? "?" : reportedSetup + 1) + ")"));
                /* Whatever the device shows now, it is not what we last told
                 * it: another setup's names, or a power cycle. */
                names.forget(); total.forget(); shownOverlay = null;
            }
            if (!isActive) return;
            nav.tick(t);
            syncFocus();
            if (ctl) ctl.tick();
            if (mixer && nav.mixer && !nav.mapVisible(t)) mixer.refreshNext();
            names.set(namesNow(t));
            const rows = overlayNow(t);
            wantOverlay = !!rows;
            if (rows) total.set(rows.map((r) => pad(ascii(r), ec4.TOTAL_COLS)).join(""));
            drain(t, MSGS_PER_TICK);
        },

        get enabled() { return enabled; },
        get present() { return active(); },
        get reportedSetup() { return reportedSetup; },
        get acks() { return acks; },
        get sent() { return sentMsgs; },
        get nav() { return nav; },
        get controller() { return ctl; },
        view: viewNow,
        /* What the device should be showing -- for tests and the log. */
        screen() { return { names: namesNow(now()), overlay: overlayNow(now()) }; },
    };
}
