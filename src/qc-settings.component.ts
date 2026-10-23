/**
 * QuickCommand+ 设置面板
 * 功能描述：在 Tabby 设置左侧栏注册 QuickCmd+ 配置入口（语言、命令管理、数据备份）
 *   支持双存储模式：Tabby 配置（config.yaml）或 浏览器缓存（localStorage）
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-27
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-10-12
 *   - 2026-10-12 (Hy3)：关于区新增 NPM 入口（openNpm），图标改为与 SFTP+ 同机制的内置 npm.svg
 *     （新增 scripts/copy-icons.mjs 随构建复制到 dist/assets/icons；运行时按 bootstrapData
 *     解析插件路径后以 file:// 引用，兼容 dist / 根 / src 三种布局）
 *   - 导出数据改为「可勾选内容」：点「导出数据」先弹出勾选弹窗（命令与分组 / 界面与外观 /
 *     窗口行为与位置，默认全选，可一键全选·全不选，一类未勾时禁用导出按钮），只把勾选的类别
 *     写进 JSON；导入侧维持「字段不存在 = 不覆盖」语义，故选择性备份不会误伤未勾选的数据
 *   - 2026-09-24 修复反馈环境信息的 Windows 版本取不准（按 build 反查市场版本名：
 *     Windows 11 25H2 (build 26200, x64)）；意见反馈拆分为「报告问题 / 提出需求」两个入口，
 *     需求类提供英文版双语正文；反馈预填环境信息（不含隐私字段）
 *   - 2026-06-29 添加双存储模式（Tabby 配置 / 浏览器缓存），默认使用 Tabby 配置
 */
import { Component, Injectable, Optional, Inject } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { ConfigService, HotkeysService, PlatformService, HostAppService } from 'tabby-core'
import { defaultQcConfig } from './qc-config-provider'
import { QuickCommandService, QuickCommand, QuickCommandGroup } from './qc-command.service'
import { QuickCommandI18nService, LOCALES, Locale } from './qc-i18n.service'
import { QC_PLUS_TOGGLE_HOTKEY } from './qc-hotkey-provider'
import {
  HotkeyBinding, readToggleHotkeyBindings, formatHotkeyBinding,
  findHotkeyConflicts, setHotkeyRecordingActive, isHotkeyRecordingActive,
  getKeystrokeNameFromEvent,
} from './qc-hotkey-util'
import { parseColorLuminance } from '@common/utils'
// 内置图标目录探测需读文件系统（webpack externals 已放行 fs/path，运行时即 node require）
import * as fs from 'fs'

/** webpack DefinePlugin 在每次 build 时注入的 ISO 时间戳 */
declare const __QC_PLUS_BUILD_TIME__: string

/**
 * Windows build 号 → 市场版本代号，按 build 升序（取 ≤ build 的最大条目）
 * 背景：Windows 自 Vista 起内核版本号固定 10.0.<build>，Win10/Win11 共用同一主版本，
 *       只有 build 号能区分（≥22000 = Windows 11），故必须靠此表还原出「25H2」这类用户可辨识的版本名
 */
const WINDOWS_BUILD_RELEASES: Array<[number, string]> = [
  [10240, '1507'], [10586, '1511'], [14393, '1607'], [15063, '1703'], [16299, '1709'],
  [17134, '1803'], [17763, '1809'], [18362, '1903'], [18363, '1909'], [19041, '2004'],
  [19042, '20H2'], [19043, '21H1'], [19044, '21H2'], [19045, '22H2'],
  [22000, '21H2'], [22621, '22H2'], [22631, '23H2'], [26100, '24H2'], [26200, '25H2'],
]

/** Darwin 内核主版本 → macOS 市场版本（19=10.15 Catalina … 24=15 Sequoia、25=26 Tahoe） */
const MACOS_BY_DARWIN: Record<number, string> = {
  19: '10.15', 20: '11', 21: '12', 22: '13', 23: '14', 24: '15', 25: '26',
}

