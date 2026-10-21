import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const source = readFileSync(new URL("../OpenTrackerBarWidget.qml", import.meta.url), "utf8");

function functionSource(name) {
    const start = source.indexOf(`function ${name}(`);
    assert.notEqual(start, -1, `missing QML function ${name}`);
    const brace = source.indexOf("{", start);
    let depth = 0;
    for (let i = brace; i < source.length; i++) {
        if (source[i] === "{") depth++;
        if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`unterminated QML function ${name}`);
}

function makeRoot() {
    const root = {
        providers: [], opencodeProviders: [], openaiProviders: [], claudeProviders: [],
        providerTimes: { "opencode-go": 0, "opencode-zen": 0, codex: 0, claude: 0 },
        providerErrors: { "opencode-go": "", "opencode-zen": "", codex: "", claude: "" }, fetchStarted: { "opencode-go": false, "opencode-zen": false, codex: false, claude: false }, fetchStderr: { "opencode-go": "", "opencode-zen": "", codex: "", claude: "" },
        fetchActive: { "opencode-go": false, "opencode-zen": false, codex: false, claude: false },
        fetchTimeouts: { "opencode-go": "", "opencode-zen": "", codex: "", claude: "" },
        fetchAwaitingExit: { "opencode-go": false, "opencode-zen": false, codex: false, claude: false },
        pendingFetches: 0, isLoading: false, opencodeError: "", openaiError: "", claudeError: "", hasError: false,
        activeTab: "opencode", refreshIntervalMs: 1000, clockNow: Date.now(), lastUpdated: "", barProviders: [],
        pluginId: "openTrackerBar", pluginData: {}, barSources: ["opencode-go", "opencode-zen", "codex"],
        usageDisplayMode: "used", notificationsEnabled: false, zenBalanceThreshold: 1, alertQueue: [], alertProcessBusy: false,
        barSourceWindows: { "opencode-go": "rolling", codex: "primary", "opencode-zen": "none", claude: "fiveHour" }, localStatsEnabled: false, localStats: null, localStatsLoading: false, localStatsError: "", localStatsBuffer: "", localStatsStderr: "", localStatsStarted: false, localStatsAwaitingExit: false, localStatsUpdatedAt: 0, interactionActive: false,
        alertActiveRecord: null, alertOutput: "", alertTimeoutMs: 15000, pluginService: null
    };
    const timer = { starts: 0, interval: 15000, restart() { this.starts++; }, stop() {} };
    const process = { command: [], running: false, processId: null, signal() {} };
    root.alertProcess = process;
    root.procOpencode = { command: [], running: false, processId: null };
    root.procOpencodeZen = { command: [], running: false, processId: null };
    root.procOpenai = { command: [], running: false, processId: null };
    root.procClaude = { command: [], running: false, processId: null };
    root.procLocalStats = { command: [], running: false, processId: null, signal() {} };
    root.testWatchdog = timer;
    const globals = { root, Date, JSON, Number, Math, isFinite, console: { warn() {} }, Theme: { error: "error", warning: "warning", success: "success" }, Qt: { formatDateTime: () => "12:00:00" }, watchdogGo: timer, watchdogZen: timer, watchdogCodex: timer, watchdogClaude: timer, alertWatchdog: timer, localStatsWatchdog: timer, procAlert: process, procOpencode: root.procOpencode, procOpencodeZen: root.procOpencodeZen, procOpenai: root.procOpenai, procClaude: root.procClaude, procLocalStats: root.procLocalStats };
    for (const key of ["providerErrors", "providerTimes", "clockNow", "refreshIntervalMs", "fetchActive", "fetchTimeouts", "fetchAwaitingExit", "fetchStarted", "fetchStderr", "pendingFetches", "isLoading", "activeTab", "localStatsEnabled", "localStats", "localStatsLoading", "localStatsError", "localStatsBuffer", "localStatsStderr", "localStatsStarted", "localStatsAwaitingExit", "localStatsUpdatedAt", "interactionActive", "barSourceWindows", "claudeProviders", "claudeError"])
        Object.defineProperty(globals, key, { get: () => root[key], set: value => { root[key] = value; } });
    const context = vm.createContext(globals);
    const names = ["parseProviderOutput", "mergeProviders", "setProviderError", "finishFetch", "providerError", "providerHint", "providerRecoveryCommand", "classifyProviderFailure", "appendFetchStderr", "markFetchStarted", "providerUpdatedAt", "providerIsStale", "providerUpdatedLabel", "providerBalanceText", "barProviderText", "primaryUsage", "secondaryUsage", "tertiaryUsage", "claudeUsageWindow", "providerUsageWindows", "validNumber", "validUsageWindow", "hasZenBalance", "getUsageColor", "formatProviderName", "providerLogoPath", "providerTab", "currentProviders", "currentError", "normalizeBarSources", "legacyBarSources", "isBarSourceSelected", "toggleBarSource", "normalizeBarSourceWindows", "selectedWindowKey", "availableBarWindows", "barUsageWindow", "barWindowLabel", "setBarSourceWindow", "setLocalStatsEnabled", "selectBarProviders", "primaryLabel", "barTooltipText", "formatTimeUntil", "startFetch", "refreshProvider", "timeoutFetch", "savePluginSetting", "setUsageDisplayMode", "setNotificationsEnabled", "setZenBalanceThreshold", "displayPercent", "alertWindows", "alertState", "alertPrefs", "removeAlertReservation", "removeAlertReservationForProvider", "saveAlertState", "baselineAlertSource", "evaluateProviderAlerts", "startNextAlert", "finishAlert", "localDayBounds", "parseLocalStats", "ensureLocalStats", "invalidateLocalStatsForDay", "refreshLocalStats", "finishLocalStats", "localStatsNeedsUpgrade", "timeoutLocalStats"];
    for (const name of names) root[name] = vm.runInContext(`(${functionSource(name)})`, context);
    return root;
}

