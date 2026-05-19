import QtQuick
import Quickshell
import Quickshell.Io
import qs.Common
import qs.Services
import qs.Widgets
import qs.Modules.Plugins

PluginComponent {
    id: root

    // === State ===
    property var providers: []
    property var opencodeProviders: []
    property var openaiProviders: []
    property string activeTab: "opencode"
    property bool isLoading: false
    property bool hasError: false
    property string errorMessage: ""
    property string opencodeError: ""
    property string openaiError: ""
    property string lastUpdated: ""
    property string opencodeJsonBuffer: ""
    property string openaiJsonBuffer: ""
    property int pendingFetches: 0
    property string barProvider: pluginData.barProvider || "auto"

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
            return p.usage && root.primaryUsage(p.usage) && !p.error;
        });
        if (filtered.length === 0)
            return null;
        var highest = filtered[0];
        for (var i = 1; i < filtered.length; i++) {
            if (root.primaryUsage(filtered[i].usage).usedPercent > root.primaryUsage(highest.usage).usedPercent)
                highest = filtered[i];
        }
        return highest;
    }

    readonly property real highestPercent: {
        if (!highestProvider || !highestProvider.usage || !root.primaryUsage(highestProvider.usage))
            return 0;
        return root.primaryUsage(highestProvider.usage).usedPercent;
    }

    readonly property string highestName: {
        if (!highestProvider)
            return "N/A";
        return formatProviderName(highestProvider.provider);
    }

    readonly property var barProviders: {
        var list = root.providers.filter(function (p) {
            return p.usage && root.primaryUsage(p.usage) && !p.error;
        });
        if (root.barProvider === "opencode") {
            list = list.filter(function (p) {
                return p.provider === "opencode-go";
            });
        } else if (root.barProvider === "openai") {
            list = list.filter(function (p) {
                return p.provider === "codex";
            });
        } else if (root.barProvider === "both") {
            list = list.filter(function (p) {
                return p.provider === "opencode-go" || p.provider === "codex";
            });
        }
        return list;
    }

    readonly property var barHighestProvider: {
        if (root.barProviders.length === 0)
            return null;
        var highest = root.barProviders[0];
        for (var i = 1; i < root.barProviders.length; i++) {
            if (root.primaryUsage(root.barProviders[i].usage).usedPercent > root.primaryUsage(highest.usage).usedPercent)
                highest = root.barProviders[i];
        }
        return highest;
    }

    readonly property real barHighestPercent: {
        if (!root.barHighestProvider || !root.barHighestProvider.usage || !root.primaryUsage(root.barHighestProvider.usage))
            return 0;
        return root.primaryUsage(root.barHighestProvider.usage).usedPercent;
    }

    // === Helpers ===
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
            return "Opencode";
        if (name === "codex")
            return "OpenAI";
        return capitalizeFirst(name);
    }

    function providerLogoPath(provider) {
        var isLight = !!SessionData.isLightMode;
        if (provider === "opencode" || provider === "opencode-go") {
            return isLight ? "opencode-logo-dark-square.svg" : "opencode-logo-light-square.svg";
        }
        if (provider === "openai" || provider === "codex") {
            return isLight ? "OpenAI-black-monoblossom.svg" : "OpenAI-white-monoblossom.svg";
        }
        return "";
    }

    function currentProviders() {
        return activeTab === "openai" ? openaiProviders : opencodeProviders;
    }

    function currentError() {
        return activeTab === "openai" ? openaiError : opencodeError;
    }

    function primaryUsage(usage) {
        if (!usage)
            return null;
        return usage.rolling || usage.primary || null;
    }

    function secondaryUsage(usage) {
        if (!usage)
            return null;
        return usage.weekly || usage.secondary || null;
    }

    function tertiaryUsage(usage) {
        if (!usage)
            return null;
        return usage.monthly || null;
    }

    function primaryLabel(provider) {
        return provider === "codex" ? "Session" : "Session";
    }

    function secondaryLabel(provider) {
        return provider === "codex" ? "Weekly" : "Weekly";
    }

    function mergeProviders() {
        root.providers = root.opencodeProviders.concat(root.openaiProviders);
    }

    function parseProviderOutput(target, raw) {
        var data = JSON.parse(raw);
        if (!Array.isArray(data))
            data = [data];
        if (target === "openai") {
            root.openaiProviders = data;
            root.openaiError = "";
        } else {
            root.opencodeProviders = data;
            root.opencodeError = "";
        }
        root.mergeProviders();
        root.hasError = root.opencodeError !== "" || root.openaiError !== "";
        root.errorMessage = root.currentError();
        root.lastUpdated = Qt.formatDateTime(new Date(), "hh:mm:ss");
    }

    function finishFetch(target, exitCode, raw) {
        if (root.pendingFetches > 0)
            root.pendingFetches--;
        root.isLoading = root.pendingFetches > 0;

        if (exitCode === 0 && raw.length > 0) {
            try {
                root.parseProviderOutput(target, raw);
            } catch (e) {
                console.warn("opentracker: JSON parse error:", e);
                if (target === "openai")
                    root.openaiError = "Failed to parse OpenAI output";
                else
                    root.opencodeError = "Failed to parse Opencode output";
            }
        } else if (exitCode !== 0) {
            if (target === "openai")
                root.openaiError = "OpenAI fetch exited with code " + exitCode;
            else
                root.opencodeError = "Opencode fetch exited with code " + exitCode;
        }

        root.hasError = root.opencodeError !== "" || root.openaiError !== "";
        root.errorMessage = root.currentError();
    }

    function formatTimeUntil(iso) {
        if (!iso)
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
        var diff = targetMs - Date.now();
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
        stderr: SplitParser {
            onRead: line => console.warn("opentracker opencode stderr:", line)
        }
        onExited: exitCode => {
            root.finishFetch("opencode", exitCode, root.opencodeJsonBuffer);
            root.opencodeJsonBuffer = "";
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
        stderr: SplitParser {
            onRead: line => console.warn("opentracker openai stderr:", line)
        }
        onExited: exitCode => {
            root.finishFetch("openai", exitCode, root.openaiJsonBuffer);
            root.openaiJsonBuffer = "";
        }
    }

    function refresh(force) {
        if (procOpencode.running || procOpenai.running)
            return;
        root.isLoading = true;
        root.pendingFetches = 2;
        root.opencodeJsonBuffer = "";
        root.openaiJsonBuffer = "";
        if (force) {
            procOpencode.command = ["opentracker", "fetch", "opencode-go", "--force"];
            procOpenai.command = ["opentracker", "fetch", "codex", "--force"];
        } else {
            procOpencode.command = ["opentracker", "fetch", "opencode-go"];
            procOpenai.command = ["opentracker", "fetch", "codex"];
        }
        procOpencode.running = true;
        procOpenai.running = true;
    }

    Timer {
        interval: root.refreshIntervalMs
        running: true
        repeat: true
        onTriggered: root.refresh(false)
    }

    Component.onCompleted: {
        root.refresh(false);
    }

    // === Bar pill (horizontal) ===
    horizontalBarPill: Component {
        Row {
            spacing: Theme.spacingXS

            DankIcon {
                name: "monitoring"
                size: Theme.iconSize - 6
                color: root.getUsageColor(root.barHighestPercent)
                anchors.verticalCenter: parent.verticalCenter
                visible: root.barProviders.length > 0
            }

            Repeater {
                model: root.barProviders

                Row {
                    spacing: 2
                    anchors.verticalCenter: parent.verticalCenter

                    Image {
                        width: 14
                        height: 14
                        source: root.providerLogoPath(modelData.provider)
                        sourceSize.width: 14
                        sourceSize.height: 14
                        fillMode: Image.PreserveAspectFit
                        anchors.verticalCenter: parent.verticalCenter
                    }

                    StyledText {
                        text: root.formatProviderName(modelData.provider) + " " + Math.round(root.primaryUsage(modelData.usage).usedPercent) + "%"
                        font.pixelSize: Theme.fontSizeSmall
                        font.weight: Font.Medium
                        color: root.getUsageColor(root.primaryUsage(modelData.usage).usedPercent)
                        anchors.verticalCenter: parent.verticalCenter
                    }
                }
            }

            StyledText {
                visible: root.barProviders.length === 0
                text: {
                    if (root.isLoading && root.providers.length === 0)
                        return "...";
                    if (root.hasError && root.providers.length === 0)
                        return "ERR";
                    return "N/A";
                }
                font.pixelSize: Theme.fontSizeSmall
                font.weight: Font.Medium
                color: root.getUsageColor(root.barHighestPercent)
                anchors.verticalCenter: parent.verticalCenter
            }
        }
    }

    // === Bar pill (vertical) ===
    verticalBarPill: Component {
        Column {
            spacing: Theme.spacingXS

            DankIcon {
                name: "monitoring"
                size: Theme.iconSize - 6
                color: root.getUsageColor(root.barHighestPercent)
                anchors.horizontalCenter: parent.horizontalCenter
            }

            StyledText {
                text: {
                    if (!root.barHighestProvider)
                        return "--";
                    return Math.round(root.barHighestPercent) + "%";
                }
                font.pixelSize: Theme.fontSizeSmall
                font.weight: Font.Medium
                color: root.getUsageColor(root.barHighestPercent)
                anchors.horizontalCenter: parent.horizontalCenter
            }
        }
    }

    // === Popout ===
    popoutWidth: 420
    popoutHeight: 0

    popoutContent: Component {
        PopoutComponent {
            id: popup
            headerText: "OpenTracker"
            detailsText: root.lastUpdated ? ("Updated " + root.lastUpdated) : ""
            showCloseButton: true

            headerActions: Component {
                Row {
                    spacing: Theme.spacingXS

                    Rectangle {
                        width: 28
                        height: 28
                        radius: 14
                        color: refreshTap.pressed ? Theme.surfaceContainerHighest : refreshArea.containsMouse ? Theme.surfaceContainerHighest : "transparent"

                        DankIcon {
                            anchors.centerIn: parent
                            name: "refresh"
                            size: 16
                            color: Theme.surfaceText
                        }

                        MouseArea {
                            id: refreshArea
                            anchors.fill: parent
                            hoverEnabled: true
                            cursorShape: Qt.PointingHandCursor

                            TapHandler {
                                id: refreshTap
                                onTapped: root.refresh(true)
                            }
                        }
                    }
                }
            }

            Item {
                id: contentWrapper
                width: parent.width
                implicitHeight: mainCol.implicitHeight

                Column {
                    id: mainCol
                    width: parent.width
                    spacing: Theme.spacingS

                    Row {
                        width: parent.width
                        spacing: Theme.spacingXS

                        Repeater {
                            model: [
                                {
                                    key: "opencode",
                                    label: "Opencode"
                                },
                                {
                                    key: "openai",
                                    label: "OpenAI"
                                }
                            ]

                            Rectangle {
                                required property var modelData

                                width: (mainCol.width - Theme.spacingXS) / 2
                                height: 72
                                radius: Theme.cornerRadius
                                color: root.activeTab === modelData.key ? Theme.surfaceContainerHighest : Theme.surfaceContainerHigh
                                border.width: root.activeTab === modelData.key ? 2 : 0
                                border.color: Theme.primary

                                Column {
                                    anchors.centerIn: parent
                                    spacing: 2

                                    Image {
                                        anchors.horizontalCenter: parent.horizontalCenter
                                        width: 28
                                        height: 28
                                        source: root.providerLogoPath(modelData.key)
                                        sourceSize.width: 28
                                        sourceSize.height: 28
                                        fillMode: Image.PreserveAspectFit
                                    }

                                    StyledText {
                                        anchors.horizontalCenter: parent.horizontalCenter
                                        text: modelData.label
                                        font.pixelSize: Theme.fontSizeSmall
                                        font.weight: Font.Medium
                                        color: root.activeTab === modelData.key ? Theme.primary : Theme.surfaceText
                                    }
                                }

                                MouseArea {
                                    anchors.fill: parent
                                    hoverEnabled: true
                                    cursorShape: Qt.PointingHandCursor
                                    onClicked: {
                                        root.activeTab = modelData.key;
                                        root.errorMessage = root.currentError();
                                    }
                                }
                            }
                        }
                    }

                    // Error banner
                    StyledRect {
                        width: parent.width
                        height: errCol.implicitHeight + Theme.spacingM * 2
                        radius: Theme.cornerRadius
                        color: Qt.rgba(Theme.error.r, Theme.error.g, Theme.error.b, 0.15)
                        visible: root.currentError() !== "" && root.currentProviders().length === 0

                        Column {
                            id: errCol
                            anchors.fill: parent
                            anchors.margins: Theme.spacingM
                            spacing: Theme.spacingXS

                            Row {
                                spacing: Theme.spacingS
                                DankIcon {
                                    name: "error"
                                    size: 18
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
                                    spacing: Theme.spacingS

                                    Image {
                                        width: 22
                                        height: 22
                                        source: root.providerLogoPath(modelData.provider)
                                        sourceSize.width: 22
                                        sourceSize.height: 22
                                        fillMode: Image.PreserveAspectFit
                                        anchors.verticalCenter: parent.verticalCenter
                                    }

                                    StyledText {
                                        text: root.formatProviderName(modelData.provider)
                                        font.pixelSize: Theme.fontSizeLarge
                                        font.weight: Font.Bold
                                        color: Theme.surfaceText
                                    }

                                    StyledText {
                                        visible: !!modelData.usage && !!modelData.usage.plan
                                        text: modelData.usage && modelData.usage.plan ? modelData.usage.plan : ""
                                        font.pixelSize: Theme.fontSizeSmall
                                        color: Theme.surfaceVariantText
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }

                                StyledText {
                                    visible: !!modelData.usage && modelData.usage.creditsRemaining !== undefined
                                    text: "Credits remaining: " + (modelData.usage ? modelData.usage.creditsRemaining : "")
                                    font.pixelSize: Theme.fontSizeSmall
                                    color: Theme.surfaceVariantText
                                }

                                // Error state for this provider
                                Row {
                                    visible: !!modelData.error
                                    spacing: Theme.spacingXS

                                    DankIcon {
                                        name: "warning"
                                        size: 14
                                        color: Theme.error
                                        anchors.verticalCenter: parent.verticalCenter
                                    }

                                    StyledText {
                                        text: modelData.error ? (modelData.error.message || "Error") : ""
                                        font.pixelSize: Theme.fontSizeSmall
                                        color: Theme.error
                                        anchors.verticalCenter: parent.verticalCenter
                                    }
                                }

                                // Primary window
                                Column {
                                    width: parent.width
                                    spacing: 2
                                    visible: !!modelData.usage && !!root.primaryUsage(modelData.usage)

                                    Item {
                                        width: parent.width
                                        height: Math.max(primLabel.implicitHeight, primValue.implicitHeight)

                                        StyledText {
                                            id: primLabel
                                            anchors.left: parent.left
                                            text: root.primaryLabel(modelData.provider)
                                            font.pixelSize: Theme.fontSizeSmall
                                            color: Theme.surfaceVariantText
                                        }
                                        StyledText {
                                            id: primValue
                                            anchors.right: parent.right
                                            text: {
                                                var usage = root.primaryUsage(modelData.usage);
                                                if (!usage)
                                                    return "";
                                                var pct = Math.round(usage.usedPercent);
                                                var reset = root.formatTimeUntil(usage.resetsAt);
                                                return pct + "%" + (reset ? " \u00B7 " + reset : "");
                                            }
                                            font.pixelSize: Theme.fontSizeSmall
                                            color: root.getUsageColor(root.primaryUsage(modelData.usage) ? root.primaryUsage(modelData.usage).usedPercent : 0)
                                        }
                                    }

                                    Rectangle {
                                        width: parent.width
                                        height: 6
                                        radius: 3
                                        color: Theme.surfaceContainerHighest

                                        Rectangle {
                                            width: {
                                                var usage = root.primaryUsage(modelData.usage);
                                                var pct = usage ? usage.usedPercent : 0;
                                                return Math.min(1, pct / 100) * parent.width;
                                            }
                                            height: parent.height
                                            radius: parent.radius
                                            color: root.getUsageColor(root.primaryUsage(modelData.usage) ? root.primaryUsage(modelData.usage).usedPercent : 0)
                                            Behavior on width {
                                                NumberAnimation {
                                                    duration: 300
                                                    easing.type: Easing.OutCubic
                                                }
                                            }
                                        }
                                    }
                                }

                                // Secondary window
                                Column {
                                    width: parent.width
                                    spacing: 2
                                    visible: !!modelData.usage && !!root.secondaryUsage(modelData.usage)

                                    Item {
                                        width: parent.width
                                        height: Math.max(secLabel.implicitHeight, secValue.implicitHeight)

                                        StyledText {
                                            id: secLabel
                                            anchors.left: parent.left
                                            text: root.secondaryLabel(modelData.provider)
                                            font.pixelSize: Theme.fontSizeSmall
                                            color: Theme.surfaceVariantText
                                        }
                                        StyledText {
                                            id: secValue
                                            anchors.right: parent.right
                                            text: {
                                                var usage = root.secondaryUsage(modelData.usage);
                                                if (!usage)
                                                    return "";
                                                var pct = Math.round(usage.usedPercent);
                                                var reset = root.formatTimeUntil(usage.resetsAt);
                                                return pct + "%" + (reset ? " \u00B7 " + reset : "");
                                            }
                                            font.pixelSize: Theme.fontSizeSmall
                                            color: root.getUsageColor(root.secondaryUsage(modelData.usage) ? root.secondaryUsage(modelData.usage).usedPercent : 0)
                                        }
                                    }

                                    Rectangle {
                                        width: parent.width
                                        height: 6
                                        radius: 3
                                        color: Theme.surfaceContainerHighest

                                        Rectangle {
                                            width: {
                                                var usage = root.secondaryUsage(modelData.usage);
                                                var pct = usage ? usage.usedPercent : 0;
                                                return Math.min(1, pct / 100) * parent.width;
                                            }
                                            height: parent.height
                                            radius: parent.radius
                                            color: root.getUsageColor(root.secondaryUsage(modelData.usage) ? root.secondaryUsage(modelData.usage).usedPercent : 0)
                                            Behavior on width {
                                                NumberAnimation {
                                                    duration: 300
                                                    easing.type: Easing.OutCubic
                                                }
                                            }
                                        }
                                    }
                                }

                                // Monthly window
                                Column {
                                    width: parent.width
                                    spacing: 2
                                    visible: !!modelData.usage && !!root.tertiaryUsage(modelData.usage)

                                    Item {
                                        width: parent.width
                                        height: Math.max(terLabel.implicitHeight, terValue.implicitHeight)

                                        StyledText {
                                            id: terLabel
                                            anchors.left: parent.left
                                            text: "Monthly"
                                            font.pixelSize: Theme.fontSizeSmall
                                            color: Theme.surfaceVariantText
                                        }
                                        StyledText {
                                            id: terValue
                                            anchors.right: parent.right
                                            text: {
                                                var usage = root.tertiaryUsage(modelData.usage);
                                                if (!usage)
                                                    return "";
                                                var pct = Math.round(usage.usedPercent);
                                                var reset = root.formatTimeUntil(usage.resetsAt);
                                                return pct + "%" + (reset ? " \u00B7 " + reset : "");
                                            }
                                            font.pixelSize: Theme.fontSizeSmall
                                            color: root.getUsageColor(root.tertiaryUsage(modelData.usage) ? root.tertiaryUsage(modelData.usage).usedPercent : 0)
                                        }
                                    }

                                    Rectangle {
                                        width: parent.width
                                        height: 6
                                        radius: 3
                                        color: Theme.surfaceContainerHighest

                                        Rectangle {
                                            width: {
                                                var usage = root.tertiaryUsage(modelData.usage);
                                                var pct = usage ? usage.usedPercent : 0;
                                                return Math.min(1, pct / 100) * parent.width;
                                            }
                                            height: parent.height
                                            radius: parent.radius
                                            color: root.getUsageColor(root.tertiaryUsage(modelData.usage) ? root.tertiaryUsage(modelData.usage).usedPercent : 0)
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // No providers
                    StyledText {
                        visible: root.currentProviders().length === 0 && root.currentError() === "" && !root.isLoading
                        text: root.activeTab === "openai" ? "No OpenAI usage found. Run 'opentracker fetch codex' to configure." : "No providers found. Run 'opentracker login opencode-go' to configure."
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
