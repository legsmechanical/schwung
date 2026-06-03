import { ctx } from './shadow_ui_ctx.mjs';
import {
    SCREEN_WIDTH,
    LIST_TOP_Y, LIST_LINE_HEIGHT, LIST_HIGHLIGHT_HEIGHT,
    LIST_LABEL_X, LIST_VALUE_X,
    FOOTER_RULE_Y,
    truncateText
} from '/data/UserData/schwung/shared/chain_ui_views.mjs';
import {
    drawMenuHeader as drawHeader,
    drawMenuFooter as drawFooter,
    drawMenuList
} from '/data/UserData/schwung/shared/menu_layout.mjs';
import {
    announce, announceMenuItem
} from '/data/UserData/schwung/shared/screen_reader.mjs';

const SEND_FX_COMPONENTS = [
    { key: "fx1", label: "FX 1", position: 0 },
    { key: "fx2", label: "FX 2", position: 1 },
    { key: "fx3", label: "FX 3", position: 2 },
];

let activeBus = 0;
let selectedComponent = 0;
let selectingModule = false;
let selectedModuleIndex = 0;

function busKey() { return activeBus === 0 ? "a" : "b"; }
function busLabel() { return activeBus === 0 ? "Send FX A" : "Send FX B"; }
function paramPrefix(slot) { return `send_fx:${busKey()}:fx${slot + 1}:`; }

function getParam(slot, key) {
    return shadow_get_param(0, paramPrefix(slot) + key);
}
function setParam(slot, key, val) {
    shadow_set_param(0, paramPrefix(slot) + key, val);
}

function getSlotModule(slot) {
    return getParam(slot, "name") || "";
}

export function enterSendFxSettings(bus) {
    const { scanForAudioFxModules, setView, VIEWS } = ctx;
    activeBus = bus;
    ctx.SEND_FX_OPTIONS = scanForAudioFxModules();
    selectedComponent = 0;
    selectingModule = false;
    setView(VIEWS.SEND_FX);
    ctx.needsRedraw = true;

    const moduleName = getSlotModule(0) || "Empty";
    announce(`${busLabel()}, FX 1 ${moduleName}`);
}

export function drawSendFx() {
    const { getModuleAbbrev } = ctx;

    clear_screen();

    if (selectingModule) {
        drawModuleSelect();
        return;
    }

    drawHeader(busLabel());

    const BOX_W = 28;
    const BOX_H = 16;
    const GAP = 3;
    const TOTAL_W = SEND_FX_COMPONENTS.length * BOX_W + (SEND_FX_COMPONENTS.length - 1) * GAP;
    const START_X = Math.floor((SCREEN_WIDTH - TOTAL_W) / 2);
    const BOX_Y = 20;

    for (let i = 0; i < SEND_FX_COMPONENTS.length; i++) {
        const comp = SEND_FX_COMPONENTS[i];
        const x = START_X + i * (BOX_W + GAP);
        const isSelected = i === selectedComponent;

        const moduleName = getSlotModule(i);
        let abbrev = moduleName ? (ctx.getModuleAbbrev(moduleName) || moduleName.slice(0, 3).toUpperCase()) : "--";

        if (isSelected) {
            fill_rect(x, BOX_Y, BOX_W, BOX_H, 1);
        } else {
            draw_rect(x, BOX_Y, BOX_W, BOX_H, 1);
        }

        const textColor = isSelected ? 0 : 1;
        const textX = x + Math.floor((BOX_W - abbrev.length * 5) / 2);
        const textY = BOX_Y + 5;
        print(textX, textY, abbrev, textColor);

        const bypassed = parseInt(getParam(i, "bypassed") || "0", 10) === 1;
        if (bypassed) {
            const bx = x + 1;
            const by = BOX_Y - 6;
            set_pixel(bx, by, 1); set_pixel(bx + 1, by, 1);
            set_pixel(bx, by + 1, 1); set_pixel(bx + 2, by + 1, 1);
            set_pixel(bx, by + 2, 1); set_pixel(bx + 1, by + 2, 1);
            set_pixel(bx, by + 3, 1); set_pixel(bx + 1, by + 3, 1); set_pixel(bx + 2, by + 3, 1);
        }
    }

    const comp = SEND_FX_COMPONENTS[selectedComponent];
    const labelY = BOX_Y + BOX_H + 4;
    const label = comp.label;
    const labelX = Math.floor((SCREEN_WIDTH - label.length * 5) / 2);
    print(labelX, labelY, label, 1);

    const infoY = labelY + 12;
    const moduleName = getSlotModule(selectedComponent);
    let infoLine = "(empty)";
    if (moduleName) {
        const opt = (ctx.SEND_FX_OPTIONS || []).find(o => o.id === moduleName);
        infoLine = opt ? opt.name : moduleName;
    }
    infoLine = truncateText(infoLine, 24);
    const infoX = Math.floor((SCREEN_WIDTH - infoLine.length * 5) / 2);
    print(infoX, infoY, infoLine, 1);
}

