# Changelog

All notable changes to **tabby-quick-command-plus** will be documented in this file.

**[中文](https://github.com/10D24D/Tabby-QuickCmd-Plus/blob/main/CHANGELOG.md) | English**

## [2.1.0] — 2026-10-28

### ⚡ Highlight: a full keyboard workflow — you can skip the mouse entirely

Everyday actions have keys: `↑` / `↓` to pick a command, `←` / `→` to switch groups, `Tab` to cycle focus inside the panel, `` ` `` to collapse every group and jump back to "All groups". Numbers work in two stages — press `1`–`9` to lock a group, then a digit to jump to that row; it commits as soon as you pause.

Most importantly, **running has four levels, so Enter no longer fires blindly**:

| Key | What it does |
|---|---|
| `Enter` | **Send only** — the command sits on the prompt so you can check it before pressing Enter yourself |
| `Ctrl` / `⌘` + `Enter` | Send and run |
| `Alt` + `Enter` | Send to the current tab only, with a confirmation step |
| `Shift` + `Enter` | Confirm, then broadcast to **every connected tab** (including terminals inside splits) |

Quick-bar chips respond to the same combinations once focused with `Tab`, so writing long commands and fanning out to several machines never needs the mouse. The Settings page ships a shortcut reference card ("In-panel keyboard").

### ✨ Added

- **Execution history** — open it from the clock button in the title bar: the latest 200 runs in four fixed-width columns (time / connection / command name / command details), filterable by connection and time range (today, last 7 days, last 30 days, custom), with CSV export and one-click clear. Newlines in multi-step commands show as `⏎`, broadcast entries list every connection that received the command, "Clear" asks for confirmation in-panel (no native OS dialog), and an empty list explains itself.
- **Layout mode** — choose "per tab" or "global": global moves the entry to the window toolbar and keeps the panel alive on every terminal tab (hidden on the Settings page); switching takes effect immediately, no restart.
- **Focus strategy** — after a command finishes, focus can return to the terminal or to the panel (the panel keeps the previously selected row and requires "Keep panel open"); send-only commands always keep focus in the terminal so you can keep typing arguments.
- **Unified "Confirm command run" dialog** — the former multi-step hint and the pre-run confirmation are now one dialog with a single title and button pair, showing the command name above the preview.
- **Multi-tab actions** — `Shift+Enter` confirms then broadcasts to every connected tab; `Alt+Enter` forces confirmation for the current tab only.
- **In-panel keyboard reference** — a shortcut card in the Settings page; quick-bar chips now respond to Enter (send only), Ctrl (run), Alt (confirm for the current tab) and Shift (broadcast) once focused.
- **Drag to reorder groups** — drag a group header to change group order; the order value is persisted and survives a restart.
- **Title-bar context menu** — right-click the panel title bar to reset its size or position.
- **Hide the in-panel settings entry** — new toggle: drop the gear on the panel and keep only the toolbar entry.
- **Action style for command rows** — hover buttons, a right-click menu, or both (default). The menu offers "Send to all connected tabs" and "Duplicate as new" (clone a command as a starting point for a variant; shortcut and pin state are not inherited).
- **SFTP+ list refresh** — after a command runs you can ask SFTP+ to refresh its panel file list: a global switch in the Settings page (off by default) plus a per-command "Follow global / Always / Never" override; commands that are only sent (not run) don't trigger it.
- **Author profile and release links** — under About, the author name opens the GitHub profile and the version opens that version's release page.

### 🐛 Fixed

- **Multi-step hint dialog ignored the keyboard** — Enter and Esc did nothing; both now work like every other dialog.
- **Pre-run confirmation button order was inconsistent** — now the same "OK | Cancel" order as the other dialogs.
- **"Reset usage counts" button was not flush right** — it now lines up with the option group above.
- **Group dropdown wouldn't open in the command editor** — the native dropdown doesn't open inside panel overlays; replaced with an in-panel list.
- **Right-click menu stayed open when clicking elsewhere** — it only closed on clicks inside the panel; it now closes on any click outside.
- **Quick-bar chips had over-bright outlines** — a row of chips looked permanently selected on dark panels; the outline is now subtle and brightens only on hover.
- **Panel and dialog shadows were too heavy** — they produced a visible dark halo on dark terminals; strengths now match SFTP+, with a 0.5px border to keep edges crisp.
- **Confusing label for the group's connection restriction** — "Restrict to Profiles" is now "Applies to", with a hint that leaving it empty shows the group everywhere.

### 🔧 Technical / Build

- Every dropdown inside dialogs is an in-panel list now; no native dropdowns left.
- Completed all 24 locales (15 new strings, 2 retired).
- Version bumped to **2.1.0** (this section covers everything since 2.0.0).

## [2.0.0] — 2026-10-23

### ✨ Added

- **Command short name** — commands pinned to the quick bar can display a shorter label; leave it empty to keep the full name. Search also matches the short name.
- **Sort mode switch** — a title-bar button cycles "drag order → name → usage count"; display only, stored order is untouched.
- **Multi-column layout** — the list splits into columns once the panel is wide enough, reducing scrolling on wide screens.
- **Right-click to edit** — right-click a command in the list to open the editor directly.
- **Free resizing from any edge or corner** — the panel resizes from any side or corner, with the minimum height lowered to 200px.
- **Drag-reorder for quick entries (bookmarks)** — reorder chips on the quick bar independently of the list order.
- **Remove a chip inline** — hover a quick-entry chip and click ✕ instead of hunting for the star in the list.
- **"Align rows when scrolling" toggle** — optional: snap to whole rows once scrolling stops so entries are never cut in half; off by default.
- **Per-command "Confirm before running"** — for dangerous commands, show the full content to be sent (multi-step commands listed line by line) before sending; commands with parameters run as confirm → fill → execute.
- **Tooltips for settings** — "Keep panel open" and "Align rows when scrolling" now explain what they do on hover.
- **NPM entry in About** — with a bundled icon, linking straight to the npm package page.
- **Auto theme follows the host's light/dark mode** — the panel palette matches the current Tabby theme instead of using one fixed set of colours.

### 🐛 Fixed

- **A leftover line under the list after drag-sorting** — no stray border remains after dropping.
- **A "horizontal bar" appearing when dragging to the bottom** — the insert indicator is no longer drawn, so it can't be mistaken for a horizontal scrollbar.
- **Group filter dropdown wouldn't open** — the native dropdown doesn't open in this environment; replaced with an in-panel list that is no longer clipped and scrolls internally when the panel is short.
- **"Keep panel open" state out of sync between panel and settings** — turning it off from the panel now updates the settings page too.
- **On/selected states were hard to tell apart** — pin, star and checkbox states now use the theme accent colour.
- **Auto theme mismatched after a restart** — panel colours now match the UI after restarting Tabby or reopening the panel.
- **Switching to Auto reverted to the old palette after a restart** — the Auto choice is now remembered correctly.
- **Wrong tooltip on the title-bar pin** — now reads "Keep panel open", consistent with the settings page.
- **Confirm dialog covered / too wide** — raised its stacking order and narrowed it to a sensible width.
- **Position of the search clear button** — ✕ now sits inside the input, aligned in height with the group filter.

### 🔧 Technical / Build

- Theme variables split into "neutral" and "accent" sets so highlighted elements no longer blend into the panel background.
- The settings page and the panel share one source of truth: panel-side changes are written back to config and broadcast, and vice versa.
- Completed copy for all 24 locales (new strings plus previously missing translations).
- Version bumped to **2.0.0** (this section summarises everything since 1.0.0).

## [1.0.0] — 2026-06-28

First release: floating command panel, group management, fuzzy search, multi-step commands with per-step delays, parameter placeholders, pinning commands to the quick bar, drag-sorting, entry/panel position memory, SSH profile awareness, Chinese/English UI.
