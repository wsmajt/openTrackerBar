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
        providers: [], opencodeProviders: [], openaiProviders: [], claudeProviders: [], providerStale: {},
        providerTimes: { "opencode-go": 0, "opencode-zen": 0, codex: 0, claude: 0 },
        providerErrors: { "opencode-go": "", "opencode-zen": "", codex: "", claude: "" }, fetchStarted: { "opencode-go": false, "opencode-zen": false, codex: false, claude: false }, fetchStderr: { "opencode-go": "", "opencode-zen": "", codex: "", claude: "" },
        fetchActive: { "opencode-go": false, "opencode-zen": false, codex: false, claude: false },
        fetchTimeouts: { "opencode-go": "", "opencode-zen": "", codex: "", claude: "" },
        fetchAwaitingExit: { "opencode-go": false, "opencode-zen": false, codex: false, claude: false },
        pendingFetches: 0, isLoading: false, opencodeError: "", openaiError: "", claudeError: "", hasError: false,
        activeTab: "opencode", refreshIntervalMs: 1000, clockNow: Date.now(), lastUpdated: "", barProviders: [],
        pluginId: "openTrackerBar", pluginData: {}, barSources: ["opencode-go", "opencode-zen", "codex"],
        usageDisplayMode: "used", notificationsEnabled: false, emailMaskMode: "prefix", emailMaskFill: "*", emailMaskCount: 3, zenBalanceThreshold: 1, alertQueue: [], alertProcessBusy: false,
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
    const names = ["isResetArray", "resetCreditsOf", "resetExpiryInfo", "parseProviderOutput", "inspectFamilyOutput", "normalizeFamilyOutput", "commitFamilyOutput", "markFamilyStale", "sourceIdOf", "sourceKind", "sourceName", "maskAccountEmail", "emailParts", "maskEmailParts", "safeUsage", "sourceFetching", "sourceUpdatedLabel", "sourceIsStale", "sourceError", "sourceHint", "sourceRecoveryCommand", "availableSourceWindows", "selectedSourceWindowKey", "setSourceWindow", "sourceUsageWindow", "sourceWindowLabel", "validSourceId", "mergeProviders", "setProviderError", "finishFetch", "providerError", "providerHint", "providerRecoveryCommand", "classifyProviderFailure", "appendFetchStderr", "markFetchStarted", "providerUpdatedAt", "providerIsStale", "providerUpdatedLabel", "providerBalanceText", "barProviderText", "primaryUsage", "secondaryUsage", "tertiaryUsage", "claudeUsageWindow", "providerUsageWindows", "validNumber", "validUsageWindow", "hasZenBalance", "getUsageColor", "formatProviderName", "providerLogoPath", "providerTab", "currentProviders", "currentError", "normalizeBarSources", "legacyBarSources", "isBarSourceSelected", "toggleBarSource", "normalizeBarSourceWindows", "selectedWindowKey", "availableBarWindows", "barUsageWindow", "barWindowLabel", "setBarSourceWindow", "setLocalStatsEnabled", "selectBarProviders", "primaryLabel", "barTooltipText", "formatTimeUntil", "startFetch", "refreshProvider", "timeoutFetch", "savePluginSetting", "setUsageDisplayMode", "setNotificationsEnabled", "setEmailMaskMode", "setEmailMaskFill", "setEmailMaskCount", "setShowBarLabels", "setZenBalanceThreshold", "displayPercent", "alertWindows", "alertState", "alertPrefs", "removeAlertReservation", "removeAlertReservationForProvider", "saveAlertState", "baselineAlertSource", "evaluateProviderAlerts", "startNextAlert", "finishAlert", "localDayBounds", "parseLocalStats", "ensureLocalStats", "invalidateLocalStatsForDay", "refreshLocalStats", "finishLocalStats", "localStatsMissingBinary", "localStatsNeedsUpgrade", "timeoutLocalStats"];
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

test("missing OpenCode CLI reports a specific local stats error", () => {
    const root = makeRoot();
    root.localStatsLoading = true;
    root.localStatsStarted = true;
    root.localStatsBuffer = "Error: OpenCode CLI was not found\nUsage:\n  opentracker stats opencode [flags]\n";
    assert.equal(root.localStatsMissingBinary(), true);
    root.finishLocalStats(1, false);
    assert.equal(root.localStatsError, "OpenCode CLI was not found — install it or add it to PATH");
    assert.equal(root.localStatsBuffer, "");
    root.localStatsLoading = true;
    root.localStatsStarted = true;
    root.localStatsBuffer = "";
    assert.equal(root.localStatsMissingBinary(), false);
    root.finishLocalStats(1, false);
    assert.equal(root.localStatsError, "Local statistics are unavailable");
});

