# QuickCmd+ — Quick Command Panel for Tabby

**[中文](https://github.com/10D24D/Tabby-QuickCmd-Plus/blob/main/README.md) | English**

[![Version](https://img.shields.io/github/package-json/v/10D24D/Tabby-QuickCmd-Plus?style=for-the-badge&label=Version&color=7B68EE)](https://github.com/10D24D/Tabby-QuickCmd-Plus)
[![Stars](https://img.shields.io/github/stars/10D24D/Tabby-QuickCmd-Plus?style=for-the-badge&label=Stars&color=orange)](https://github.com/10D24D/Tabby-QuickCmd-Plus/stargazers)
[![License](https://img.shields.io/github/license/10D24D/Tabby-QuickCmd-Plus?style=for-the-badge&label=License&color=green)](https://github.com/10D24D/Tabby-QuickCmd-Plus)

QuickCmd+ is a plugin for [Tabby Terminal](https://tabby.sh/) that turns long commands and multi-step flows into saved entries you can summon from a floating panel and send or run with one click. It supports groups and filtering, fuzzy search, parameter placeholders, per-connection (SSH profile) scoping, pinning to a quick bar, and a confirmation step for dangerous commands.

---

## 📋 Features

### Command management

- **Floating command panel** — an overlay above the terminal, available on demand without interrupting your work
- **Groups and filtering** — commands are organised into groups; the search row filters by group, and "Auto" shows only groups relevant to the current connection
- **Fuzzy search** — matches the command name, short name and content as you type
- **Command short name** — a shorter label for quick-bar chips; falls back to the full name, and search matches it too
- **Multi-line / multi-step commands** — split a command into steps with an independent delay per step (0–60s), ideal for "start the service, wait, then check status"
- **Parameter placeholders** — use `{{param}}` in a command and fill it in a dialog before sending
- **Right-click to edit** — open the editor straight from the list
- **Selective import/export** — export only what you need (commands & groups / interface & appearance / window behaviour & position)

### Execution

- **Send or run** — clicking a command *sends* it (review, then press Enter); the inline ⏎ *sends and runs*
- **Confirm before running** — opt-in per command: the full content is shown before sending (multi-step commands line by line); with parameters the order is confirm → fill → run
- **Ctrl+C before running** — optionally interrupt whatever is still running first

### Panel and appearance

- **Keep panel open** — once enabled, running a command or losing focus no longer hides the panel; the title-bar pin and the settings toggle stay in sync both ways
- **Free resizing** — drag any edge or corner; minimum height 200px
- **Multi-column layout** — the list splits into columns on wide panels, reducing scrolling
- **Sort mode switch** — a title-bar button cycles drag order → name → usage count
- **Snap to whole rows** — optional: snap after scrolling stops so entries are never cut in half (off by default)
- **Auto theme** — follows the current Tabby theme's light/dark mode, or pick a built-in preset / custom colours
- **24 languages** — EN, ZH, JA, KO, DE, FR, ES, PT, RU and more, following Tabby's interface language

### Entry points and position

- **Draggable launcher** — the `⚡` toolbar button can be dragged, and its position is remembered
- **Pin to quick bar** — pinned commands become chips above the list and can be drag-reordered; hovering for a moment reveals an ✕ to unpin (so a stray click can't remove one)
- **Position memory** — launcher and panel positions are remembered per SSH connection
- **SSH awareness** — commands and groups can be scoped to SSH profiles and appear only in matching connections
- **Hotkeys** — configurable for opening the panel and quick-bar actions

## Tech stack

| Area | Technology |
|------|------------|
| Framework | Angular 9 |
| Language | TypeScript 5.8 |
| Build | Webpack 5 |
| Styling | Component-scoped CSS driven by theme variables |
| Platform deps | tabby-core ^1.0.163, tabby-settings ^1.0.163, tabby-terminal ^1.0.163 |
| Persistence | Tabby config (config.yaml) with a localStorage cache |
| i18n | gettext (`.po`, 24 locales) |
| Package manager | npm |

## Project layout

```
tabby-QuickCmd+/
├── package.json                 # metadata and dependencies
├── tsconfig.json                # TypeScript config
├── webpack.config.js            # Webpack config
├── README.md / README.en.md     # docs (Chinese / English)
├── CHANGELOG.md / .en.md        # changelog (Chinese / English)
├── .github/                     # issue forms and npm publish workflow
├── locale/                      # 24 locale .po files
├── scripts/                     # build & generation scripts (icons, manifest, locales)
├── tabby-plugin-common/         # shared constants/utilities with SFTP+
├── dist/                        # build output (npm run build)
│   ├── index.js                 #   bundled plugin entry
│   └── package.json             #   plugin manifest (generated at build time)
└── src/                         # sources
    ├── index.ts                 #   entry — module registration, theme sync
    ├── qc-floating-panel.component.ts  # main panel (template + styles + interaction)
    ├── qc-settings.component.ts        # settings page (incl. About)
    ├── qc-command.service.ts           # command & group storage
    ├── qc-i18n.service.ts              # i18n service
    ├── qc-terminal-decorator.ts        # toolbar launcher, panel instances
    ├── qc-config-provider.ts           # config defaults
    ├── qc-toolbar-button-provider.ts   # toolbar button provider
    ├── qc-hotkey-provider.ts           # hotkey registration
    ├── qc-open-settings.ts             # helper to open settings
    └── assets/icons/                   # bundled icons (npm.svg / kofi.svg)
```

## Usage

### Basics

1. Open an SSH connection (or a local terminal) — a `⚡` launcher appears in the toolbar
2. Click it to open the panel, then browse or search (and filter by group)
3. Clicking a command *sends* it to the terminal (press Enter to run); the inline ⏎ runs it immediately
4. Drag the launcher to move it

### Pinning to the quick bar

- Click ☆ on a command to pin it; pinned commands appear as chips above the list
- Chips can be drag-reordered; hover for about 0.6s and an ✕ appears to unpin

### Confirm before running

- Tick "Confirm before running" while editing a command
- Running it then opens a dialog showing the exact content to be sent
- Multi-step commands are listed line by line; parameterised commands are confirmed before the parameter dialog

### Step delays

- Add several steps while editing, each with its own delay
- Steps are sent in order, waiting the configured delay between them
- Good for flows like "start service → wait a few seconds → check status"

### Parameters

- Use `{{param}}` placeholders in a command
- A dialog asks for the values before sending

### SSH profile scoping

- In settings, scope a command or group to SSH profiles
- The panel shows only commands matching the current connection; unscoped commands appear everywhere

### Import, export and backup

- "Export data" lets you tick the categories to include
- Import merges with a "field absent = do not overwrite" rule, so it never wipes config you did not export

## Build & development

```bash
# install dependencies
npm install

# development (rebuild on change)
npm run watch

# production build (also generates icons and the plugin manifest)
npm run build
```

The build output `dist/index.js` is the plugin bundle — drop it into Tabby's plugin directory and restart.

## License

MIT — by DD1024z

## 📜 Version history

Latest: **v2.0.0** (2026-10-23) — [full changelog](https://github.com/10D24D/Tabby-QuickCmd-Plus/blob/main/CHANGELOG.en.md)

## Notes

> The feature ideas come from the author (DD1024z); most of the implementation code was written with AI assistance.
> Bug reports and feature requests are welcome via [Issues](https://github.com/10D24D/Tabby-QuickCmd-Plus/issues) or pull requests.
> If QuickCmd+ is useful to you, feel free to [buy me a coffee ☕](https://ko-fi.com/dd1024z).

## Disclaimer

> QuickCmd+ is a free, open-source project. The author makes no guarantees about its completeness, reliability or fitness for purpose. By using this plugin you accept the associated risks; the developer is not liable for any problems or losses arising from its use — please evaluate the risks yourself.