@Component({
  template: `
    <div class="qc-settings-page">
      <h3 class="qs-title">QuickCmd+</h3>
      <p class="qs-desc">{{ t('快捷命令管理面板，创建和管理常用命令。', 'Quick command panel, create and manage commands.') }}</p>

      <!-- 语言 -->
      <div class="qs-section">
        <label class="qs-label">{{ t('语言', 'Language') }}</label>
        <select [(ngModel)]="lang" (ngModelChange)="onLangChange()" class="qs-select">
          <option value="">{{ t('跟随Tabby', 'Follow Tabby') }}</option>
          <option *ngFor="let l of locales" [value]="l.code">{{ l.name }}</option>
        </select>
      </div>

      <!-- 界面 -->
      <div class="qs-section">
        <label class="qs-label">{{ t('界面', 'Interface') }}</label>
        <div class="qs-color-row">
          <label *ngFor="let c of colorThemes" class="qs-color-swatch"
            [class.qs-color-active]="colorTheme === c.value"
            (click)="setColorTheme(c.value)">
            <span class="qs-color-swatch-name">{{ themeLabel(c) }}</span>
            <span class="qs-color-swatch-preview" [style.background]="c.bg">
              <span class="qs-cp-title" [style.background]="c.surface" [style.color]="c.text">{{ themeLabel(c) }}</span>
              <span class="qs-cp-body" [style.color]="c.muted">
                <span class="qs-cp-line" [style.color]="c.text">cmd</span>
                <span class="qs-cp-accent" [style.background]="c.primary"></span>
              </span>
            </span>
          </label>
        </div>

        <!-- 配色方案详情 -->
        <div class="qs-scheme-preview" *ngFor="let c of colorThemes" [hidden]="colorTheme !== c.value">
          <div class="qs-color-fields">
            <div class="qs-color-field">
              <label>{{ t('主色调', 'Primary') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'primary')" (change)="onColorChange('primary', $event.target.value)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'primary') }}</span>
            </div>
            <div class="qs-color-field">
              <label>{{ t('背景', 'Bg') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'bg')" (change)="onColorChange('bg', $event.target.value)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'bg') }}</span>
            </div>
            <div class="qs-color-field">
              <label>{{ t('文字', 'Text') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'text')" (change)="onColorChange('text', $event.target.value)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'text') }}</span>
            </div>
            <div class="qs-color-field">
              <label>{{ t('标题栏', 'Surface') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'surface')" (change)="onColorChange('surface', $event.target.value)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'surface') }}</span>
            </div>
            <div class="qs-color-field">
              <label>{{ t('边框', 'Border') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'border')" (change)="onColorChange('border', $event.target.value)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'border') }}</span>
            </div>
            <div class="qs-color-field">
              <label>{{ t('次要文字', 'Muted') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'muted')" (change)="onColorChange('muted', $event.target.value)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'muted') }}</span>
            </div>
          </div>
        </div>

        <!-- 字体大小 -->
        <div class="qs-font-row">
          <label class="qs-font-label">{{ t('字体大小', 'Font Size') }}</label>
          <div class="qs-font-control">
            <input type="range" min="11" max="18" step="1"
              [value]="fontSize" (input)="onFontSizeChange(+$any($event.target).value)"
              class="qs-range">
            <span class="qs-font-val">{{ fontSize }}px</span>
          </div>
        </div>

        <!-- 面板透明度 -->
        <div class="qs-font-row" style="margin-top:8px;">
          <label class="qs-font-label" [title]="t('设置面板整体透明度（50%–100%），低于 100% 时面板内容会半透明', 'Set panel opacity (50%–100%). Below 100% the panel content becomes semi-transparent.')">
            {{ t('面板透明度', 'Panel Opacity') }}
          </label>
          <div class="qs-font-control">
            <input type="range" min="50" max="100" step="5"
              [value]="panelOpacityPercent"
              (input)="onPanelOpacityChange(+$any($event.target).value)"
              class="qs-range">
            <span class="qs-font-val">{{ panelOpacityPercent }}%</span>
          </div>
        </div>

        <!-- 入口模式 -->
        <div class="qs-entry-mode-row">
          <label style="font-size:13px; font-weight:500;">{{ t('入口模式', 'Entry Mode') }}</label>
          <div class="qs-pills">
            <span class="qs-pill" [class.qs-pill-active]="entryMode === 'toolbar'"
              (click)="entryMode='toolbar'; onEntryModeChange()">{{ t('工具栏按钮', 'Toolbar') }}</span>
            <span class="qs-pill" [class.qs-pill-active]="entryMode === 'floating'"
              (click)="entryMode='floating'; onEntryModeChange()">{{ t('浮动按钮', 'Floating') }}</span>
          </div>
        </div>

        <!-- 面板常驻 -->
        <div class="qs-toggle-row" (click)="togglePinPanel()"
          [title]="t('开启后执行命令不会自动关闭面板，面板保持常驻；关闭时执行命令或点击别处会自动收起', 'When on, the panel stays open after running a command or losing focus; when off, it hides automatically.')">
          <span class="qs-toggle-label">{{ t('面板常驻', 'Keep panel open') }}</span>
          <span class="qs-toggle-track" [class.active]="pinPanel">
            <span class="qs-toggle-thumb"></span>
          </span>
        </div>

        <!-- 排序模式 -->
        <div class="qs-entry-mode-row" style="margin-top:12px;" [title]="t('更改命令列表的排序方式，仅影响显示顺序', 'Change command list sort order. Only affects display order.')">
          <label style="font-size:13px; font-weight:500;">{{ t('排序方式', 'Sort by') }}</label>
          <div class="qs-pills">
            <span class="qs-pill" [class.qs-pill-active]="sortMode === 'manual'"
              (click)="setSortMode('manual')">{{ t('手动', 'Manual') }}</span>
            <span class="qs-pill" [class.qs-pill-active]="sortMode === 'name'"
              (click)="setSortMode('name')">{{ t('名称', 'Name') }}</span>
            <span class="qs-pill" [class.qs-pill-active]="sortMode === 'usage'"
              (click)="setSortMode('usage')">{{ t('执行次数', 'Usage') }}</span>
          </div>
        </div>
        <!-- 仅「执行次数」排序下显示重置统计入口 -->
        <div class="qs-reset-row" *ngIf="sortMode === 'usage'">
          <span class="qs-reset-msg" *ngIf="usageResetMsg">{{ usageResetMsg }}</span>
          <button type="button" class="qs-mini-btn" (click)="resetUsageCount()">
            {{ t('重置执行次数', 'Reset usage counts') }}
          </button>
        </div>
      </div>

      <!-- 面板快捷键（置于数据上方） -->
      <div class="qs-section">
        <label class="qs-label">{{ t('面板快捷键', 'Panel Hotkey') }}</label>
        <div class="qs-hotkey-row">
          <div class="qs-hotkey-field"
            [class.recording]="hotkeyRecording"
            [class.has-value]="!!hotkeyBindingLabel && !hotkeyRecording">
            <button type="button" class="qs-hotkey-display"
              (click)="startHotkeyRecording($event)"
              [disabled]="!configService?.store"
              [title]="t('点击设置快捷键', 'Click to set shortcut')">
              <ng-container *ngIf="hotkeyRecording; else hotkeyIdle">
                {{ hotkeyRecordingPreview || t('按下按键...', 'Press keys...') }}
              </ng-container>
              <ng-template #hotkeyIdle>
                {{ hotkeyBindingLabel || t('未绑定', 'Unbound') }}
              </ng-template>
            </button>
            <button type="button" class="qs-hotkey-clear" *ngIf="hotkeyRecording"
              (click)="cancelHotkeyRecording(); $event.stopPropagation()" [title]="t('取消', 'Cancel')">&#x2715;</button>
            <button type="button" class="qs-hotkey-clear" *ngIf="!hotkeyRecording && hotkeyBindingLabel"
              (click)="clearHotkeyBinding(); $event.stopPropagation()" [title]="t('清除', 'Clear')">&#x2715;</button>
          </div>
        </div>
        <div class="qs-hint qs-hotkey-ok" *ngIf="hotkeySaveMessage">{{ hotkeySaveMessage }}</div>
      </div>

      <!-- 功能 -->
      <div class="qs-section">
        <label class="qs-label">{{ t('功能', 'Features') }}</label>
        <div class="qs-toggle-row" (click)="toggleHideAuthorInfo()">
          <span class="qs-toggle-label">{{ t('隐藏插件作者信息', 'Hide plugin author info') }}</span>
          <span class="qs-toggle-track" [class.active]="hideAuthorInfo">
            <span class="qs-toggle-thumb"></span>
          </span>
        </div>
        <div class="qs-toggle-row" (click)="toggleHidePanelSettingsEntry()">
          <span class="qs-toggle-label">{{ t('隐藏面板设置入口', 'Hide panel settings entry') }}</span>
          <span class="qs-toggle-track" [class.active]="hidePanelSettingsEntry">
            <span class="qs-toggle-thumb"></span>
          </span>
        </div>
        <div class="qs-toggle-row" (click)="toggleScrollSnap()"
          [title]="t('开启后，列表滚动停止时会自动对齐到整行，避免条目被裁掉一半；关闭则保持原生滚动', 'When on, the list snaps to whole rows after scrolling stops, so entries are not cut in half.')">
          <span class="qs-toggle-label">{{ t('滚动时对齐整行', 'Align rows when scrolling') }}</span>
          <span class="qs-toggle-track" [class.active]="scrollSnapEnabled">
            <span class="qs-toggle-thumb"></span>
          </span>
        </div>
      </div>

      <!-- 数据（保持在关于上方） -->
      <div class="qs-section">
        <label class="qs-label">{{ t('数据', 'Data') }}</label>

        <div class="qs-backup-row">
          <button class="qs-btn" (click)="openExportDialog()">[&darr;] {{ t('导出数据', 'Export') }}</button>
          <label class="qs-btn qs-btn-import">[&uarr;] {{ t('导入数据', 'Import') }}
            <input type="file" accept=".json" (change)="onImport($event)" style="display:none" />
          </label>
          <button class="qs-btn qs-btn-danger" (click)="openClearConfirm()">[&times;] {{ t('清空数据', 'Clear All') }}</button>
        </div>
      </div>

      <!-- 关于 -->
      <div class="qs-section">
        <label class="qs-label">{{ t('关于', 'About') }}</label>
        <div class="qs-about-row">
          <span class="qs-about-item">{{ t('版本', 'Version') }}: {{ pkgVersion }}</span>
          <span class="qs-about-item">{{ t('构建时间', 'Build Time') }}: {{ formatBuildTime() }}</span>
          <span class="qs-about-item" *ngIf="!hideAuthorInfo">{{ t('作者', 'Author') }}: DD1024z</span>
        </div>
        <div class="qs-about-row qs-about-links">
          <span class="qs-about-link" (click)="openGithub()">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>
            <span class="qs-about-label">{{ t('Github源码', 'GitHub Source') }}</span>
          </span>
          <!-- NPM 包链接（对齐 SFTP+：位于「GitHub源码」右侧，图标用内置 npm.svg，非文字徽标） -->
          <span class="qs-about-link" (click)="openNpm()">
            <img class="qs-about-icon" [src]="'file://' + bundledIconPreviewPath('npm.svg')"
              alt="" aria-hidden="true" draggable="false" />
            <span class="qs-about-label">{{ t('NPM源码', 'NPM Source') }}</span>
          </span>
          <!-- 赞助入口（ko-fi）：对齐 SFTP+，置于「点赞支持」左侧；
               ⛔ 英文写 Treat me to a coffee，不用 Buy me a coffee（后者是注册商标） -->
          <span class="qs-about-link" (click)="openKofi()">
            <img class="qs-about-icon" [src]="'file://' + bundledIconPreviewPath('kofi.svg')"
              alt="" aria-hidden="true" draggable="false" />
            <span class="qs-about-label">{{ t('请喝咖啡', 'Treat me to a coffee') }}</span>
          </span>
          <span class="qs-about-link" (click)="openGithub()">
            ⭐ <span class="qs-about-label">{{ t('点赞支持', 'Give a Star') }}</span>
          </span>
          <span class="qs-about-link" (click)="openBugReport()">
            🐞 <span class="qs-about-label">{{ t('报告问题', 'Report a Bug') }}</span>
          </span>
          <span class="qs-about-link" (click)="openFeatureRequest()">
            💡 <span class="qs-about-label">{{ t('提出需求', 'Feature Request') }}</span>
          </span>
        </div>
      </div>
    </div>

    <!-- 主题颜色修改确认弹窗 -->
    <div class="qc-overlay" *ngIf="showThemeColorConfirm" (click)="cancelThemeColorOverwrite()"
      [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
      <div class="qc-edit-modal" [class.qc-dark]="isDarkMode" [class.qc-light]="!isDarkMode" (click)="$event.stopPropagation()">
        <div class="qc-edit-title">{{ t('⚠️ 修改配色', '⚠️ Modify Colors') }}</div>
        <div class="qc-edit-field">
          <p style="font-size:13px; line-height:1.6; margin:0 0 12px 0;">
            {{ t('当前为自动/预设模式，修改将覆盖到自定义配色方案中。是否继续？', 'You are in Auto/Preset mode. Changes will overwrite the custom color scheme. Continue?') }}
          </p>
        </div>
        <div class="qc-edit-footer">
          <button class="qs-btn qs-btn-danger" (click)="confirmThemeColorOverwrite()">{{ t('确认覆盖', 'Overwrite') }}</button>
          <button class="qs-btn" (click)="cancelThemeColorOverwrite()">{{ t('取消', 'Cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- 隐藏插件作者信息确认弹窗（点击开启时已自动打开仓库链接，需点「我已点 Star 支持」才生效） -->
    <div class="qc-overlay" *ngIf="showHideAuthorConfirm" (click)="cancelHideAuthor()"
      [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
      <div class="qc-edit-modal" [class.qc-dark]="isDarkMode" [class.qc-light]="!isDarkMode" (click)="$event.stopPropagation()">
        <div class="qc-edit-title">⭐ {{ t('隐藏插件作者信息', 'Hide plugin author info') }}</div>
        <div class="qc-edit-field">
          <p style="font-size:13px; line-height:1.6; margin:0 0 12px 0;">
            {{ t('隐藏作者信息前，请先为插件仓库点 Star 支持一下。仓库页面已在浏览器中打开。您的点赞支持是我开发的动力，感谢支持！🙏', 'Before hiding the author info, please star the plugin repository to show your support. The repository page has been opened in your browser. Your star is what keeps me developing — thank you for your support! 🙏') }}
          </p>
          <span class="qs-about-link" (click)="openGithub()">⭐ <span class="qs-about-label">{{ t('点赞支持', 'Give a Star') }}</span></span>
        </div>
        <div class="qc-edit-footer">
          <button class="qs-btn qs-btn-danger" (click)="confirmHideAuthor()">{{ t('我已点 Star 支持', 'I have starred') }}</button>
          <button class="qs-btn" (click)="cancelHideAuthor()">{{ t('取消', 'Cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- 清空数据确认弹窗 -->
    <div class="qc-overlay" *ngIf="showClearConfirm" (click)="closeClearConfirm()"
      [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
      <div class="qc-edit-modal" [class.qc-dark]="isDarkMode" [class.qc-light]="!isDarkMode" (click)="$event.stopPropagation()">
        <div class="qc-edit-title" style="color:var(--primary-color,#e24b4a);">{{ t('⚠️ 清空数据', '⚠️ Clear All Data') }}</div>
        <div class="qc-edit-field">
          <p style="font-size:13px; line-height:1.6; margin:0 0 12px 0;">
            {{ t('此操作将删除所有命令和分组数据，不可撤销！', 'This will delete all commands and groups, and cannot be undone!') }}
          </p>
          <label style="font-size:12px; opacity:.8;">
            {{ t('请输入 DELETE 确认：', 'Please type DELETE to confirm:') }}
          </label>
          <input class="qc-edit-input" type="text" [(ngModel)]="clearConfirmInput"
            (keydown.enter)="doClearData()" placeholder="DELETE" #clearInput
            style="margin-top:6px; width:100%; box-sizing:border-box;" />
        </div>
        <div class="qc-edit-footer">
          <button class="qs-btn qs-btn-danger" (click)="doClearData()"
            [style.opacity]="clearConfirmInput !== 'DELETE' ? '0.5' : '1'"
            [disabled]="clearConfirmInput !== 'DELETE'">{{ t('清空', 'Clear') }}</button>
          <button class="qs-btn" (click)="closeClearConfirm()">{{ t('取消', 'Cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- ★ 2026-09-29：导出勾选弹窗（按配置类别选择要写入备份文件的内容） -->
    <div class="qc-overlay" *ngIf="showExportDialog" (click)="closeExportDialog()"
      [style.background]="isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(128,128,128,0.2)'">
      <div class="qc-edit-modal" [class.qc-dark]="isDarkMode" [class.qc-light]="!isDarkMode"
        (click)="$event.stopPropagation()" style="max-width:440px;">
        <div class="qc-edit-title">{{ t('导出数据', 'Export') }}</div>
        <div class="qc-edit-field">
          <p class="qs-export-desc">{{ t('选择要包含在导出文件中的内容。', 'Pick what to include in the export file.') }}</p>

          <label class="qs-export-item">
            <input type="checkbox" [(ngModel)]="exportPickCommands" class="qs-export-check" />
            <span class="qs-export-text">
              <span class="qs-export-name">{{ t('命令与分组', 'Commands and groups') }}</span>
            </span>
            <span class="qs-export-count">{{ exportCommandCount }} {{ t('条命令', 'commands') }} · {{ exportGroupCount }} {{ t('个分组', 'groups') }}</span>
          </label>

          <label class="qs-export-item">
            <input type="checkbox" [(ngModel)]="exportPickAppearance" class="qs-export-check" />
            <span class="qs-export-text">
              <span class="qs-export-name">{{ t('界面与外观', 'Interface and appearance') }}</span>
              <span class="qs-export-sub">{{ t('语言', 'Language') }} · {{ t('字体大小', 'Font Size') }}</span>
            </span>
          </label>

          <label class="qs-export-item">
            <input type="checkbox" [(ngModel)]="exportPickWindow" class="qs-export-check" />
            <span class="qs-export-text">
              <span class="qs-export-name">{{ t('窗口行为与位置', 'Window behavior and position') }}</span>
              <span class="qs-export-sub">{{ t('入口模式', 'Entry Mode') }} · {{ t('面板常驻', 'Keep panel open') }}</span>
            </span>
          </label>

          <div class="qs-export-foot">
            <button type="button" class="qs-btn-xs" (click)="toggleExportAll()">
              {{ exportAllPicked ? t('全不选', 'Clear Selection') : t('全选', 'Select All') }}
            </button>
          </div>
        </div>
        <div class="qc-edit-footer">
          <button class="qs-btn qs-btn-primary" (click)="exportData()"
            [disabled]="!exportPickCount">{{ t('导出数据', 'Export') }}</button>
          <button class="qs-btn" (click)="closeExportDialog()">{{ t('取消', 'Cancel') }}</button>
        </div>
      </div>
    </div>

    <!-- #14 修复：自定义确认弹窗（替代原生 confirm） -->
    <div class="qc-overlay" *ngIf="showClearConfirmModal" (click)="cancelClearConfirmModal()"></div>
    <div class="qc-edit-modal" *ngIf="showClearConfirmModal" (click)="$event.stopPropagation()" style="max-width:360px;">
      <div class="qc-edit-title">{{ _clearConfirmTitle }}</div>
      <div class="qc-edit-footer">
        <button class="qs-btn qs-btn-danger" (click)="doClearConfirmModal()">{{ t('确定', 'OK') }}</button>
        <button class="qs-btn" (click)="cancelClearConfirmModal()">{{ t('取消', 'Cancel') }}</button>
      </div>
    </div>
  `,
  styles: [`
    .qc-settings-page { padding:20px; max-width:600px; }
    .qs-title { color:var(--primary-color,#3b82f6); font-size:18px; margin-bottom:6px; }
    .qs-desc { opacity:.7; font-size:13px; line-height:1.6; margin-bottom:24px; }
    .qs-section { border-top:1px solid rgba(128,128,128,0.2); padding-top:16px; margin-bottom:16px; }
    .qs-section-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .qs-label { display:block; font-size:16px; font-weight:600; margin-bottom:10px; }
    .qs-select {
      width:100%; max-width:280px;
      padding:7px 10px; border-radius:6px;
      background: rgba(128,128,128,0.1);
      border:1px solid rgba(128,128,128,0.25);
      font-size:13px; cursor:pointer; outline:none;
      color: inherit;
    }
    .qs-select option { color: #000; background: #fff; }
    .qs-select:focus { border-color: var(--primary-color, #3b82f6); }
    .qs-hint { opacity:.6; font-size:11px; line-height:1.5; margin-top:6px; }

    /* 颜色主题 */
    .qs-color-row { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
    .qs-color-swatch {
      display:inline-flex; flex-direction:column; align-items:center; gap:4px;
      padding:8px; border-radius:10px; border:2px solid transparent;
      font-size:12px; font-weight:500; cursor:pointer; transition:border-color .15s;
      min-width:80px;
    }
    .qs-color-swatch:hover { opacity:.85; }
    .qs-color-active { border-color: var(--primary-color,#3b82f6) !important; box-shadow:0 0 0 1px rgba(59,130,246,.3); }
    .qs-color-swatch-name { font-size:11px; font-weight:600; }
    .qs-color-swatch-preview {
      display:flex; flex-direction:column; border-radius:6px; overflow:hidden;
      width:72px; border:1px solid rgba(128,128,128,.2);
    }
    .qs-cp-title { display:block; padding:3px 6px; font-size:8px; font-weight:600; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
    .qs-cp-body { display:block; padding:4px 6px; font-size:8px; font-family:monospace; min-height:18px; }
    .qs-cp-line { display:block; line-height:1.4; }
    .qs-cp-accent { display:inline-block; width:12px; height:3px; border-radius:2px; margin-top:2px; }
    .qs-color-fields { display:flex; gap:16px; flex-wrap:wrap; align-items:flex-start; margin-top:8px; }
    .qs-color-field { display:flex; flex-direction:column; gap:3px; }
    .qs-color-field label { font-size:12px; font-weight:500; }
    .qs-color-input { width:44px; height:30px; border:none; border-radius:6px; cursor:pointer; }
    .qs-color-val { font-size:11px; font-family:monospace; opacity:.6; }

    /* 命令列表 */
    .qs-empty { padding:24px; text-align:center; opacity:.5; font-size:13px; }
    .qs-cmd-item { padding:10px; margin-bottom:8px; border:1px solid rgba(128,128,128,0.2); border-radius:8px; }
    .qs-cmd-top { display:flex; align-items:center; gap:8px; }
    .qs-cmd-info { display:flex; align-items:center; gap:6px; flex-wrap:wrap; flex:1; min-width:0; }
    .qs-cmd-name { font-weight:500; font-size:14px; flex-shrink:0; }
    .qs-cmd-badge { background: var(--primary-color,#3b82f6); color:#fff; padding:1px 8px; border-radius:10px; font-size:11px; flex-shrink:0; }
    .qs-cmd-shortcut { background: rgba(128,128,128,0.15); padding:1px 6px; border-radius:4px; font-size:11px; font-family:monospace; flex-shrink:0; }
    .qs-cmd-text { background: rgba(128,128,128,0.08); padding:6px 10px; border-radius:4px; font-family:monospace; font-size:12px; white-space:pre-wrap; margin:6px 0 0; overflow-x:auto; }
    .qs-cmd-text-inline { font-family:monospace; font-size:11px; opacity:.55; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:60px; flex:1; cursor:default; }
    .qs-cmd-actions { display:flex; gap:4px; flex-shrink:0; }
    .qs-btn-xs { padding:2px 8px; border-radius:4px; border:1px solid rgba(128,128,128,0.2); background:rgba(128,128,128,0.06); font-size:11px; cursor:pointer; color:inherit; line-height:1.4; }
    .qs-btn-xs:hover { background: rgba(128,128,128,0.15); }
    .qs-btn-xs-danger { border-color:#e24b4a; color:#e24b4a; }
    .qs-btn-xs-danger:hover { background: rgba(226,75,74,0.1); }

    /* 分组 */
    .qs-group-item { display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px solid rgba(128,128,128,0.1); font-size:13px; }
    .qs-group-actions { display:flex; gap:6px; }

    /* 按钮 */
    .qs-btn {
      display:inline-flex; align-items:center; gap:6px;
      padding:6px 16px; border-radius:8px;
      border:1px solid rgba(128,128,128,0.25);
      background: rgba(128,128,128,0.08);
      font-size:13px; cursor:pointer; transition:background .15s;
      color: inherit;
    }
    .qs-btn:hover { background: rgba(128,128,128,0.15); }
    .qs-btn-primary { background: var(--primary-color,#3b82f6); color:#fff; border-color:var(--primary-color,#3b82f6); }
    .qs-btn-primary:hover { opacity:.85; }
    .qs-btn-danger { border-color:#e24b4a; color:#e24b4a; }
    .qs-btn-danger:hover { background: rgba(226,75,74,0.1); }
    .qs-btn-sm { padding:4px 12px; border-radius:6px; border:1px solid rgba(128,128,128,0.25); background: rgba(128,128,128,0.08); font-size:12px; cursor:pointer; color: inherit; }
    .qs-btn-sm:hover { background: rgba(128,128,128,0.15); }
    .qs-btn-sm-danger { border-color:#e24b4a; color:#e24b4a; }
    .qs-btn-sm-danger:hover { background: rgba(226,75,74,0.1); }
    .qs-btn-import { cursor:pointer; }
    .qs-backup-row { display:flex; gap:10px; flex-wrap:wrap; margin-top:4px; }

    /* 入口模式选择 - Tabby 风格 pill 切换 */
    .qs-entry-mode-row { margin-top:8px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .qs-pills { display:flex; gap:0; border-radius:6px; overflow:hidden; border:1px solid var(--border-color,rgba(128,128,128,0.3)); width:fit-content; }
    .qs-pill {
      padding:5px 14px; font-size:13px; cursor:pointer;
      background:transparent; transition:all .15s;
      user-select:none; white-space:nowrap;
    }
    .qs-pill:not(:last-child) { border-right:1px solid var(--border-color,rgba(128,128,128,0.3)); }
    .qs-pill:hover { background:rgba(128,128,128,0.08); }
    .qs-pill-active { background:var(--primary-color,#3b82f6); color:#fff; }

    /* Toggle 开关样式 - 参考 SFTP+ 风格 */
    .qs-toggle-row {
      display:flex; align-items:center; justify-content:space-between;
      /* 水平内距用「负外边距抵消」：文字与同页其它行（字体大小 / 入口模式 / section 标题）保持同一条
         左基准线，同时 hover 背景仍向两侧外扩 10px。原先只有 padding-left:10px，导致开关行的
         label 比其它行右缩 10px（「面板常驻有缩进」的观感来源）。 */
      padding:8px 10px; margin:8px -10px 0;
      border-radius:6px;
      font-size:13px; cursor:pointer; user-select:none;
    }
    .qs-toggle-row:hover { background:rgba(128,128,128,0.06); }
    .qs-toggle-label { font-size:13px; line-height:1.4; }
    .qs-toggle-track {
      position:relative; flex-shrink:0;
      width:36px; height:20px; border-radius:10px;
      background:rgba(128,128,128,0.25);
      transition:background .2s; cursor:pointer;
    }
    .qs-toggle-track.active { background:var(--primary-color,#3b82f6); }
    .qs-toggle-thumb {
      position:absolute; top:2px; left:2px;
      width:16px; height:16px; border-radius:50%;
      background:#fff; transition:transform .2s;
    }
    .qs-toggle-track.active .qs-toggle-thumb { transform:translateX(16px); }

    /* 字体大小 */
    .qs-font-row { margin-top:12px; display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .qs-font-label { font-size:13px; font-weight:500; }
    .qs-font-control { display:flex; align-items:center; gap:10px; }
    .qs-font-val { font-size:13px; min-width:30px; opacity:.6; font-variant-numeric:tabular-nums; }

    /* range 滑块 — 保持浏览器原生样式 */
    .qs-range { flex:1; max-width:160px; margin:0; cursor:pointer; background:none; border:none; outline:none; }

    /* 重置执行次数按钮行 — 与上方开关右缘对齐 */
    .qs-reset-row {
      display:flex; align-items:center; justify-content:flex-end;
      gap:8px; margin-top:2px; padding:0 10px;
    }
    .qs-mini-btn {
      padding:3px 10px; font-size:12px; border-radius:5px;
      border:1px solid var(--border-color,rgba(128,128,128,0.3)); background:transparent;
      color:inherit; cursor:pointer;
    }
    .qs-mini-btn:hover { background:rgba(128,128,128,0.12); }
    .qs-reset-msg { font-size:12px; opacity:.7; }

    /* 关于 */
    .qs-about-row { display:flex; gap:16px; flex-wrap:wrap; align-items:center; margin-top:4px; font-size:13px; }
    .qs-about-links { margin-top:8px; }
    .qs-about-item { opacity:.75; }
    .qs-about-link {
      display:inline-flex; align-items:center; gap:4px;
      cursor:pointer; opacity:.7; transition:opacity .15s;
    }
    .qs-about-link:hover { opacity:1; }
    .qs-about-link:hover .qs-about-label { text-decoration:underline; }
    /* 关于区图标（尺寸对齐 SFTP+ 的 .ss-about-link .ss-about-icon） */
    .qs-about-link .qs-about-icon { width:14px; height:14px; vertical-align:-2px; flex-shrink:0; }
    .qs-about-link svg { width:12px; height:12px; vertical-align:middle; flex-shrink:0; }

    /* 面板快捷键 */
    .qs-hotkey-row { margin-top:4px; }
    .qs-hotkey-field { display:inline-flex; align-items:center; border:1px solid var(--border-color,rgba(128,128,128,0.3)); border-radius:6px; overflow:hidden; }
    .qs-hotkey-field.has-value { border-color:var(--primary-color,#b4befe); }
    .qs-hotkey-field.recording {
      border-color:#f9e2af; box-shadow:0 0 0 1px #f9e2af;
      animation: qs-hotkey-pulse 1.2s ease-in-out infinite;
    }
    .qs-hotkey-display {
      all:unset; padding:6px 12px; cursor:pointer; font-size:13px;
      min-width:120px; text-align:center; background:var(--body-bg,transparent); color:var(--text-color,inherit);
    }
    .qs-hotkey-field.has-value .qs-hotkey-display,
    .qs-hotkey-field.recording .qs-hotkey-display { background:rgba(128,128,128,0.06); }
    .qs-hotkey-display:disabled { opacity:.45; cursor:not-allowed; }
    .qs-hotkey-clear { all:unset; padding:4px 8px; cursor:pointer; font-size:13px; opacity:.5; }
    .qs-hotkey-clear:hover { opacity:.9; background:rgba(128,128,128,0.14); }
    @keyframes qs-hotkey-pulse {
      0%,100% { opacity:1; } 50% { opacity:.6; }
    }
    .qs-hotkey-conflict { color:#e24b4a; opacity:.9; }
    .qs-hotkey-ok { color:#22a06b; opacity:.9; }

    /* 确认弹窗 */
    .qc-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:1048; display:flex; align-items:center; justify-content:center; }
    .qc-edit-modal {
      background:var(--body-bg,#313244); color:var(--text-color,#cdd6f4);
      border:1px solid var(--border-color,rgba(128,128,128,0.3)); border-radius:12px; padding:24px; z-index:1049;
      max-width:400px; width:90%;
      color:var(--text-color,#cdd6f4);
    }
    .qc-edit-modal.qc-dark { color:#fff; }
    .qc-edit-modal.qc-light { color:#222; }
    .qc-edit-modal p, .qc-edit-modal label { color:inherit; font-size:13px; line-height:1.6; }
    .qc-edit-modal p { margin:0 0 12px 0; }
    .qc-edit-modal label { font-size:12px; opacity:.8; display:block; margin-bottom:6px; }
    .qc-edit-title { font-size:16px; font-weight:600; margin-bottom:16px; color:inherit; }
    .qc-edit-field { margin-bottom:16px; }
    .qc-edit-input {
      width:100%; padding:8px 12px; border-radius:6px;
      border:1px solid rgba(128,128,128,0.3);
      background:rgba(0,0,0,0.2); color:inherit; font-size:13px; outline:none;
      box-sizing:border-box;
    }
    .qc-edit-input:focus { border-color:var(--primary-color,#3b82f6); }
    .qc-edit-footer { display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }

    /* ★ 2026-09-29：导出勾选弹窗。
       必须带 .qc-edit-modal 前缀提特异性 —— 上面的 .qc-edit-modal label（(0,1,1)）会压掉
       复选框行的 display/opacity/margin，只写 .qs-export-item（(0,1,0)）会失效。 */
    .qc-edit-modal .qs-export-desc { font-size:12px; opacity:.75; line-height:1.6; margin:0 0 12px 0; }
    .qc-edit-modal .qs-export-item {
      display:flex; align-items:center; gap:10px;
      padding:8px 10px; margin-bottom:6px;
      border:1px solid rgba(128,128,128,0.22); border-radius:8px;
      cursor:pointer; opacity:1; font-size:13px;
    }
    .qc-edit-modal .qs-export-item:hover { background: rgba(128,128,128,0.08); }
    .qs-export-check { width:15px; height:15px; flex-shrink:0; margin:0; cursor:pointer; accent-color: var(--primary-color,#3b82f6); }
    .qs-export-text { display:flex; flex-direction:column; gap:2px; flex:1; min-width:0; }
    .qs-export-name { font-size:13px; font-weight:500; }
    .qs-export-sub { font-size:11px; opacity:.6; line-height:1.4; }
    .qs-export-count { flex-shrink:0; font-size:11px; opacity:.6; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .qs-export-foot { display:flex; justify-content:flex-end; margin-top:8px; }
    .qs-btn:disabled { opacity:.45; cursor:not-allowed; }
  `],
})
export class QuickCommandSettingsComponent {
  // @ts-ignore — ts-loader 可能无法正确处理 JSON 模块类型
  /** 插件版本号（webpack 构建时内联 package.json） */
  readonly pkgVersion: string = require('../package.json').version
  /** 构建时间（webpack 每次 build 时注入，用于确认是否已重新打包） */
  readonly pkgBuildTime: string = typeof __QC_PLUS_BUILD_TIME__ !== 'undefined' ? __QC_PLUS_BUILD_TIME__ : ''