test("process start detection uses the verified Process started signal", () => {
    assert.match(source, /onStarted:\s*root\.markFetchStarted\("opencode-go"\)/);
    assert.match(source, /onStarted:\s*root\.localStatsStarted\s*=\s*true/);
    assert.doesNotMatch(source, /onErrorOccurred:/);
});

test("family output keeps identities while masking account emails", () => {
    const root = makeRoot();
    const rows = [
        { provider: "codex", usage: { primary: { usedPercent: 10 } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "acct-b", authIndex: "auth-b", accountEmail: "alice@example.invalid", usage: { primary: { usedPercent: 20 } } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "acct-a", authIndex: "auth-a", accountEmail: "alex@example.invalid", usage: { primary: { usedPercent: 30 } } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "bad/id", authIndex: "auth-c", usage: { primary: { usedPercent: 40 } } } }
    ];
    root.fetchActive.codex = true;
    root.pendingFetches = 1;
    root.finishFetch("codex", 0, JSON.stringify(rows));
    assert.deepEqual(Array.from(root.openaiProviders, item => item.sourceId), ["codex", "cliproxyapi:codex:acct-a", "cliproxyapi:codex:acct-b"]);
    assert.equal(root.sourceIdOf(root.openaiProviders[0]), "codex");
    assert.equal(root.sourceKind("cliproxyapi:codex:acct-a"), "codex");
    assert.deepEqual(Array.from(root.openaiProviders.slice(1), item => item.accountLabel), ["al***@ex***", "al***@ex***"]);
    assert.equal(root.sourceName(root.openaiProviders[1]), "Codex · al***@ex*** · 1");
    assert.equal(root.sourceName(root.openaiProviders[2]), "Codex · al***@ex*** · 2");
    assert.deepEqual(Array.from(root.normalizeFamilyOutput("claude", JSON.stringify([
        { provider: "cliproxyapi", usage: { accountProvider: "claude", authIndex: "auth-a", accountEmail: "user@example.invalid", usage: { fiveHour: { usedPercent: 20 } } } },
        { provider: "cliproxyapi", usage: { accountProvider: "claude", authIndex: "auth-b", accountEmail: "user@example.invalid", usage: { fiveHour: { usedPercent: 25 } } } }
    ])), item => item.sourceId), ["cliproxyapi:claude:auth-a", "cliproxyapi:claude:auth-b"]);
    assert.doesNotMatch(JSON.stringify(root.openaiProviders), /alice|alex/);
});

test("masked account labels validate input and never retain raw addresses", () => {
    const root = makeRoot();
    const records = root.normalizeFamilyOutput("codex", JSON.stringify([
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "one", accountEmail: "a@example.invalid", usage: { primary: { usedPercent: 1 } } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "unicode", accountEmail: "éclair@éxample.invalid", usage: { primary: { usedPercent: 2 } } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "nested", usage: { accountEmail: "nested@example.invalid", primary: { usedPercent: 3 } } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "bad-at", accountEmail: "a@@example.invalid", usage: { primary: { usedPercent: 4 } } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "bad-space", accountEmail: "a b@example.invalid", usage: { primary: { usedPercent: 5 } } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "bad-control", accountEmail: "a\u0001@example.invalid", usage: { primary: { usedPercent: 6 } } } },
        { provider: "codex", usage: { accountEmail: "local@example.invalid", primary: { usedPercent: 7 } } },
        { provider: "codex", usage: { primary: { usedPercent: 8 } } }
    ]));
    root.providers = records;
    const labels = Object.fromEntries(records.map(item => [item.sourceId, item.accountLabel]));
    assert.deepEqual(labels, {
        codex: "lo***@ex***",
        "cliproxyapi:codex:bad-at": "",
        "cliproxyapi:codex:bad-control": "",
        "cliproxyapi:codex:bad-space": "",
        "cliproxyapi:codex:nested": "ne***@ex***",
        "cliproxyapi:codex:one": "***@ex***",
        "cliproxyapi:codex:unicode": "éc***@éx***"
    });
    assert.equal(records.find(item => item.sourceId === "codex").usage.accountEmail, undefined);
    assert.doesNotMatch(JSON.stringify(records), /nested@example|local@example|éclair/);
    assert.match(root.sourceName(records.find(item => item.sourceId === "codex")), /^Codex · lo\*\*\*@ex\*\*\*/);
    assert.equal(root.sourceName(records.find(item => item.sourceId === "cliproxyapi:codex:bad-at")), "Codex · Proxy 1");
});