test("parses quota providers and Zen balance without treating it as quota", () => {
    const root = makeRoot();
    root.parseProviderOutput("opencode-zen", JSON.stringify([null, { provider: "opencode-zen", usage: { billingMode: "prepaid", mode: "pay-as-you-go", balanceMicroCents: "0", balanceDollars: 0, creditLimitMicroCents: null } }]));
    root.parseProviderOutput("opencode-go", JSON.stringify([{ provider: "opencode-go", usage: { rolling: { usedPercent: 41 } } }]));
    root.parseProviderOutput("codex", JSON.stringify([{ provider: "codex", usage: { primary: { usedPercent: 73 }, weekly: { usedPercent: 12 } } }]));
    assert.equal(root.primaryUsage(root.opencodeProviders.find(p => p.provider === "opencode-zen").usage), null);
    assert.equal(root.providerBalanceText(root.opencodeProviders.find(p => p.provider === "opencode-zen").usage), "$0.00");
    assert.equal(root.primaryUsage(root.opencodeProviders.find(p => p.provider === "opencode-go").usage).usedPercent, 41);
    assert.equal(root.primaryUsage(root.openaiProviders[0].usage).usedPercent, 73);
    assert.equal(root.barProviderText(root.opencodeProviders.find(p => p.provider === "opencode-zen")), "$0.00");
    assert.equal(root.providerBalanceText({ balanceDollars: 4.5, balanceMicroCents: null }), "$4.50");
    assert.equal(root.providerBalanceText({ balanceDollars: null, balanceMicroCents: "150000000" }), "$1.50");
    assert.equal(root.hasZenBalance({ balanceDollars: 0 }), true);
    assert.equal(root.hasZenBalance({ balanceDollars: null, balanceMicroCents: null }), false);
});

test("Claude accepts valid optional windows, preserves fractional usage, and rejects unusable payloads", () => {
    const root = makeRoot();
    const payload = { provider: "claude", usage: { fiveHour: { usedPercent: 32.5, resetsAt: "2026-03-01T00:00:00Z", windowSeconds: 18000 }, sevenDay: { usedPercent: 41.25, windowSeconds: 604800 }, sonnet: { usedPercent: 55.5, windowSeconds: 604800 }, opus: { usedPercent: 64.75, windowSeconds: 604800 }, updatedAt: "2026-02-28T12:00:00Z", source: "claude-oauth" } };
    root.parseProviderOutput("claude", JSON.stringify([payload]));
    assert.equal(root.claudeProviders[0].usage.fiveHour.usedPercent, 32.5);
    assert.deepEqual(JSON.parse(JSON.stringify(root.providerUsageWindows("claude", payload.usage).map(({ key, label }) => ({ key, label })))), [
        { key: "fiveHour", label: "5-hour" }, { key: "sevenDay", label: "Weekly" }, { key: "sonnet", label: "Sonnet" }, { key: "opus", label: "Opus" }
    ]);
    assert.equal(root.providerUsageWindows("claude", { sonnet: { usedPercent: 11.5 } })[0].key, "sonnet");
    assert.equal(root.primaryUsage(payload.usage), null);
    const old = root.claudeProviders;
    for (const usage of [{ fiveHour: { usedPercent: null } }, { opus: { usedPercent: "" } }, { sevenDay: { usedPercent: false } }]) {
        assert.throws(() => root.parseProviderOutput("claude", JSON.stringify([{ provider: "claude", usage }])));
        assert.equal(root.claudeProviders, old);
    }
});

test("Opencode cards stay ordered Go then Zen regardless of fetch completion order", () => {
    const go = { provider: "opencode-go", usage: { rolling: { usedPercent: 54 } } };
    const zen = { provider: "opencode-zen", usage: { balanceDollars: 0 } };
    for (const order of [[go, zen], [zen, go]]) {
        const root = makeRoot();
        for (const provider of [...order, ...order.slice().reverse()]) {
            root.parseProviderOutput(provider.provider, JSON.stringify([provider]));
            if (root.opencodeProviders.length === 2)
                assert.deepEqual(Array.from(root.opencodeProviders, p => p.provider), ["opencode-go", "opencode-zen"]);
        }
    }
});

test("provider merging keeps Claude after the existing provider order", () => {
    const root = makeRoot();
    root.opencodeProviders = [{ provider: "opencode-zen" }, { provider: "opencode-go" }];
    root.openaiProviders = [{ provider: "codex" }];
    root.claudeProviders = [{ provider: "claude" }];
    root.mergeProviders();
    assert.deepEqual(JSON.parse(JSON.stringify(root.providers.map(item => item.provider))), ["opencode-zen", "opencode-go", "codex", "claude"]);
});

test("bar selection includes only explicitly selected sources in stable allowlist order", () => {
    const root = makeRoot();
    const providers = [
        { provider: "codex", usage: { primary: { usedPercent: 82 } } },
        { provider: "opencode-go", usage: { rolling: { usedPercent: 54 } } },
        { provider: "opencode-zen", usage: { balanceDollars: 0 } }
    ];
    assert.deepEqual(JSON.parse(JSON.stringify(root.selectBarProviders(providers, ["codex", "opencode-go", "opencode-zen"]))), [providers[1], providers[2], providers[0]]);
    const allowlist = ["opencode-go", "opencode-zen", "codex"];
    for (let mask = 0; mask < 8; mask++) {
        const selected = allowlist.filter((_, index) => mask & (1 << index));
        const expected = allowlist.filter(id => selected.includes(id)).map(id => providers.find(provider => provider.provider === id));
        assert.deepEqual(JSON.parse(JSON.stringify(root.selectBarProviders(providers, selected))), expected);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(root.selectBarProviders(providers, ["invalid-source"]))), []);
    assert.deepEqual(JSON.parse(JSON.stringify(root.selectBarProviders([{ provider: "opencode-zen", usage: {} }], ["opencode-zen"]))), []);
});