  /** 格式化构建时间为本地可读字符串 */
  formatBuildTime(): string {
    if (!this.pkgBuildTime) return '—'
    const d = new Date(this.pkgBuildTime)
    if (isNaN(d.getTime())) return this.pkgBuildTime
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  }

  commands: QuickCommand[] = []
  groups: QuickCommandGroup[] = []
  lang: '' | Locale = ''
  /** 语言下拉选项（24 语言，按语言代码排序） */
  locales = LOCALES
  /** i18n 服务实例（设置页文案经 .po 翻译） */
  i18n = new QuickCommandI18nService()

  // 颜色主题（含配色预览色值）
  colorThemes = [
    { value: '',       label: 'Auto',   bg: '#1a1d23', text: '#e8edf5', primary: '#b6b6c3', surface: '#252830', border: '#2d3242', muted: '#5a5f6f' },
    { value: 'dark',  label: 'Dark',  bg: '#1a1d23', text: '#e8edf5', primary: '#b6b6c3', surface: '#252830', border: '#2d3242', muted: '#5a5f6f' },
    { value: 'light', label: 'Light', bg: '#f0f4f8', text: '#333333', primary: '#2563eb', surface: '#e5e7eb', border: '#d1d5db', muted: '#9ca3af' },
    { value: 'blue',  label: 'Blue',  bg: '#0b1929', text: '#e0e7ff', primary: '#60a5fa', surface: '#172554', border: '#1e3a5f', muted: '#64748b' },
    { value: 'green', label: 'Green', bg: '#0a2016', text: '#d1fae5', primary: '#34d399', surface: '#14532d', border: '#166534', muted: '#6b7280' },
    { value: 'purple',label: 'Purple',bg: '#160e23', text: '#eaddff', primary: '#a78bfa', surface: '#2e1065', border: '#4c1d95', muted: '#7c3aed' },
    { value: 'red',   label: 'Red',    bg: '#1a0808', text: '#fecaca', primary: '#f87171', surface: '#450a0a', border: '#991b1b', muted: '#dc2626' },
    { value: 'custom',label: 'Custom', bg: '#1a1d23', text: '#e8edf5', primary: '#b6b6c3', surface: '#252830', border: '#2d3242', muted: '#5a5f6f' },
  ]
  colorTheme: string = ''
  colorPrimary: string = ''
  colorBg: string = ''
  colorText: string = ''
  colorSurface: string = ''
  colorBorder: string = ''
  colorMuted: string = ''