test("reset credit display keeps unknown values distinct from zero", () => {
    const root = makeRoot();
    assert.deepEqual(JSON.parse(JSON.stringify(root.resetCreditsOf({}))), { available: null, applicable: null });
    assert.deepEqual(JSON.parse(JSON.stringify(root.resetCreditsOf({ resetCredits: { available: 1 } }))), { available: 1, applicable: null });
    assert.deepEqual(JSON.parse(JSON.stringify(root.resetCreditsOf({ resetCredits: { available: 1, credits: [] } }))), { available: 1, applicable: null, credits: [] });
    assert.deepEqual(JSON.parse(JSON.stringify(root.resetCreditsOf({ resetCredits: { available: 0, applicable: 0, credits: [{}, { expiresAt: null }, { expiresAt: "2026-12-01T00:00:00Z" }] } }))), {
        available: 0, applicable: 0, credits: [{}, { expiresAt: null }, { expiresAt: "2026-12-01T00:00:00Z" }]
    });
    for (const invalid of [-1, 1.5, "2", true, Number.MAX_SAFE_INTEGER + 1])
        assert.equal(root.resetCreditsOf({ resetCredits: { available: invalid } }).available, null);
    assert.equal(root.resetCreditsOf({ resetCredits: { available: 4, applicable: -1 } }).applicable, null);
});

test("reset credit lists reject array-like objects and accept native arrays", () => {
    const root = makeRoot();
    const spoof = { 0: { expiresAt: null }, length: 1, [Symbol.toStringTag]: "V4Sequence" };
    for (const credits of [null, "x", { 0: {}, length: 1 }, spoof]) {
        const summary = root.resetCreditsOf({ resetCredits: { available: 1, credits } });
        assert.equal(summary.credits, undefined);
    }
    assert.deepEqual(JSON.parse(JSON.stringify(root.resetCreditsOf({ resetCredits: { available: 1, credits: [{ expiresAt: null }] } }))).credits, [{ expiresAt: null }]);
    assert.deepEqual(JSON.parse(JSON.stringify(root.resetCreditsOf({ resetCredits: { available: 1, credits: [{ expiresAt: 4 }, null, {}, { expiresAt: null }] } }))).credits, [{}, { expiresAt: null }]);
});

test("reset expiry distinguishes unknown, never, dated, and expired credits", () => {
    const root = makeRoot();
    root.clockNow = Date.UTC(2026, 0, 1, 0, 0, 0);
    for (const credit of [{}, { expiresAt: undefined }, { expiresAt: "2026-01-01T01:00:00" }, { expiresAt: "2026-02-30T00:00:00Z" }, { expiresAt: "2026-01-01T00:00:00+25:00" }]) {
        assert.deepEqual(JSON.parse(JSON.stringify(root.resetExpiryInfo(credit))), { kind: "unknown", label: "Expiry unknown", urgent: false });
    }
    assert.deepEqual(JSON.parse(JSON.stringify(root.resetExpiryInfo({ expiresAt: null }))), { kind: "never", label: "Never expires", urgent: false });
    const past = root.resetExpiryInfo({ expiresAt: "2025-12-31T23:59:59Z" });
    assert.equal(past.kind, "expired");
    assert.equal(past.label, "Expired");
    assert.equal(past.urgent, true);
    assert.equal(past.epoch, Date.UTC(2025, 11, 31, 23, 59, 59));
});