test("bar source normalization migrates legacy values and sanitizes arrays", () => {
    const root = makeRoot();
    assert.deepEqual(JSON.parse(JSON.stringify(root.legacyBarSources("opencode"))), ["opencode-go", "opencode-zen"]);
    assert.deepEqual(JSON.parse(JSON.stringify(root.legacyBarSources("openai"))), ["codex"]);
    for (const legacy of ["both", "auto", undefined, null, "unknown"])
        assert.deepEqual(JSON.parse(JSON.stringify(root.legacyBarSources(legacy))), ["opencode-go", "opencode-zen", "codex"]);
    assert.deepEqual(JSON.parse(JSON.stringify(root.normalizeBarSources(["codex", "opencode-go", "codex", "fake"]))), ["opencode-go", "codex"]);
    assert.deepEqual(JSON.parse(JSON.stringify(root.normalizeBarSources([]))), []);
    assert.deepEqual(JSON.parse(JSON.stringify(root.normalizeBarSources(["claude", "codex"]))), ["codex", "claude"]);
    for (const invalid of [null, "codex", {}, 42])
        assert.deepEqual(JSON.parse(JSON.stringify(root.normalizeBarSources(invalid))), ["opencode-go", "opencode-zen", "codex"]);
});

test("existing bar pins stay unchanged and Claude can be pinned explicitly", () => {
    const root = makeRoot();
    for (const legacy of ["opencode", "openai", "both", "auto"]) {
        const pins = root.legacyBarSources(legacy);
        assert.equal(pins.includes("claude"), false);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(root.normalizeBarSources(["opencode-go", "codex"]))), ["opencode-go", "codex"]);
    root.pluginService = { savePluginData: (_id, _key, value) => { root.barSources = value; return true; } };
    root.barSources = ["codex"];
    assert.equal(root.toggleBarSource("claude"), true);
    assert.deepEqual(JSON.parse(JSON.stringify(root.barSources)), ["codex", "claude"]);
});

test("bar source property distinguishes absent settings from an explicit empty selection", () => {
    assert.match(source, /readonly property var barSources:\s*root\.normalizeBarSources\(root\.pluginData && root\.pluginData\.barSources !== undefined \? root\.pluginData\.barSources : root\.legacyBarSources\(root\.pluginData \? root\.pluginData\.barProvider : undefined\)\)/);
    const root = makeRoot();
    root.pluginData = { barProvider: "opencode" };
    assert.deepEqual(JSON.parse(JSON.stringify(root.normalizeBarSources(root.pluginData.barSources !== undefined ? root.pluginData.barSources : root.legacyBarSources(root.pluginData.barProvider)))), ["opencode-go", "opencode-zen"]);
    root.pluginData = { barProvider: "opencode", barSources: [] };
    assert.deepEqual(JSON.parse(JSON.stringify(root.normalizeBarSources(root.pluginData.barSources !== undefined ? root.pluginData.barSources : root.legacyBarSources(root.pluginData.barProvider)))), []);
});

test("source toggle persists the exact allowlisted payload and reflects plugin data refresh", () => {
    const root = makeRoot();
    root.barSources = ["opencode-go", "codex"];
    root.pluginData = { barSources: root.barSources };
    const calls = [];
    root.pluginService = {
        savePluginData(pluginId, key, value) {
            calls.push([pluginId, key, value]);
            root.pluginData = { ...root.pluginData, [key]: value };
            root.barSources = root.normalizeBarSources(root.pluginData.barSources);
            return true;
        }
    };
    assert.equal(root.isBarSourceSelected("opencode-go"), true);
    assert.equal(root.toggleBarSource("opencode-go"), true);
    assert.deepEqual(calls, [["openTrackerBar", "barSources", ["codex"]]]);
    assert.deepEqual(JSON.parse(JSON.stringify(root.barSources)), ["codex"]);
    assert.equal(root.toggleBarSource("opencode-zen"), true);
    assert.deepEqual(JSON.parse(JSON.stringify(calls[1])), ["openTrackerBar", "barSources", ["opencode-zen", "codex"]]);
    assert.equal(root.isBarSourceSelected("not-a-source"), false);
    assert.equal(root.toggleBarSource("not-a-source"), false);
    assert.equal(calls.length, 2);
});

test("display mode round-trips quota percentages without changing used values", () => {
    const root = makeRoot();
    const calls = [];
    root.pluginService = { savePluginData: (...args) => { calls.push(args); return true; } };
    const quota = { usedPercent: 132 };
    assert.equal(root.displayPercent(quota), 100);
    assert.equal(root.getUsageColor(95), "error");
    root.usageDisplayMode = "remaining";
    assert.equal(root.displayPercent(quota), 0);
    root.barProviders = [{ provider: "codex", usage: { primary: { usedPercent: 25 } } }];
    assert.equal(root.barProviderText(root.barProviders[0]), "75%");
    assert.match(root.barTooltipText(), /Session \(remaining\) 75%/);
    assert.equal(root.setUsageDisplayMode("remaining"), true);
    assert.equal(root.setUsageDisplayMode("other"), false);
    assert.deepEqual(calls, [["openTrackerBar", "usageDisplayMode", "remaining"]]);
});

test("notification settings reject invalid values and save exact payloads", () => {
    const root = makeRoot();
    const calls = [];
    root.pluginService = { savePluginData: (...args) => { calls.push(args); return true; } };
    assert.equal(root.setNotificationsEnabled(true), true);
    for (const value of [null, "", true, NaN, -1, 1.001]) assert.equal(root.setZenBalanceThreshold(value), false);
    assert.equal(root.setZenBalanceThreshold("0.75"), true);
    assert.equal(root.setZenBalanceThreshold(0), true);
    assert.equal(root.setZenBalanceThreshold("1.10"), true);
    assert.equal(root.setZenBalanceThreshold(0.29), true);
    assert.equal(root.setZenBalanceThreshold(1.01), true);
    assert.deepEqual(calls, [
        ["openTrackerBar", "notificationsEnabled", true],
        ["openTrackerBar", "zenBalanceThreshold", 0.75],
        ["openTrackerBar", "zenBalanceThreshold", 0],
        ["openTrackerBar", "zenBalanceThreshold", 1.1],
        ["openTrackerBar", "zenBalanceThreshold", 0.29],
        ["openTrackerBar", "zenBalanceThreshold", 1.01]
    ]);
});

