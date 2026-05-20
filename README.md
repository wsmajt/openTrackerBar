# OpenTrackerBar

<img width="550" height="438" alt="obraz" src="https://github.com/user-attachments/assets/fad23f59-286b-4c00-a01d-bae6bed4f1ca" />


[DankMaterialShell](https://github.com/DankMaterialShell/DankMaterialShell) plugin that tracks Opencode and OpenAI Codex usage limits via the [opentracker](https://github.com/wsmajt/opentracker) CLI.

## Requirements

- [opentracker-cli](https://aur.archlinux.org/packages/opentracker-cli): `yay -S opentracker-cli`

## Install

```bash
git clone https://github.com/wsmajt/OpenTrackerBar.git ~/.config/DankMaterialShell/plugins/OpenTrackerBar
```

## Setup

```bash
opentracker login opencode-go
# Log in via browser, export Netscape cookies to ~/.config/opentracker/opencode-cookies.txt
opentracker fetch opencode-go
# First run will prompt for your workspace ID

opentracker fetch codex
# Shows OpenAI/Codex primary and secondary usage windows
```

## Usage

Enable the `OpenTrackerBar` plugin in DankMaterialShell settings. Click the widget and switch between the Opencode and OpenAI tabs.

## Credits
[zakstam](https://github.com/zakstam/dms-codexbar) - dms-codexbar