test("reset expiry uses UTC instants, exact urgency boundaries, and does not mutate input", () => {
    const root = makeRoot();
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    root.clockNow = now;
    const credit = { expiresAt: "2026-01-01T02:15:00Z" };
    assert.deepEqual(JSON.parse(JSON.stringify(root.resetExpiryInfo(credit))), { kind: "dated", label: "Expires in 2h 15m", urgent: true, epoch: now + 2 * 60 * 60 * 1000 + 15 * 60 * 1000 });
    assert.equal(root.resetExpiryInfo({ expiresAt: new Date(now + 59 * 1000).toISOString() }).label, "Less than 1m");
    assert.equal(root.resetExpiryInfo({ expiresAt: new Date(now + 5 * 60 * 60 * 1000).toISOString() }).urgent, true);
    assert.equal(root.resetExpiryInfo({ expiresAt: new Date(now + 5 * 60 * 60 * 1000 + 1).toISOString() }).urgent, false);
    assert.equal(root.resetExpiryInfo({ expiresAt: new Date(now + 195 * 60 * 60 * 1000).toISOString() }).label, "Expires in 8d 3h");
    const offset = root.resetExpiryInfo({ expiresAt: "2026-03-08T02:30:00-05:00" });
    assert.equal(offset.kind, "dated");
    assert.equal(offset.epoch, Date.UTC(2026, 2, 8, 7, 30));
    const yearEnd = root.resetExpiryInfo({ expiresAt: "2027-01-01T00:00:00+02:00" });
    assert.equal(yearEnd.epoch, Date.UTC(2026, 11, 31, 22, 0));
    assert.deepEqual(credit, { expiresAt: "2026-01-01T02:15:00Z" });
    assert.match(source, /property real clockNow: Date\.now\(\)/);
});

test("reset target metadata is discarded and no reset launch action remains", () => {
    const root = makeRoot();
    const resetTarget = { authIndex: "auth-secret", accountId: "acct-secret" };
    const usage = { primary: { usedPercent: 10 }, resetCredits: { available: 2 }, resetTarget };
    const sanitized = root.safeUsage(usage);
    assert.deepEqual(JSON.parse(JSON.stringify(sanitized)), { primary: { usedPercent: 10 }, resetCredits: { available: 2 } });
    const records = root.normalizeFamilyOutput("codex", JSON.stringify([
        { provider: "codex", usage: { ...usage, accountId: "acct-secret", authIndex: "auth-secret" } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "acct-proxy", authIndex: "auth-proxy", resetTarget, usage: { primary: { usedPercent: 20 }, resetCredits: { available: 1 } } } }
    ]));
    assert.equal(records.length, 2);
    assert.equal("resetAuthIndex" in records[0], false);
    assert.equal("resetAccountId" in records[0], false);
    assert.equal("resetTarget" in records[0].usage, false);
    assert.equal("resetTarget" in records[1].usage, false);
    assert.doesNotMatch(JSON.stringify(records) + JSON.stringify(root.pluginData), /auth-secret|acct-secret|auth-proxy/);
    assert.doesNotMatch(source, /opentracker\s+reset\s+codex/);
    assert.doesNotMatch(source, /openResetTerminal/);
});

test("email mask settings validate values and update existing provider names", () => {
    const root = makeRoot();
    const saved = [];
    root.pluginService = { savePluginData: (_id, key, value) => { saved.push([key, value]); return true; } };
    const records = root.normalizeFamilyOutput("codex", JSON.stringify([
        { provider: "codex", usage: { accountEmail: "alice@gmail.com", primary: { usedPercent: 1 } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "one", accountEmail: "alex@gmail.com", usage: { primary: { usedPercent: 2 } } } }
    ]));
    root.providers = records;
    assert.equal(root.sourceName(records[0]), "Codex · al***@gm*** · 2");
    assert.equal(root.setEmailMaskMode("domain"), true);
    assert.equal(root.setEmailMaskMode("anything"), false);
    root.emailMaskMode = "domain";
    assert.equal(root.sourceName(records[0]), "Codex · ***@gmail.com · 2");
    assert.equal(root.setEmailMaskFill("•"), true);
    assert.equal(root.setEmailMaskFill("x"), false);
    root.emailMaskFill = "•";
    assert.equal(root.setEmailMaskCount(2), true);
    for (const invalid of [0, 4, "2", 2.5, null]) assert.equal(root.setEmailMaskCount(invalid), false);
    root.emailMaskCount = 2;
    assert.equal(root.sourceName(records[0]), "Codex · ••@gmail.com · 2");
    assert.deepEqual(saved, [["emailMaskMode", "domain"], ["emailMaskFill", "•"], ["emailMaskCount", 2]]);
    assert.doesNotMatch(JSON.stringify(records), /alice|alex/);
});

