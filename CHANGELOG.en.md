# Changelog

All notable changes to **tabby-quick-command-plus** will be documented in this file.

**[中文](https://github.com/10D24D/Tabby-QuickCmd-Plus/blob/main/CHANGELOG.md) | English**

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