test("quota alerts baseline silently, emit the highest crossed threshold, and suppress duplicates", () => {
    const root = makeRoot();
    let state = null;
    root.notificationsEnabled = true;
    root.pluginData.notificationsEnabled = true;
    root.pluginService = {
        loadPluginState: () => state,
        savePluginState: (_id, _key, next) => { state = structuredClone(next); }
    };
    const output = percent => JSON.stringify([{ provider: "opencode-go", usage: { rolling: { usedPercent: percent } } }]);
    root.parseProviderOutput("opencode-go", output(0));
    assert.equal(root.alertQueue.length, 0);
    root.parseProviderOutput("opencode-go", output(96));
    assert.match(root.alertActiveRecord.body, /95/);
    assert.doesNotMatch(root.alertActiveRecord.body, /threshold 80/);
    assert.deepEqual(JSON.parse(JSON.stringify(root.alertProcess.command.slice(0, 8))), ["dms", "notify", "-a", "OpenTrackerBar", "-u", "normal", "-i", "monitoring"]);
    root.finishAlert(0, false);
    root.parseProviderOutput("opencode-go", output(96));
    assert.equal(root.alertQueue.length, 0);
    const restarted = makeRoot();
    restarted.notificationsEnabled = true;
    restarted.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    restarted.parseProviderOutput("opencode-go", output(96));
    assert.equal(restarted.alertQueue.length, 0);
});

test("Claude alert windows baseline quietly, cross thresholds, and reset by UTC cycle", () => {
    const root = makeRoot();
    let state = null;
    root.notificationsEnabled = true;
    root.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    const read = (used, reset) => root.parseProviderOutput("claude", JSON.stringify([{ provider: "claude", usage: { fiveHour: { usedPercent: used, resetsAt: reset }, opus: { usedPercent: 0 } } }]));
    read(79, "2026-03-01T00:00:00Z");
    assert.equal(root.alertQueue.length, 0);
    read(81, "2026-03-01T00:00:00Z");
    assert.match(root.alertActiveRecord.body, /Claude 5-hour 81% used; threshold 80/);
    root.finishAlert(0, false);
    read(96, "2026-03-01T00:00:00Z");
    assert.match(root.alertActiveRecord.body, /threshold 95/);
    root.finishAlert(0, false);
    read(96, "2026-03-01T05:00:00Z");
    assert.equal(root.alertActiveRecord, null);
    assert.equal(state.sources.claude.windows["claude:fiveHour"].sent95, true);
});

test("Claude alert reservations coexist with other providers", () => {
    const root = makeRoot();
    let state = null;
    root.notificationsEnabled = true;
    root.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    const read = (provider, percent) => root.parseProviderOutput(provider, JSON.stringify([{ provider, usage: provider === "claude" ? { sonnet: { usedPercent: percent } } : { rolling: { usedPercent: percent } } }]));
    read("opencode-go", 0); read("claude", 0);
    read("opencode-go", 96); read("claude", 96);
    assert.equal(root.alertQueue.length, 1);
    assert.ok(state.pending.some(entry => entry.provider === "claude"));
    root.finishAlert(0, false);
    assert.equal(root.alertActiveRecord.provider, "claude");
});

test("disabled and changed alert preferences baseline on the next successful read", () => {
    const root = makeRoot();
    let state = null;
    root.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    const fetch = value => root.parseProviderOutput("opencode-go", JSON.stringify([{ provider: "opencode-go", usage: { rolling: { usedPercent: value } } }]));
    root.notificationsEnabled = true;
    fetch(20);
    root.notificationsEnabled = false;
    fetch(96);
    root.notificationsEnabled = true;
    fetch(96);
    assert.equal(root.alertActiveRecord, null);
    root.zenBalanceThreshold = 0.5;
    fetch(96);
    assert.equal(root.alertActiveRecord, null);
});

test("quota alert latch rearms below thresholds and sender failure leaves it uncommitted", () => {
    const root = makeRoot();
    let state = null;
    root.notificationsEnabled = true;
    root.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    const fetch = value => root.parseProviderOutput("codex", JSON.stringify([{ provider: "codex", usage: { primary: { usedPercent: value } } }]));
    fetch(0);
    fetch(82);
    assert.match(root.alertActiveRecord.body, /threshold 80/);
    root.finishAlert(1, false);
    fetch(82);
    assert.ok(root.alertActiveRecord);
    root.finishAlert(0, false);
    fetch(79);
    fetch(81);
    assert.match(root.alertActiveRecord.body, /threshold 80/);
    root.finishAlert(0, false);
    fetch(79);
    fetch(81);
    assert.match(root.alertActiveRecord.body, /threshold 80/);
});

test("Zen alerts use dollar balance, include zero threshold, and rearm after a top-up", () => {
    const root = makeRoot();
    let state = null;
    root.notificationsEnabled = true;
    root.zenBalanceThreshold = 0;
    root.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    const fetch = balanceMicroCents => root.parseProviderOutput("opencode-zen", JSON.stringify([{ provider: "opencode-zen", usage: { balanceDollars: null, balanceMicroCents } }]));
    fetch(200000000);
    fetch(0);
    assert.match(root.alertActiveRecord.body, /Balance is \$0\.00/);
    root.finishAlert(0, false);
    fetch(50000000);
    fetch(0);
    assert.ok(root.alertActiveRecord);
});