  // 字体大小（px）
  fontSize: number = 14

  // 入口模式（默认工具栏按钮）
  entryMode: 'floating' | 'toolbar' = 'toolbar'
  // 面板常驻（开启后执行命令不自动关闭面板）
  pinPanel = true
  /** 面板整体透明度（0.5–1），默认 1 */
  panelOpacity = 1
  // 「功能」分组：隐藏关于区作者信息 / 隐藏面板设置入口
  hideAuthorInfo = false
  hidePanelSettingsEntry = false
  /** 滚动停止后是否把列表吸附到整行（默认关闭，避免改变用户既有的滚动手感） */
  scrollSnapEnabled = false
  /** 面板排序模式：manual = 拖拽顺序；name = 按名称；usage = 按执行次数 */
  sortMode: 'manual' | 'name' | 'usage' = 'manual'
  /** 隐藏作者信息确认弹窗（开启需点 Star 确认，对齐 SFTP+） */
  showHideAuthorConfirm = false
  /** 重置执行次数后的提示文字 */
  usageResetMsg = ''
  private _usageResetMsgTimer: ReturnType<typeof setTimeout> | null = null

  /** 主题颜色修改确认弹窗 */
  showThemeColorConfirm = false
  private _pendingColorKey = ''
  private _pendingColorVal = ''
  private _pendingOrigTheme = ''

  // 面板快捷键
  hotkeyRecording = false
  hotkeyRecordingPreview = ''
  hotkeyConflictNames = ''
  hotkeySaveMessage = ''
  private _hotkeyStrokeSub: { unsubscribe(): void } | null = null
  private _hotkeyKeyEventSub: { unsubscribe(): void } | null = null
  private _hotkeyDomHandler: ((ev: KeyboardEvent) => void) | null = null
  private _hotkeyCommitTimer: ReturnType<typeof setTimeout> | null = null
  private _hotkeySafetyTimer: ReturnType<typeof setTimeout> | null = null
  private _hotkeyMsgTimer: ReturnType<typeof setTimeout> | null = null
  private _hotkeyDescCache: Record<string, string> = {}
  private _hotkeyDisableHeld = false
  private _pendingHotkeyStrokes: string[] = []
  private _pendingHotkeyTimer: ReturnType<typeof setTimeout> | null = null

  /** 判断当前是否为深色模式（读取 Tabby CSS 变量亮度） */
  get isDarkMode(): boolean {
    try {
      const textColor = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
      if (textColor) {
        const lum = parseColorLuminance(textColor)
        if (lum >= 0) return lum > 128
      }
      const bodyBg = getComputedStyle(document.documentElement).getPropertyValue('--body-bg').trim()
      if (bodyBg) {
        const lum = parseColorLuminance(bodyBg)
        if (lum >= 0) return lum < 128
      }
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  /** 存储模式：仅使用 Tabby 配置存储 */
  storageMode = 'config'

  private svc: QuickCommandService

  // 清空数据确认弹窗
  showClearConfirm = false
  clearConfirmInput = ''

  // #14 修复：自定义确认弹窗（替代原生 confirm）
  showClearConfirmModal = false
  _clearConfirmTitle = ''
  private _clearConfirmCallback: (() => void) | null = null

  /**
   * ★ 2026-09-29：导出勾选弹窗 —— 按配置类别选择要写入备份文件的内容（默认全勾）。
   * 未勾选的类别不会写进 JSON；导入侧本来就是「字段不存在 = 不覆盖」的语义
   * （onImport 逐字段判 undefined），所以「只导外观」的备份导入时不会动到命令数据。
   */
  showExportDialog = false
  exportPickCommands = true
  exportPickAppearance = true
  exportPickWindow = true

  /** 已勾选的类别数（0 → 禁用「导出数据」按钮，避免导出空文件） */
  get exportPickCount(): number {
    return (this.exportPickCommands ? 1 : 0) + (this.exportPickAppearance ? 1 : 0) + (this.exportPickWindow ? 1 : 0)
  }

  /** 三类是否全勾（决定底部按钮显示「全选」还是「全不选」） */
  get exportAllPicked(): boolean {
    return this.exportPickCount === 3
  }

  /** 弹窗里展示的命令/分组数量（数字动态，不进 i18n，避免出现「12 条命令」这种一次性 key） */
  get exportCommandCount(): number {
    try { return this.svc.getAll().length } catch { return 0 }
  }

  get exportGroupCount(): number {
    try { return this.svc.getGroups().length } catch { return 0 }
  }

  /** 打开导出勾选弹窗；每次都回到全选，避免上次的勾选残留导致「以为全导出了其实没有」 */
  openExportDialog(): void {
    this.exportPickCommands = true
    this.exportPickAppearance = true
    this.exportPickWindow = true
    this.showExportDialog = true
  }

  closeExportDialog(): void {
    this.showExportDialog = false
  }

  /** 全选 / 全不选一键切换 */
  toggleExportAll(): void {
    const next = !this.exportAllPicked
    this.exportPickCommands = next
    this.exportPickAppearance = next
    this.exportPickWindow = next
  }

  doClearConfirmModal(): void {
    this.showClearConfirmModal = false
    if (this._clearConfirmCallback) {
      this._clearConfirmCallback()
      this._clearConfirmCallback = null
    }
  }

  cancelClearConfirmModal(): void {
    this.showClearConfirmModal = false
    this._clearConfirmCallback = null
  }

  /** 当前生效语言（含自动检测） */
  get effectiveLang(): Locale {
    return this.i18n.getLocale()
  }

  get namedGroups(): QuickCommandGroup[] {
    return this.groups.filter(g => g.name)
  }

  /**
   * 设置页文案翻译：以中文串作 msgid 查 .po（24 语言）。
   * 若 .po 无对应译文，退回旧的中/英双语行为（en 参数兜底）。
   */
  t(zh: string, en?: string): string {
    const tr = this.i18n.t(zh)
    if (tr && tr !== zh) return tr
    if (en && this.i18n.getLocale().startsWith('en')) return en
    return zh
  }

  /** 获取颜色主题的本地化名称 */
  themeLabel(c: any): string {
    const labels: Record<string, [string, string]> = {
      '':      ['自动', 'Auto'],
      'dark':  ['深色', 'Dark'],
      'light': ['浅色', 'Light'],
      'blue':  ['蓝色', 'Blue'],
      'green': ['绿色', 'Green'],
      'purple':['紫色', 'Purple'],
      'red':   ['红色', 'Red'],
      'custom':['自定义', 'Custom'],
    }
    const pair = labels[c.value]
    if (pair) return this.t(pair[0], pair[1])
    return c.label || ''
  }

  constructor(
    @Optional() public configService?: ConfigService,
    @Optional() private hotkeys?: HotkeysService,
    // ★ 2026-09-24：意见反馈预填环境信息（对齐 Tabby 原生「报告问题」）
    @Optional() @Inject('BOOTSTRAP_DATA') private bootstrapData?: any,
    @Optional() private platformService?: PlatformService,
    @Optional() private hostApp?: HostAppService,
  ) {
    this.svc = new QuickCommandService(configService)
    this._readFromConfig()
    // 同步 i18n 实例到已保存语言（设置页文案随之切换）
    this.i18n.setLocale(this.lang || 'auto')
    this.refresh()
    // 应用已保存的颜色主题
    if (this.colorPrimary && this.colorBg && this.colorText) {
      const root = document.documentElement
      root.style.setProperty('--qc-primary', this.colorPrimary)
      root.style.setProperty('--qc-bg', this.colorBg)
      root.style.setProperty('--qc-text', this.colorText)
      if (this.colorBorder) root.style.setProperty('--qc-border', this.colorBorder)
      if (this.colorSurface) root.style.setProperty('--qc-surface', this.colorSurface)
      // 无 hover/inputBg/textMuted 时回退
      root.style.setProperty('--qc-hover', this.colorBorder || this.colorBg)
      root.style.setProperty('--qc-input-bg', this.colorBg || '#1a1d23')
      root.style.setProperty('--qc-text-muted', this.colorMuted || this.colorText)
    }
    // 应用已保存的字体大小
    if (this.fontSize && this.fontSize !== 14) {
      document.documentElement.style.setProperty('--qc-font-size', this.fontSize + 'px')
    }
    // 面板侧也能改「面板常驻」（标题栏图钉）⇒ 监听它派发的事件，让设置页 UI 与面板保持一致
    try { window.addEventListener('qc-plus-config-changed', this._onPanelConfigChanged) } catch { /* ignore */ }
  }

  /** 面板侧改动偏好（目前只有图钉=面板常驻）时，同步设置页开关的显示状态 */
  private _onPanelConfigChanged = (ev: Event): void => {
    try {
      const detail = (ev as CustomEvent).detail || {}
      if (typeof detail.pinPanel === 'boolean') this.pinPanel = detail.pinPanel
    } catch { /* ignore */ }
  }

  ngOnDestroy(): void {
    try { window.removeEventListener('qc-plus-config-changed', this._onPanelConfigChanged) } catch { /* ignore */ }
  }

  /** 从 Tabby 配置加载所有设置 */
  private _readFromConfig(): void {
    try {
      const cfg = this.configService?.store?.['tabby-quick-command-plus']
      if (!cfg) return
      if (cfg.lang !== undefined) this.lang = cfg.lang as '' | Locale
      if (cfg.fontSize !== undefined) this.fontSize = cfg.fontSize as number
      if (cfg.entryMode !== undefined) this.entryMode = cfg.entryMode as 'floating' | 'toolbar'
      if (cfg.pinPanel !== undefined) this.pinPanel = !!cfg.pinPanel
      if (cfg.panelOpacity !== undefined) this.panelOpacity = Math.min(1, Math.max(0.5, Number(cfg.panelOpacity)))
      if (cfg.hideAuthorInfo !== undefined) this.hideAuthorInfo = !!cfg.hideAuthorInfo
      if (cfg.hidePanelSettingsEntry !== undefined) this.hidePanelSettingsEntry = !!cfg.hidePanelSettingsEntry
      if (cfg.scrollSnapEnabled !== undefined) this.scrollSnapEnabled = !!cfg.scrollSnapEnabled
      if (cfg.sortMode === 'manual' || cfg.sortMode === 'name' || cfg.sortMode === 'usage') this.sortMode = cfg.sortMode
      if (cfg.theme !== undefined) this.colorTheme = cfg.theme as string
      if (cfg.colorPrimary !== undefined) this.colorPrimary = cfg.colorPrimary as string
      if (cfg.colorBg !== undefined) this.colorBg = cfg.colorBg as string
      if (cfg.colorText !== undefined) this.colorText = cfg.colorText as string
      if (cfg.colorSurface !== undefined) this.colorSurface = cfg.colorSurface as string
      if (cfg.colorBorder !== undefined) this.colorBorder = cfg.colorBorder as string
      if (cfg.colorMuted !== undefined) this.colorMuted = cfg.colorMuted as string
      // 命令和分组
      if (Array.isArray(cfg.commands)) { this.svc['commands'] = cfg.commands; this.svc['saveCommands']() }
      if (Array.isArray(cfg.groups)) { this.svc['groups'] = cfg.groups; this.svc['saveGroups']() }
      // 位置记忆
      if (cfg.entryPos) localStorage.setItem('qc-plus-entry-pos', JSON.stringify(cfg.entryPos))
      if (cfg.panelPos) localStorage.setItem('qc-plus-panel-pos', JSON.stringify(cfg.panelPos))
      if (cfg.posMemoryByProfile) {
        for (const [k, v] of Object.entries(cfg.posMemoryByProfile as Record<string, any>)) {
          localStorage.setItem(k, JSON.stringify(v))
        }
      }
    } catch { /* ignore */ }
  }

  /**
   * 将当前所有设置写入 config.store
   */
  private _saveToConfig(): void {
    if (!this.configService) return
    try {
      const target = this.configService.store['tabby-quick-command-plus']
      if (!target) return
      target.lang = this.lang
      target.commands = this.svc.getAll()
      target.groups = this.svc.getGroups()
      target.fontSize = this.fontSize
      target.entryMode = this.entryMode
      target.pinPanel = this.pinPanel
      target.panelOpacity = this.panelOpacity
      target.hideAuthorInfo = this.hideAuthorInfo
      target.hidePanelSettingsEntry = this.hidePanelSettingsEntry
      target.scrollSnapEnabled = this.scrollSnapEnabled
      target.sortMode = this.sortMode
      target.theme = this.colorTheme
      target.colorPrimary = this.colorPrimary
      target.colorBg = this.colorBg
      target.colorText = this.colorText
      target.colorSurface = this.colorSurface
      target.colorBorder = this.colorBorder
      target.colorMuted = this.colorMuted
      // 位置数据同步（从 localStorage 读取写入 config）
      try {
        const entryPos = localStorage.getItem('qc-plus-entry-pos')
        if (entryPos) target.entryPos = JSON.parse(entryPos)
        const panelPos = localStorage.getItem('qc-plus-panel-pos')
        if (panelPos) target.panelPos = JSON.parse(panelPos)
        // 按连接的位置记忆
        const posMems: Record<string, any> = {}
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('qc-plus-pos-memory-')) {
            try { posMems[key] = JSON.parse(localStorage.getItem(key)!) } catch {}
          }
        }
        if (Object.keys(posMems).length) target.posMemoryByProfile = posMems
      } catch {}
      this.configService.save()
    } catch (e) {
      console.error('[QC+] Failed to save to config', e)
    }
  }

