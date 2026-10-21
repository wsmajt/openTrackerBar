import QtQuick
import qs.Common
import qs.Widgets
import qs.Modules.Plugins
import qs.DCommon.Widgets as DCommonWidgets

PluginSettings {
    id: root
    pluginId: "openTrackerBar"

    StyledText {
        width: parent.width
        text: "OpenTrackerBar"
        font.pixelSize: Theme.fontSizeLarge
        font.weight: Font.Bold
        color: Theme.surfaceText
    }

    StyledText {
        width: parent.width
        text: "Track Opencode Go usage, Zen balance, and Codex and Claude limits with the opentracker CLI. Click the bar widget to switch providers."
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
        description: "How often to refresh Opencode (Go + Zen) and Codex usage"
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

    StyledText {
        width: parent.width
        text: "Project"
        font.pixelSize: Theme.fontSizeMedium
        font.weight: Font.Medium
        color: Theme.surfaceText
    }

    Flow {
        width: parent.width
        spacing: Theme.spacingS

        DCommonWidgets.DButton {
            text: "Star on GitHub"
            iconName: "star"
            onClicked: Qt.openUrlExternally("https://github.com/wsmajt/OpenTrackerBar")
        }

        DCommonWidgets.DButton {
            text: "Source code"
            iconName: "code"
            onClicked: Qt.openUrlExternally("https://github.com/wsmajt/OpenTrackerBar")
        }

        DCommonWidgets.DButton {
            text: "Report an issue"
            iconName: "bug_report"
            onClicked: Qt.openUrlExternally("https://github.com/wsmajt/OpenTrackerBar/issues/new")
        }
    }

}