test("email parts reject malformed and URL-like addresses without retaining full local parts", () => {
    const root = makeRoot();
    for (const email of ["", "a@@gmail.com", "a b@gmail.com", "a\u0001@gmail.com", "a@https://gmail.com", "a@gmail.com/path", "a@.gmail.com", "a@gmail..com"])
        assert.equal(root.maskAccountEmail(email), "");
    assert.equal(root.maskAccountEmail("a@gmail.com"), "***@gm***");
    assert.equal(root.maskAccountEmail("alice@gmail.com", "domain", "•", 2), "••@gmail.com");
    const parts = root.emailParts("alice@gmail.com");
    assert.deepEqual(JSON.parse(JSON.stringify(parts)), { prefix: "al", domain: "gmail.com" });
    assert.equal(JSON.stringify(parts).includes("alice"), false);
});

test("bar label visibility defaults on and persists explicit boolean choices", () => {
    assert.match(source, /readonly property bool showBarLabels:\s*!root\.pluginData \|\| root\.pluginData\.showBarLabels !== false/);
    const root = makeRoot();
    const saved = [];
    Object.defineProperty(root, "showBarLabels", { get: () => !root.pluginData || root.pluginData.showBarLabels !== false });
    root.pluginService = { savePluginData: (_id, key, value) => { saved.push([key, value]); root.pluginData[key] = value; return true; } };
    assert.equal(root.showBarLabels, true);
    assert.equal(root.setShowBarLabels(false), true);
    assert.equal(root.showBarLabels, false);
    assert.equal(root.setShowBarLabels(true), true);
    assert.equal(root.showBarLabels, true);
    for (const invalid of ["false", 0, null]) assert.equal(root.setShowBarLabels(invalid), false);
    assert.deepEqual(saved, [["showBarLabels", false], ["showBarLabels", true]]);
    root.pluginData = {};
    assert.equal(root.showBarLabels, true);
    root.pluginData.showBarLabels = false;
    assert.equal(root.showBarLabels, false);
});

test("family fetch exit one updates valid accounts and retains missing accounts as stale", () => {
    const root = makeRoot();
    root.parseProviderOutput("codex", JSON.stringify([
        { provider: "codex", usage: { primary: { usedPercent: 10 } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "kept", authIndex: "x", usage: { primary: { usedPercent: 20 } } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "stale", authIndex: "y", usage: { primary: { usedPercent: 30 } } } }
    ]));
    const oldTimestamp = root.providerUpdatedAt("cliproxyapi:codex:stale");
    root.fetchActive.codex = true;
    root.pendingFetches = 1;
    root.finishFetch("codex", 1, JSON.stringify([
        { provider: "codex", usage: { primary: { usedPercent: 11 } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "kept", authIndex: "x", usage: { primary: { usedPercent: 21 } } } }
    ]));
    assert.deepEqual(Array.from(root.openaiProviders, item => item.sourceId), ["codex", "cliproxyapi:codex:kept", "cliproxyapi:codex:stale"]);
    assert.equal(root.openaiProviders[1].usage.primary.usedPercent, 21);
    assert.equal(root.providerUpdatedAt("cliproxyapi:codex:stale"), oldTimestamp);
    assert.equal(root.sourceIsStale("cliproxyapi:codex:stale"), true);
    assert.equal(root.sourceIsStale("cliproxyapi:codex:kept"), false);
    assert.equal(root.providerError("codex"), "Some accounts could not be refreshed");
    root.fetchActive.codex = true;
    root.pendingFetches = 1;
    root.finishFetch("codex", 0, JSON.stringify([{ provider: "codex", usage: { primary: { usedPercent: 12 } } }]));
    assert.deepEqual(Array.from(root.openaiProviders, item => item.sourceId), ["codex"]);
});

test("partial output leaves an omitted local account timestamp unchanged", () => {
    const root = makeRoot();
    root.providerStale = {};
    root.parseProviderOutput("codex", JSON.stringify([
        { provider: "codex", usage: { primary: { usedPercent: 10 } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "fresh-proxy", authIndex: "auth-a", usage: { primary: { usedPercent: 20 } } } }
    ]));
    root.providerTimes.codex = 1000;
    root.providerTimes["cliproxyapi:codex:fresh-proxy"] = 1000;
    root.clockNow = 61000;
    const localTimestamp = root.providerUpdatedAt("codex");
    const localAge = root.sourceUpdatedLabel("codex");
    root.fetchActive.codex = true;
    root.pendingFetches = 1;
    root.finishFetch("codex", 1, JSON.stringify([
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "fresh-proxy", authIndex: "auth-a", usage: { primary: { usedPercent: 21 } } } }
    ]));

    assert.equal(root.providerUpdatedAt("codex"), localTimestamp);
    assert.equal(root.sourceUpdatedLabel("codex"), localAge);
    assert.ok(root.providerUpdatedAt("cliproxyapi:codex:fresh-proxy") > 1000);
    assert.equal(root.sourceIsStale("codex"), true);
    assert.equal(root.sourceError("codex"), "Some accounts could not be refreshed");
    assert.equal(root.sourceError("cliproxyapi:codex:fresh-proxy"), "");
});

