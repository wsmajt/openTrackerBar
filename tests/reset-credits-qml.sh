#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT HUP INT TERM

node "$root/tests/generate-reset-credits-qml.mjs" "$root" "$tmp/tst_resetcredits.qml"
QT_QPA_PLATFORM=offscreen /usr/lib/qt6/bin/qmltestrunner -input "$tmp/tst_resetcredits.qml"