function drawModuleSelect() {
    const options = ctx.SEND_FX_OPTIONS || [];
    const comp = SEND_FX_COMPONENTS[selectedComponent];
    drawHeader(`Select ${comp ? comp.label : "FX"}`);

    if (options.length === 0) {
        print(LIST_LABEL_X, LIST_TOP_Y, "No FX modules available", 1);
        return;
    }

    drawMenuList({
        items: options,
        selectedIndex: selectedModuleIndex,
        listArea: { topY: LIST_TOP_Y, bottomY: FOOTER_RULE_Y },
        getLabel: (item) => item.name,
        getValue: (item) => {
            const currentModule = getSlotModule(selectedComponent);
            return item.id === currentModule ? "*" : "";
        }
    });
    drawFooter({left: "Back: cancel", right: "Click: apply"});
}

export function handleSendFxJog(delta) {
    if (selectingModule) {
        const options = ctx.SEND_FX_OPTIONS || [];
        selectedModuleIndex = Math.max(0, Math.min(options.length - 1, selectedModuleIndex + delta));
        const item = options[selectedModuleIndex];
        if (item) announceMenuItem(item.name);
    } else {
        selectedComponent = Math.max(0, Math.min(SEND_FX_COMPONENTS.length - 1, selectedComponent + delta));
        const comp = SEND_FX_COMPONENTS[selectedComponent];
        const moduleName = getSlotModule(selectedComponent) || "Empty";
        announce(`${comp.label} ${moduleName}`);
    }
}

export function handleSendFxSelect() {
    if (selectingModule) {
        const options = ctx.SEND_FX_OPTIONS || [];
        const selected = options[selectedModuleIndex];
        if (selected) {
            if (selected.id === "") {
                setParam(selectedComponent, "module", "");
            } else {
                setParam(selectedComponent, "module", selected.dspPath || "");
            }
        }
        selectingModule = false;
        ctx.needsRedraw = true;
    } else {
        const currentModule = getSlotModule(selectedComponent);
        if (currentModule) {
            const { enterSendFxHierarchyEditor } = ctx;
            enterSendFxHierarchyEditor(activeBus, selectedComponent);
        } else {
            enterModuleSelect();
        }
    }
}

function enterModuleSelect() {
    const options = ctx.SEND_FX_OPTIONS || [];
    selectedModuleIndex = 0;
    const currentModule = getSlotModule(selectedComponent);
    if (currentModule) {
        const idx = options.findIndex(o => o.id === currentModule);
        if (idx >= 0) selectedModuleIndex = idx;
    }
    selectingModule = true;
    ctx.needsRedraw = true;
}

export function handleSendFxBack() {
    const { setView, VIEWS, enterFxBusPicker } = ctx;
    if (selectingModule) {
        selectingModule = false;
        ctx.needsRedraw = true;
    } else {
        enterFxBusPicker();
    }
}

export function handleSendFxShiftSelect() {
    const bypassed = parseInt(getParam(selectedComponent, "bypassed") || "0", 10);
    setParam(selectedComponent, "bypassed", bypassed ? "0" : "1");
    const state = bypassed ? "enabled" : "bypassed";
    announce(`${SEND_FX_COMPONENTS[selectedComponent].label} ${state}`);
    ctx.needsRedraw = true;
}