  /**
   * 切换存储模式时迁移数据
   */
  /** 确认：将自动/预设配色复制到自定义并应用修改 */
  confirmThemeColorOverwrite(): void {
    const orig = this._pendingOrigTheme
    const activeTheme = orig ? this.colorThemes.find(t => t.value === orig) : null
    if (!orig) {
      // Auto 模式 → 取 dark 或 light 预设
      const autoTheme = this.colorThemes.find(t => t.value === 'dark') || this.colorThemes[1]
      if (autoTheme) {
        this.colorPrimary = autoTheme.primary
        this.colorBg = autoTheme.bg
        this.colorText = autoTheme.text
        this.colorSurface = autoTheme.surface
        this.colorBorder = autoTheme.border
        this.colorMuted = autoTheme.muted
      }
    } else if (activeTheme) {
      this.colorPrimary = activeTheme.primary
      this.colorBg = activeTheme.bg
      this.colorText = activeTheme.text
      this.colorSurface = activeTheme.surface
      this.colorBorder = activeTheme.border
      this.colorMuted = activeTheme.muted
    }
    this.colorTheme = 'custom'
    // 应用待修改的颜色值
    const map: Record<string, string> = {
      primary: this.colorPrimary, bg: this.colorBg, text: this.colorText,
      surface: this.colorSurface, border: this.colorBorder, muted: this.colorMuted,
    }
    map[this._pendingColorKey] = this._pendingColorVal
    ;({ primary: this.colorPrimary, bg: this.colorBg, text: this.colorText,
       surface: this.colorSurface, border: this.colorBorder, muted: this.colorMuted } = map)
    const vars = {
      primary: this.colorPrimary, bg: this.colorBg, text: this.colorText,
      border: this.colorBorder, surface: this.colorSurface, hover: this.colorBorder,
      inputBg: this.colorBg, textMuted: this.colorMuted,
    }
    this.saveColorVars(vars)
    this.updateCustomPreview()
    this.persistThemeSnapshot('custom')
    this._saveToConfig()
    this.notifyPanels()
    this.showThemeColorConfirm = false
  }

  /** 取消：关闭弹窗，不应用修改 */
  cancelThemeColorOverwrite(): void {
    this.showThemeColorConfirm = false
    this._pendingColorKey = ''
    this._pendingColorVal = ''
    this._refreshColorInputs()
  }

  /** 刷新颜色输入框，确保取消后恢复到原值 */
  private _refreshColorInputs(): void {
    if (!this.colorTheme || this.colorTheme === 'custom') {
      // 从 config 重新加载
      this._readFromConfig()
    } else {
      const p = this.colorThemes.find(t => t.value === this.colorTheme)
      if (p) {
        this.colorPrimary = p.primary
        this.colorBg = p.bg
        this.colorText = p.text
        this.colorSurface = p.surface
        this.colorBorder = p.border
        this.colorMuted = p.muted
      }
    }
  }

  private refresh(): void {
    this.commands = this.svc.getAll()
    this.groups = this.svc.getGroups()
    this.notifyPanels()
  }

  /** 通知所有浮动面板数据或语言已变更 */
  private notifyPanels(): void {
    try { window.dispatchEvent(new CustomEvent('qc-plus-data-changed')) } catch {}
  }

  onLangChange(): void {
    // 同步 i18n 实例（立即使设置页文案切换到目标语言）
    this.i18n.setLocale(this.lang || 'auto')
    window.dispatchEvent(new CustomEvent('qc-plus-locale-changed', { detail: this.lang || 'auto' }))
    this._saveToConfig()
    this.notifyPanels()
  }