test("parallel provider sends merge only their own source state and reservations", () => {
    const root = makeRoot();
    let state = null;
    root.notificationsEnabled = true;
    root.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    const quota = (provider, percent) => provider === "codex"
        ? JSON.stringify([{ provider, usage: { primary: { usedPercent: percent } } }])
        : JSON.stringify([{ provider, usage: { rolling: { usedPercent: percent } } }]);
    root.parseProviderOutput("opencode-zen", JSON.stringify([{ provider: "opencode-zen", usage: { balanceDollars: 3 } }]));
    root.parseProviderOutput("opencode-go", quota("opencode-go", 0));
    root.parseProviderOutput("codex", quota("codex", 0));
    root.parseProviderOutput("opencode-go", quota("opencode-go", 96));
    root.parseProviderOutput("codex", quota("codex", 96));
    root.parseProviderOutput("opencode-zen", JSON.stringify([{ provider: "opencode-zen", usage: { balanceDollars: 0 } }]));
    assert.equal(root.alertQueue.length, 2);
    const codexReservation = state.pending.find(entry => entry.provider === "codex");
    const zenReservation = state.pending.find(entry => entry.provider === "opencode-zen");
    root.testWatchdog.interval = 3000;
    root.finishAlert(0, false);
    assert.equal(root.alertActiveRecord.provider, "codex");
    assert.equal(root.testWatchdog.interval, 15000);
    assert.ok(state.pending.some(entry => entry.token === codexReservation.token));
    root.finishAlert(1, false);
    assert.equal(root.alertActiveRecord.provider, "opencode-zen");
    assert.ok(state.pending.some(entry => entry.token === zenReservation.token));
    assert.equal(state.sources["opencode-go"].windows["opencode-go:rolling"].sent95, true);
    assert.equal(state.sources.codex.windows["codex:primary"].used, 0);
    root.finishAlert(0, false);
    assert.equal(state.pending.length, 0);
    assert.equal(state.sources["opencode-go"].windows["opencode-go:rolling"].sent95, true);
    assert.equal(state.sources.codex.windows["codex:primary"].used, 0);
    assert.equal(state.sources["opencode-zen"].zen, 0);
    root.parseProviderOutput("codex", quota("codex", 96));
    assert.equal(root.alertActiveRecord.provider, "codex");
});

test("queued alerts cancel on disable and stale send completions do not commit", () => {
    const root = makeRoot();
    let state = null;
    root.notificationsEnabled = true;
    root.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    const go = percent => JSON.stringify([{ provider: "opencode-go", usage: { rolling: { usedPercent: percent } } }]);
    const codex = percent => JSON.stringify([{ provider: "codex", usage: { primary: { usedPercent: percent } } }]);
    root.parseProviderOutput("opencode-go", go(0));
    root.parseProviderOutput("codex", codex(0));
    root.parseProviderOutput("opencode-go", go(96));
    root.parseProviderOutput("codex", codex(96));
    root.notificationsEnabled = false;
    root.finishAlert(0, false);
    assert.equal(root.alertActiveRecord, null);
    assert.equal(root.alertQueue.length, 0);
    assert.equal(state.pending.length, 0);
    assert.equal(state.sources["opencode-go"].windows["opencode-go:rolling"].used, 0);

    root.notificationsEnabled = true;
    root.parseProviderOutput("opencode-go", go(0));
    root.parseProviderOutput("opencode-go", go(96));
    const oldToken = root.alertActiveRecord.token;
    root.zenBalanceThreshold = 0.5;
    root.finishAlert(0, false);
    assert.equal(state.pending.some(entry => entry.token === oldToken), false);
    assert.equal(state.sources["opencode-go"].windows["opencode-go:rolling"].used, 0);
});

test("preference changes baseline only the fresh provider and crashed reservations expire", () => {
    const root = makeRoot();
    let state = null;
    root.notificationsEnabled = true;
    root.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    const go = percent => JSON.stringify([{ provider: "opencode-go", usage: { rolling: { usedPercent: percent } } }]);
    const codex = percent => JSON.stringify([{ provider: "codex", usage: { primary: { usedPercent: percent } } }]);
    root.parseProviderOutput("codex", codex(75));
    root.parseProviderOutput("opencode-go", go(0));
    root.zenBalanceThreshold = 0.5;
    root.parseProviderOutput("opencode-go", go(10));
    root.parseProviderOutput("codex", codex(96));
    assert.equal(root.alertActiveRecord, null);
    assert.equal(state.sources.codex.windows["codex:primary"].used, 96);

    state.pending.push({ token: "crashed", provider: "codex", prefs: root.alertPrefs(), time: Date.now() - 180001 });
    state.sources.codex.windows["codex:primary"] = { used: 0, resetsAt: "", sent80: false, sent95: false };
    root.parseProviderOutput("codex", codex(96));
    assert.equal(root.alertActiveRecord.provider, "codex");
    assert.equal(state.pending.some(entry => entry.token === "crashed"), false);
});

test("quota readers reject null, empty, and boolean percentages", () => {
    const root = makeRoot();
    for (const usedPercent of [null, "", true, false, [], {}])
        assert.equal(root.primaryUsage({ rolling: { usedPercent } }), null);
    assert.equal(root.secondaryUsage({ weekly: { usedPercent: "" } }), null);
    assert.equal(root.tertiaryUsage({ monthly: { usedPercent: false } }), null);
});

test("failed, empty, or invalid output preserves source data and update time", () => {
    const root = makeRoot();
    root.fetchActive["opencode-go"] = true;
    root.pendingFetches = 1;
    root.finishFetch("opencode-go", 0, '[{"provider":"opencode-go","usage":{"rolling":{"usedPercent":55}}}]');
    const oldProviders = root.opencodeProviders;
    const oldTime = root.providerUpdatedAt("opencode-go");
    root.fetchActive["opencode-go"] = true;
    root.pendingFetches = 1;
    root.finishFetch("opencode-go", 0, "not-json");
    assert.equal(root.opencodeProviders, oldProviders);
    assert.equal(root.providerUpdatedAt("opencode-go"), oldTime);
    assert.equal(root.providerError("opencode-go"), "Provider returned invalid data");
    root.fetchActive["opencode-go"] = true;
    root.pendingFetches = 1;
    root.finishFetch("opencode-go", 0, "   ");
    assert.equal(root.providerUpdatedAt("opencode-go"), oldTime);
    assert.equal(root.providerError("opencode-go"), "Provider returned no data");
    for (const raw of [
        '[{"provider":"opencode-go","usage":null}]',
        '[{"provider":"opencode-go","usage":{"rolling":{"usedPercent":20}},"error":{"message":"bad"}}]'
    ]) {
        root.fetchActive["opencode-go"] = true;
        root.pendingFetches = 1;
        root.finishFetch("opencode-go", 0, raw);
        assert.equal(root.opencodeProviders, oldProviders);
        assert.equal(root.providerUpdatedAt("opencode-go"), oldTime);
        assert.equal(root.providerError("opencode-go"), "Provider returned invalid data");
    }
});

