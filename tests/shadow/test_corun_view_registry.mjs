// Unit tests for the co-run view-addressing registry + verbs. Extracts the
// CORUN_ENTRIES block and the shadow_corun_* function bodies from
// src/shadow/shadow_ui.js and runs them in a Node vm sandbox with minimal stubs.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { strict as assert } from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const source = readFileSync(path.join(repoRoot, 'src/shadow/shadow_ui.js'), 'utf8');

// Extract the marker-delimited registry+verbs block.
function extractBlock(startMarker, endMarker) {
    const s = source.indexOf(startMarker);
    if (s < 0) throw new Error(`start marker not found: ${startMarker}`);
    const e = source.indexOf(endMarker, s);
    if (e < 0) throw new Error(`end marker not found: ${endMarker}`);
    return source.slice(s, e + endMarker.length);
}

const block = extractBlock(
    '/* ==== CO-RUN VIEW ADDRESSING (begin) ==== */',
    '/* ==== CO-RUN VIEW ADDRESSING (end) ==== */'
);

function makeSandbox(overrides = {}) {
    const calls = { overlay: [], entered: [] };
    const sandbox = {
        VIEWS: { SLOTS: 'slots', FX_BUS_PICKER: 'fxbuspicker' },
        view: null,
        needsRedraw: false,
        globalThis: {},
        enterChainEdit: (slot) => calls.entered.push(['chain_editor', slot]),
        enterMasterFxSettings: () => calls.entered.push(['master_fx']),
        enterGlobalSettings: () => calls.entered.push(['global_settings']),
        enterFxBusPicker: () => calls.entered.push(['fx_picker']),
        shadow_corun_overlay: (active, mask) => calls.overlay.push([active, mask]),
        shadow_corun_state: () => ({ target: 2, id: 3, keep_mask: 0x040E }),
        ...overrides,
    };
    sandbox.globalThis = sandbox; // shared global object, like the device
    vm.createContext(sandbox);
    vm.runInContext(block, sandbox);
    return { sandbox, calls };
}

// Test 1: entries() lists upstream catalog + fork-only fx_picker (enterFxBusPicker present)
{
    const { sandbox } = makeSandbox();
    const ids = sandbox.shadow_corun_entries();
    // Spread into host realm before deepEqual — vm Object.keys returns a cross-realm
    // array that Node's assert.deepStrictEqual rejects even when values are identical.
    assert.deepEqual(
        [...ids].sort(),
        ['chain_editor', 'fx_picker', 'global_settings', 'master_fx', 'slots'],
        'entries should list the four upstream screens + fork-only fx_picker'
    );
    console.log('ok - entries lists catalog incl fork-only fx_picker');
}

// Test 2: when enterFxBusPicker is absent (upstream build), fx_picker is NOT registered
{
    const { sandbox } = makeSandbox({ enterFxBusPicker: undefined });
    const ids = sandbox.shadow_corun_entries();
    assert.ok(![...ids].includes('fx_picker'), 'fx_picker must not register without enterFxBusPicker');
    assert.ok([...ids].includes('global_settings'), 'upstream screens still register');
    console.log('ok - fx_picker absent on builds lacking enterFxBusPicker');
}

// Test 3: open() looks up the entry, remembers prev mask, flips overlay via C helper, runs enter
{
    const { sandbox, calls } = makeSandbox();
    const ok = sandbox.shadow_corun_open('fx_picker', 0x041E);
    assert.equal(ok, true, 'open known id returns true');
    assert.deepEqual(calls.overlay.map(x => [...x]), [[1, 0x041E]], 'overlay(1, mask) called');
    assert.deepEqual(calls.entered.map(x => [...x]), [['fx_picker']], 'enter-function invoked');
    console.log('ok - open flips overlay + runs enter');
}

// Test 4: open() of an unknown id is a graceful no-op
{
    const { sandbox, calls } = makeSandbox();
    const ok = sandbox.shadow_corun_open('nope', 0x041E);
    assert.equal(ok, false, 'open unknown id returns false');
    assert.equal(calls.overlay.length, 0, 'no overlay flip for unknown id');
    assert.equal(calls.entered.length, 0, 'no enter for unknown id');
    console.log('ok - open unknown id is a no-op');
}

// Test 5: close() restores the remembered prev mask via overlay(0, prevMask)
{
    const { sandbox, calls } = makeSandbox();
    sandbox.shadow_corun_open('fx_picker', 0x041E); // prev mask from state stub = 0x040E
    sandbox.shadow_corun_close();
    assert.deepEqual([...calls.overlay[1]], [0, 0x040E], 'close restores prev keep_mask');
    console.log('ok - close restores prev mask');
}

// Test 6: close() when no overlay is open is a no-op
{
    const { sandbox, calls } = makeSandbox();
    sandbox.shadow_corun_close();
    assert.equal(calls.overlay.length, 0, 'close with no overlay does nothing');
    console.log('ok - close with no overlay is a no-op');
}

console.log('PASS test_corun_view_registry');