  onFontSizeChange(val: number): void {
    this.fontSize = Math.max(11, Math.min(18, val))
    localStorage.setItem('qc-plus-font-size', String(this.fontSize))
    const root = document.documentElement
    root.style.setProperty('--qc-font-size', this.fontSize + 'px')
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 面板透明度百分比（用于 range 滑块显示） */
  get panelOpacityPercent(): number {
    return Math.round(this.panelOpacity * 100)
  }

  /** 面板透明度变更（50%–100%，防抖保存） */
  onPanelOpacityChange(val: number): void {
    this.panelOpacity = Math.min(1, Math.max(0.5, Number.isFinite(val) ? val / 100 : 1))
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 设置排序模式 */
  setSortMode(mode: 'manual' | 'name' | 'usage'): void {
    if (this.sortMode === mode) return
    this.sortMode = mode
    this._saveToConfig()
    // 通知面板排序模式变更
    window.dispatchEvent(new CustomEvent('qc-plus-config-changed', { detail: { sortMode: this.sortMode } }))
  }

  /** 重置所有命令的执行次数 */
  resetUsageCount(): void {
    try {
      const n = this.svc.resetUsageCount()
      this.usageResetMsg = n > 0
        ? this.t('已重置 ' + n + ' 条命令的执行次数', 'Reset ' + n + ' command usage counts')
        : this.t('没有需要重置的命令', 'No commands to reset')
    } catch (e) {
      console.warn('[QC+] reset usage count failed:', e)
      this.usageResetMsg = this.t('重置失败', 'Reset failed')
    }
    if (this._usageResetMsgTimer) clearTimeout(this._usageResetMsgTimer)
    this._usageResetMsgTimer = setTimeout(() => {
      this._usageResetMsgTimer = null
      this.usageResetMsg = ''
    }, 2600)
  }

  onEntryModeChange(): void {
    this.svc.saveEntryMode(this.entryMode)
    this._saveToConfig()
    // 通过 window 事件通知所有面板入口模式变更
    window.dispatchEvent(new CustomEvent('qc-plus-entry-mode-changed', { detail: this.entryMode }))
  }

  togglePinPanel(): void {
    this.pinPanel = !this.pinPanel
    this._saveToConfig()
    // 通过 window 事件通知所有面板设置变更
    window.dispatchEvent(new CustomEvent('qc-plus-config-changed', { detail: { pinPanel: this.pinPanel } }))
  }

  /** 切换「隐藏插件作者信息」：关闭直接生效；开启需确认（先打开仓库链接，
   *   用户点「我已点 Star 支持」后才真正隐藏）—— 与 SFTP+ 的 toggleHideAuthorInfo 行为一致 */
  toggleHideAuthorInfo(): void {
    if (this.hideAuthorInfo) {
      this.hideAuthorInfo = false
      try { localStorage.setItem('qc-plus-hide-author', 'false') } catch { /* ignore */ }
      this._saveToConfig()
      return
    }
    this.openGithub()
    this.showHideAuthorConfirm = true
  }

  /** 确认隐藏作者信息（用户已点 Star 支持） */
  confirmHideAuthor(): void {
    this.showHideAuthorConfirm = false
    this.hideAuthorInfo = true
    try { localStorage.setItem('qc-plus-hide-author', 'true') } catch { /* ignore */ }
    this._saveToConfig()
  }

  cancelHideAuthor(): void { this.showHideAuthorConfirm = false }

  /** 切换「滚动吸附到整行」：通过 window 事件实时通知所有已打开的面板 */
  toggleScrollSnap(): void {
    this.scrollSnapEnabled = !this.scrollSnapEnabled
    try { localStorage.setItem('qc-plus-scroll-snap', String(this.scrollSnapEnabled)) } catch { /* ignore */ }
    this._saveToConfig()
    window.dispatchEvent(new CustomEvent('qc-plus-config-changed', { detail: { scrollSnapEnabled: this.scrollSnapEnabled } }))
  }

  /** 切换「隐藏面板设置入口」：通过 window 事件实时通知所有已打开的面板更新标题栏 */
  toggleHidePanelSettingsEntry(): void {
    this.hidePanelSettingsEntry = !this.hidePanelSettingsEntry
    try { localStorage.setItem('qc-plus-hide-entry-settings', String(this.hidePanelSettingsEntry)) } catch { /* ignore */ }
    this._saveToConfig()
    window.dispatchEvent(new CustomEvent('qc-plus-config-changed', { detail: { hidePanelSettingsEntry: this.hidePanelSettingsEntry } }))
  }

  /**
   * 插件内置图标目录（对齐 SFTP+ 的 resolveBundledIconDir 机制）。
   * 兼容三种布局：<plugin>/dist/assets/icons（标准安装 / 开发链接）、
   * <plugin>/assets/icons（把 dist 内容拷到插件根）、<plugin>/src/assets/icons（源码目录直链）。
   */
  private get _bundledIconDir(): string {
    try {
      const info = (this.bootstrapData?.installedPlugins as any[])?.find(
        (p: any) => p && p.packageName === 'tabby-quick-command-plus'
      )
      const base = info?.path ? String(info.path).replace(/\\/g, '/').replace(/\/+$/, '') : ''
      if (!base) return ''
      const candidates = [
        `${base}/dist/assets/icons`,
        `${base}/assets/icons`,
        `${base}/src/assets/icons`,
      ]
      return candidates.find(d => { try { return fs.existsSync(d) } catch { return false } }) || ''
    } catch {
      return ''
    }
  }

  /** 内置图标完整路径（模板前置 file:// 使用）；与 SFTP+ 的 bundledIconPreviewPath 同语义 */
  bundledIconPreviewPath(svg: string): string {
    const dir = this._bundledIconDir
    const file = (svg || '').trim().replace(/^\/+/, '')
    if (!dir || !file) return ''
    return dir + '/' + file
  }

  /**
   * 打开 NPM 包页面（对齐 SFTP+：关于区「GitHub源码」右侧新增入口）
   *   包名保持 tabby-quick-command-plus —— 它同时是 Tabby 的配置存储键，
   *   改名会导致已安装用户的命令数据（存在旧 key 下）读不到，故不改名。
   */
  openNpm(): void {
    const url = 'https://www.npmjs.com/package/tabby-quick-command-plus'
    try {
      ;(window as any).require('electron').shell.openExternal(url)
    } catch {
      try { window.open(url, '_blank') } catch { location.href = url }
    }
  }

  /** 打开 ko-fi 赞助页（关于区「请喝咖啡」，与 SFTP+ 用同一链接） */
  openKofi(): void {
    const url = 'https://ko-fi.com/dd1024z'
    try {
      ;(window as any).require('electron').shell.openExternal(url)
    } catch {
      try { window.open(url, '_blank') } catch { location.href = url }
    }
  }

  openGithub(): void {
    const url = 'https://github.com/10D24D/Tabby-QuickCmd-Plus'
    try {
      // Electron shell
      ;(window as any).require('electron').shell.openExternal(url)
    } catch {
      try {
        // 标准浏览器
        window.open(url, '_blank')
      } catch {
        // 兜底
        location.href = url
      }
    }
  }

  /**
   * 「报告问题」入口：预填环境信息后新建 issue（对齐 Tabby 原生「报告问题」）
   *   机制：GitHub 支持 https://github.com/<owner>/<repo>/issues/new?body=<urlencoded>
   *   纯 URL query 预填，无需 API/token；正文按界面语言双语（中文 + English）
   */
  openBugReport(): void {
    this._openIssue('bug')
  }

  /**
   * 「提出需求」入口：预填环境信息后新建 issue（双语正文，非中文用户也能看懂）
   */
  openFeatureRequest(): void {
    this._openIssue('feature')
  }

  /** 统一打开 issue：kind=bug 走缺陷正文，kind=feature 走需求正文；任一异常都回退为纯新建页 */
  private _openIssue(kind: 'bug' | 'feature'): void {
    let url = 'https://github.com/10D24D/Tabby-QuickCmd-Plus/issues/new'
    try {
      const body = this._buildIssueBody(kind)
      if (body) url += `?body=${encodeURIComponent(body)}`
    } catch { /* 组装失败则退化为空白新建页 */ }
    this._openExternal(url)
  }

  /**
   * 组装 issue 正文：用户填写模板 + 自动环境信息；正文双语（中文 + English）以覆盖非中文用户
   * 隐私红线：不采集主机名、用户名、文件路径、服务器地址等任何敏感字段
   */
  private _buildIssueBody(kind: 'bug' | 'feature'): string {
    const zh = String(this.i18n.getLocale() || '').toLowerCase().startsWith('zh')
    const lines: string[] = []
    if (kind === 'bug') {
      lines.push(zh ? '### 问题描述' : '### Description')
      lines.push(zh
        ? '<!-- 请描述遇到的问题：做了什么、期望什么、实际发生了什么（可附截图） -->'
        : '<!-- What you did, what you expected, what actually happened (screenshots welcome) -->')
      lines.push('')
      lines.push(zh ? '### 复现步骤' : '### Steps to reproduce')
      lines.push('1. ')
      lines.push('2. ')
    } else {
      lines.push(zh ? '### 功能需求' : '### Feature Request')
      lines.push(zh
        ? '<!-- 请描述使用场景与期望功能 -->'
        : '<!-- Describe the use case and expected feature -->')
      lines.push('')
      lines.push(zh ? '### 使用场景' : '### Use case')
      lines.push(zh ? '<!-- 当前痛点或使用场景是什么？ -->' : '<!-- What is the current pain point or use case? -->')
      lines.push('')
      lines.push(zh ? '### 期望功能' : '### Expected feature')
      lines.push(zh ? '<!-- 希望产品怎么做？ -->' : '<!-- How would you like the product to behave? -->')
    }
    lines.push('')
    lines.push('---')
    lines.push(zh ? '**环境信息**（插件自动填写，请保留）' : '**Environment** (auto-filled, please keep)')
    lines.push(...this._collectEnvLines())
    return lines.join('\n')
  }

  /** 打开外部链接：Electron shell 优先，失败回退浏览器 / location.href */
  private _openExternal(url: string): void {
    try {
      ;(window as any).require('electron').shell.openExternal(url)
    } catch {
      try {
        window.open(url, '_blank')
      } catch {
        try { location.href = url } catch { /* ignore */ }
      }
    }
  }

  /** 收集环境信息行（对齐 Tabby 原生 reportBug 的 Version/Platform/Plugins/Frontend 四项） */
  private _collectEnvLines(): string[] {
    return [
      `Version: tabby-quick-command-plus ${this.pkgVersion}`,
      `Tabby: ${this._safeStr(() => this.platformService?.getAppVersion?.())}`,
      `Platform: ${this._platformLabel()}`,
      `Frontend: ${this._safeStr(() => this.configService?.store?.terminal?.frontend)}`,
      `Plugins: ${this._pluginsLabel()}`,
    ]
  }

  /**
   * 平台描述：系统市场版本名 + 精确版本号 + CPU 架构，如 `Windows 11 25H2 (build 26200, x64)`
   *
   * ★ 修复「Windows 版本取不准」：PlatformService.getOSRelease() 底层就是 Node 的 os.release()，
   *   而 Windows 11 沿用 NT 10.0 内核号（本机实测 = `Windows 10.0.26200`），
   *   旧写法把内核号原样透出 → issue 里显示 "Windows 10.0.26200"，用户实机却是 Win11。
   *   现改为按 build 号反查市场版本名：≥22000 判为 Windows 11，并用 WINDOWS_BUILD_RELEASES 定位 21H2/25H2 等代号。
   * 隐私红线：仅取系统版本与 CPU 架构，不采集主机名、用户名、文件路径、服务器地址、书签/Profile 名称等敏感字段
   */
  private _platformLabel(): string {
    const host = this._safeStr(() => this.hostApp?.platform, '')
    const arch = (typeof process !== 'undefined' && (process as any)?.arch) ? String((process as any).arch) : ''
    const raw = this._safeStr(() => this.platformService?.getOSRelease?.(), '')
    // getOSRelease() 形如 `Windows 10.0.26200`，剥掉自带平台名前缀，避免拼出「Windows Windows」
    const ver = raw.replace(/^(Windows|macOS|Linux|Darwin)\s+/i, '').trim()

    const build = this._windowsBuild(ver)
    if (build != null) {
      // Server 与客户端常共用同一 build（如 17763 = Win10 1809 / Server 2019），只能靠产品名区分
      if (/server/i.test(this._osProductName())) {
        return this._platformTail('Windows Server', `build ${build}`, arch)
      }
      const release = this._windowsReleaseName(build)
      const name = `Windows ${build >= 22000 ? 11 : 10}${release ? ` ${release}` : ''}`
      return this._platformTail(name, `build ${build}`, arch)
    }

    // macOS：给的是 Darwin 内核号，按主版本映射回市场版本；主版本 < 18 视为已是市场版本，不干预
    const darwin = /^(\d+)\.(\d+)/.exec(ver)
    if (darwin && Number(darwin[1]) >= 18) {
      const mac = MACOS_BY_DARWIN[Number(darwin[1])]
      return this._platformTail(mac ? `macOS ${mac}` : 'macOS', `Darwin ${ver}`, arch)
    }

    // 其他（Linux 等）：平台名 + 原始内核/系统版本
    return this._platformTail(host || 'unknown', ver || undefined, arch)
  }

  /** 从内核版本号 `10.0.26200` 取 build 号；Windows 自 Vista 起统一为 10.0.<build> 格式 */
  private _windowsBuild(ver: string): number | null {
    const m = /^10\.0\.(\d+)(?:\.|$)/.exec(ver || '')
    return m ? Number(m[1]) : null
  }

  /** build 号 → Windows 市场版本代号（26200 → 25H2）；超出已知表返回空串，不猜 */
  private _windowsReleaseName(build: number): string {
    let name = ''
    for (const [b, n] of WINDOWS_BUILD_RELEASES) {
      if (build >= b) name = n
      else break
    }
    return name
  }

  /**
   * 本机系统产品名（best-effort），Windows 下形如 `Windows 11 Pro` / `Windows Server 2025 Standard`
   * 仅用于区分 Server 版；renderer 无 require('os') 或取不到时返回空串，不影响主流程
   */
  private _osProductName(): string {
    try {
      const req = (typeof window !== 'undefined') ? (window as any).require : null
      return String(req ? req('os')?.version?.() ?? '' : '')
    } catch { return '' }
  }

  /** 拼装 `名称 (细节, 架构)`，空项自动略过；名称缺失时回退 unknown */
  private _platformTail(name: string, detail?: string, arch?: string): string {
    const extras = [detail, arch].filter(x => !!x && x !== 'unknown') as string[]
    return extras.length ? `${name || 'unknown'} (${extras.join(', ')})` : (name || 'unknown')
  }

  /** 已安装的非内置插件列表（name@version），便于作者判断插件组合冲突 */
  private _pluginsLabel(): string {
    try {
      const list = (this.bootstrapData?.installedPlugins || []).filter((p: any) => p && !p.isBuiltin)
      const names = list
        .map((p: any) => (p.version ? `${p.name}@${p.version}` : String(p.name || '')))
        .filter(Boolean)
      return names.join(', ') || 'none'
    } catch { return 'unknown' }
  }

  /** 安全读取：服务未注入/取值抛错时返回兜底值，绝不让反馈入口本身崩掉 */
  private _safeStr(fn: () => any, fallback = 'unknown'): string {
    try {
      const v = fn()
      return (v === undefined || v === null || v === '') ? fallback : String(v)
    } catch { return fallback }
  }

  setColorTheme(value: string): void {
    this.colorTheme = value

    if (value === 'custom') {
      // 使用当前组件的 color* 属性（已通过 _readFromConfig 从 config 加载）
      if (!this.colorPrimary) {
        // 自定义模式的初始色：取当前 Dark 预设值（与 Auto 深色下的观感一致）
        this.colorPrimary = '#b6b6c3'
        this.colorBg = '#1a1d23'
        this.colorText = '#e8edf5'
        this.colorSurface = '#252830'
        this.colorBorder = '#2d3242'
        this.colorMuted = '#5a5f6f'
      }
      this.applyColorTheme()
      this.updateCustomPreview()
      return
    }

    const presets: Record<string, { primary: string; bg: string; text: string; border: string; surface: string; hover: string; inputBg: string; textMuted: string }> = {
      dark:   { primary: '#b6b6c3', bg: '#1a1d23', text: '#e8edf5', border: '#2d3242', surface: '#252830', hover: '#2d3242', inputBg: '#1a1d23', textMuted: '#5a5f6f' },
      light:  { primary: '#2563eb', bg: '#f0f4f8', text: '#333333', border: '#d1d5db', surface: '#e5e7eb', hover: '#dfe4ea', inputBg: '#ffffff', textMuted: '#9ca3af' },
      blue:   { primary: '#3b9eff', bg: '#0b1929', text: '#e6f0ff', border: '#1e3a5f', surface: '#0d2240', hover: '#112a50', inputBg: '#091520', textMuted: '#5a7a9a' },
      green:  { primary: '#4ade80', bg: '#0a2016', text: '#e8fce8', border: '#1a5030', surface: '#0d2818', hover: '#103420', inputBg: '#081810', textMuted: '#3a7a5a' },
      purple: { primary: '#b794f4', bg: '#160e23', text: '#ebe0fc', border: '#3a2558', surface: '#1e1230', hover: '#281640', inputBg: '#120c20', textMuted: '#7a5a9a' },
      red:    { primary: '#f87171', bg: '#1a0808', text: '#ffe0dd', border: '#502020', surface: '#2a0e0e', hover: '#341212', inputBg: '#140606', textMuted: '#9a5a5a' },
    }

    if (value && presets[value]) {
      const p = presets[value]
      // 更新组件属性，确保 _saveToConfig() 写入正确的预设色值
      this.colorPrimary = p.primary
      this.colorBg = p.bg
      this.colorText = p.text
      this.colorSurface = p.surface
      this.colorBorder = p.border
      this.colorMuted = p.textMuted
      // 应用预设 CSS 到根元素
      const root = document.documentElement
      root.style.setProperty('--qc-primary', p.primary)
      root.style.setProperty('--qc-bg', p.bg)
      root.style.setProperty('--qc-text', p.text)
      root.style.setProperty('--qc-border', p.border)
      root.style.setProperty('--qc-surface', p.surface)
      root.style.setProperty('--qc-hover', p.hover)
      root.style.setProperty('--qc-input-bg', p.inputBg)
      root.style.setProperty('--qc-text-muted', p.textMuted)
    } else {
      // Auto：跟随宿主明暗（对齐 SFTP+ 的 Auto 语义）
      //   深色宿主 → 清掉自定义变量，走组件默认值（即 Dark 预设）；
      //   浅色宿主 → 应用 Light 预设，否则浅底上用深色面板会很违和。
      this.colorPrimary = ''
      this.colorBg = ''
      this.colorText = ''
      this.clearColorVars()
      if (!this.isHostDarkMode()) {
        const lp = presets['light']
        if (lp) {
          const root = document.documentElement
          root.style.setProperty('--qc-primary', lp.primary)
          root.style.setProperty('--qc-bg', lp.bg)
          root.style.setProperty('--qc-text', lp.text)
          root.style.setProperty('--qc-border', lp.border)
          root.style.setProperty('--qc-surface', lp.surface)
          root.style.setProperty('--qc-hover', lp.hover)
          root.style.setProperty('--qc-input-bg', lp.inputBg)
          root.style.setProperty('--qc-text-muted', lp.textMuted)
        }
      }
    }
    this.persistThemeSnapshot(value || '')
    this._saveToConfig()
    this.notifyPanels()
  }

  /** 宿主 Tabby 是否为深色模式（读 --body-bg / --text-color 亮度；对齐 SFTP+ 的 isDarkMode 判定） */
  private isHostDarkMode(): boolean {
    try {
      const cs = getComputedStyle(document.documentElement)
      // 多级兜底：--body-bg 可能挂在 body 而非 documentElement 上
      let bg = cs.getPropertyValue('--body-bg').trim()
      if (!bg && document.body) bg = getComputedStyle(document.body).getPropertyValue('--body-bg').trim()
      if (bg) { const lum = parseColorLuminance(bg); if (lum >= 0) return lum < 128 }
      const tc = cs.getPropertyValue('--text-color').trim()
      if (tc) { const lum = parseColorLuminance(tc); if (lum >= 0) return lum > 128 }
    } catch { /* ignore */ }
    try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return true }
  }

  /**
   * 主题快照（供插件启动瞬间由 index.ts 的 applySavedTheme 应用）。
   * ⚠ 两个坑：① 切回「自动」时必须**清除**快照 —— 否则重启后仍按旧主题名走「应用自定义色」分支，
   *   完全跳过 Auto 的宿主明暗判定（表现为重启后面板颜色与界面不匹配）；
   * ② 非 Auto 时必须把 8 个色值**一起**写入 —— 否则重启后只有主题名、读不到色值，等于没应用。
   */
  private persistThemeSnapshot(themeValue: string): void {
    const keys = ['primary', 'bg', 'text', 'border', 'surface', 'hover', 'input-bg', 'text-muted']
    try {
      if (!themeValue) {
        localStorage.removeItem('qc-plus-theme')
        keys.forEach(k => localStorage.removeItem(`qc-plus-color-${k}`))
        return
      }
      localStorage.setItem('qc-plus-theme', themeValue)
      const cur: Record<string, string> = {
        primary: this.colorPrimary,
        bg: this.colorBg,
        text: this.colorText,
        border: this.colorBorder,
        surface: this.colorSurface,
        hover: this.colorBorder || this.colorBg,
        'input-bg': this.colorBg,
        'text-muted': this.colorMuted || this.colorText,
      }
      for (const k of keys) {
        const v = (cur[k] || '').trim()
        if (v) localStorage.setItem(`qc-plus-color-${k}`, v)
        else localStorage.removeItem(`qc-plus-color-${k}`)
      }
    } catch { /* ignore */ }
  }

  applyColorTheme(): void {
    this.colorTheme = 'custom'
    this.saveColorVars()
    this.persistThemeSnapshot('custom')
    this.notifyPanels()
  }

  /** 同步自定义配色到 colorThemes 数组，使预览实时更新 */
  private updateCustomPreview(): void {
    const custom = this.colorThemes.find(t => t.value === 'custom')
    if (custom) {
      custom.primary = this.colorPrimary
      custom.bg = this.colorBg
      custom.text = this.colorText
      custom.surface = this.colorSurface
      custom.border = this.colorBorder
      custom.muted = this.colorMuted
    }
  }

  private saveColorVars(p?: { primary?: string; bg?: string; text?: string; border: string; surface: string; hover: string; inputBg: string; textMuted: string }): void {
    const root = document.documentElement
    root.style.setProperty('--qc-primary', p?.primary ?? this.colorPrimary)
    root.style.setProperty('--qc-bg', p?.bg ?? this.colorBg)
    root.style.setProperty('--qc-text', p?.text ?? this.colorText)
    root.style.setProperty('--qc-border', p?.border ?? this.colorBorder)
    root.style.setProperty('--qc-surface', p?.surface ?? this.colorSurface)
    root.style.setProperty('--qc-hover', p?.hover ?? this.colorBorder)
    root.style.setProperty('--qc-input-bg', p?.inputBg ?? this.colorBg)
    root.style.setProperty('--qc-text-muted', p?.textMuted ?? this.colorMuted)
    // 存储到 Tabby 配置
    this._saveToConfig()
  }

  private clearColorVars(): void {
    const root = document.documentElement
    const vars = ['--qc-primary','--qc-bg','--qc-text','--qc-border','--qc-surface','--qc-hover','--qc-input-bg','--qc-text-muted']
    vars.forEach(v => root.style.removeProperty(v))
  }

  openClearConfirm(): void {
    this.clearConfirmInput = ''
    this.showClearConfirm = true
    setTimeout(() => {
      const input = document.querySelector('.qc-edit-modal .qc-edit-input') as HTMLInputElement | null
      if (input) input.focus()
    }, 50)
  }

  closeClearConfirm(): void {
    this.showClearConfirm = false
    this.clearConfirmInput = ''
  }

  doClearData(): void {
    if (this.clearConfirmInput !== 'DELETE') return
    this.showClearConfirm = false
    this.clearConfirmInput = ''
    // #17 修复：使用公开方法替代 bracket notation 访问私有成员
    this.svc.clearAll()
    // 清空所有 qc-plus-* localStorage 键
    try {
      const keys: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key && key.startsWith('qc-plus-')) keys.push(key)
      }
      for (const key of keys) localStorage.removeItem(key)
    } catch {}
    // 清空 config.store → 重置为默认值
    if (this.configService?.store) {
      const target = this.configService.store['tabby-quick-command-plus']
      const defaults = defaultQcConfig()
      for (const k of Object.keys(defaults)) {
        target[k] = defaults[k]
      }
      this.configService.save()
    }
    // 重置组件状态
    this.lang = ''
    this.fontSize = 14
    this.entryMode = 'toolbar'
    this.pinPanel = true
    this.hideAuthorInfo = false
    this.hidePanelSettingsEntry = false
    this.scrollSnapEnabled = false
    this.colorTheme = ''
    this.colorPrimary = ''
    this.colorBg = ''
    this.colorText = ''
    this.colorSurface = ''
    this.colorBorder = ''
    this.colorMuted = ''
    this.refresh()
    // #14 修复：使用闪现提示替代原生 alert()
    this._flashHotkeyMessage(this.t('已清空所有数据', 'All data cleared'))
  }

  clearData(): void {
    // #14 修复：使用自定义确认弹窗替代原生 confirm()
    this._clearConfirmTitle = this.t('确定清空所有命令数据？此操作不可撤销！', 'Clear all command data? This cannot be undone!')
    this._clearConfirmCallback = () => {
      // #17 修复：使用公开方法
      this.svc.clearAll()
      this.refresh()
    }
    this.showClearConfirmModal = true
  }

  /** 获取当前主题对应颜色值 */
  currentColor(c: any, key: string): string {
    if (this.colorTheme === 'custom') {
      const map: Record<string, string> = {
        primary: this.colorPrimary, bg: this.colorBg, text: this.colorText,
        surface: this.colorSurface, border: this.colorBorder, muted: this.colorMuted,
      }
      return map[key] || c[key] || ''
    }
    return c[key] || ''
  }

  /** 颜色值变更时自动切换为自定义模式 */
  onColorChange(key: string, val: string): void {
    if (this.colorTheme !== 'custom') {
      // 非自定义模式：记录待修改值，弹窗询问
      this._pendingColorKey = key
      this._pendingColorVal = val
      this._pendingOrigTheme = this.colorTheme
      this.showThemeColorConfirm = true
      return
    }
    const map: Record<string, string> = {
      primary: this.colorPrimary, bg: this.colorBg, text: this.colorText,
      surface: this.colorSurface, border: this.colorBorder, muted: this.colorMuted,
    }
    map[key] = val
    ;({ primary: this.colorPrimary, bg: this.colorBg, text: this.colorText,
       surface: this.colorSurface, border: this.colorBorder, muted: this.colorMuted } = map)
    const vars = {
      primary: this.colorPrimary, bg: this.colorBg, text: this.colorText,
      border: this.colorBorder, surface: this.colorSurface, hover: this.colorBorder,
      inputBg: this.colorBg, textMuted: this.colorMuted,
    }
    this.saveColorVars(vars)
    this.updateCustomPreview()
    this.notifyPanels()
  }

  /**
   * ★ 2026-09-29：按「导出数据」勾选弹窗里勾选的类别生成备份文件（原实现固定导出全部内容）。
   * 只写入被勾选的类别；未写入的字段在导入侧是「不存在 = 不覆盖」语义，
   * 所以「只导外观」的备份导入时不会动到命令数据。
   */
  exportData(): void {
    const data: Record<string, unknown> = {}

    // ① 命令与分组
    if (this.exportPickCommands) {
      data.commands = this.svc.getAll()
      data.groups = this.svc.getGroups()
      // 快捷入口（书签）的显示顺序：随命令数据一起备份（导入时按命令位置映射回新 id）
      data.pinnedOrder = this.svc.getPinnedOrder()
    }

    // ② 界面与外观
    if (this.exportPickAppearance) {
      data.lang = this.lang
      data.fontSize = this.fontSize
      data.theme = this.colorTheme
      data.colorPrimary = this.colorPrimary
      data.colorBg = this.colorBg
      data.colorText = this.colorText
      data.colorSurface = this.colorSurface
      data.colorBorder = this.colorBorder
      data.colorMuted = this.colorMuted
      // 面板排序模式由面板自身维护（此处只透传导出，避免用设置页的旧值覆盖面板刚切换的模式）
      data.sortMode = this.configService?.store?.['tabby-quick-command-plus']?.sortMode || 'manual'
    }

    // ③ 窗口行为与位置（位置数据从 localStorage 同步导出）
    if (this.exportPickWindow) {
      data.entryMode = this.entryMode
      data.pinPanel = this.pinPanel
      data.hideAuthorInfo = this.hideAuthorInfo
      data.hidePanelSettingsEntry = this.hidePanelSettingsEntry
      data.scrollSnapEnabled = this.scrollSnapEnabled
      try {
        const entryPos = localStorage.getItem('qc-plus-entry-pos')
        if (entryPos) data.entryPos = JSON.parse(entryPos)
        const panelPos = localStorage.getItem('qc-plus-panel-pos')
        if (panelPos) data.panelPos = JSON.parse(panelPos)
        const posMems: Record<string, any> = {}
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key && key.startsWith('qc-plus-pos-memory-')) {
            try { posMems[key] = JSON.parse(localStorage.getItem(key)!) } catch {}
          }
        }
        if (Object.keys(posMems).length) data.posMemoryByProfile = posMems
      } catch {}
    }

    // 兜底：一类都没勾（按钮已 disabled，这里防键盘/脚本绕过）→ 不生成空备份文件
    if (!Object.keys(data).length) {
      this.showExportDialog = false
      console.warn('[QC+] export skipped: no category selected')
      return
    }

    this.showExportDialog = false
    const json = JSON.stringify({ 'tabby-quick-command-plus': data }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const ts = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`
    a.download = `quick-cmd-plus_backup_${ts}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  /** 从 JSON 文件导入所有数据 */
  onImport(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const json = JSON.parse(reader.result as string)

        // 格式校验：兼容新格式（带标识）和旧格式（扁平结构）
        let data = json['tabby-quick-command-plus']
        if (!data || typeof data !== 'object') {
          // 拒绝 SFTP+ 数据（新格式标识或旧格式前缀）
          if (json['tabby-sftp-plus'] || Object.keys(json).some(k => k.startsWith('sftp-plus-'))) {
            throw new Error(this.t('无效的数据格式。', 'Invalid data format.'))
          }
          // 旧格式兼容：直接使用扁平 JSON
          data = json
        }

        // #17 修复：使用公开方法 replaceAll() 替代 bracket notation
        const generateId = () => Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
        // 快捷入口（书签）顺序：备份中的 id 在导入时会被重建，因此按「命令在原数组中的位置」
        // 映射到重建后的新 id，避免顺序丢失（映射不到的直接忽略，getPinned 会按列表顺序兜底）
        let pinnedOrderMapped: string[] | null = null
        const mapPinnedOrder = (newCmds: any[]): string[] | null => {
          const order = (data as any).pinnedOrder
          if (!Array.isArray(order) || !Array.isArray(data.commands)) return null
          const posOf = new Map<string, number>()
          data.commands.forEach((c: any, i: number) => { if (c?.id) posOf.set(c.id, i) })
          const out: string[] = []
          for (const oldId of order) {
            const i = posOf.get(oldId)
            const nc = (i === undefined) ? null : newCmds[i]
            if (nc?.id) out.push(nc.id)
          }
          return out.length ? out : null
        }
        if (Array.isArray(data.commands) && Array.isArray(data.groups)) {
          const cmds = data.commands.map((c: any) => ({ ...c, id: generateId() }))
          pinnedOrderMapped = mapPinnedOrder(cmds)
          this.svc.replaceAll(cmds, data.groups)
        } else if (Array.isArray(data.commands)) {
          const cmds = data.commands.map((c: any) => ({ ...c, id: generateId() }))
          pinnedOrderMapped = mapPinnedOrder(cmds)
          this.svc.replaceAll(cmds, this.svc.getGroups())
        } else if (Array.isArray(data.groups)) {
          this.svc.replaceAll(this.svc.getAll(), data.groups)
        }
        if (pinnedOrderMapped) this.svc.applyPinnedOrder(pinnedOrderMapped)

        // 导入设置并写入 config
        if (this.configService?.store) {
          const target = this.configService.store['tabby-quick-command-plus']
          if (data.lang !== undefined) { this.lang = data.lang; target.lang = data.lang }
          if (data.fontSize !== undefined) { this.fontSize = data.fontSize; target.fontSize = data.fontSize }
          if (data.entryMode !== undefined) { this.entryMode = data.entryMode; target.entryMode = data.entryMode }
          if (data.pinPanel !== undefined) { this.pinPanel = !!data.pinPanel; target.pinPanel = this.pinPanel }
          if (data.hideAuthorInfo !== undefined) { this.hideAuthorInfo = !!data.hideAuthorInfo; target.hideAuthorInfo = this.hideAuthorInfo }
          if (data.hidePanelSettingsEntry !== undefined) { this.hidePanelSettingsEntry = !!data.hidePanelSettingsEntry; target.hidePanelSettingsEntry = this.hidePanelSettingsEntry }
          if (data.scrollSnapEnabled !== undefined) { this.scrollSnapEnabled = !!data.scrollSnapEnabled; target.scrollSnapEnabled = this.scrollSnapEnabled }
          if (data.theme !== undefined) { this.colorTheme = data.theme; target.theme = data.theme }
          if (data.colorPrimary !== undefined) { this.colorPrimary = data.colorPrimary; target.colorPrimary = data.colorPrimary }
          if (data.colorBg !== undefined) { this.colorBg = data.colorBg; target.colorBg = data.colorBg }
          if (data.colorText !== undefined) { this.colorText = data.colorText; target.colorText = data.colorText }
          if (data.colorSurface !== undefined) { this.colorSurface = data.colorSurface; target.colorSurface = data.colorSurface }
          if (data.colorBorder !== undefined) { this.colorBorder = data.colorBorder; target.colorBorder = data.colorBorder }
          if (data.colorMuted !== undefined) { this.colorMuted = data.colorMuted; target.colorMuted = data.colorMuted }
          if (Array.isArray(data.commands)) target.commands = data.commands
          if (Array.isArray(data.groups)) target.groups = data.groups
          // 面板排序模式：写回 config + localStorage（面板初始化时读取）
          if (data.sortMode === 'manual' || data.sortMode === 'name' || data.sortMode === 'usage') {
            target.sortMode = data.sortMode
            try { localStorage.setItem('qc-plus-sort-mode', data.sortMode) } catch { /* ignore */ }
          }
          // #10 修复：位置数据导入加 try-catch
          try {
            if (data.entryPos) { localStorage.setItem('qc-plus-entry-pos', JSON.stringify(data.entryPos)); target.entryPos = data.entryPos }
            if (data.panelPos) { localStorage.setItem('qc-plus-panel-pos', JSON.stringify(data.panelPos)); target.panelPos = data.panelPos }
            if (data.posMemoryByProfile) {
              target.posMemoryByProfile = data.posMemoryByProfile
              for (const [key, val] of Object.entries(data.posMemoryByProfile as Record<string, any>)) {
                localStorage.setItem(key, JSON.stringify(val))
              }
            }
          } catch (e) { console.warn('[QC+] import localStorage failed', e) }
          this.configService.save()
        }

        this.refresh()
        // #6 修复：导入完成后派发事件通知其他面板刷新
        try { window.dispatchEvent(new CustomEvent('qc-plus-data-imported')) } catch {}
        // #14 修复：使用闪现提示替代原生 alert()
        this._flashHotkeyMessage(this.t('导入成功', 'Import successful'))
      } catch (e: any) {
        // #14 修复：使用闪现提示替代原生 alert()
        this._flashHotkeyMessage(e?.message || this.t('导入失败：文件格式无效', 'Import failed: invalid file format'))
      }
    }
    reader.readAsText(file)
    input.value = ''
  }

  /** 当前「打开 QuickCmd+ 面板」热键绑定文案（来自 Tabby hotkeys 配置） */
  get hotkeyBindingLabel(): string {
    try {
      const list = readToggleHotkeyBindings(this.configService?.store?.hotkeys)
      return list.map(formatHotkeyBinding).join(' › ')
    } catch {
      return ''
    }
  }

  /** 开始录制面板开关快捷键 */
  startHotkeyRecording(event: MouseEvent): void {
    event.stopPropagation()
    if (!this.configService?.store || this.hotkeyRecording) return
    this.hotkeyConflictNames = ''
    this.hotkeySaveMessage = ''
    this.hotkeyRecording = true
    this.hotkeyRecordingPreview = ''
    this._pendingHotkeyStrokes = []

    // 禁用 Tabby 热键系统，避免录制期间触发其它快捷键
    try { (this.hotkeys as any)?.clearCurrentKeystrokes?.() } catch { /* ignore */ }
    try {
      (this.hotkeys as any)?.disable?.()
      this._hotkeyDisableHeld = true
    } catch {
      this._hotkeyDisableHeld = false
    }
    setHotkeyRecordingActive(true)

    // 监听键盘事件
    this._hotkeyDomHandler = (ev: KeyboardEvent) => {
      if (!this.hotkeyRecording) return
      ev.preventDefault(); ev.stopPropagation()
      const stroke = getKeystrokeNameFromEvent(ev)
      if (!stroke) return
      if (stroke === 'Escape') {
        this.cancelHotkeyRecording()
        return
      }
      if (stroke === 'Enter') {
        // Enter 确认当前预览
        if (this.hotkeyRecordingPreview) {
          this.commitHotkeyBinding(this.hotkeyRecordingPreview)
        }
        return
      }
      if (stroke === 'Backspace') {
        this._pendingHotkeyStrokes.pop()
        this.hotkeyRecordingPreview = this._pendingHotkeyStrokes.join(' › ')
        return
      }
      this._pendingHotkeyStrokes.push(stroke)
      this.hotkeyRecordingPreview = this._pendingHotkeyStrokes.join(' › ')
      // 自动提交：输入完成后短暂等待
      if (this._pendingHotkeyTimer) clearTimeout(this._pendingHotkeyTimer)
      this._pendingHotkeyTimer = setTimeout(() => {
        if (this.hotkeyRecording && this.hotkeyRecordingPreview) {
          this.commitHotkeyBinding(this.hotkeyRecordingPreview)
        }
      }, 3000)
    }
    window.addEventListener('keydown', this._hotkeyDomHandler, true)

    // 安全超时：60s 后自动取消录制
    if (this._hotkeySafetyTimer) clearTimeout(this._hotkeySafetyTimer)
    this._hotkeySafetyTimer = setTimeout(() => {
      if (this.hotkeyRecording) {
        this.cancelHotkeyRecording()
        this._flashHotkeyMessage(this.t('录制超时', 'Recording timeout'))
      }
    }, 15000)
  }

  /** 取消录制 */
  cancelHotkeyRecording(): void {
    this._cleanupHotkeyRecording()
    this.hotkeyRecording = false
    this.hotkeyRecordingPreview = ''
  }

  /** 清除现有快捷键绑定 */
  clearHotkeyBinding(): void {
    try {
      if (!this.configService?.store) return
      if (!this.configService.store.hotkeys) this.configService.store.hotkeys = {}
      this.configService.store.hotkeys[QC_PLUS_TOGGLE_HOTKEY] = []
      this.configService.save()
      this.hotkeyConflictNames = ''
      this._flashHotkeyMessage(this.t('快捷键已清除', 'Hotkey cleared'))
    } catch (e) {
      console.warn('[QC+] clear hotkey failed', e)
      this._flashHotkeyMessage(this.t('保存失败', 'Save failed'))
    }
  }

  /** 提交快捷键绑定 */
  private commitHotkeyBinding(stroke: string): void {
    if (this._hotkeyCommitTimer) clearTimeout(this._hotkeyCommitTimer)
    this._hotkeyCommitTimer = setTimeout(() => {
      this._hotkeyCommitTimer = null
      try {
        if (!this.configService?.store) return
        // 冲突检测
        const conflicts = findHotkeyConflicts(stroke, this.configService.store.hotkeys, QC_PLUS_TOGGLE_HOTKEY)
        if (conflicts.length > 0) {
          const names = this._resolveHotkeyNames(conflicts)
          const ok = confirm(
            this.t('快捷键「' + stroke + '」已被 ' + names.join(', ') + ' 使用，确认将覆盖。',
                    'Hotkey "' + stroke + '" is used by ' + names.join(', ') + '. Overwrite?')
          )
          if (!ok) {
            this.cancelHotkeyRecording()
            return
          }
        }
        // 保存
        if (!this.configService.store.hotkeys) this.configService.store.hotkeys = {}
        this.configService.store.hotkeys[QC_PLUS_TOGGLE_HOTKEY] = [stroke]
        this.configService.save()
        // 完成录制
        this.cancelHotkeyRecording()
        this._flashHotkeyMessage(this.t('快捷键已设置为 ' + stroke, 'Hotkey set to ' + stroke))
      } catch (e) {
        console.warn('[QC+] save hotkey failed', e)
        this.cancelHotkeyRecording()
        this._flashHotkeyMessage(this.t('保存失败', 'Save failed'))
      }
    }, 200)
  }

  /** 清理录制状态 */
  private _cleanupHotkeyRecording(): void {
    if (this._hotkeyCommitTimer) { clearTimeout(this._hotkeyCommitTimer); this._hotkeyCommitTimer = null }
    if (this._hotkeySafetyTimer) { clearTimeout(this._hotkeySafetyTimer); this._hotkeySafetyTimer = null }
    if (this._pendingHotkeyTimer) { clearTimeout(this._pendingHotkeyTimer); this._pendingHotkeyTimer = null }
    try { this._hotkeyStrokeSub?.unsubscribe() } catch { /* ignore */ }
    try { this._hotkeyKeyEventSub?.unsubscribe() } catch { /* ignore */ }
    this._hotkeyStrokeSub = null
    this._hotkeyKeyEventSub = null
    if (this._hotkeyDomHandler) {
      window.removeEventListener('keydown', this._hotkeyDomHandler, true)
      this._hotkeyDomHandler = null
    }
    try { (this.hotkeys as any)?.clearCurrentKeystrokes?.() } catch { /* ignore */ }
    if (this._hotkeyDisableHeld) {
      try { (this.hotkeys as any)?.enable?.() } catch { /* ignore */ }
      this._hotkeyDisableHeld = false
    }
    setHotkeyRecordingActive(false)
    this.hotkeyRecording = false
    this.hotkeyRecordingPreview = ''
  }

  /** 闪现提示消息 */
  private _flashHotkeyMessage(msg: string): void {
    this.hotkeySaveMessage = msg
    if (this._hotkeyMsgTimer) clearTimeout(this._hotkeyMsgTimer)
    this._hotkeyMsgTimer = setTimeout(() => {
      this.hotkeySaveMessage = ''
      this._hotkeyMsgTimer = null
    }, 3000)
  }

  /** 解析热键 ID 为可读名称 */
  private _resolveHotkeyNames(ids: string[]): string[] {
    if (Object.keys(this._hotkeyDescCache).length === 0) {
      this._hotkeyDescCache[QC_PLUS_TOGGLE_HOTKEY] = this.t('打开 QuickCmd+ 面板', 'Open QuickCmd+ panel')
    }
    return ids.map(id => this._hotkeyDescCache[id] || id)
  }
}

/** QuickCmd+ 在 Tabby 设置左侧栏的菜单 id（面板齿轮跳转时通过 NgbNav 的 activeTab 定位） */
export const QC_PLUS_SETTINGS_TAB_ID = 'qc-settings'

@Injectable()
export class QuickCommandSettingsTabProvider extends SettingsTabProvider {
  id = QC_PLUS_SETTINGS_TAB_ID
  icon = 'terminal'
  title = 'QuickCmd+'

  getComponentType(): any {
    return QuickCommandSettingsComponent
  }

  async getSettingsTabs() {
    return [{
      title: 'QuickCmd+',
      icon: 'terminal',
      weight: 99,
      component: QuickCommandSettingsComponent,
    }]
  }
}
