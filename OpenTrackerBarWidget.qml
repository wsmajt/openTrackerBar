pragma ComponentBehavior: Bound

import QtQuick
import QtQuick.Effects
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Services
import qs.Widgets
import qs.Modules.Plugins
import qs.DCommon.Widgets as DCommonWidgets

PluginComponent {
    id: root

    // === State ===
    property var providers: []
    property var opencodeProviders: []
    property var openaiProviders: []
    property var claudeProviders: []
    property string activeTab: "opencode"
    property bool isLoading: false
    property bool hasError: false
    property string errorMessage: ""
    property string opencodeError: ""
    property string openaiError: ""
    property string claudeError: ""
    property string lastUpdated: ""
    property string opencodeJsonBuffer: ""
    property string opencodeZenJsonBuffer: ""
    property string openaiJsonBuffer: ""
    property string claudeJsonBuffer: ""
    property int pendingFetches: 0
    property var providerTimes: ({ "opencode-go": 0, "opencode-zen": 0, "codex": 0, "claude": 0 })
    property var providerStale: ({})
    property var providerErrors: ({ "opencode-go": "", "opencode-zen": "", "codex": "", "claude": "" })
    property var fetchActive: ({ "opencode-go": false, "opencode-zen": false, "codex": false, "claude": false })
    property var fetchTimeouts: ({ "opencode-go": "", "opencode-zen": "", "codex": "", "claude": "" })
    property var fetchAwaitingExit: ({ "opencode-go": false, "opencode-zen": false, "codex": false, "claude": false })
    property var fetchStarted: ({ "opencode-go": false, "opencode-zen": false, "codex": false, "claude": false })
    property var fetchStderr: ({ "opencode-go": "", "opencode-zen": "", "codex": "", "claude": "" })
    property real clockNow: Date.now()
    onClockNowChanged: root.invalidateLocalStatsForDay()
    property int fetchTimeoutMs: 30000
    readonly property var barSources: root.normalizeBarSources(root.pluginData && root.pluginData.barSources !== undefined ? root.pluginData.barSources : root.legacyBarSources(root.pluginData ? root.pluginData.barProvider : undefined))
    readonly property string usageDisplayMode: root.pluginData && root.pluginData.usageDisplayMode === "remaining" ? "remaining" : "used"
    readonly property var barSourceWindows: root.normalizeBarSourceWindows(root.pluginData ? root.pluginData.barSourceWindows : null)
    readonly property bool notificationsEnabled: root.pluginData && root.pluginData.notificationsEnabled === true
    readonly property real zenBalanceThreshold: {
        var value = root.pluginData ? root.validNumber(root.pluginData.zenBalanceThreshold) : null;
        return value !== null && value >= 0 ? value : 1;
    }
    property var alertQueue: []
    property bool alertProcessBusy: false
    property bool alertTimedOut: false
    property var alertActiveRecord: null
    property string alertOutput: ""
    property int alertTimeoutMs: 15000
    readonly property bool localStatsEnabled: root.pluginData && root.pluginData.localStatsEnabled === true
    property var localStats: null
    property bool localStatsLoading: false
    property string localStatsError: ""
    property string localStatsBuffer: ""
    property string localStatsStderr: ""
    property int localStatsTimeoutMs: 25000
    property real localStatsUpdatedAt: 0
    property bool localStatsAwaitingExit: false
    property bool localStatsStarted: false

    // === Settings ===
    property int refreshIntervalMs: {
        var val = pluginData.refreshInterval;
        return val ? parseInt(val) : 120000;
    }

    // === Derived: highest-usage provider for the bar pill ===
    readonly property var highestProvider: {
        if (providers.length === 0)
            return null;
        var filtered = providers.filter(function (p) {
            return p && p.usage && root.barUsageWindow(root.sourceIdOf(p), p.usage) && !p.error;
        });
        if (filtered.length === 0)
            return null;
        var highest = filtered[0];
        for (var i = 1; i < filtered.length; i++) {
            if (root.barUsageWindow(root.sourceIdOf(filtered[i]), filtered[i].usage).usedPercent > root.barUsageWindow(root.sourceIdOf(highest), highest.usage).usedPercent)
                highest = filtered[i];
        }
        return highest;
    }

    readonly property real highestPercent: {
        if (!highestProvider || !highestProvider.usage || !root.barUsageWindow(root.sourceIdOf(highestProvider), highestProvider.usage))
            return 0;
        return root.barUsageWindow(root.sourceIdOf(highestProvider), highestProvider.usage).usedPercent;
    }

    readonly property string highestName: {
        if (!highestProvider)
            return "N/A";
        return root.sourceName(highestProvider);
    }

    readonly property var barProviders: root.selectBarProviders(root.providers, root.barSources)

    function normalizeBarSources(value) {
        var allowed = ["opencode-go", "opencode-zen", "codex", "claude"];
        if (!Array.isArray(value))
            return ["opencode-go", "opencode-zen", "codex"];
        var result = allowed.filter(function (id) { return value.indexOf(id) !== -1; });
        value.forEach(function (id) {
            if (root.validSourceId(id) && result.indexOf(id) === -1)
                result.push(id);
        });
        return result;
    }

    function legacyBarSources(value) {
        if (value === "opencode")
            return ["opencode-go", "opencode-zen"];
        if (value === "openai")
            return ["codex"];
        return ["opencode-go", "opencode-zen", "codex"];
    }

    function isBarSourceSelected(id) {
        return ( ["opencode-go", "opencode-zen", "codex", "claude"].indexOf(id) !== -1 || root.validSourceId(id)) && root.barSources.indexOf(id) !== -1;
    }

    function toggleBarSource(id) {
        var allowed = ["opencode-go", "opencode-zen", "codex", "claude"];
        if ((allowed.indexOf(id) === -1 && !root.validSourceId(id)) || !root.pluginService || !root.pluginId || typeof root.pluginService.savePluginData !== "function")
            return false;
        var next;
        if (root.isBarSourceSelected(id))
            next = root.barSources.filter(function (source) { return source !== id; });
        else
            next = root.normalizeBarSources(root.barSources.concat([id]));
        try {
            return root.pluginService.savePluginData(root.pluginId, "barSources", next) !== false;
        } catch (error) {
            return false;
        }
    }

    function savePluginSetting(key, value) {
        if (!root.pluginService || !root.pluginId || typeof root.pluginService.savePluginData !== "function")
            return false;
        try {
            return root.pluginService.savePluginData(root.pluginId, key, value) !== false;
        } catch (error) {
            return false;
        }
    }

    function normalizeBarSourceWindows(value) {
        var result = ({ "opencode-go": "rolling", "codex": "primary", "opencode-zen": "none", "claude": "fiveHour" });
        if (!value || typeof value !== "object" || Array.isArray(value)) return result;
        if (["rolling", "weekly", "monthly"].indexOf(value["opencode-go"]) !== -1) result["opencode-go"] = value["opencode-go"];
        if (["primary", "secondary"].indexOf(value.codex) !== -1) result.codex = value.codex;
        if (value["opencode-zen"] === "none") result["opencode-zen"] = "none";
        if (["fiveHour", "sevenDay", "sonnet", "opus"].indexOf(value.claude) !== -1) result.claude = value.claude;
        Object.keys(value).forEach(function (id) {
            var kind = root.sourceKind(id);
            var valid = kind === "codex" ? ["primary", "secondary"] : kind === "claude" ? ["fiveHour", "sevenDay", "sonnet", "opus"] : [];
            if (root.validSourceId(id) && valid.indexOf(value[id]) !== -1) result[id] = value[id];
        });
        return result;
    }

    function validSourceId(id) { return typeof id === "string" && /^cliproxyapi:(codex|claude):[A-Za-z0-9._-]+$/.test(id); }
    function sourceIdOf(item) { return item && typeof item.sourceId === "string" && item.sourceId ? item.sourceId : item ? item.provider : ""; }
    function sourceKind(id) { return typeof id === "string" && id.indexOf("cliproxyapi:") === 0 ? id.split(":")[1] : id; }
    function maskAccountEmail(value) {
        if (typeof value !== "string" || /[\s\u0000-\u001f\u007f]/.test(value)) return "";
        var at = value.indexOf("@");
        if (at <= 0 || at !== value.lastIndexOf("@") || at === value.length - 1) return "";
        var local = Array.from(value.slice(0, at)), domain = Array.from(value.slice(at + 1));
        if (!local.length || !domain.length) return "";
        return local.slice(0, 2).join("") + "***@" + domain.slice(0, 2).join("") + "***";
    }
    function safeUsage(value) {
        var result = {};
        Object.keys(value || {}).forEach(function (key) { if (key !== "accountEmail") result[key] = value[key]; });
        return result;
    }
    function sourceName(item) {
        if (!item) return "";
        var kind = root.sourceKind(root.sourceIdOf(item));
        if (item.accountLabel) {
            var peersWithLabel = root.providers.filter(function (entry) { return entry && entry.provider === kind && entry.accountLabel === item.accountLabel; }).slice().sort(function (a, b) { return root.sourceIdOf(a) < root.sourceIdOf(b) ? -1 : 1; });
            var labelIndex = peersWithLabel.findIndex(function (entry) { return root.sourceIdOf(entry) === root.sourceIdOf(item); });
            return root.formatProviderName(kind) + " · " + item.accountLabel + (peersWithLabel.length > 1 ? " · " + (labelIndex + 1) : "");
        }
        if (item.origin !== "cliproxyapi") return root.formatProviderName(item.provider);
        var id = root.sourceIdOf(item), kind = root.sourceKind(id), peers = root.providers.filter(function (entry) { return entry && entry.origin === "cliproxyapi" && root.sourceKind(root.sourceIdOf(entry)) === kind; }).slice().sort(function (a, b) { return root.sourceIdOf(a) < root.sourceIdOf(b) ? -1 : 1; });
        return root.formatProviderName(kind) + " · Proxy " + (peers.findIndex(function (entry) { return root.sourceIdOf(entry) === id; }) + 1);
    }
    function sourceFetching(id) { return !!root.fetchActive[root.sourceKind(id)]; }
    function sourceUpdatedLabel(id) { return root.providerUpdatedLabel(id); }
    function sourceIsStale(id) { return root.providerIsStale(id); }
    function sourceError(id) {
        var kind = root.sourceKind(id);
        var category = root.providerErrors[kind] || "";
        if (category === "partial")
            return root.providerStale && root.providerStale[id] ? root.providerError(kind) : "";
        return root.providerError(kind);
    }
    function sourceHint(id) { return root.providerHint(root.sourceKind(id)); }
    function sourceRecoveryCommand(id) { return root.providerRecoveryCommand(root.sourceKind(id)); }
    function availableSourceWindows(item) { return root.availableBarWindows(root.sourceKind(root.sourceIdOf(item)), item ? item.usage : null); }
    function selectedSourceWindowKey(item) { return root.selectedWindowKey(root.sourceIdOf(item)); }
    function setSourceWindow(item, key) { return item ? root.setBarSourceWindow(root.sourceIdOf(item), key) : false; }
    function sourceUsageWindow(item) { return item ? root.barUsageWindow(root.sourceIdOf(item), item.usage) : null; }
    function sourceWindowLabel(item) { return item ? root.barWindowLabel(root.sourceIdOf(item), item.usage) : ""; }

    function selectedWindowKey(provider) {
        if (root.validSourceId(provider)) return root.barSourceWindows[provider] || (root.sourceKind(provider) === "claude" ? "fiveHour" : "primary");
        return provider === "opencode-go" ? root.barSourceWindows[provider] || "rolling" : provider === "codex" ? root.barSourceWindows[provider] || "primary" : provider === "claude" ? root.barSourceWindows[provider] || "fiveHour" : "none";
    }

    function availableBarWindows(provider, usage) {
        provider = root.sourceKind(provider);
        var candidates = provider === "opencode-go" ? [["rolling", "Rolling", root.primaryUsage(usage)], ["weekly", "Weekly", root.secondaryUsage(usage)], ["monthly", "Monthly", root.tertiaryUsage(usage)]] : provider === "codex" ? [["primary", "Session", root.primaryUsage(usage)], ["secondary", "Weekly", root.secondaryUsage(usage)]] : provider === "claude" ? [["fiveHour", "5-hour", root.claudeUsageWindow(usage, "fiveHour")], ["sevenDay", "Weekly", root.claudeUsageWindow(usage, "sevenDay")], ["sonnet", "Sonnet", root.claudeUsageWindow(usage, "sonnet")], ["opus", "Opus", root.claudeUsageWindow(usage, "opus")]] : [];
        return candidates.filter(function (entry) { return root.validUsageWindow(entry[2]); }).map(function (entry) { return { key: entry[0], label: entry[1] }; });
    }

    function barUsageWindow(provider, usage) {
        var sourceId = provider;
        var kind = root.sourceKind(sourceId);
        var windows = root.availableBarWindows(kind, usage);
        if (!windows.length) return null;
        var key = root.selectedWindowKey(sourceId);
        var actual = windows.find(function (entry) { return entry.key === key; }) || windows[0];
        if (kind === "claude") return root.claudeUsageWindow(usage, actual.key);
        return actual.key === "rolling" || actual.key === "primary" ? root.primaryUsage(usage) : actual.key === "weekly" || actual.key === "secondary" ? root.secondaryUsage(usage) : root.tertiaryUsage(usage);
    }

    function barWindowLabel(provider, usage) {
        var sourceId = provider;
        var kind = root.sourceKind(sourceId);
        var windows = root.availableBarWindows(kind, usage);
        if (!windows.length) return "";
        var key = root.selectedWindowKey(sourceId);
        return (windows.find(function (entry) { return entry.key === key; }) || windows[0]).label;
    }

    function setBarSourceWindow(provider, key) {
        var kind = root.sourceKind(provider);
        if (kind !== "opencode-go" && kind !== "codex" && kind !== "claude") return false;
        if (root.validSourceId(provider) && root.barSourceWindows[provider] === key) return true;
        var item = root.providers.find(function (entry) { return root.sourceIdOf(entry) === provider; });
        if (!item || !root.availableBarWindows(kind, item.usage).some(function (entry) { return entry.key === key; })) return false;
        var next = Object.assign({}, root.barSourceWindows);
        next[provider] = key;
        return root.savePluginSetting("barSourceWindows", next);
    }

    function setLocalStatsEnabled(enabled) {
        return typeof enabled === "boolean" && root.savePluginSetting("localStatsEnabled", enabled);
    }

    function setUsageDisplayMode(mode) {
        return (mode === "used" || mode === "remaining") && root.savePluginSetting("usageDisplayMode", mode);
    }

    function setNotificationsEnabled(enabled) {
        return typeof enabled === "boolean" && root.savePluginSetting("notificationsEnabled", enabled);
    }

    function setZenBalanceThreshold(value) {
        var parsed = root.validNumber(value);
        if (typeof value === "boolean" || parsed === null || parsed < 0 || Math.abs(parsed * 100 - Math.round(parsed * 100)) > 1e-8)
            return false;
        return root.savePluginSetting("zenBalanceThreshold", Math.round(parsed * 100) / 100);
    }

    function displayPercent(window) {
        if (!root.validUsageWindow(window))
            return 0;
        var used = Math.max(0, Math.min(100, Number(window.usedPercent)));
        return root.usageDisplayMode === "remaining" ? 100 - used : used;
    }

    function selectBarProviders(sourceProviders, selectedSources) {
        var list = [];
        var selected = root.normalizeBarSources(selectedSources);
        selected.forEach(function (id) {
            var provider = sourceProviders.find(function (p) {
                return p && root.sourceIdOf(p) === id && !p.error && (root.barUsageWindow(id, p.usage) || (id === "opencode-zen" && root.hasZenBalance(p.usage)));
            });
            if (provider)
                list.push(provider);
        });
        return list;
    }

    readonly property var barHighestProvider: {
        if (root.barProviders.length === 0)
            return null;
        var quotaProviders = root.barProviders.filter(function (p) { return root.barUsageWindow(root.sourceIdOf(p), p.usage); });
        if (quotaProviders.length === 0)
            return null;
        var highest = quotaProviders[0];
        for (var i = 1; i < quotaProviders.length; i++) {
            if (root.barUsageWindow(root.sourceIdOf(quotaProviders[i]), quotaProviders[i].usage).usedPercent > root.barUsageWindow(root.sourceIdOf(highest), highest.usage).usedPercent)
                highest = quotaProviders[i];
        }
        return highest;
    }

    readonly property real barHighestPercent: {
        if (!root.barHighestProvider || !root.barHighestProvider.usage || !root.barUsageWindow(root.sourceIdOf(root.barHighestProvider), root.barHighestProvider.usage))
            return 0;
        return root.barUsageWindow(root.sourceIdOf(root.barHighestProvider), root.barHighestProvider.usage).usedPercent;
    }

    // === Helpers ===
    function findContainingPill(item) {
        var current = item;
        while (current) {
            if ("isMouseHovered" in current && "visualContent" in current && "contentItem" in current)
                return current;
            current = current.parent;
        }
        return null;
    }

    function getUsageColor(pct) {
        if (pct >= 80)
            return Theme.error;
        if (pct >= 60)
            return Theme.warning;
        return Theme.success;
    }

    function capitalizeFirst(s) {
        if (!s)
            return "";
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function formatProviderName(name) {
        if (name === "opencode-go")
            return "Opencode Go";
        if (name === "opencode-zen")
            return "Opencode Zen";
        if (name === "codex")
            return "Codex";
        if (name === "claude")
            return "Claude";
        return capitalizeFirst(name);
    }

    function providerLogoPath(provider) {
        var isLight = !!SessionData.isLightMode;
        if (provider === "opencode" || provider === "opencode-go" || provider === "opencode-zen") {
            return isLight ? "icons/opencode-go-dark.svg" : "icons/opencode-go-light.svg";
        }
        if (provider === "openai" || provider === "codex") {
            return isLight ? "icons/codex-dark.svg" : "icons/codex-light.svg";
        }
        if (provider === "claude") return "icons/claude.svg";
        return "";
    }

    function providerTab(provider) {
        return provider === "codex" || provider === "openai" ? "openai" : provider === "claude" ? "claude" : "opencode";
    }

    function currentProviders() {
        return activeTab === "openai" ? openaiProviders : activeTab === "claude" ? claudeProviders : opencodeProviders;
    }

    function currentError() {
        if (activeTab === "openai")
            return root.providerError("codex");
        if (activeTab === "claude")
            return root.providerError("claude");
        return [root.providerError("opencode-go"), root.providerError("opencode-zen")].filter(function (s) { return s !== ""; }).join(" · ");
    }

    function providerError(id) {
        var category = providerErrors[id] || "";
        return ({ "partial": "Some accounts could not be refreshed", "missing-cli": "OpenTracker CLI is not installed", "not-configured": "Provider is not configured", "auth-expired": "Sign-in has expired", "rate-limited": "Provider is rate limited", "http-error": "Provider request failed", "timeout": "Provider request timed out", "invalid-output": "Provider returned invalid data", "empty-output": "Provider returned no data", "unknown": "Provider request failed" })[category] || "";
    }

    function providerHint(id) {
        var category = root.providerErrors[id] || "";
        return ({
            "missing-cli": "Install opentracker-cli and refresh PATH before retrying.",
            "not-configured": "Sign in to this provider to continue.",
            "auth-expired": "Sign in again to refresh provider access.",
            "rate-limited": "Wait a while, then retry.",
            "http-error": "Check your network connection, then retry.",
            "timeout": "Retry this provider.",
            "invalid-output": "Update opentracker, then retry this provider.",
            "empty-output": "Update opentracker, then retry this provider.",
            "unknown": "Retry this provider using the command shown in the terminal."
        })[category] || "Retry this provider using the command shown in the terminal.";
    }

    function providerRecoveryCommand(id) {
        var category = root.providerErrors[id] || "";
        if (["opencode-go", "opencode-zen", "codex", "claude"].indexOf(id) === -1) return "opentracker version";
        if (category === "missing-cli") return "opentracker version";
        if (category === "auth-expired" || category === "not-configured") return id === "codex" ? "opentracker login codex" : id === "claude" ? "opentracker login claude" : "opentracker login opencode";
        return "opentracker fetch " + id + " --force";
    }

    function classifyProviderFailure(id, stderr, exitCode, started, reason) {
        if (!started) return "missing-cli";
        if (reason) return reason.indexOf("Timed out") >= 0 ? "timeout" : "unknown";
        var text = String(stderr || "").slice(0, 4096).toLowerCase();
        if (/not configured|not logged in|no credentials/.test(text)) return "not-configured";
        if (/unauthorized|forbidden|authentication|token expired|login required|\b(?:http\s*)?40[13]\b/.test(text)) return "auth-expired";
        if (/rate.?limit|too many requests|\b(?:http\s*)?429\b/.test(text)) return "rate-limited";
        if (/\bhttp\s*[45]\d\d\b|request failed/.test(text)) return "http-error";
        return exitCode === 0 ? "empty-output" : "unknown";
    }

    function providerUpdatedAt(id) {
        return Number(providerTimes[id]) || 0;
    }

    function providerIsStale(id) {
        if (root.providerStale && root.providerStale[id]) return true;
        var updated = root.providerUpdatedAt(id);
        return updated > 0 && root.clockNow - updated >= root.refreshIntervalMs * 2;
    }

    function providerUpdatedLabel(id) {
        var updated = root.providerUpdatedAt(id);
        if (!updated)
            return "";
        var ageSeconds = Math.max(0, Math.floor((root.clockNow - updated) / 1000));
        return ageSeconds < 60 ? ageSeconds + "s ago" : Math.floor(ageSeconds / 60) + "m ago";
    }

    function providerBalanceText(usage) {
        if (!usage || typeof usage !== "object")
            return "";
        var dollars = root.validNumber(usage.balanceDollars);
        if (dollars !== null)
            return "$" + dollars.toFixed(2);
        var micros = root.validNumber(usage.balanceMicroCents);
        return micros !== null ? "$" + (micros / 100000000).toFixed(2) : "";
    }

    function validNumber(value) {
        if ((typeof value !== "number" && typeof value !== "string") || (typeof value === "string" && value.trim() === ""))
            return null;
        var number = Number(value);
        return isFinite(number) ? number : null;
    }

    function hasZenBalance(usage) {
        return !!usage && typeof usage === "object" && (root.validNumber(usage.balanceDollars) !== null || root.validNumber(usage.balanceMicroCents) !== null);
    }

    function barProviderText(provider) {
        if (!provider || !provider.usage)
            return "";
        var quota = root.barUsageWindow(root.sourceIdOf(provider), provider.usage);
        return quota ? Math.round(root.displayPercent(quota)) + "%" : root.providerBalanceText(provider.usage);
    }

    function barTooltipText() {
        return root.barProviders.map(function (provider) {
            var id = root.sourceIdOf(provider);
            var quota = root.barUsageWindow(id, provider.usage);
            var details = (quota ? root.barWindowLabel(id, provider.usage) + " (" + root.usageDisplayMode + ")" : "Balance") + " " + root.barProviderText(provider);
            if (quota && typeof quota.resetsAt === "string") {
                var reset = root.formatTimeUntil(quota.resetsAt);
                if (reset)
                    details += " · resets " + reset;
            }
            var error = root.sourceError(id);
            var age = root.providerUpdatedLabel(id);
            if (error)
                details += " · " + error;
            else if (age)
                details += " · updated " + age;
            if (root.providerIsStale(id))
                details += " · stale";
            return root.sourceName(provider) + ": " + details;
        }).join("\n");
    }

    function validUsageWindow(value) {
        return !!value && typeof value === "object" && !Array.isArray(value) && root.validNumber(value.usedPercent) !== null;
    }

    function primaryUsage(usage) {
        if (!usage || typeof usage !== "object")
            return null;
        var value = usage.rolling || usage.primary || null;
        return root.validUsageWindow(value) ? value : null;
    }

    function claudeUsageWindow(usage, key) {
        if (!usage || typeof usage !== "object") return null;
        var value = usage[key];
        return root.validUsageWindow(value) ? value : null;
    }

    function providerUsageWindows(provider, usage) {
        var candidates = provider === "opencode-go" ? [["rolling", "Session", root.primaryUsage(usage)], ["weekly", "Weekly", root.secondaryUsage(usage)], ["monthly", "Monthly", root.tertiaryUsage(usage)]] : provider === "codex" ? [["primary", "Session", root.primaryUsage(usage)], ["secondary", "Weekly", root.secondaryUsage(usage)]] : provider === "claude" ? [["fiveHour", "5-hour", root.claudeUsageWindow(usage, "fiveHour")], ["sevenDay", "Weekly", root.claudeUsageWindow(usage, "sevenDay")], ["sonnet", "Sonnet", root.claudeUsageWindow(usage, "sonnet")], ["opus", "Opus", root.claudeUsageWindow(usage, "opus")]] : [];
        return candidates.filter(function (entry) { return root.validUsageWindow(entry[2]); }).map(function (entry) { return { key: entry[0], label: entry[1], window: entry[2] }; });
    }

    function secondaryUsage(usage) {
        if (!usage || typeof usage !== "object")
            return null;
        var value = usage.weekly || usage.secondary || null;
        return root.validUsageWindow(value) ? value : null;
    }

    function tertiaryUsage(usage) {
        if (!usage || typeof usage !== "object")
            return null;
        var value = usage.monthly || null;
        return root.validUsageWindow(value) ? value : null;
    }

    function primaryLabel(provider) {
        return provider === "codex" ? "Session" : "Session";
    }

    function secondaryLabel(provider) {
        return provider === "codex" ? "Weekly" : "Weekly";
    }

    function mergeProviders() {
        root.providers = root.opencodeProviders.concat(root.openaiProviders, root.claudeProviders);
    }

    function inspectFamilyOutput(target, raw) {
        if (!raw || !raw.trim()) throw new Error("Empty output");
        var data = JSON.parse(raw);
        if (!Array.isArray(data)) data = [data];
        var normalized = [];
        var invalidIds = ({});
        var hasInvalid = false;
        data.forEach(function (item) {
            if (!item || typeof item !== "object" || Array.isArray(item)) { hasInvalid = true; return; }
            var kind, sourceId, origin, usage, accountLabel = "";
            if (item.provider === target) { kind = target; sourceId = target; origin = "local"; accountLabel = root.maskAccountEmail(item.usage && item.usage.accountEmail); usage = root.safeUsage(item.usage); }
            else if (item.provider === "cliproxyapi" && item.usage && item.usage.accountProvider === target) {
                kind = target;
                var identity = target === "codex" ? item.usage.accountId || item.usage.authIndex : item.usage.authIndex;
                sourceId = typeof identity === "string" ? "cliproxyapi:" + target + ":" + identity : "";
                if (!root.validSourceId(sourceId)) { hasInvalid = true; return; }
                origin = "cliproxyapi"; accountLabel = root.maskAccountEmail(item.usage.accountEmail || (item.usage.usage && item.usage.usage.accountEmail)); usage = root.safeUsage(item.usage.usage);
            } else if (item.provider === "cliproxyapi") { hasInvalid = true; return; }
            else return;
            if (item.error || !usage || typeof usage !== "object" || Array.isArray(usage) || root.availableBarWindows(kind, usage).length === 0) {
                hasInvalid = true;
                if (sourceId) invalidIds[sourceId] = true;
                return;
            }
            normalized.push({ provider: kind, sourceId: sourceId, origin: origin, usage: usage, accountLabel: accountLabel });
        });
        var seen = ({});
        normalized = normalized.filter(function (entry) { if (seen[entry.sourceId]) return false; seen[entry.sourceId] = true; return true; });
        normalized.sort(function (a, b) { return a.origin === b.origin ? (a.sourceId < b.sourceId ? -1 : a.sourceId > b.sourceId ? 1 : 0) : a.origin === "local" ? -1 : 1; });
        return { items: normalized, invalidIds: invalidIds, hasInvalid: hasInvalid };
    }

    function normalizeFamilyOutput(target, raw) {
        var result = root.inspectFamilyOutput(target, raw);
        var normalized = result.items;
        if (!normalized.length) throw new Error("No valid account data");
        return normalized;
    }

    function commitFamilyOutput(target, inspection, partial) {
        var previous = target === "codex" ? root.openaiProviders : root.claudeProviders;
        var known = ({});
        inspection.items.forEach(function (entry) { known[entry.sourceId] = true; });
        var next = inspection.items.slice();
        if (partial) previous.forEach(function (entry) { if (!known[root.sourceIdOf(entry)]) next.push(entry); });
        next.sort(function (a, b) { return a.origin === b.origin ? (root.sourceIdOf(a) < root.sourceIdOf(b) ? -1 : root.sourceIdOf(a) > root.sourceIdOf(b) ? 1 : 0) : a.origin === "local" ? -1 : 1; });
        if (target === "codex") root.openaiProviders = next; else root.claudeProviders = next;
        var times = Object.assign({}, root.providerTimes);
        var errors = Object.assign({}, root.providerErrors);
        var stale = Object.assign({}, root.providerStale);
        next.forEach(function (entry) {
            var id = root.sourceIdOf(entry);
            if (known[id]) { times[id] = Date.now(); errors[id] = ""; delete stale[id]; }
            else if (partial) stale[id] = true;
        });
        Object.keys(inspection.invalidIds).forEach(function (id) { if (!known[id]) stale[id] = true; });
        if (!partial) Object.keys(stale).forEach(function (id) { if (root.sourceKind(id) === target) delete stale[id]; });
        if (known[target]) times[target] = Date.now();
        root.providerTimes = times; root.providerErrors = errors; root.providerStale = stale;
        root.setProviderError(target, partial ? "partial" : "");
        root.mergeProviders();
        root.opencodeError = root.providerError("opencode-go") || root.providerError("opencode-zen");
        root.openaiError = root.providerError("codex"); root.claudeError = root.providerError("claude");
        root.hasError = root.opencodeError !== "" || root.openaiError !== "" || root.claudeError !== "";
        root.errorMessage = root.currentError();
        root.lastUpdated = Qt.formatDateTime(new Date(), "hh:mm:ss");
        inspection.items.forEach(function (entry) { root.evaluateProviderAlerts(entry.sourceId); });
        return true;
    }

    function markFamilyStale(target, category) {
        var previous = target === "codex" ? root.openaiProviders : root.claudeProviders;
        var stale = Object.assign({}, root.providerStale);
        previous.forEach(function (entry) { stale[root.sourceIdOf(entry)] = true; });
        root.providerStale = stale;
        root.setProviderError(target, category);
    }

    function parseProviderOutput(target, raw) {
        if (!raw || !raw.trim())
            throw new Error("Empty output");
        var data = JSON.parse(raw);
        if (target === "codex" || target === "claude") {
            var inspection = root.inspectFamilyOutput(target, raw);
            if (!inspection.items.length || inspection.hasInvalid) throw new Error("Provider account data is invalid");
            return root.commitFamilyOutput(target, inspection, false);
        }
        if (!Array.isArray(data))
            data = [data];
        data = data.filter(function (item) { return item && typeof item === "object" && !Array.isArray(item) && item.provider === target; });
        if (data.length === 0)
            throw new Error("No provider data for " + target);
        for (var i = 0; i < data.length; i++) {
            var item = data[i];
            if (item.error)
                throw new Error("Provider returned an error");
            if (!item.usage || typeof item.usage !== "object" || Array.isArray(item.usage))
                throw new Error("Provider usage is missing or invalid");
            if (target === "opencode-zen") {
                if (!root.hasZenBalance(item.usage))
                    throw new Error("Zen balance is missing or invalid");
            } else if ((target === "claude" ? root.providerUsageWindows(target, item.usage).length : root.availableBarWindows(target, item.usage).length) === 0) {
                throw new Error("Quota window is missing or invalid");
            }
        }
        if (target === "codex") {
            root.openaiProviders = data;
        } else if (target === "claude") {
            root.claudeProviders = data;
        } else {
            root.opencodeProviders = root.opencodeProviders.filter(function (item) { return item.provider !== target; }).concat(data).sort(function (a, b) {
                return (a.provider === "opencode-go" ? 0 : 1) - (b.provider === "opencode-go" ? 0 : 1);
            });
        }
        var times = Object.assign({}, root.providerTimes);
        times[target] = Date.now();
        root.providerTimes = times;
        root.setProviderError(target, "");
        root.opencodeError = root.providerError("opencode-go") || root.providerError("opencode-zen");
        root.openaiError = root.providerError("codex");
        root.claudeError = root.providerError("claude");
        root.mergeProviders();
        root.hasError = root.opencodeError !== "" || root.openaiError !== "" || root.claudeError !== "";
        root.errorMessage = root.currentError();
        root.lastUpdated = Qt.formatDateTime(new Date(), "hh:mm:ss");
        root.evaluateProviderAlerts(target);
    }

    function alertWindows(provider, usage) {
        var kind = root.sourceKind(provider);
        var windows = [];
        if (kind === "claude")
            return root.providerUsageWindows(kind, usage).map(function (entry) { return { key: provider + ":" + entry.key, label: (provider === kind ? "Claude " : "Claude proxy account ") + entry.label, window: entry.window }; });
        var candidates = kind === "opencode-go" ? [["rolling", root.primaryUsage(usage)], ["weekly", root.secondaryUsage(usage)], ["monthly", root.tertiaryUsage(usage)]] : [["primary", root.primaryUsage(usage)], ["secondary", root.secondaryUsage(usage)]];
        candidates.forEach(function (entry) {
            if (root.validUsageWindow(entry[1]))
                windows.push({ key: provider + ":" + entry[0], label: (provider === "codex" ? "Codex " : provider === "opencode-go" ? "Opencode Go " : "Codex proxy account ") + entry[0], window: entry[1] });
        });
        return windows;
    }

    function alertState() {
        if (!root.pluginService || typeof root.pluginService.loadPluginState !== "function")
            return { sources: ({}), sourcePrefs: ({}), pending: [] };
        var state = root.pluginService.loadPluginState(root.pluginId, "alertState", null);
        if (!state || typeof state !== "object") state = {};
        else state = JSON.parse(JSON.stringify(state));
        if (!state.sources || typeof state.sources !== "object") state.sources = ({});
        if (!state.sourcePrefs || typeof state.sourcePrefs !== "object") state.sourcePrefs = ({});
        if (!Array.isArray(state.pending)) state.pending = [];
        return state;
    }

    function alertPrefs() {
        return JSON.stringify([root.notificationsEnabled, root.zenBalanceThreshold]);
    }

    function removeAlertReservation(state, token) {
        state.pending = (state.pending || []).filter(function (pending) { return pending.token !== token; });
    }

    function saveAlertState(state) {
        root.pluginService.savePluginState(root.pluginId, "alertState", state);
    }

    function baselineAlertSource(state, provider, usage) {
        var source = { windows: ({}) };
        if (provider === "opencode-zen") {
            var dollars = root.validNumber(usage.balanceDollars);
            source.zen = dollars !== null ? dollars : root.validNumber(usage.balanceMicroCents) / 100000000;
        } else {
            root.alertWindows(provider, usage).forEach(function (entry) {
                var used = Math.max(0, Math.min(100, Number(entry.window.usedPercent)));
                source.windows[entry.key] = { used: used, resetsAt: entry.window.resetsAt || "", sent80: used >= 80, sent95: used >= 95 };
            });
        }
        state.sources[provider] = source;
        state.sourcePrefs[provider] = root.alertPrefs();
    }

    function evaluateProviderAlerts(provider) {
        if (!root.pluginService || typeof root.pluginService.savePluginState !== "function")
            return;
        var state = root.alertState();
        var prefs = root.alertPrefs();
        state.pending = state.pending.filter(function (pending) { return Date.now() - pending.time < 180000; });
        var item;
        var kind = root.sourceKind(provider);
        if (kind === "opencode-zen")
            item = root.opencodeProviders.find(function (entry) { return entry.provider === provider && !entry.error && root.hasZenBalance(entry.usage); });
        else {
            var sourceProviders = kind === "codex" ? root.openaiProviders : kind === "claude" ? root.claudeProviders : root.opencodeProviders;
            item = sourceProviders.find(function (entry) { return root.sourceIdOf(entry) === provider && !entry.error && root.alertWindows(provider, entry.usage).length > 0; });
        }
        if (!item)
            return;
        if (!root.notificationsEnabled || state.sourcePrefs[provider] !== prefs) {
            root.removeAlertReservationForProvider(state, provider);
            root.baselineAlertSource(state, provider, item.usage);
            root.saveAlertState(state);
            return;
        }
        if (state.pending.some(function (pending) { return pending.provider === provider; }))
            return;
        var priorSource = state.sources[provider] ? JSON.parse(JSON.stringify(state.sources[provider])) : null;
        var events = [];
        if (kind === "opencode-zen") {
            var sourceState = state.sources[provider] || {};
            var balance = root.validNumber(item.usage.balanceDollars);
            if (balance === null) balance = root.validNumber(item.usage.balanceMicroCents) / 100000000;
            if (sourceState.zen !== undefined && sourceState.zen > root.zenBalanceThreshold && balance <= root.zenBalanceThreshold) {
                events.push({ provider: provider, body: "Balance is $" + balance.toFixed(2) + " (threshold $" + root.zenBalanceThreshold.toFixed(2) + ")" });
            }
            sourceState.zen = balance;
            state.sources[provider] = sourceState;
        } else {
            var sourceState = state.sources[provider] || { windows: ({}) };
            if (!sourceState.windows) sourceState.windows = ({});
            root.alertWindows(provider, item.usage).forEach(function (entry) {
                    var used = Math.max(0, Math.min(100, Number(entry.window.usedPercent)));
                    var old = sourceState.windows[entry.key];
                    var resetAt = entry.window.resetsAt || "";
                    var newCycle = !old || (resetAt !== (old.resetsAt || "") && (resetAt || old.resetsAt));
                    var crossed = [];
                    if (newCycle) {
                        old = { used: used, resetsAt: entry.window.resetsAt || "", sent80: used >= 80, sent95: used >= 95 };
                    } else {
                        if (!old.sent95 && used >= 95 && old.used < 95) { crossed.push(95); old.sent80 = true; old.sent95 = true; }
                        else if (!old.sent80 && used >= 80 && old.used < 80) { crossed.push(80); old.sent80 = true; }
                        if (used < 80) old.sent80 = false;
                        if (used < 95) old.sent95 = false;
                        old.used = used;
                        old.resetsAt = entry.window.resetsAt || "";
                    }
                    if (crossed.length) events.push({ provider: provider, key: entry.key, label: entry.label, used: used, resetsAt: entry.window.resetsAt || "", sent80: old.sent80, sent95: old.sent95, thresholds: crossed });
                    sourceState.windows[entry.key] = old;
                });
            state.sources[provider] = sourceState;
        }
        if (events.length) {
            if (root.alertQueue.length >= 3) {
                if (priorSource) state.sources[provider] = priorSource;
                else delete state.sources[provider];
                root.saveAlertState(state);
                return;
            }
            var body = kind === "opencode-zen" ? events[0].body : events.map(function (entry) { return entry.label + " " + entry.used + "% used; threshold " + entry.thresholds.join(" and "); }).join("\n");
            var desired = JSON.parse(JSON.stringify(state.sources[provider]));
            if (priorSource) state.sources[provider] = priorSource;
            else delete state.sources[provider];
            var pending = { token: String(Date.now()) + ":" + provider + ":" + Math.random(), provider: provider, prefs: prefs, time: Date.now(), body: body, desired: desired };
            state.pending.push({ token: pending.token, provider: provider, prefs: prefs, time: pending.time });
            root.saveAlertState(state);
            root.alertQueue = root.alertQueue.concat([pending]);
            root.startNextAlert();
            return;
        }
        state.sourcePrefs[provider] = prefs;
        root.saveAlertState(state);
    }

    function removeAlertReservationForProvider(state, provider) {
        state.pending = state.pending.filter(function (pending) { return pending.provider !== provider; });
    }

    function startNextAlert() {
        if (root.alertProcessBusy)
            return;
        while (root.alertQueue.length > 0) {
            var candidate = root.alertQueue[0];
            var candidateState = root.alertState();
            var reservation = candidateState.pending.find(function (pending) { return pending.token === candidate.token; });
            if (root.notificationsEnabled && candidate.prefs === root.alertPrefs() && reservation && reservation.prefs === candidate.prefs)
                break;
            root.alertQueue = root.alertQueue.slice(1);
            root.removeAlertReservation(candidateState, candidate.token);
            root.saveAlertState(candidateState);
        }
        if (root.alertQueue.length === 0)
            return;
        var next = root.alertQueue[0];
        root.alertQueue = root.alertQueue.slice(1);
        root.alertProcessBusy = true;
        root.alertTimedOut = false;
        root.alertActiveRecord = next;
        root.alertOutput = "";
        alertWatchdog.interval = root.alertTimeoutMs;
        alertWatchdog.restart();
        procAlert.command = ["dms", "notify", "-a", "OpenTrackerBar", "-u", "normal", "-i", "monitoring", next.provider === "opencode-zen" ? "Zen balance low" : "Quota alert", next.body];
        procAlert.running = true;
    }

    function finishAlert(exitCode, timedOut) {
        if (!root.alertProcessBusy) return;
        alertWatchdog.stop();
        var record = root.alertActiveRecord;
        if (record) {
            var state = root.alertState();
            var reservation = state.pending.find(function (pending) { return pending.token === record.token; });
            var currentPrefs = root.alertPrefs();
            var current = root.notificationsEnabled && record.prefs === currentPrefs && reservation && reservation.prefs === record.prefs;
            if (exitCode === 0 && !timedOut && !root.alertTimedOut && current) {
                state.sources[record.provider] = record.desired;
                state.sourcePrefs[record.provider] = record.prefs;
            } else if (exitCode !== 0 || timedOut || root.alertTimedOut) {
                console.warn("opentracker: alert sender failed for " + root.sourceKind(record.provider) + " (exit " + exitCode + (timedOut || root.alertTimedOut ? ", timeout" : "") + ")");
            }
            root.removeAlertReservation(state, record.token);
            root.saveAlertState(state);
        }
        root.alertActiveRecord = null;
        root.alertProcessBusy = false;
        root.alertTimedOut = false;
        root.startNextAlert();
    }

    function setProviderError(target, message) {
        var errors = Object.assign({}, root.providerErrors);
        errors[target] = message;
        root.providerErrors = errors;
    }

    function finishFetch(target, exitCode, raw, reason) {
        if (!root.fetchActive[target])
            return;
        reason = reason || root.fetchTimeouts[target] || "";
        var timeouts = Object.assign({}, root.fetchTimeouts);
        timeouts[target] = "";
        root.fetchTimeouts = timeouts;
        var fetchWasStarted = root.fetchStarted[target] === true;
        var active = Object.assign({}, root.fetchActive);
        active[target] = false;
        root.fetchActive = active;
        root.pendingFetches = Math.max(0, root.pendingFetches - 1);
        root.isLoading = root.pendingFetches > 0;

        if ((exitCode === 0 || exitCode === 1) && raw && raw.trim().length > 0 && !reason && (target === "codex" || target === "claude")) {
            try {
                var inspection = root.inspectFamilyOutput(target, raw);
                if (!inspection.items.length && !inspection.hasInvalid) throw new Error("No valid account data");
                root.commitFamilyOutput(target, inspection, exitCode === 1 || inspection.hasInvalid);
            } catch (e) { root.markFamilyStale(target, "invalid-output"); }
        } else if (exitCode === 0 && raw && raw.trim().length > 0 && !reason) {
            try {
                root.parseProviderOutput(target, raw);
            } catch (e) {
                if (target === "codex" || target === "claude") root.markFamilyStale(target, "invalid-output");
                else root.setProviderError(target, "invalid-output");
            }
        } else {
            var category = root.classifyProviderFailure(target, root.fetchStderr[target], exitCode, fetchWasStarted, reason);
            if (exitCode === 0 && (!raw || !raw.trim())) category = "empty-output";
            if (target === "codex" || target === "claude") root.markFamilyStale(target, category);
            else root.setProviderError(target, category);
        }
        var started = Object.assign({}, root.fetchStarted); started[target] = false; root.fetchStarted = started;
        var stderr = Object.assign({}, root.fetchStderr); stderr[target] = ""; root.fetchStderr = stderr;

        root.opencodeError = root.providerError("opencode-go") || root.providerError("opencode-zen");
        root.openaiError = root.providerError("codex");
        root.claudeError = root.providerError("claude");
        root.hasError = root.opencodeError !== "" || root.openaiError !== "" || root.claudeError !== "";
        root.errorMessage = root.currentError();
    }

    function timeoutFetch(target, process) {
        if (!root.fetchActive[target])
            return;
        var processId = Number(process.processId);
        var hasProcess = isFinite(processId) && processId > 0;
        if (hasProcess) root.markFetchStarted(target);
        var timeouts = Object.assign({}, root.fetchTimeouts);
        timeouts[target] = "Timed out after 30 seconds";
        root.fetchTimeouts = timeouts;
        var awaiting = Object.assign({}, root.fetchAwaitingExit);
        awaiting[target] = hasProcess;
        root.fetchAwaitingExit = awaiting;
        if (hasProcess)
            process.signal(9);
        else
            process.running = false;
        root.finishFetch(target, -1, "", timeouts[target]);
    }

    function startFetch(target, process, force) {
        if (process.running || root.fetchActive[target] || root.fetchAwaitingExit[target])
            return;
        var active = Object.assign({}, root.fetchActive);
        active[target] = true;
        root.fetchActive = active;
        var timeouts = Object.assign({}, root.fetchTimeouts);
        timeouts[target] = "";
        root.fetchTimeouts = timeouts;
        var started = Object.assign({}, root.fetchStarted); started[target] = false; root.fetchStarted = started;
        var stderr = Object.assign({}, root.fetchStderr); stderr[target] = ""; root.fetchStderr = stderr;
        root.pendingFetches++;
        root.isLoading = true;
        if (target === "opencode-go") root.opencodeJsonBuffer = "";
        else if (target === "opencode-zen") root.opencodeZenJsonBuffer = "";
        else if (target === "codex") root.openaiJsonBuffer = "";
        else root.claudeJsonBuffer = "";
        process.command = ["opentracker", "fetch", target].concat(force ? ["--force"] : []);
        process.running = true;
        if (target === "opencode-go") watchdogGo.restart();
        else if (target === "opencode-zen") watchdogZen.restart();
        else if (target === "codex") watchdogCodex.restart();
        else watchdogClaude.restart();
    }

    function markFetchStarted(target) {
        var started = Object.assign({}, root.fetchStarted); started[target] = true; root.fetchStarted = started;
    }

    function appendFetchStderr(target, text) {
        var stderr = Object.assign({}, root.fetchStderr);
        stderr[target] = String(String(stderr[target] || "") + String(text || "")).slice(-4096);
        root.fetchStderr = stderr;
    }

    function refreshProvider(provider, force) {
        if (provider === "opencode-go") root.startFetch(provider, procOpencode, force === true);
        else if (provider === "opencode-zen") root.startFetch(provider, procOpencodeZen, force === true);
        else if (provider === "codex") root.startFetch(provider, procOpenai, force === true);
        else if (provider === "claude") root.startFetch(provider, procClaude, force === true);
        else return false;
        return true;
    }

    function localDayBounds(now) {
        var date = new Date(now);
        var from = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
        return { from: from, to: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() };
    }

    function parseLocalStats(raw, now) {
        if (!raw || raw.length > 32768) return null;
        var value;
        try { value = JSON.parse(raw); } catch (error) { return null; }
        if (!value || value.source !== "opencode-local" || value.period !== "today" || !Number.isSafeInteger(value.totalTokens) || value.totalTokens < 0 || !Number.isSafeInteger(value.sessions) || value.sessions < 0 || !value.range || !Number.isSafeInteger(value.range.from) || !Number.isSafeInteger(value.range.to)) return null;
        var bounds = root.localDayBounds(now);
        var dayStart = bounds.from;
        var tolerance = 60000;
        if (value.range.from < bounds.from || value.range.from >= bounds.to || value.range.to < value.range.from || value.range.to > now + tolerance || value.range.to >= bounds.to) return null;
        if (typeof value.updatedAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value.updatedAt) || !Number.isFinite(Date.parse(value.updatedAt)) || Date.parse(value.updatedAt) < dayStart || Date.parse(value.updatedAt) >= bounds.to || Date.parse(value.updatedAt) > now + tolerance) return null;
        return { source: value.source, period: value.period, totalTokens: value.totalTokens, sessions: value.sessions, updatedAt: value.updatedAt, range: { from: value.range.from, to: value.range.to } };
    }

    function ensureLocalStats() {
        if (!root.localStatsEnabled || !root.interactionActive || root.activeTab !== "opencode") return false;
        root.invalidateLocalStatsForDay();
        if (root.localStatsLoading || (root.localStatsUpdatedAt > 0 && Date.now() - root.localStatsUpdatedAt < 300000)) return false;
        return root.refreshLocalStats(false);
    }

    function invalidateLocalStatsForDay() {
        if (!root.localStats) return false;
        var bounds = root.localDayBounds(root.clockNow);
        if (root.localStats.range && root.localStats.range.from >= bounds.from && root.localStats.range.from < bounds.to) return false;
        root.localStats = null;
        root.localStatsUpdatedAt = 0;
        return true;
    }

    function refreshLocalStats(force) {
        if (!root.localStatsEnabled || !root.interactionActive || root.activeTab !== "opencode" || root.localStatsLoading || root.localStatsAwaitingExit) return false;
        root.localStatsLoading = true;
        root.localStatsError = "";
        root.localStatsBuffer = "";
        root.localStatsStderr = "";
        root.localStatsStarted = false;
        procLocalStats.command = ["opentracker", "stats", "opencode"].concat(force === true ? ["--force"] : []);
        procLocalStats.running = true;
        localStatsWatchdog.restart();
        return true;
    }

    function finishLocalStats(exitCode, timedOut) {
        if (!root.localStatsLoading) return;
        localStatsWatchdog.stop();
        root.localStatsLoading = false;
        var parsed = exitCode === 0 && !timedOut ? root.parseLocalStats(root.localStatsBuffer, Date.now()) : null;
        if (parsed) {
            root.localStats = parsed;
            root.localStatsUpdatedAt = Date.parse(parsed.updatedAt);
            root.localStatsError = "";
        } else {
            root.localStatsError = exitCode !== 0 && root.localStatsNeedsUpgrade(root.localStatsStderr, root.localStatsStarted) ? "Update opentracker and OpenCode to enable local statistics" : exitCode !== 0 && root.localStatsMissingBinary() ? "OpenCode CLI was not found — install it or add it to PATH" : timedOut ? "Local statistics request timed out" : "Local statistics are unavailable";
        }
        root.localStatsBuffer = "";
        root.localStatsStderr = "";
    }

    function localStatsMissingBinary() {
        return String(root.localStatsBuffer || "").indexOf("OpenCode CLI was not found") !== -1;
    }

    function localStatsNeedsUpgrade(stderr, started) {
        if (!started) return true;
        var text = String(stderr || "").slice(0, 4096).toLowerCase();
        return /unknown\s+command[^\n]*\bstats\b|(?:unsupported|unrecognized|unknown (?:option|flag))[^\n]*(?:--standalone|--json)|(?:--standalone|--json)[^\n]*(?:unsupported|unrecognized|unknown)/.test(text);
    }

    function timeoutLocalStats() {
        if (!root.localStatsLoading) return;
        var pid = Number(procLocalStats.processId);
        if (isFinite(pid) && pid > 0) root.localStatsStarted = true;
        root.localStatsAwaitingExit = isFinite(pid) && pid > 0;
        if (root.localStatsAwaitingExit) procLocalStats.signal(9);
        else procLocalStats.running = false;
        root.finishLocalStats(-1, true);
    }

    function formatTimeUntil(iso) {
        if (typeof iso !== "string" || !iso)
            return "";
        var parts = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/);
        var targetMs;
        if (parts) {
            var year = parseInt(parts[1], 10);
            var month = parseInt(parts[2], 10) - 1;
            var day = parseInt(parts[3], 10);
            var hour = parseInt(parts[4], 10);
            var minute = parseInt(parts[5], 10);
            var second = parseInt(parts[6], 10);
            targetMs = Date.UTC(year, month, day, hour, minute, second, 0);
        } else {
            var d = new Date(iso);
            if (isNaN(d.getTime()))
                return "";
            targetMs = d.getTime();
        }
        var diff = targetMs - root.clockNow;
        if (diff <= 0)
            return "now";
        var mins = Math.floor(diff / 60000);
        if (mins < 60)
            return mins + "m";
        var hrs = Math.floor(mins / 60);
        if (hrs < 24)
            return hrs + "h " + (mins % 60) + "m";
        var days = Math.floor(hrs / 24);
        return days + "d " + (hrs % 24) + "h";
    }

    // === Usage fetch ===
    Process {
        id: procOpencode
        command: ["opentracker", "fetch", "opencode-go"]
        stdout: SplitParser {
            splitMarker: ""
            onRead: data => {
                root.opencodeJsonBuffer += data;
            }
        }
        stderr: SplitParser { onRead: line => root.appendFetchStderr("opencode-go", line) }
        onStarted: root.markFetchStarted("opencode-go")
        onExited: exitCode => {
            var awaiting = Object.assign({}, root.fetchAwaitingExit);
            awaiting["opencode-go"] = false;
            root.fetchAwaitingExit = awaiting;
            root.finishFetch("opencode-go", exitCode, root.opencodeJsonBuffer);
            root.opencodeJsonBuffer = "";
            watchdogGo.stop();
        }
    }

    Process {
        id: procOpencodeZen
        command: ["opentracker", "fetch", "opencode-zen"]
        stdout: SplitParser {
            splitMarker: ""
            onRead: data => { root.opencodeZenJsonBuffer += data; }
        }
        stderr: SplitParser { onRead: line => root.appendFetchStderr("opencode-zen", line) }
        onStarted: root.markFetchStarted("opencode-zen")
        onExited: exitCode => {
            var awaiting = Object.assign({}, root.fetchAwaitingExit);
            awaiting["opencode-zen"] = false;
            root.fetchAwaitingExit = awaiting;
            root.finishFetch("opencode-zen", exitCode, root.opencodeZenJsonBuffer);
            root.opencodeZenJsonBuffer = "";
            watchdogZen.stop();
        }
    }

    Process {
        id: procOpenai
        command: ["opentracker", "fetch", "codex"]
        stdout: SplitParser {
            splitMarker: ""
            onRead: data => {
                root.openaiJsonBuffer += data;
            }
        }
        stderr: SplitParser { onRead: line => root.appendFetchStderr("codex", line) }
        onStarted: root.markFetchStarted("codex")
        onExited: exitCode => {
            var awaiting = Object.assign({}, root.fetchAwaitingExit);
            awaiting.codex = false;
            root.fetchAwaitingExit = awaiting;
            root.finishFetch("codex", exitCode, root.openaiJsonBuffer);
            root.openaiJsonBuffer = "";
            watchdogCodex.stop();
        }
    }

    Process {
        id: procClaude
        command: ["opentracker", "fetch", "claude"]
        stdout: SplitParser { splitMarker: ""; onRead: data => { root.claudeJsonBuffer += data; } }
        stderr: SplitParser { onRead: line => root.appendFetchStderr("claude", line) }
        onStarted: root.markFetchStarted("claude")
        onExited: exitCode => {
            var awaiting = Object.assign({}, root.fetchAwaitingExit);
            awaiting.claude = false;
            root.fetchAwaitingExit = awaiting;
            root.finishFetch("claude", exitCode, root.claudeJsonBuffer);
            root.claudeJsonBuffer = "";
            watchdogClaude.stop();
        }
    }

    Timer { id: watchdogGo; interval: root.fetchTimeoutMs; repeat: false; onTriggered: root.timeoutFetch("opencode-go", procOpencode) }
    Timer { id: watchdogZen; interval: root.fetchTimeoutMs; repeat: false; onTriggered: root.timeoutFetch("opencode-zen", procOpencodeZen) }
    Timer { id: watchdogCodex; interval: root.fetchTimeoutMs; repeat: false; onTriggered: root.timeoutFetch("codex", procOpenai) }
    Timer { id: watchdogClaude; interval: root.fetchTimeoutMs; repeat: false; onTriggered: root.timeoutFetch("claude", procClaude) }

    function refresh(force) {
        root.startFetch("opencode-go", procOpencode, force);
        root.startFetch("opencode-zen", procOpencodeZen, force);
        root.startFetch("codex", procOpenai, force);
        root.startFetch("claude", procClaude, force);
    }

    Timer {
        interval: root.refreshIntervalMs
        running: true
        repeat: true
        onTriggered: root.refresh(false)
    }

    Timer {
        interval: 30000
        running: true
        repeat: true
        onTriggered: root.clockNow = Date.now()
    }

    Process {
        id: procAlert
        stdout: SplitParser { onRead: data => { root.alertOutput += data; } }
        onExited: exitCode => root.finishAlert(exitCode, false)
    }
    Process {
        id: procLocalStats
        stdout: SplitParser { splitMarker: ""; onRead: data => { root.localStatsBuffer = (root.localStatsBuffer + data).slice(0, 32769); } }
        stderr: SplitParser { onRead: data => { root.localStatsStderr = (root.localStatsStderr + String(data || "")).slice(-4096); } }
        onStarted: root.localStatsStarted = true
        onExited: exitCode => {
            root.localStatsAwaitingExit = false;
            root.finishLocalStats(exitCode, false);
        }
    }
    Timer { id: localStatsWatchdog; interval: root.localStatsTimeoutMs; repeat: false; onTriggered: root.timeoutLocalStats() }
    Connections {
        target: root
        function onInteractionActiveChanged() { root.ensureLocalStats(); }
        function onActiveTabChanged() { root.ensureLocalStats(); }
        function onLocalStatsEnabledChanged() { root.ensureLocalStats(); }
    }
    Timer {
        id: alertWatchdog
        interval: root.alertTimeoutMs
        repeat: false
        onTriggered: {
            var pid = Number(procAlert.processId);
            if (isFinite(pid) && pid > 0) {
                root.alertTimedOut = true;
                procAlert.signal(9);
                alertWatchdog.interval = 3000;
                alertWatchdog.restart();
            } else {
                procAlert.running = false;
                root.finishAlert(-1, true);
            }
        }
    }

    Component.onCompleted: {
        root.refresh(false);
    }

    // === Bar pill (horizontal) ===
    horizontalBarPill: Component {
        Item {
            id: horizontalPillWrapper
            readonly property var containingPill: root.findContainingPill(horizontalPillWrapper)
            readonly property bool pillHovered: containingPill ? containingPill.isMouseHovered : false
            implicitWidth: horizontalPillContent.implicitWidth
            implicitHeight: horizontalPillContent.implicitHeight
            width: implicitWidth
            height: implicitHeight
            onPillHoveredChanged: pillHovered ? horizontalBarTooltipHost.schedule() : horizontalBarTooltipHost.dismiss()
            Component.onCompleted: {
                if (horizontalPillWrapper.pillHovered)
                    horizontalBarTooltipHost.schedule();
            }

            Row {
                id: horizontalPillContent
                spacing: Theme.spacingXS

                Repeater {
                    model: root.barProviders

                    Row {
                        id: barProviderDelegate
                        required property var modelData
                        required property int index
                        spacing: Theme.spacingS
                        anchors.verticalCenter: parent.verticalCenter

                        Rectangle {
                            visible: barProviderDelegate.index > 0
                            width: 1
                            height: Theme.iconSizeSmall
                            radius: Theme.spacingXXS
                            color: Theme.outline
                            opacity: 0.45
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        Image {
                            id: barProviderLogo
                            width: Theme.iconSizeSmall
                            height: Theme.iconSizeSmall
                            source: root.providerLogoPath(barProviderDelegate.modelData.provider)
                            sourceSize.width: Theme.iconSizeSmall
                            sourceSize.height: Theme.iconSizeSmall
                            fillMode: Image.PreserveAspectFit
                            layer.enabled: true
                            layer.effect: MultiEffect {
                                colorization: 1
                                colorizationColor: Theme.surfaceText
                            }
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        StyledText {
                            text: barProviderDelegate.modelData.provider === "codex" ? (barProviderDelegate.modelData.accountLabel ? root.sourceName(barProviderDelegate.modelData).replace(/^Codex · /, "") : "Codex") : barProviderDelegate.modelData.origin === "cliproxyapi" ? root.sourceName(barProviderDelegate.modelData) : barProviderDelegate.modelData.provider === "opencode-zen" ? "Zen" : barProviderDelegate.modelData.provider === "opencode-go" ? "Go" : root.formatProviderName(barProviderDelegate.modelData.provider)
                            font.pixelSize: Theme.fontSizeSmall
                            font.weight: Font.Medium
                            color: Theme.surfaceText
                            anchors.verticalCenter: parent.verticalCenter
                        }

                        StyledText {
                            text: {
                                var window = root.sourceUsageWindow(barProviderDelegate.modelData);
                                return window ? Math.round(root.displayPercent(window)) + "%" : root.barProviderText(barProviderDelegate.modelData);
                            }
                            font.pixelSize: Theme.fontSizeSmall
                            font.weight: Font.Medium
                            color: root.sourceUsageWindow(barProviderDelegate.modelData) ? root.getUsageColor(root.sourceUsageWindow(barProviderDelegate.modelData).usedPercent) : Theme.surfaceText
                            anchors.verticalCenter: parent.verticalCenter
                        }
                    }
                }

                StyledText {
                    visible: root.barSources.length > 0 && root.barProviders.length === 0
                    text: {
                        if (root.isLoading && root.providers.length === 0)
                            return "...";
                        if (root.hasError && root.providers.length === 0)
                            return "ERR";
                        return "";
                    }
                    font.pixelSize: Theme.fontSizeSmall
                    font.weight: Font.Medium
                    color: Theme.surfaceText
                    anchors.verticalCenter: parent.verticalCenter
                }

                DankIcon {
                    visible: root.barSources.length === 0 || root.barProviders.length === 0 && !root.isLoading && !(root.hasError && root.providers.length === 0)
                    name: "monitoring"
                    size: Theme.iconSizeSmall
                    color: Theme.surfaceVariantText
                    anchors.verticalCenter: parent.verticalCenter
                }
            }

            DCommonWidgets.DTooltipHost {
                id: horizontalBarTooltipHost
                anchors.fill: parent
                target: horizontalPillWrapper
                text: root.barSources.length === 0 ? "Pin a provider card to show it in the bar" : root.barTooltipText()
                multiline: true
                enabled: !root.interactionActive
                onEnabledChanged: {
                    if (!enabled)
                        dismiss();
                    else if (horizontalPillWrapper.pillHovered)
                        schedule();
                }
                z: 2
            }
        }
    }

    // === Bar pill (vertical) ===
    verticalBarPill: Component {
        Item {
            id: verticalPillWrapper
            readonly property var containingPill: root.findContainingPill(verticalPillWrapper)
            readonly property bool pillHovered: containingPill ? containingPill.isMouseHovered : false
            implicitWidth: verticalPillContent.implicitWidth
            implicitHeight: verticalPillContent.implicitHeight
            width: implicitWidth
            height: implicitHeight
            onPillHoveredChanged: pillHovered ? verticalBarTooltipHost.schedule() : verticalBarTooltipHost.dismiss()
            Component.onCompleted: {
                if (verticalPillWrapper.pillHovered)
                    verticalBarTooltipHost.schedule();
            }

            Column {
                id: verticalPillContent
                spacing: Theme.spacingXS

                StyledText {
                        visible: root.barSources.length > 0
                    text: {
                        var provider = root.barHighestProvider;
                        if (!provider)
                            provider = root.barProviders.find(function (p) { return p && p.provider === "opencode-zen" && p.usage; }) || null;
                        if (!provider)
                            return "--";
                        var window = root.sourceUsageWindow(provider);
                        return window ? Math.round(root.displayPercent(window)) + "%" : root.barProviderText(provider);
                    }
                    font.pixelSize: Theme.fontSizeSmall
                    font.weight: Font.Medium
                    color: root.barHighestProvider && root.sourceUsageWindow(root.barHighestProvider) ? root.getUsageColor(root.sourceUsageWindow(root.barHighestProvider).usedPercent) : Theme.surfaceText
                    anchors.horizontalCenter: parent.horizontalCenter
                }

                DankIcon {
                    visible: root.barSources.length === 0
                    name: "monitoring"
                    size: Theme.iconSizeSmall
                    color: Theme.surfaceVariantText
                    anchors.horizontalCenter: parent.horizontalCenter
                }
            }

            DCommonWidgets.DTooltipHost {
                id: verticalBarTooltipHost
                anchors.fill: parent
                target: verticalPillWrapper
                text: root.barSources.length === 0 ? "Pin a provider card to show it in the bar" : root.barTooltipText()
                multiline: true
                side: root.axis?.edge === "left" ? "right" : "left"
                enabled: !root.interactionActive
                onEnabledChanged: {
                    if (!enabled)
                        dismiss();
                    else if (verticalPillWrapper.pillHovered)
                        schedule();
                }
                z: 2
            }
        }
    }

    // === Popout ===
    popoutWidth: 420
    popoutHeight: 0

    popoutContent: Component {
        PopoutComponent {
            id: popup
            headerText: ""
            detailsText: ""
            showCloseButton: true

            Item {
                id: contentWrapper
                width: parent.width
                implicitHeight: mainCol.implicitHeight
                property bool preferencesExpanded: false
                property string zenThresholdDraft: "1.00"
                property bool zenThresholdInvalid: false
                property string copiedProvider: ""

                function windowOptions(provider, usage) {
                    return root.availableBarWindows(provider, usage);
                }

                function compactTokens(value) {
                    var n = Number(value);
                    if (!isFinite(n) || n < 0)
                        return "";
                    if (n >= 1000000)
                        return (n / 1000000).toFixed(n >= 10000000 ? 0 : 1).replace(/\.0$/, "") + "M";
                    if (n >= 1000)
                        return (n / 1000).toFixed(n >= 100000 ? 0 : 1).replace(/\.0$/, "") + "K";
                    return String(Math.round(n));
                }

                function copyRecovery(provider) {
                    var command = root.sourceRecoveryCommand(provider);
                    if (!command || typeof DMSService === "undefined")
                        return;
                    DMSService.sendRequest("clipboard.copy", { "text": command }, function (response) {
                        if (!response || response.error || response.result === false || response.success === false
                            || (response.result && typeof response.result === "object" && response.result.success === false))
                            return;
                        contentWrapper.copiedProvider = provider;
                        copiedStatusTimer.restart();
                    });
                }

                function commitZenThreshold() {
                    var draft = zenThresholdDraft.trim();
                    if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/.test(draft)) {
                        zenThresholdInvalid = true;
                        return;
                    }
                    var value = Number(draft);
                    if (!isFinite(value) || value < 0) {
                        zenThresholdInvalid = true;
                        return;
                    }
                    if (value !== Number(root.zenBalanceThreshold) && root.setZenBalanceThreshold(value) !== true) {
                        zenThresholdInvalid = true;
                        return;
                    }
                    zenThresholdInvalid = false;
                    zenThresholdDraft = value.toFixed(2);
                }
                Component.onCompleted: zenThresholdDraft = Number(root.zenBalanceThreshold).toFixed(2)

                Timer {
                    id: copiedStatusTimer
                    interval: 1800
                    repeat: false
                    onTriggered: contentWrapper.copiedProvider = ""
                }

                Column {
                    id: mainCol
                    width: parent.width
                    spacing: Theme.spacingS

                    Row {
                        width: parent.width
                        spacing: Theme.spacingXS

                        StyledRect {
                            width: parent.width - refreshButton.width - preferencesButton.width - parent.spacing * 2
                            height: Theme.buttonHeightXS
                            radius: Theme.cornerRadius
                            color: Theme.surfaceContainerHigh

                            StyledText {
                                anchors.left: parent.left
                                anchors.leftMargin: Theme.spacingS
                                anchors.verticalCenter: parent.verticalCenter
                                text: "OpenTracker"
                                font.pixelSize: Theme.fontSizeMedium
                                font.weight: Font.Medium
                                color: Theme.surfaceText
                            }
                        }

                        DankActionButton {
                            id: refreshButton
                            iconName: root.isLoading ? "progress_activity" : "refresh"
                            iconSize: Theme.iconSizeSmall
                            buttonSize: Theme.buttonHeightXS
                            iconColor: Theme.surfaceText
                            backgroundColor: Theme.surfaceContainerHigh
                            tooltipText: root.isLoading ? "Refreshing…" : "Refresh usage"
                            enabled: !root.isLoading
                            RotationAnimation on rotation {
                                from: 0
                                to: 360
                                duration: 900
                                loops: Animation.Infinite
                                running: root.isLoading
                                onRunningChanged: if (!running) refreshButton.rotation = 0
                            }
                            onClicked: root.refresh(true)
                        }

                        DankActionButton {
                            id: preferencesButton
                            iconName: "tune"
                            iconSize: Theme.iconSizeSmall
                            buttonSize: Theme.buttonHeightXS
                            iconColor: contentWrapper.preferencesExpanded ? Theme.primary : Theme.surfaceText
                            backgroundColor: Theme.surfaceContainerHigh
                            tooltipText: contentWrapper.preferencesExpanded ? "Hide preferences" : "Show preferences"
                            Accessible.name: tooltipText
                            onClicked: contentWrapper.preferencesExpanded = !contentWrapper.preferencesExpanded
                        }
                    }

                    StyledRect {
                        width: parent.width
                        visible: contentWrapper.preferencesExpanded
                        implicitHeight: visible ? preferencesColumn.implicitHeight + Theme.spacingM * 2 : 0
                        height: implicitHeight
                        radius: Theme.cornerRadius
                        color: Theme.surfaceContainerHigh

                        Column {
                            id: preferencesColumn
                            anchors.left: parent.left
                            anchors.right: parent.right
                            anchors.top: parent.top
                            anchors.margins: Theme.spacingM
                            spacing: Theme.spacingS

                            StyledText {
                                text: "Preferences"
                                font.pixelSize: Theme.fontSizeMedium
                                font.weight: Font.Medium
                                color: Theme.surfaceText
                            }

                            Column {
                                width: parent.width
                                spacing: Theme.spacingXS
                                StyledText {
                                    text: "Usage display"
                                    font.pixelSize: Theme.fontSizeSmall
                                    font.weight: Font.Medium
                                    color: Theme.surfaceText
                                }
                                DCommonWidgets.DFilterChips {
                                    width: parent.width
                                    model: ["Used", "Remaining"]
                                    currentIndex: root.usageDisplayMode === "remaining" ? 1 : 0
                                    showCheck: false
                                    showCounts: false
                                    chipHeight: Theme.buttonHeightXS
                                    chipPadding: Theme.spacingM
                                    onSelectionChanged: index => root.setUsageDisplayMode(index === 1 ? "remaining" : "used")
                                }
                            }

                            DCommonWidgets.DToggle {
                                width: parent.width
                                checked: root.notificationsEnabled
                                text: "Notifications"
                                description: "Alerts at 80% and 95% usage"
                                descriptionColor: Theme.surfaceVariantText
                                Accessible.name: "Usage notifications"
                                onToggled: value => root.setNotificationsEnabled(value)
                            }

                            DCommonWidgets.DToggle {
                                width: parent.width
                                checked: root.localStatsEnabled
                                text: "Local OpenCode stats"
                                description: "Show today's token and session totals"
                                descriptionColor: Theme.surfaceVariantText
                                Accessible.name: "Local OpenCode stats"
                                onToggled: value => {
                                    root.setLocalStatsEnabled(value);
                                    if (value && root.activeTab === "opencode")
                                        root.ensureLocalStats();
                                }
                            }

                            Column {
                                width: parent.width
                                spacing: Theme.spacingXS
                                StyledText {
                                    text: "Zen low-balance alert ($)"
                                    font.pixelSize: Theme.fontSizeSmall
                                    font.weight: Font.Medium
                                    color: Theme.surfaceText
                                }
                                DCommonWidgets.DTextField {
                                    id: zenThresholdField
                                    width: parent.width
                                    controlHeight: Theme.buttonHeightXS
                                    text: contentWrapper.zenThresholdDraft
                                    labelText: "USD"
                                    placeholderText: "1.00"
                                    isError: contentWrapper.zenThresholdInvalid
                                    supportingText: contentWrapper.zenThresholdInvalid ? "Enter a nonnegative amount with up to 2 decimals." : ""
                                    validator: DoubleValidator { bottom: 0; decimals: 2; notation: DoubleValidator.StandardNotation; locale: "C" }
                                    onTextEdited: {
                                        contentWrapper.zenThresholdDraft = zenThresholdField.text;
                                        contentWrapper.zenThresholdInvalid = false;
                                    }
                                    onEditingFinished: contentWrapper.commitZenThreshold()
                                    onFocusStateChanged: hasFocus => {
                                        if (!hasFocus)
                                            contentWrapper.commitZenThreshold();
                                    }
                                    Accessible.name: "Zen low-balance threshold in dollars"
                                }
                            }
                        }
                    }

                    Row {
                        id: providerTabs
                        width: parent.width
                        spacing: Theme.spacingXS

                        Repeater {
                            model: [
                                { "id": "opencode", "text": "Opencode", "logo": "opencode-go" },
                                { "id": "openai", "text": "Codex", "logo": "codex" },
                                { "id": "claude", "text": "Claude", "logo": "claude" }
                            ]

                            StyledButton {
                                id: tabDelegate
                                required property var modelData
                                property bool isActive: root.activeTab === tabDelegate.modelData.id
                                height: Theme.buttonHeightXS
                                width: tabLabel.implicitWidth + Theme.iconSizeSmall + Theme.spacingXS * 3
                                color: isActive ? Theme.surfaceContainerHigh : "transparent"
                                radius: Theme.cornerRadius
                                Accessible.role: Accessible.PageTab
                                Accessible.name: tabDelegate.modelData.text
                                Accessible.selected: isActive
                                onClicked: {
                                    root.activeTab = tabDelegate.modelData.id;
                                    root.errorMessage = root.currentError();
                                    if (root.activeTab === "opencode" && root.localStatsEnabled)
                                        root.ensureLocalStats();
                                }

                                StateLayer {
                                    control: parent
                                    stateColor: Theme.surfaceText
                                    transitionDuration: 150
                                }

                                Row {
                                    anchors.centerIn: parent
                                    spacing: Theme.spacingXS

                                    Image {
                                        width: Theme.iconSizeSmall
                                        height: Theme.iconSizeSmall
                                        source: root.providerLogoPath(tabDelegate.modelData.logo)
                                        sourceSize.width: Theme.iconSizeSmall
                                        sourceSize.height: Theme.iconSizeSmall
                                        fillMode: Image.PreserveAspectFit
                                        anchors.verticalCenter: parent.verticalCenter
                                        layer.enabled: true
                                        layer.effect: MultiEffect {
                                            colorization: 1
                                            colorizationColor: Theme.surfaceText
                                        }
                                    }

                                    StyledText {
                                        id: tabLabel
                                        text: tabDelegate.modelData.text
                                        font.pixelSize: Theme.fontSizeSmall
                                        font.weight: Font.Medium
                                        color: Theme.surfaceText
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }
                            }
                        }
                    }

                    StyledRect {
                        id: partialAccountsBanner
                        width: parent.width
                        readonly property string family: root.activeTab === "openai" ? "codex" : "claude"
                        readonly property bool partialFailure: root.providerErrors[family] === "partial"
                        readonly property bool fullFailure: root.providerError(family) !== "" && !partialFailure
                        visible: root.activeTab !== "opencode" && root.currentProviders().length > 0 && (partialFailure || fullFailure)
                        height: Math.max(partialMessage.implicitHeight, partialActions.implicitHeight) + Theme.spacingS * 2
                        radius: Theme.cornerRadius
                        color: Qt.rgba(Theme.warning.r, Theme.warning.g, Theme.warning.b, 0.12)
                        StyledText {
                            id: partialMessage
                            anchors.left: parent.left
                            anchors.right: partialActions.left
                            anchors.rightMargin: Theme.spacingXS
                            anchors.verticalCenter: parent.verticalCenter
                            anchors.margins: Theme.spacingS
                            text: partialAccountsBanner.partialFailure ? "Some accounts could not be refreshed"
                                : root.providerError(partialAccountsBanner.family) + (root.providerHint(partialAccountsBanner.family) !== "" ? "\n" + root.providerHint(partialAccountsBanner.family) : "")
                            font.pixelSize: Theme.fontSizeSmall
                            color: Theme.warning
                            wrapMode: Text.WordWrap
                        }
                        Row {
                            id: partialActions
                            anchors.right: parent.right
                            anchors.rightMargin: Theme.spacingXS
                            anchors.verticalCenter: parent.verticalCenter
                            spacing: Theme.spacingXXS
                            DankActionButton {
                                iconName: "refresh"
                                iconSize: Theme.iconSizeSmall
                                buttonSize: Theme.buttonHeightXS
                                iconColor: Theme.surfaceText
                                backgroundColor: "transparent"
                                tooltipText: "Refresh " + (root.activeTab === "openai" ? "Codex accounts" : "Claude accounts")
                                enabled: !root.fetchActive[partialAccountsBanner.family]
                                onClicked: root.refreshProvider(partialAccountsBanner.family, true)
                            }
                            DCommonWidgets.DButton {
                                text: contentWrapper.copiedProvider === "family-" + root.activeTab ? "Copied" : "Copy command"
                                iconName: contentWrapper.copiedProvider === "family-" + root.activeTab ? "check" : "content_copy"
                                onClicked: {
                                    var command = root.providerRecoveryCommand(partialAccountsBanner.family);
                                    if (command && typeof DMSService !== "undefined")
                                        DMSService.sendRequest("clipboard.copy", { "text": command }, function (response) {
                                            if (response && !response.error && response.result !== false && response.success !== false) {
                                                contentWrapper.copiedProvider = "family-" + root.activeTab;
                                                copiedStatusTimer.restart();
                                            }
                                        });
                                }
                            }
                        }
                    }

                    // Error banner
                    Column {
                        id: emptyProviderErrors
                        width: parent.width
                        spacing: Theme.spacingXS
                        visible: root.currentError() !== ""

                        Repeater {
                            model: ["opencode-go", "opencode-zen", "codex", "claude"]
                            Column {
                                id: emptyErrorDelegate
                                required property string modelData
                                width: emptyProviderErrors.width
                                spacing: Theme.spacingXS
                                visible: root.providerTab(emptyErrorDelegate.modelData) === root.activeTab
                                    && root.providerError(emptyErrorDelegate.modelData) !== ""
                                    && !root.currentProviders().some(function (p) { return p && p.provider === emptyErrorDelegate.modelData; })
                                StyledText {
                                    width: parent.width
                                    text: root.formatProviderName(emptyErrorDelegate.modelData) + ": " + root.providerError(emptyErrorDelegate.modelData)
                                    font.pixelSize: Theme.fontSizeSmall
                                    color: Theme.error
                                    wrapMode: Text.WordWrap
                                }
                                StyledText {
                                    width: parent.width
                                    visible: root.providerHint(emptyErrorDelegate.modelData) !== "" && root.providerHint(emptyErrorDelegate.modelData) !== root.providerError(emptyErrorDelegate.modelData)
                                    text: root.providerHint(emptyErrorDelegate.modelData)
                                    font.pixelSize: Theme.fontSizeSmall
                                    color: Theme.surfaceVariantText
                                    wrapMode: Text.WordWrap
                                }
                                Row {
                                    spacing: Theme.spacingXS
                                    DankActionButton {
                                        iconName: root.fetchActive[emptyErrorDelegate.modelData] ? "progress_activity" : "refresh"
                                        iconSize: Theme.iconSizeSmall
                                        buttonSize: Theme.buttonHeightXS
                                        iconColor: Theme.surfaceText
                                        backgroundColor: "transparent"
                                        tooltipText: "Retry " + root.formatProviderName(emptyErrorDelegate.modelData)
                                        enabled: !root.fetchActive[emptyErrorDelegate.modelData]
                                        onClicked: root.refreshProvider(emptyErrorDelegate.modelData, true)
                                    }
                                    DCommonWidgets.DButton {
                                        text: contentWrapper.copiedProvider === emptyErrorDelegate.modelData ? "Copied" : "Copy command"
                                        iconName: contentWrapper.copiedProvider === emptyErrorDelegate.modelData ? "check" : "content_copy"
                                        visible: root.providerRecoveryCommand(emptyErrorDelegate.modelData) !== ""
                                        onClicked: contentWrapper.copyRecovery(emptyErrorDelegate.modelData)
                                    }
                                }
                            }
                        }
                    }

                    // Optional local summary, fetched only while the OpenCode view is opened.
                    Column {
                        width: parent.width
                        spacing: Theme.spacingXXS
                        visible: root.activeTab === "opencode" && root.localStatsEnabled
                            && (!!root.localStats || root.localStatsLoading || root.localStatsError !== "")
                        Component.onCompleted: {
                            if (root.activeTab === "opencode" && root.localStatsEnabled)
                                root.ensureLocalStats();
                        }
                        Row {
                            width: parent.width
                            spacing: Theme.spacingXS
                            StyledText {
                                id: localStatsSummary
                                width: parent.width - localStatsRefresh.width - parent.spacing
                                text: {
                                    var stats = root.localStats;
                                    if (!stats)
                                        return "";
                                    var parts = ["Today"];
                                    var tokens = contentWrapper.compactTokens(stats.totalTokens);
                                    if (tokens !== "")
                                        parts.push(tokens + " tokens");
                                    var sessions = Number(stats.sessions);
                                    if (isFinite(sessions) && sessions >= 0)
                                        parts.push(String(Math.round(sessions)) + (Math.round(sessions) === 1 ? " session" : " sessions"));
                                    return parts.length > 1 ? parts.join(" · ") : "";
                                }
                                visible: text !== ""
                                font.pixelSize: Theme.fontSizeSmall
                                color: Theme.surfaceVariantText
                                anchors.verticalCenter: parent.verticalCenter
                            }
                            DankActionButton {
                                id: localStatsRefresh
                                iconName: root.localStatsLoading ? "progress_activity" : "refresh"
                                iconSize: Theme.iconSizeSmall
                                buttonSize: Theme.buttonHeightXS
                                iconColor: Theme.surfaceText
                                backgroundColor: "transparent"
                                tooltipText: root.localStatsLoading ? "Updating local stats" : "Refresh local stats"
                                enabled: !root.localStatsLoading
                                onClicked: root.refreshLocalStats(true)
                            }
                        }
                        Row {
                            width: parent.width
                            spacing: Theme.spacingXS
                            visible: root.localStatsLoading || root.localStatsError !== ""
                            StyledText {
                                width: parent.width
                                visible: root.localStatsLoading || root.localStatsError !== ""
                                text: root.localStatsLoading ? "Updating local stats…" : root.localStatsError
                                font.pixelSize: Theme.fontSizeSmall
                                color: root.localStatsLoading ? Theme.surfaceVariantText : Theme.warning
                                wrapMode: Text.WordWrap
                                anchors.verticalCenter: parent.verticalCenter
                            }
                        }
                    }

                    StyledRect {
                        width: parent.width
                        height: errCol.implicitHeight + Theme.spacingM * 2
                        radius: Theme.cornerRadius
                        color: Qt.rgba(Theme.error.r, Theme.error.g, Theme.error.b, 0.15)
                        visible: root.currentError() !== "" && root.currentProviders().length === 0
                            && !(root.activeTab === "opencode" && (root.providerError("opencode-go") !== "" || root.providerError("opencode-zen") !== ""))
                            && !(root.activeTab === "openai" && root.providerError("codex") !== "")
                            && !(root.activeTab === "claude" && root.providerError("claude") !== "")

                        Column {
                            id: errCol
                            anchors.fill: parent
                            anchors.margins: Theme.spacingM
                            spacing: Theme.spacingXS

                            Row {
                                spacing: Theme.spacingS
                                DankIcon {
                                    name: "error"
                                    size: Theme.iconSizeMedium
                                    color: Theme.error
                                    anchors.verticalCenter: parent.verticalCenter
                                }
                                StyledText {
                                    text: root.currentError()
                                    font.pixelSize: Theme.fontSizeMedium
                                    color: Theme.error
                                    anchors.verticalCenter: parent.verticalCenter
                                }
                            }
                        }
                    }

                    // Loading
                    StyledText {
                        visible: root.isLoading && root.currentProviders().length === 0
                        text: "Fetching usage data..."
                        font.pixelSize: Theme.fontSizeMedium
                        color: Theme.surfaceVariantText
                        width: parent.width
                        horizontalAlignment: Text.AlignHCenter
                    }

                    // Provider cards
                    Repeater {
                        model: root.currentProviders()

                        StyledRect {
                            id: providerCardDelegate
                            required property var modelData
                            required property int index

                            width: mainCol.width
                            height: providerCol.implicitHeight + Theme.spacingM * 2
                            radius: Theme.cornerRadius
                            color: Theme.surfaceContainerHigh

                            Column {
                                id: providerCol
                                anchors.left: parent.left
                                anchors.right: parent.right
                                anchors.top: parent.top
                                anchors.margins: Theme.spacingM
                                spacing: Theme.spacingS

                                // Provider name + login
                                Row {
                                    width: parent.width
                                    spacing: Theme.spacingS

                                    Image {
                                        width: Theme.iconSizeMedium
                                        height: Theme.iconSizeMedium
                                        source: root.providerLogoPath(providerCardDelegate.modelData.provider)
                                        sourceSize.width: Theme.iconSizeMedium
                                        sourceSize.height: Theme.iconSizeMedium
                                        fillMode: Image.PreserveAspectFit
                                        anchors.verticalCenter: parent.verticalCenter
                                        layer.enabled: true
                                        layer.effect: MultiEffect {
                                            colorization: 1
                                            colorizationColor: Theme.surfaceText
                                        }
                                    }

                                    Item {
                                        width: Math.max(0, parent.width - Theme.iconSizeMedium - Theme.spacingS * 3 - pinButton.width - providerRefreshButton.width)
                                        height: Math.max(providerName.implicitHeight, providerPlan.implicitHeight)
                                        anchors.verticalCenter: parent.verticalCenter

                                        StyledText {
                                            id: providerName
                                            anchors.left: parent.left
                                            anchors.right: providerPlan.visible ? providerPlan.left : parent.right
                                            anchors.rightMargin: providerPlan.visible ? Theme.spacingXS : 0
                                            text: root.sourceName(providerCardDelegate.modelData)
                                            font.pixelSize: Theme.fontSizeLarge
                                            font.weight: Font.Bold
                                            color: Theme.surfaceText
                                            elide: Text.ElideRight
                                            anchors.verticalCenter: parent.verticalCenter
                                        }

                                        StyledText {
                                            id: providerPlan
                                            visible: !!providerCardDelegate.modelData.usage && !!providerCardDelegate.modelData.usage.plan
                                            width: visible ? Math.min(implicitWidth, parent.width * 0.38) : 0
                                            anchors.right: parent.right
                                            anchors.verticalCenter: parent.verticalCenter
                                            text: providerCardDelegate.modelData.usage && providerCardDelegate.modelData.usage.plan ? providerCardDelegate.modelData.usage.plan : ""
                                            font.pixelSize: Theme.fontSizeSmall
                                            color: Theme.surfaceVariantText
                                            elide: Text.ElideRight
                                        }
                                    }

                                    DankActionButton {
                                        id: pinButton
                                        iconName: "push_pin"
                                        iconSize: Theme.iconSizeSmall
                                        buttonSize: Theme.buttonHeightXS
                                        checkable: true
                                        checked: root.isBarSourceSelected(root.sourceIdOf(providerCardDelegate.modelData))
                                        iconColor: checked ? Theme.primary : Theme.surfaceText
                                        backgroundColor: checked ? Theme.surfaceContainerHighest : "transparent"
                                        tooltipText: checked ? "Hide " + root.sourceName(providerCardDelegate.modelData) + " from bar" : "Show " + root.sourceName(providerCardDelegate.modelData) + " in bar"
                                        Accessible.name: tooltipText
                                        Accessible.checkable: true
                                        Accessible.checked: checked
                                        onClicked: root.toggleBarSource(root.sourceIdOf(providerCardDelegate.modelData))
                                    }

                                    DankActionButton {
                                        id: providerRefreshButton
                                        iconName: root.sourceFetching(root.sourceIdOf(providerCardDelegate.modelData)) ? "progress_activity" : "refresh"
                                        iconSize: Theme.iconSizeSmall
                                        buttonSize: Theme.buttonHeightXS
                                        iconColor: Theme.surfaceText
                                        backgroundColor: "transparent"
                                        tooltipText: root.sourceFetching(root.sourceIdOf(providerCardDelegate.modelData)) ? "Refreshing " + (providerCardDelegate.modelData.provider === "codex" ? "Codex accounts" : "Claude accounts") : (providerCardDelegate.modelData.origin === "cliproxyapi" ? "Refresh " + (providerCardDelegate.modelData.provider === "codex" ? "Codex accounts" : "Claude accounts") : "Refresh " + root.sourceName(providerCardDelegate.modelData))
                                        enabled: !root.sourceFetching(root.sourceIdOf(providerCardDelegate.modelData))
                                        RotationAnimation on rotation {
                                            from: 0
                                            to: 360
                                            duration: 900
                                            loops: Animation.Infinite
                                            running: root.sourceFetching(root.sourceIdOf(providerCardDelegate.modelData))
                                            onRunningChanged: if (!running) providerRefreshButton.rotation = 0
                                        }
                                        onClicked: root.refreshProvider(providerCardDelegate.modelData.provider, true)
                                    }
                                }

                                Row {
                                    width: parent.width
                                    spacing: Theme.spacingXS
                                    visible: root.isBarSourceSelected(root.sourceIdOf(providerCardDelegate.modelData))
                                        && providerCardDelegate.modelData.provider !== "opencode-zen"
                                        && contentWrapper.windowOptions(providerCardDelegate.modelData.provider, providerCardDelegate.modelData.usage).length >= 2
                                    StyledText {
                                        id: inBarLabel
                                        text: "In bar"
                                        font.pixelSize: Theme.fontSizeSmall
                                        color: Theme.surfaceVariantText
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                    DCommonWidgets.DFilterChips {
                                        id: barWindowChips
                                        property var options: root.availableSourceWindows(providerCardDelegate.modelData)
                                        width: parent.width - inBarLabel.implicitWidth - parent.spacing
                                        model: options.map(function (option) { return option.label; })
                                        currentIndex: {
                                            var key = root.selectedSourceWindowKey(providerCardDelegate.modelData);
                                            var index = options.findIndex(function (option) { return option.key === key; });
                                            return index >= 0 ? index : 0;
                                        }
                                        showCheck: false
                                        showCounts: false
                                        chipHeight: Theme.buttonHeightXS
                                        chipPadding: Theme.spacingS
                                        onSelectionChanged: index => {
                                            var options = root.availableSourceWindows(providerCardDelegate.modelData);
                                            if (index >= 0 && index < options.length)
                                                root.setSourceWindow(providerCardDelegate.modelData, options[index].key);
                                        }
                                    }
                                }

                                Row {
                                    spacing: Theme.spacingXS
                                    visible: root.sourceUpdatedLabel(root.sourceIdOf(providerCardDelegate.modelData)) !== "" || root.sourceIsStale(root.sourceIdOf(providerCardDelegate.modelData))

                                    StyledText {
                                        text: root.sourceIsStale(root.sourceIdOf(providerCardDelegate.modelData)) ? "Stale · " + root.sourceUpdatedLabel(root.sourceIdOf(providerCardDelegate.modelData)) : "Updated " + root.sourceUpdatedLabel(root.sourceIdOf(providerCardDelegate.modelData))
                                        font.pixelSize: Theme.fontSizeSmall
                                        color: root.sourceIsStale(root.sourceIdOf(providerCardDelegate.modelData)) ? Theme.warning : Theme.surfaceVariantText
                                    }
                                }

                                StyledText {
                                    visible: !!providerCardDelegate.modelData.usage && providerCardDelegate.modelData.usage.creditsRemaining !== undefined
                                    text: "Credits remaining: " + (providerCardDelegate.modelData.usage ? providerCardDelegate.modelData.usage.creditsRemaining : "")
                                    font.pixelSize: Theme.fontSizeSmall
                                    color: Theme.surfaceVariantText
                                }

                                // Error state for this provider
                                Row {
                                    width: parent.width
                                    visible: providerCardDelegate.modelData.origin !== "cliproxyapi" && (root.sourceError(root.sourceIdOf(providerCardDelegate.modelData)) !== "" || !!providerCardDelegate.modelData.error)
                                    spacing: Theme.spacingXS

                                    DankIcon {
                                        name: "warning"
                                        size: Theme.iconSizeSmall
                                        color: Theme.error
                                        anchors.verticalCenter: parent.verticalCenter
                                    }

                                    StyledText {
                                        width: Math.max(0, parent.width - Theme.iconSizeSmall - Theme.spacingXS)
                                        text: root.sourceError(root.sourceIdOf(providerCardDelegate.modelData)) || (providerCardDelegate.modelData.error ? "Account data is unavailable" : "")
                                        font.pixelSize: Theme.fontSizeSmall
                                        color: Theme.error
                                        anchors.verticalCenter: parent.verticalCenter
                                        wrapMode: Text.WordWrap
                                    }
                                }

                                Row {
                                    width: parent.width
                                    spacing: Theme.spacingXS
                                    visible: providerCardDelegate.modelData.origin !== "cliproxyapi" && root.sourceError(root.sourceIdOf(providerCardDelegate.modelData)) !== ""
                                        && (root.sourceHint(root.sourceIdOf(providerCardDelegate.modelData)) !== "" || root.sourceRecoveryCommand(root.sourceIdOf(providerCardDelegate.modelData)) !== "")
                                    StyledText {
                                        width: Math.max(0, parent.width - recoveryActions.width - Theme.spacingXS)
                                        visible: root.sourceHint(root.sourceIdOf(providerCardDelegate.modelData)) !== ""
                                        text: root.sourceHint(root.sourceIdOf(providerCardDelegate.modelData))
                                        font.pixelSize: Theme.fontSizeSmall
                                        color: Theme.surfaceVariantText
                                        wrapMode: Text.WordWrap
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                    Row {
                                        id: recoveryActions
                                        spacing: Theme.spacingXXS
                                        DankActionButton {
                                            iconName: root.sourceFetching(root.sourceIdOf(providerCardDelegate.modelData)) ? "progress_activity" : "refresh"
                                            iconSize: Theme.iconSizeSmall
                                            buttonSize: Theme.buttonHeightXS
                                            iconColor: Theme.surfaceText
                                            backgroundColor: "transparent"
                                            tooltipText: "Retry " + (providerCardDelegate.modelData.provider === "codex" ? "Codex accounts" : "Claude accounts")
                                            enabled: !root.sourceFetching(root.sourceIdOf(providerCardDelegate.modelData))
                                            onClicked: root.refreshProvider(providerCardDelegate.modelData.provider, true)
                                        }
                                        DCommonWidgets.DButton {
                                            text: contentWrapper.copiedProvider === providerCardDelegate.modelData.provider ? "Copied" : "Copy command"
                                            iconName: contentWrapper.copiedProvider === providerCardDelegate.modelData.provider ? "check" : "content_copy"
                                            visible: root.sourceRecoveryCommand(root.sourceIdOf(providerCardDelegate.modelData)) !== ""
                                            onClicked: contentWrapper.copyRecovery(providerCardDelegate.modelData.provider)
                                        }
                                    }
                                }

                                Row {
                                    visible: providerCardDelegate.modelData.provider === "opencode-zen" && root.providerBalanceText(providerCardDelegate.modelData.usage) !== ""
                                    spacing: Theme.spacingS

                                    StyledText {
                                        text: "Balance"
                                        font.pixelSize: Theme.fontSizeSmall
                                        color: Theme.surfaceVariantText
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                    StyledText {
                                        text: root.providerBalanceText(providerCardDelegate.modelData.usage)
                                        font.pixelSize: Theme.fontSizeSmall
                                        font.weight: Font.Medium
                                        color: Theme.surfaceText
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }

                                StyledText {
                                    visible: providerCardDelegate.modelData.provider === "opencode-zen" && providerCardDelegate.modelData.usage && root.validNumber(providerCardDelegate.modelData.usage.availableDollars) !== null && ((root.validNumber(providerCardDelegate.modelData.usage.balanceDollars) !== null && Math.abs(Number(providerCardDelegate.modelData.usage.availableDollars) - Number(providerCardDelegate.modelData.usage.balanceDollars)) >= 0.01) || (root.validNumber(providerCardDelegate.modelData.usage.balanceMicroCents) !== null && Math.abs(Number(providerCardDelegate.modelData.usage.availableDollars) - Number(providerCardDelegate.modelData.usage.balanceMicroCents) / 100000000) >= 0.01))
                                    text: "Available: $" + Number(providerCardDelegate.modelData.usage.availableDollars).toFixed(2)
                                    font.pixelSize: Theme.fontSizeSmall
                                    color: Theme.surfaceVariantText
                                }

                                StyledText {
                                    visible: providerCardDelegate.modelData.provider === "opencode-zen" && providerCardDelegate.modelData.usage && !!(providerCardDelegate.modelData.usage.billingMode || providerCardDelegate.modelData.usage.mode)
                                    text: {
                                        var mode = String(providerCardDelegate.modelData.usage.billingMode || providerCardDelegate.modelData.usage.mode).toLowerCase();
                                        if (mode === "prepaid") return "Prepaid";
                                        if (mode === "payg" || mode === "pay-as-you-go" || mode === "pay_as_you_go") return "Pay as you go";
                                        return providerCardDelegate.modelData.usage.billingMode || providerCardDelegate.modelData.usage.mode;
                                    }
                                    font.pixelSize: Theme.fontSizeSmall
                                    color: Theme.surfaceVariantText
                                }

                                Repeater {
                                    model: providerCardDelegate.modelData.provider === "opencode-zen" ? [] : root.providerUsageWindows(providerCardDelegate.modelData.provider, providerCardDelegate.modelData.usage)
                                    Column {
                                        id: quotaWindowDelegate
                                        required property var modelData
                                        width: parent.width
                                        spacing: Theme.spacingXXS
                                        visible: !!quotaWindowDelegate.modelData.window

                                        Item {
                                            width: parent.width
                                            height: Math.max(windowLabel.implicitHeight, windowValue.implicitHeight)
                                            StyledText {
                                                id: windowLabel
                                                anchors.left: parent.left
                                                text: quotaWindowDelegate.modelData.label + " · " + (root.usageDisplayMode === "remaining" ? "Remaining" : "Used")
                                                font.pixelSize: Theme.fontSizeSmall
                                                color: Theme.surfaceVariantText
                                            }
                                            StyledText {
                                                id: windowValue
                                                anchors.right: parent.right
                                                text: {
                                                    var usage = quotaWindowDelegate.modelData.window;
                                                    var pct = Math.round(root.displayPercent(usage));
                                                    var reset = root.formatTimeUntil(usage.resetsAt);
                                                    return pct + "%" + (reset ? " · " + reset : "");
                                                }
                                                font.pixelSize: Theme.fontSizeSmall
                                                color: root.getUsageColor(quotaWindowDelegate.modelData.window.usedPercent)
                                            }
                                        }
                                        Rectangle {
                                            width: parent.width
                                            height: Theme.spacingS
                                            radius: Theme.cornerRadiusFull
                                            color: Theme.surfaceContainerHighest
                                            Rectangle {
                                                width: Math.max(0, Math.min(1, root.displayPercent(quotaWindowDelegate.modelData.window) / 100)) * parent.width
                                                height: parent.height
                                                radius: parent.radius
                                                color: root.getUsageColor(quotaWindowDelegate.modelData.window.usedPercent)
                                                Behavior on width {
                                                    NumberAnimation { duration: 300; easing.type: Easing.OutCubic }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // No providers
                    StyledText {
                        visible: root.currentProviders().length === 0 && root.currentError() === "" && !root.isLoading
                        text: root.activeTab === "openai" ? "No Codex usage found. Run 'opentracker fetch codex' to configure." : root.activeTab === "claude" ? "No Claude usage found. Run 'opentracker fetch claude' to configure." : "No Opencode providers found. Run 'opentracker login opencode-go' to configure."
                        font.pixelSize: Theme.fontSizeMedium
                        color: Theme.surfaceVariantText
                        width: parent.width
                        wrapMode: Text.WordWrap
                        horizontalAlignment: Text.AlignHCenter
                    }
                }
            }
        }
    }
}