test("unsupported accounts stay visible as stale and make a successful process partial", () => {
    const root = makeRoot();
    root.parseProviderOutput("codex", JSON.stringify([
        { provider: "codex", usage: { primary: { usedPercent: 10 } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "old-proxy", authIndex: "auth-a", usage: { primary: { usedPercent: 20 } } } }
    ]));
    const oldProxy = root.openaiProviders.find(item => item.sourceId === "cliproxyapi:codex:old-proxy");
    const oldTimestamp = root.providerUpdatedAt(oldProxy.sourceId);
    const missingProxy = { provider: "codex", sourceId: "cliproxyapi:codex:missing-proxy", origin: "cliproxyapi", usage: { primary: { usedPercent: 30 } } };
    root.openaiProviders = root.openaiProviders.concat([missingProxy]);
    root.providerTimes[missingProxy.sourceId] = oldTimestamp;
    root.mergeProviders();
    root.fetchActive.codex = true;
    root.pendingFetches = 1;
    root.finishFetch("codex", 0, JSON.stringify([
        { provider: "codex", usage: { primary: { usedPercent: 11 } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "old-proxy", authIndex: "auth-a", usage: { plan: "credits-only" } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "new-unsupported", authIndex: "auth-b", usage: { credits: 8 } } }
    ]));

    assert.equal(root.openaiProviders.find(item => item.sourceId === oldProxy.sourceId), oldProxy);
    assert.equal(root.providerUpdatedAt(oldProxy.sourceId), oldTimestamp);
    assert.equal(root.sourceIsStale(oldProxy.sourceId), true);
    assert.equal(root.sourceError(oldProxy.sourceId), "Some accounts could not be refreshed");
    assert.ok(root.openaiProviders.some(item => item.sourceId === missingProxy.sourceId));
    assert.equal(root.sourceIsStale(missingProxy.sourceId), true);
    assert.equal(root.providerStale["cliproxyapi:codex:new-unsupported"], true);
    assert.equal(root.providerError("codex"), "Some accounts could not be refreshed");
    assert.equal(root.openaiProviders.find(item => item.sourceId === "codex").usage.primary.usedPercent, 11);
});

test("family failure retains every card, keeps timestamps, and marks them stale immediately", () => {
    const root = makeRoot();
    root.parseProviderOutput("claude", JSON.stringify([
        { provider: "claude", usage: { fiveHour: { usedPercent: 18 } } },
        { provider: "cliproxyapi", usage: { accountProvider: "claude", authIndex: "proxy-a", usage: { fiveHour: { usedPercent: 28 } } } }
    ]));
    root.providerStale = {};
    const oldTimestamp = root.providerUpdatedAt("claude");
    root.providerTimes.claude = 1200;
    root.providerTimes["cliproxyapi:claude:proxy-a"] = 1300;
    const before = root.claudeProviders.slice();
    root.fetchActive.claude = true;
    root.pendingFetches = 1;
    root.fetchStarted.claude = true;
    root.finishFetch("claude", 1, "", "");

    assert.deepEqual(root.claudeProviders, before);
    assert.equal(root.providerUpdatedAt("claude"), 1200);
    assert.equal(root.providerUpdatedAt("cliproxyapi:claude:proxy-a"), 1300);
    assert.equal(root.sourceIsStale("claude"), true);
    assert.equal(root.sourceIsStale("cliproxyapi:claude:proxy-a"), true);
    assert.equal(root.providerError("claude"), "Provider request failed");
});

