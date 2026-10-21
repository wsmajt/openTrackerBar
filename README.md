# OpenTrackerBar

<img width="579" height="694" alt="obraz" src="https://raw.githubusercontent.com/wsmajt/openTrackerBar/refs/heads/main/Screenshot.png" />


[DankMaterialShell](https://github.com/DankMaterialShell/DankMaterialShell) plugin that tracks Opencode Go usage limits, Opencode Zen balance, and OpenAI Codex and Claude usage limits via the [opentracker](https://github.com/wsmajt/opentracker) CLI.

## Requirements

- [opentracker-cli](https://aur.archlinux.org/packages/opentracker-cli): `yay -S opentracker-cli`

## Install

```bash
dms plugins install openTrackerBar
```

Then add the widget to a DankBar in DMS settings.

Alternatively, find OpenTrackerBar by searching in DMS Settings → Plugins, or browse the [Dank plugins directory](https://duxlabs.dev/plugins).

## Setup

```bash
opentracker login opencode-go
# Log in via browser, export Netscape cookies to ~/.config/opentracker/opencode-cookies.txt
opentracker fetch opencode-go
# First run will prompt for your workspace ID

opentracker fetch opencode-zen
# Check your Zen balance after configuring access in opentracker

opentracker fetch codex
# Shows OpenAI/Codex primary and secondary usage windows

opentracker fetch claude
# Requires an opentracker build with Claude support and configured Claude access
```

## Usage

Enable the `OpenTrackerBar` plugin in DankMaterialShell settings. Click the widget and switch between the Opencode, Codex, and Claude tabs. The Opencode tab groups Go usage limits and the Zen pay-as-you-go balance.

- Zen shows a dollar balance, not a usage percentage. A zero balance is displayed as `$0.00`.
- Automatic refresh uses the configured interval; manual refresh adds `--force`.
- Each source has its own last-successful-update time. Failed refreshes preserve the last available data and show an error; data older than two refresh intervals is marked stale.
- Use the pin button on each provider card in the widget popout to show or hide Go, Zen, Codex, and Claude independently in the bar. Any combination is supported and saved immediately; no source is selected automatically. With all sources deselected, a small placeholder keeps the widget accessible so you can open it and pin a provider again. Adding Claude does not change existing pin selections.
- Older `barProvider` settings are used only until you make your first selection: `opencode` becomes Go + Zen, `openai` becomes Codex, and `auto`, `both`, or an unset value become all three sources.
- Hover over the bar for quota-window, reset, and balance details.
- Pinned Go, Codex, and Claude cards let you choose which available quota window appears in the bar. Claude supports five-hour, weekly, and optional Sonnet/Opus windows; only returned windows and plan information are shown. The cards and notifications still cover all available windows; Zen remains a dollar balance.
- Refresh a single source from its card without refetching the others. Error hints offer a fixed recovery command to copy; the widget never runs login or installation commands for you.
- Project links in settings open GitHub in your browser. Giving the project a star is an explicit action on GitHub, not an automatic action by the plugin.

Provider authentication and cookies are handled by opentracker, not by this plugin.

### Display and notifications

Open the preferences section in the widget popout to choose **Used** or **Remaining**. The setting applies to quota percentages and progress bars, not to the Zen dollar balance. Warning colors always reflect usage: 5% remaining is still a high-usage warning.

Notifications are opt-in. Enable them in the same section for Go, Codex, and Claude quota alerts at 80% and 95% used and a Zen low-balance alert. The Zen threshold is editable and defaults to `$1.00`. Pinning controls bar visibility only; it does not enable or disable monitoring.

The first successful observation establishes a quiet baseline. Alerts report subsequent threshold crossings, not old readings at startup. Enabling notifications or changing the Zen threshold also establishes a new baseline. Quota alerts use each window independently; repeated readings do not repeat an alert. Zen alerts trigger at or below the configured balance, and a top-up above it allows a future alert.

Desktop notifications are sent through the host's `dms notify` command at normal urgency and respect the notification daemon's Do Not Disturb rules. Alert state is stored through DMS's plugin-state API to prevent duplicates after a restart.

### Optional local OpenCode statistics

Enable local statistics in the popout preferences for a small **today's tokens and sessions** summary in the Opencode tab. This is local activity, not a usage limit or Zen balance, and is not included in bar pinning or quota alerts.

This requires an opentracker build supporting `opentracker stats opencode` and an installed OpenCode CLI supporting `stats --json --standalone --days 0`. No cost estimates, project paths, messages, model lists, or historical charts are displayed. If the widget reports that the OpenCode CLI was not found, install it or make it visible outside terminals: opentracker checks `OPENCODE_BIN`, then `PATH`, then `~/.bun/bin`, `~/.local/bin`, and `/usr/local/bin`.

Statistics are requested only when the summary is enabled and the Opencode tab is open, with a five-minute cache and an explicit refresh action. They are not part of periodic quota refreshes. The CLI delegates aggregation to OpenCode rather than reading its database directly; OpenCode may create or migrate its own local storage when invoked.

## Development checks

```bash
node --test tests/provider-logic.mjs
```

These offline tests exercise the widget's JavaScript helpers with quota and balance fixtures. They do not run opentracker, authenticate, or validate the rendered QML interface.

## Credits
[zakstam](https://github.com/zakstam/dms-codexbar) - dms-codexbar
