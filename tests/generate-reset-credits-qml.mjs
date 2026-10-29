import { readFileSync, writeFileSync } from "node:fs";

const [root, output] = process.argv.slice(2);
if (!root || !output) throw new Error("Pass the plugin directory and output QML path.");
const source = readFileSync(`${root}/OpenTrackerBarWidget.qml`, "utf8");

function functionSource(name) {
    const start = source.indexOf(`function ${name}(`);
    if (start < 0) throw new Error(`Missing QML function ${name}.`);
    const brace = source.indexOf("{", start);
    let depth = 0;
    for (let i = brace; i < source.length; i++) {
        if (source[i] === "{") depth++;
        if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`Unterminated QML function ${name}.`);
}

const functions = ["isResetArray", "resetCreditsOf", "resetExpiryInfo"].map(functionSource).join("\n");
const qml = `pragma ComponentBehavior: Bound

import QtQuick
import QtTest

TestCase {
    id: root
    name: "ResetCredits"
    when: windowShown
    property real clockNow: Date.parse("2026-10-29T12:00:00Z")
    property var observations: ({})
    property var providers: [
        { provider: "codex", usage: { resetCredits: { available: 2, applicable: 2, credits: [
            { expiresAt: "2026-10-29T16:00:00Z" }, { expiresAt: "2026-10-30T12:00:00Z" }
        ] } } },
        { provider: "codex", usage: { resetCredits: { available: 0, credits: [] } } },
        { provider: "codex", usage: { resetCredits: { available: 1 } } }
    ]

    ${functions}

    function test_repeater_preserves_expiry_details() {
        tryCompare(repeater, "count", 3)
        tryCompare(root, "observationCount", 3)
        var first = observations.first
        compare(first.inputIsArray, false)
        compare(first.inputIsArrayInstance, true)
        compare(first.inputTag, "[object V4Sequence]")
        compare(first.count, 2)
        compare(first.firstLabel, "Expires in 4h 0m")
        compare(first.firstUrgent, true)
        compare(first.secondLabel, "Expires in 1d 0h")
        compare(first.secondUrgent, false)
        compare(observations.emptyCount, 0)
        compare(observations.emptyListed, true)
        compare(observations.absent, true)
        console.log("QT_SEQUENCE Array.isArray=" + first.inputIsArray
            + " instanceofArray=" + first.inputIsArrayInstance + " tag=" + first.inputTag)
        console.log("UI_MODEL count=" + first.count + " first=" + first.firstLabel
            + " urgent=" + first.firstUrgent + " second=" + first.secondLabel
            + " urgent=" + first.secondUrgent)
        console.log("EMPTY_LIST count=" + observations.emptyCount
            + " listed=" + observations.emptyListed + " ABSENT_LIST=" + observations.absent)
    }

    property int observationCount: 0
    Item {
        Repeater {
            id: repeater
            model: root.providers
            Item {
                id: card
                required property var modelData
                required property int index
                readonly property var summary: root.resetCreditsOf(card.modelData.usage)
                readonly property var credits: summary && root.isResetArray(summary.credits) ? summary.credits : []
                Component.onCompleted: {
                    if (card.index === 0) {
                        var input = card.modelData.usage.resetCredits.credits
                        var first = root.resetExpiryInfo(card.credits[0])
                        var second = root.resetExpiryInfo(card.credits[1])
                        root.observations = {
                            first: {
                                inputIsArray: Array.isArray(input),
                                inputIsArrayInstance: input instanceof Array,
                                inputTag: Object.prototype.toString.call(input),
                                count: card.credits.length,
                                firstLabel: first.label,
                                firstUrgent: first.urgent,
                                secondLabel: second.label,
                                secondUrgent: second.urgent
                            }
                        }
                        root.observationCount++
                    } else if (card.index === 1) {
                        root.observations = Object.assign({}, root.observations, {
                            emptyCount: card.credits.length,
                            emptyListed: root.isResetArray(card.summary.credits)
                        })
                        root.observationCount++
                    } else {
                        root.observations = Object.assign({}, root.observations, {
                            absent: card.summary.credits === undefined && card.credits.length === 0
                        })
                        root.observationCount++
                    }
                }
            }
        }
    }
}
`;
writeFileSync(output, qml);