test("bar tooltip reports only stale sources during partial output and all sources after failure", () => {
    const root = makeRoot();
    const local = { provider: "codex", sourceId: "codex", origin: "local", usage: { primary: { usedPercent: 15 } } };
    const proxy = { provider: "codex", sourceId: "cliproxyapi:codex:proxy-a", origin: "cliproxyapi", usage: { primary: { usedPercent: 25 } } };
    root.providers = [local, proxy];
    root.barProviders = [local, proxy];
    root.providerErrors.codex = "partial";
    root.providerStale = { codex: true };
    let tooltip = root.barTooltipText();
    assert.match(tooltip.split("\n")[0], /Some accounts could not be refreshed/);
    assert.doesNotMatch(tooltip.split("\n")[1], /Some accounts could not be refreshed/);

    root.providerErrors.codex = "unknown";
    root.providerStale = { codex: true, "cliproxyapi:codex:proxy-a": true };
    tooltip = root.barTooltipText();
    assert.equal((tooltip.match(/Provider request failed/g) || []).length, 2);
});

test("malformed family output retains data and safe diagnostics", () => {
    const root = makeRoot();
    root.parseProviderOutput("claude", JSON.stringify([{ provider: "claude", usage: { fiveHour: { usedPercent: 20 } } }]));
    const previous = root.claudeProviders;
    const oldTimestamp = root.providerUpdatedAt("claude");
    root.fetchActive.claude = true;
    root.pendingFetches = 1;
    root.fetchStderr.claude = "private account user@example.invalid";
    root.finishFetch("claude", 1, "not-json");
    assert.equal(root.claudeProviders, previous);
    assert.equal(root.providerUpdatedAt("claude"), oldTimestamp);
    assert.equal(root.sourceIsStale("claude"), true);
    assert.equal(root.providerError("claude"), "Provider returned invalid data");
    assert.doesNotMatch(root.providerError("claude") + root.sourceHint("claude"), /example\.invalid|private/);
});

test("proxy pins and quota windows remain independent from local settings", () => {
    const root = makeRoot();
    const proxyId = "cliproxyapi:codex:acct-1";
    const providers = [
        { provider: "codex", sourceId: "codex", origin: "local", usage: { primary: { usedPercent: 10 }, secondary: { usedPercent: 20 } } },
        { provider: "codex", sourceId: proxyId, origin: "cliproxyapi", usage: { primary: { usedPercent: 30 }, secondary: { usedPercent: 40 } } }
    ];
    root.providers = providers;
    root.pluginService = { savePluginData: (_id, key, value) => { root[key] = value; return true; } };
    root.barSources = root.normalizeBarSources(["codex", proxyId]);
    assert.deepEqual(Array.from(root.selectBarProviders(providers, root.barSources), item => root.sourceIdOf(item)), ["codex", proxyId]);
    assert.equal(root.setSourceWindow(providers[1], "secondary"), true);
    assert.equal(root.selectedWindowKey(proxyId), "secondary");
    assert.equal(root.selectedWindowKey("codex"), "primary");
    assert.equal(root.sourceName(providers[1]), "Codex · Proxy 1");
});

test("proxy bar values, tooltips, and colors use each account's selected window", () => {
    const root = makeRoot();
    root.usageDisplayMode = "used";
    const first = { provider: "codex", sourceId: "cliproxyapi:codex:acct-a", origin: "cliproxyapi", usage: { primary: { usedPercent: 35 }, secondary: { usedPercent: 92 } } };
    const second = { provider: "codex", sourceId: "cliproxyapi:codex:acct-b", origin: "cliproxyapi", usage: { primary: { usedPercent: 88 }, secondary: { usedPercent: 21 } } };
    root.providers = [first, second];
    root.barProviders = [first, second];
    root.barSourceWindows = root.normalizeBarSourceWindows({ [first.sourceId]: "secondary", [second.sourceId]: "secondary" });
    root.providerTimes[first.sourceId] = root.clockNow;
    root.providerTimes[second.sourceId] = root.clockNow;

    assert.equal(root.barProviderText(first), "92%");
    assert.equal(root.barProviderText(second), "21%");
    assert.equal(root.barWindowLabel(first.sourceId, first.usage), "Weekly");
    assert.equal(root.getUsageColor(root.sourceUsageWindow(first).usedPercent), "error");
    assert.equal(root.getUsageColor(root.sourceUsageWindow(second).usedPercent), "success");
    const tooltip = root.barTooltipText();
    assert.match(tooltip, /Codex · Proxy 1: Weekly \(used\) 92%/);
    assert.match(tooltip, /Codex · Proxy 2: Weekly \(used\) 21%/);
});

