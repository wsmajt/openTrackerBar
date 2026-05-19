import QtQuick
import qs.Common
import qs.Widgets
import qs.Modules.Plugins

PluginSettings {
    id: root
    pluginId: "openTrackerBar"

    StyledText {
        width: parent.width
        text: "OpenTracker"
        font.pixelSize: Theme.fontSizeLarge
        font.weight: Font.Bold
        color: Theme.surfaceText
    }

    StyledText {
        width: parent.width
        text: "Monitor Opencode and OpenAI Codex usage via opentracker CLI. Click the widget to switch between provider tabs."
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.surfaceVariantText
        wrapMode: Text.WordWrap
    }

    Rectangle {
        width: parent.width
        height: 1
        color: Theme.outline
        opacity: 0.3
    }

    // --- Refresh Interval ---

    StyledText {
        width: parent.width
        text: "Refresh Interval"
        font.pixelSize: Theme.fontSizeMedium
        font.weight: Font.Medium
        color: Theme.surfaceText
    }

    DankDropdown {
        id: refreshDropdown
        text: "Refresh Interval"
        description: "How often to fetch usage data via opentracker"
        currentValue: root.loadValue("refreshInterval", "120000")
        options: ["60000", "120000", "300000", "900000", "1800000"]
        dropdownWidth: 180
        onValueChanged: function (value) {
            root.saveValue("refreshInterval", value);
        }
    }

    StyledText {
        width: parent.width
        leftPadding: Theme.spacingM
        text: {
            var v = refreshDropdown.currentValue;
            if (v === "60000")
                return "Refreshes every 1 minute";
            if (v === "120000")
                return "Refreshes every 2 minutes";
            if (v === "300000")
                return "Refreshes every 5 minutes";
            if (v === "900000")
                return "Refreshes every 15 minutes";
            if (v === "1800000")
                return "Refreshes every 30 minutes";
            return "";
        }
        font.pixelSize: Theme.fontSizeSmall
        font.italic: true
        color: Theme.surfaceVariantText
        wrapMode: Text.WordWrap
    }

    Rectangle {
        width: parent.width
        height: 1
        color: Theme.outline
        opacity: 0.3
    }

    // --- Bar Provider ---

    StyledText {
        width: parent.width
        text: "Bar Display"
        font.pixelSize: Theme.fontSizeMedium
        font.weight: Font.Medium
        color: Theme.surfaceText
    }

    DankDropdown {
        id: barProviderDropdown
        text: "Bar Provider"
        description: "Which providers to show in the bar pill"
        currentValue: root.loadValue("barProvider", "auto")
        options: ["auto", "opencode", "openai", "both"]
        dropdownWidth: 240
        onValueChanged: function (value) {
            root.saveValue("barProvider", value);
        }
    }

    StyledText {
        width: parent.width
        leftPadding: Theme.spacingM
        text: {
            var v = barProviderDropdown.currentValue;
            if (v === "auto") return "Shows the provider with the highest usage";
            if (v === "opencode") return "Shows only Opencode usage";
            if (v === "openai") return "Shows only OpenAI usage";
            if (v === "both") return "Shows both Opencode and OpenAI usage";
            return "";
        }
        font.pixelSize: Theme.fontSizeSmall
        font.italic: true
        color: Theme.surfaceVariantText
        wrapMode: Text.WordWrap
    }

}