test("fresh timestamps retain epoch precision and match the QML property type", () => {
    const root = makeRoot();
    root.parseProviderOutput("codex", '[{"provider":"codex","usage":{"primary":{"usedPercent":2}}}]');
    assert.equal(typeof root.providerUpdatedAt("codex"), "number");
    assert.ok(root.providerUpdatedAt("codex") > 2 ** 31);
    assert.match(source, /property real clockNow: Date\.now\(\)/);
});

test("tooltip includes the selected quota, reset, and source age", () => {
    const root = makeRoot();
    root.clockNow = Date.UTC(2026, 0, 1, 12, 0, 0);
    root.refreshIntervalMs = 120000;
    root.providerTimes["opencode-go"] = root.clockNow - 65000;
    root.barProviders = [{ provider: "opencode-go", usage: { rolling: { usedPercent: 64, resetsAt: "2026-01-01T12:10:00Z" } } }];
    const tooltip = root.barTooltipText();
    assert.match(tooltip, /Opencode Go: Rolling \(used\) 64%/);
    assert.match(tooltip, /resets 10m/);
    assert.match(tooltip, /updated 1m ago/);
    root.barProviders[0].usage.rolling.resetsAt = null;
    assert.doesNotThrow(() => root.barTooltipText());
    root.barProviders = [{ provider: "opencode-zen", usage: { balanceDollars: 0 } }];
    assert.match(root.barTooltipText(), /Balance \$0\.00/);
});

test("tracks three pending processes once and marks data stale", () => {
    const root = makeRoot();
    root.clockNow = Date.now();
    root.providerTimes["opencode-go"] = root.clockNow - 2000;
    assert.equal(root.providerIsStale("opencode-go"), true);
    const processes = ["opencode-go", "opencode-zen", "codex"].map(target => ({ running: false, command: [], target }));
    const start = root.startFetch;
    for (const process of processes) start(process.target, process, true);
    assert.equal(root.pendingFetches, 3);
    assert.deepEqual(JSON.parse(JSON.stringify(processes.map(p => p.command))), [
        ["opentracker", "fetch", "opencode-go", "--force"],
        ["opentracker", "fetch", "opencode-zen", "--force"],
        ["opentracker", "fetch", "codex", "--force"]
    ]);
    root.finishFetch("opencode-go", 1, "");
    root.finishFetch("opencode-zen", 1, "");
    root.finishFetch("codex", 1, "");
    root.finishFetch("codex", 1, "");
    assert.equal(root.pendingFetches, 0);
    assert.equal(root.isLoading, false);
});

test("timeout finishes once and blocks a new generation until the old exit", () => {
    const root = makeRoot();
    const process = { running: false, processId: null, command: [], signal() { throw new Error("must not signal a missing process"); } };
    root.startFetch("opencode-go", process, false);
    assert.equal(root.fetchActive["opencode-go"], true);
    root.markFetchStarted("opencode-go");
    assert.equal(root.testWatchdog.starts, 1);
    process.running = false;
    root.timeoutFetch("opencode-go", process);
    assert.equal(root.pendingFetches, 0);
    assert.equal(root.providerError("opencode-go"), "Provider request timed out");
    assert.equal(root.fetchAwaitingExit["opencode-go"], false);
    root.startFetch("opencode-go", process, false);
    assert.equal(root.pendingFetches, 1);
    assert.equal(root.fetchActive["opencode-go"], true);
    assert.doesNotMatch(source, /onErrorOccurred:/);
});

test("a process that never starts is reported as a missing CLI", () => {
    const root = makeRoot();
    root.fetchActive.codex = true;
    root.pendingFetches = 1;
    root.finishFetch("codex", -1, "", "Timed out after 30 seconds");
    assert.equal(root.providerErrors.codex, "missing-cli");
    assert.equal(root.providerRecoveryCommand("codex"), "opentracker version");
});

test("timeout sends SIGKILL and waits for a real process exit", () => {
    const root = makeRoot();
    const signals = [];
    const process = { running: false, processId: null, command: [], signal(value) { signals.push(value); } };
    root.startFetch("codex", process, false);
    process.running = true;
    process.processId = 4567;
    root.timeoutFetch("codex", process);
    assert.deepEqual(signals, [9]);
    assert.equal(root.fetchAwaitingExit.codex, true);
    root.startFetch("codex", process, false);
    assert.equal(root.pendingFetches, 0);
});

test("bar windows persist per provider, fall back to valid windows, and accept secondary-only quota", () => {
    const root = makeRoot();
    root.pluginService = { savePluginData: (_id, key, value) => { root[key] = value; return true; } };
    root.providers = [{ provider: "opencode-go", usage: { weekly: { usedPercent: 43 }, monthly: { usedPercent: 71 } } }, { provider: "codex", usage: { secondary: { usedPercent: 22 } } }];
    root.barSourceWindows = root.normalizeBarSourceWindows({ "opencode-go": "monthly", codex: "secondary" });
    assert.deepEqual(JSON.parse(JSON.stringify(root.availableBarWindows("opencode-go", root.providers[0].usage))), [{ key: "weekly", label: "Weekly" }, { key: "monthly", label: "Monthly" }]);
    assert.equal(root.selectedWindowKey("opencode-go"), "monthly");
    assert.equal(root.barWindowLabel("opencode-go", root.providers[0].usage), "Monthly");
    assert.equal(root.barUsageWindow("codex", root.providers[1].usage).usedPercent, 22);
    assert.equal(root.setBarSourceWindow("codex", "secondary"), true);
    assert.equal(root.setBarSourceWindow("opencode-go", "rolling"), false);
    root.barSourceWindows = root.normalizeBarSourceWindows({ "opencode-go": "rolling", codex: "primary" });
    assert.equal(root.barWindowLabel("opencode-go", root.providers[0].usage), "Weekly");
    assert.equal(root.selectedWindowKey("opencode-go"), "rolling");
    assert.deepEqual(JSON.parse(JSON.stringify(root.selectBarProviders(root.providers, ["opencode-go", "codex"]))), root.providers);
    root.parseProviderOutput("codex", JSON.stringify([{ provider: "codex", usage: { secondary: { usedPercent: 17 } } }]));
    assert.equal(root.openaiProviders[0].usage.secondary.usedPercent, 17);
});