test("bar source normalization and source validation share the same proxy ID rule", () => {
    const root = makeRoot();
    const valid = "cliproxyapi:claude:" + "a".repeat(140);
    const invalid = "cliproxyapi:claude:bad/id";
    assert.equal(root.validSourceId(valid), true);
    assert.equal(root.validSourceId(invalid), false);
    assert.deepEqual(JSON.parse(JSON.stringify(root.normalizeBarSources([valid, invalid]))), [valid]);
});

test("long auth indexes survive parsing, pinning, and independent window settings", () => {
    const root = makeRoot();
    const authIndex = "auth_" + "x".repeat(140);
    const sourceId = "cliproxyapi:claude:" + authIndex;
    const item = root.normalizeFamilyOutput("claude", JSON.stringify([
        { provider: "cliproxyapi", usage: { accountProvider: "claude", authIndex, usage: { fiveHour: { usedPercent: 31 }, sevenDay: { usedPercent: 62 } } } }
    ]))[0];
    assert.equal(item.sourceId, sourceId);
    assert.deepEqual(JSON.parse(JSON.stringify(root.normalizeBarSources([sourceId]))), [sourceId]);
    root.providers = [item];
    root.pluginService = { savePluginData: (_id, key, value) => { root[key] = value; return true; } };
    root.barSources = root.normalizeBarSources([sourceId]);
    assert.equal(root.setSourceWindow(item, "sevenDay"), true);
    assert.equal(root.selectedWindowKey(sourceId), "sevenDay");
});

test("family fetch command stays a single provider-family request", () => {
    const root = makeRoot();
    assert.equal(root.refreshProvider("codex", true), true);
    assert.deepEqual(JSON.parse(JSON.stringify(root.procOpenai.command)), ["opentracker", "fetch", "codex", "--force"]);
    assert.equal(root.pendingFetches, 1);
});

test("full alert queue preserves the fifth account latch for a later refresh", () => {
    const root = makeRoot();
    let state = null;
    root.notificationsEnabled = true;
    root.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    const rows = percent => Array.from({ length: 5 }, (_, index) => ({
        provider: "cliproxyapi",
        usage: { accountProvider: "codex", accountId: "acct-" + (index + 1), authIndex: "auth-" + (index + 1), usage: { primary: { usedPercent: percent } } }
    }));
    root.parseProviderOutput("codex", JSON.stringify(rows(0)));
    root.parseProviderOutput("codex", JSON.stringify(rows(96)));
    const fifthId = "cliproxyapi:codex:acct-5";
    assert.equal(root.alertProcessBusy, true);
    assert.equal(root.alertQueue.length, 3);
    assert.equal(state.sources[fifthId].windows[fifthId + ":primary"].used, 0);
    assert.equal(state.sources[fifthId].windows[fifthId + ":primary"].sent95, false);

    for (let i = 0; i < 4; i++) root.finishAlert(0, false);
    assert.equal(root.alertProcessBusy, false);
    assert.equal(root.alertQueue.length, 0);
    root.parseProviderOutput("codex", JSON.stringify(rows(96)));
    assert.equal(root.alertActiveRecord.provider, fifthId);
    assert.match(root.alertActiveRecord.body, /Codex proxy account/);
});

test("proxy alert state is keyed by source and notifications omit account identifiers", () => {
    const root = makeRoot();
    let state = null;
    root.notificationsEnabled = true;
    root.pluginService = { loadPluginState: () => state, savePluginState: (_id, _key, next) => { state = structuredClone(next); } };
    const output = percent => JSON.stringify([
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "acct-one", authIndex: "auth-one", accountEmail: "user@example.invalid", usage: { primary: { usedPercent: percent } } } },
        { provider: "cliproxyapi", usage: { accountProvider: "codex", accountId: "acct-two", authIndex: "auth-two", accountEmail: "user@example.invalid", usage: { primary: { usedPercent: percent } } } }
    ]);
    root.parseProviderOutput("codex", output(0));
    root.parseProviderOutput("codex", output(96));
    assert.ok(state.sources["cliproxyapi:codex:acct-one"]);
    assert.ok(state.sources["cliproxyapi:codex:acct-two"]);
    const notifications = [root.alertActiveRecord, ...root.alertQueue].filter(Boolean).map(record => record.body).join("\n");
    assert.match(notifications, /Codex proxy account/);
    assert.doesNotMatch(notifications, /acct-one|acct-two|auth-one|auth-two|example\.invalid/);
});