test("single-provider refresh starts only the requested provider", () => {
    const root = makeRoot();
    assert.equal(root.refreshProvider("codex", true), true);
    assert.deepEqual(JSON.parse(JSON.stringify(root.procOpenai.command)), ["opentracker", "fetch", "codex", "--force"]);
    assert.deepEqual(root.procOpencode.command, []);
    assert.deepEqual(root.procOpencodeZen.command, []);
    assert.equal(root.pendingFetches, 1);
});

test("provider failures expose fixed diagnostics and never retain stderr secrets", () => {
    const root = makeRoot();
    const secret = "token=supersecret /home/private/session-cookie";
    root.appendFetchStderr("codex", secret);
    assert.equal(root.fetchStderr.codex, secret);
    assert.equal(root.classifyProviderFailure("codex", root.fetchStderr.codex, 1, true, ""), "unknown");
    root.providerErrors.codex = "auth-expired";
    assert.equal(root.providerHint("codex"), "Sign in again to refresh provider access.");
    assert.equal(root.providerRecoveryCommand("codex"), "opentracker login codex");
    assert.doesNotMatch(root.providerHint("codex") + root.providerRecoveryCommand("codex"), /supersecret|private|session-cookie/);
    root.providerErrors["opencode-go"] = "missing-cli";
    assert.equal(root.providerRecoveryCommand("opencode-go"), "opentracker version");
    root.providerErrors["opencode-zen"] = "auth-expired";
    assert.equal(root.providerRecoveryCommand("opencode-zen"), "opentracker login opencode");
    root.fetchActive.codex = true;
    root.pendingFetches = 1;
    root.fetchStarted.codex = true;
    root.fetchStderr.codex = "401 unauthorized secret=raw";
    root.finishFetch("codex", 0, '[{"provider":"codex","usage":{"primary":{"usedPercent":20}}}]');
    assert.equal(root.providerError("codex"), "");
});

test("provider hints are safe guidance and recovery commands stay on the provider allowlist", () => {
    const root = makeRoot();
    root.providerErrors.codex = "not-configured";
    assert.equal(root.providerHint("codex"), "Sign in to this provider to continue.");
    assert.notEqual(root.providerHint("codex"), root.providerError("codex"));
    assert.equal(root.providerRecoveryCommand("codex"), "opentracker login codex");
    root.providerErrors["opencode-go"] = "not-configured";
    assert.equal(root.providerRecoveryCommand("opencode-go"), "opentracker login opencode");
    root.providerErrors["opencode-zen"] = "unknown";
    assert.equal(root.providerHint("opencode-zen"), "Retry this provider using the command shown in the terminal.");
    assert.equal(root.providerRecoveryCommand("unknown-provider"), "opentracker version");
    for (const id of ["codex", "opencode-go", "opencode-zen", "unknown-provider"])
        assert.doesNotMatch(root.providerHint(id) + root.providerRecoveryCommand(id), /secret|private|unknown-provider/);
});

test("local stats validates current-day data and ignores missing or stale ranges", () => {
    const root = makeRoot();
    const now = new Date(2026, 4, 8, 12).getTime();
    const from = new Date(2026, 4, 8).getTime();
    const value = { source: "opencode-local", period: "today", totalTokens: 0, sessions: 0, updatedAt: new Date(now).toISOString(), range: { from, to: now }, accountPath: "/private/account" };
    const parsed = JSON.parse(JSON.stringify(root.parseLocalStats(JSON.stringify(value), now)));
    assert.deepEqual(parsed, { source: value.source, period: value.period, totalTokens: value.totalTokens, sessions: value.sessions, updatedAt: value.updatedAt, range: { from, to: now } });
    assert.equal("accountPath" in parsed, false);
    const laterToday = { ...value, range: { from: from + 3600000, to: now } };
    assert.equal(root.parseLocalStats(JSON.stringify(laterToday), now).range.from, from + 3600000);
    for (const invalid of [null, { ...value, totalTokens: null }, { ...value, totalTokens: -1 }, { ...value, sessions: 1.5 }, { ...value, range: { from: from - 86400000, to: from } }])
        assert.equal(root.parseLocalStats(JSON.stringify(invalid), now), null);
    assert.equal(root.parseLocalStats("", now), null);
});

test("local stats reject a tomorrow timestamp within the future tolerance", () => {
    const root = makeRoot();
    const now = new Date(2026, 4, 8, 23, 59, 30).getTime();
    const bounds = root.localDayBounds(now);
    const value = { source: "opencode-local", period: "today", totalTokens: 5, sessions: 1, updatedAt: new Date(bounds.to + 10000).toISOString(), range: { from: bounds.from, to: now } };
    assert.equal(root.parseLocalStats(JSON.stringify(value), now), null);
});

test("local stats use local midnight across daylight-saving changes", () => {
    const root = makeRoot();
    const originalTz = process.env.TZ;
    process.env.TZ = "Europe/Warsaw";
    try {
        for (const [year, month, day, hours] of [[2026, 2, 29, 23], [2026, 9, 25, 25]]) {
            const from = new Date(year, month, day).getTime();
            const next = new Date(year, month, day + 1).getTime();
            assert.equal((next - from) / 3600000, hours);
            assert.deepEqual(JSON.parse(JSON.stringify(root.localDayBounds(from))), { from, to: next });
            const now = from + 8 * 3600000;
            const valid = { source: "opencode-local", period: "today", totalTokens: 4, sessions: 1, updatedAt: new Date(now).toISOString(), range: { from, to: now } };
            assert.ok(root.parseLocalStats(JSON.stringify(valid), now));
            assert.equal(root.parseLocalStats(JSON.stringify({ ...valid, range: { from: new Date(year, month, day - 1).getTime(), to: now } }), now), null);
        }
    } finally {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
    }
});

test("clock updates clear yesterday's local stats without starting a process", () => {
    const root = makeRoot();
    const originalTz = process.env.TZ;
    process.env.TZ = "Europe/Warsaw";
    try {
        root.clockNow = new Date(2026, 4, 8, 0, 0, 10).getTime();
        const yesterday = root.localDayBounds(root.clockNow - 120000).from;
        root.localStats = { source: "opencode-local", period: "today", range: { from: yesterday, to: root.clockNow - 1000 } };
        root.localStatsUpdatedAt = root.clockNow - 1000;
        assert.equal(root.invalidateLocalStatsForDay(), true);
        assert.equal(root.localStats, null);
        assert.equal(root.localStatsUpdatedAt, 0);
        assert.deepEqual(root.procLocalStats.command, []);
        assert.match(source, /onClockNowChanged:\s*root\.invalidateLocalStatsForDay\(\)/);
    } finally {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
    }
});

test("local stats stay opt-in and require the visible OpenCode tab", () => {
    const root = makeRoot();
    assert.equal(root.ensureLocalStats(), false);
    root.localStatsEnabled = true;
    root.interactionActive = false;
    assert.equal(root.ensureLocalStats(), false);
    root.interactionActive = true;
    root.activeTab = "openai";
    assert.equal(root.ensureLocalStats(), false);
    assert.equal(root.procLocalStats.command.length, 0);
    root.activeTab = "opencode";
    assert.equal(root.ensureLocalStats(), true);
    assert.deepEqual(JSON.parse(JSON.stringify(root.procLocalStats.command)), ["opentracker", "stats", "opencode"]);
    root.localStatsLoading = false;
    assert.equal(root.refreshLocalStats(true), true);
    assert.deepEqual(JSON.parse(JSON.stringify(root.procLocalStats.command)), ["opentracker", "stats", "opencode", "--force"]);
    root.pluginService = { savePluginData: () => true };
    assert.equal(root.setLocalStatsEnabled(true), true);
});

test("local stats cache expires after five minutes and clears at local midnight", () => {
    const root = makeRoot();
    root.localStatsEnabled = true;
    root.interactionActive = true;
    root.activeTab = "opencode";
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    root.localStats = { range: { from: today, to: now.getTime() } };
    root.localStatsUpdatedAt = Date.now() - 299999;
    assert.equal(root.ensureLocalStats(), false);
    root.localStatsUpdatedAt = Date.now() - 300001;
    assert.equal(root.ensureLocalStats(), true);
    root.localStatsLoading = false;
    root.localStats = { range: { from: today - 86400000, to: today - 1 } };
    root.localStatsUpdatedAt = Date.now() - 1000;
    assert.equal(root.ensureLocalStats(), true);
    assert.equal(root.localStatsUpdatedAt, 0);
    assert.equal(root.localStats, null);
});

test("local stats freshness starts at the CLI read time and refreshes once at five minutes", () => {
    const root = makeRoot();
    const now = Date.now();
    const updatedAt = new Date(now - 4 * 60000).toISOString();
    const from = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate()).getTime();
    root.localStatsLoading = true;
    root.localStatsBuffer = JSON.stringify({ source: "opencode-local", period: "today", totalTokens: 50, sessions: 2, updatedAt, range: { from, to: Date.parse(updatedAt) } });
    root.finishLocalStats(0, false);
    assert.equal(root.localStatsUpdatedAt, Date.parse(updatedAt));
    root.localStatsEnabled = true;
    root.interactionActive = true;
    root.activeTab = "opencode";
    assert.equal(root.ensureLocalStats(), false);
    assert.deepEqual(root.procLocalStats.command, []);

    root.localStatsUpdatedAt -= 60001;
    assert.equal(root.ensureLocalStats(), true);
    const command = JSON.parse(JSON.stringify(root.procLocalStats.command));
    assert.deepEqual(command, ["opentracker", "stats", "opencode"]);
    assert.equal(root.ensureLocalStats(), false);
    assert.deepEqual(JSON.parse(JSON.stringify(root.procLocalStats.command)), command);
});

test("unsupported stats CLI and timeout use fixed local errors", () => {
    const root = makeRoot();
    root.localStatsLoading = true;
    root.localStatsStarted = false;
    root.finishLocalStats(2, false);
    assert.equal(root.localStatsError, "Update opentracker and OpenCode to enable local statistics");
    assert.equal(root.localStatsStderr, "");
    root.localStatsLoading = true;
    root.localStatsStarted = true;
    root.localStatsStderr = "Unknown command 'stats'\naccount path: /private/profile";
    root.finishLocalStats(1, false);
    assert.equal(root.localStatsError, "Update opentracker and OpenCode to enable local statistics");
    assert.equal(root.localStatsStderr, "");
    root.localStatsLoading = true;
    root.localStatsStarted = true;
    root.localStatsStderr = "unsupported option --standalone";
    root.finishLocalStats(1, false);
    assert.equal(root.localStatsError, "Update opentracker and OpenCode to enable local statistics");
    root.localStatsLoading = true;
    root.localStatsStarted = true;
    root.finishLocalStats(-1, true);
    assert.equal(root.localStatsError, "Local statistics request timed out");
});

test("process start detection uses the verified Process started signal", () => {
    assert.match(source, /onStarted:\s*root\.markFetchStarted\("opencode-go"\)/);
    assert.match(source, /onStarted:\s*root\.localStatsStarted\s*=\s*true/);
    assert.doesNotMatch(source, /onErrorOccurred:/);
});
