/**
 * QuickCommand+ 设置面板
 * 功能描述：在 Tabby 设置左侧栏注册 QuickCmd+ 配置入口（语言、命令管理、数据备份）
 *   参考 SFTP+ 设置页的 UI 风格
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-27
 */
import { Component, Injectable } from '@angular/core'
import { SettingsTabProvider } from 'tabby-settings'
import { QuickCommandService, QuickCommand, QuickCommandGroup } from './qc-command.service'

/**
 * 检测 Tabby 实际使用的系统语言
 */
function detectSystemLocale(): 'zh-CN' | 'en-US' {
  try {
    const keys = ['locale', 'language', 'tabby-language', 'tabby-locale',
      'config', 'tabby-config', 'settings', 'tabby-settings',
      'tabby-config.json']
    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      if (/^zh/i.test(raw)) return 'zh-CN'
      if (/^en/i.test(raw)) return 'en-US'
      try {
        const obj = JSON.parse(raw)
        const lang = obj?.appearance?.language
          || obj?.appearance?.locale
          || obj?.language || obj?.locale
          || obj?.app?.language || obj?.general?.language
          || obj?.locale
        if (lang) return /^zh/i.test(String(lang)) ? 'zh-CN' : 'en-US'
      } catch {}
    }
  } catch {}

  try {
    const langs = navigator.languages || [navigator.language]
    const zhLang = langs.find(l => /^zh/i.test(l))
    if (zhLang) return 'zh-CN'
  } catch {}

  try {
    const navLang = navigator.language || ''
    if (navLang) return /^zh/i.test(navLang) ? 'zh-CN' : 'en-US'
  } catch {}

  return 'zh-CN'
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
          <option value="">{{ t('自动', 'Auto') }}</option>
          <option value="zh-CN">中文</option>
          <option value="en-US">English</option>
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
              <input type="color" [ngModel]="currentColor(c, 'primary')" (ngModelChange)="onColorChange('primary', $event)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'primary') }}</span>
            </div>
            <div class="qs-color-field">
              <label>{{ t('背景', 'Bg') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'bg')" (ngModelChange)="onColorChange('bg', $event)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'bg') }}</span>
            </div>
            <div class="qs-color-field">
              <label>{{ t('文字', 'Text') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'text')" (ngModelChange)="onColorChange('text', $event)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'text') }}</span>
            </div>
            <div class="qs-color-field">
              <label>{{ t('标题栏', 'Surface') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'surface')" (ngModelChange)="onColorChange('surface', $event)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'surface') }}</span>
            </div>
            <div class="qs-color-field">
              <label>{{ t('边框', 'Border') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'border')" (ngModelChange)="onColorChange('border', $event)" class="qs-color-input">
              <span class="qs-color-val">{{ currentColor(c, 'border') }}</span>
            </div>
            <div class="qs-color-field">
              <label>{{ t('次要文字', 'Muted') }}</label>
              <input type="color" [ngModel]="currentColor(c, 'muted')" (ngModelChange)="onColorChange('muted', $event)" class="qs-color-input">
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

        <!-- 入口模式 -->
        <div class="qs-entry-mode-row">
          <label style="font-size:13px; font-weight:500;">{{ t('入口模式', 'Entry Mode') }}</label>
          <div class="qs-entry-mode-options">
            <label class="qs-entry-mode-option"
              [class.qs-entry-mode-active]="entryMode === 'toolbar'">
              <input type="radio" name="entryMode" value="toolbar"
                [(ngModel)]="entryMode" (ngModelChange)="onEntryModeChange()">
              <span>{{ t('工具栏按钮', 'Toolbar') }}</span>
            </label>
            <label class="qs-entry-mode-option"
              [class.qs-entry-mode-active]="entryMode === 'floating'">
              <input type="radio" name="entryMode" value="floating"
                [(ngModel)]="entryMode" (ngModelChange)="onEntryModeChange()">
              <span>{{ t('浮动按钮', 'Floating') }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 数据 -->
      <div class="qs-section">
        <label class="qs-label">{{ t('数据', 'Data') }}</label>
        <div class="qs-backup-row">
          <button class="qs-btn" (click)="exportData()">[&uarr;] {{ t('导出数据', 'Export') }}</button>
          <label class="qs-btn qs-btn-import">[&darr;] {{ t('导入数据', 'Import') }}
            <input type="file" accept=".json" (change)="onImport($event)" style="display:none" />
          </label>
          <button class="qs-btn qs-btn-danger" (click)="openClearConfirm()">[&times;] {{ t('清空数据', 'Clear All') }}</button>
        </div>
      </div>

      <!-- 关于 -->
      <div class="qs-section">
        <label class="qs-label">{{ t('关于', 'About') }}</label>
        <div class="qs-about-row">
          <span class="qs-about-item">{{ t('版本', 'Version') }}: 1.0.0</span>
          <span class="qs-about-item">{{ t('作者', 'Author') }}: DD1024z</span>
          <span class="qs-about-link" (click)="openGithub()">
            <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8"/></svg>
            {{ t('Github源码', 'GitHub Source') }}
          </span>
        </div>
      </div>
    </div>

    <!-- 清空数据确认弹窗 -->
    <div class="qc-overlay" *ngIf="showClearConfirm" (click)="closeClearConfirm()">
      <div class="qc-edit-modal" (click)="$event.stopPropagation()">
        <div class="qc-edit-title" style="color:var(--_primary,#e24b4a);">{{ t('⚠️ 清空数据', '⚠️ Clear All Data') }}</div>
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
          <button class="qs-btn" (click)="closeClearConfirm()">{{ t('取消', 'Cancel') }}</button>
          <button class="qs-btn qs-btn-danger" (click)="doClearData()"
            [style.opacity]="clearConfirmInput !== 'DELETE' ? '0.5' : '1'"
            [disabled]="clearConfirmInput !== 'DELETE'">{{ t('清空', 'Clear') }}</button>
        </div>
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

    /* 入口模式选择 */
    .qs-entry-mode-row { margin-top:8px; display:flex; flex-direction:column; gap:4px; }
    .qs-entry-mode-options { display:flex; gap:8px; }
    .qs-entry-mode-option {
      display:flex; align-items:center; gap:4px;
      padding:6px 12px; border-radius:6px;
      border:0.5px solid var(--_border,#585b70);
      cursor:pointer; transition:all .15s;
      user-select:none;
    }
    .qs-entry-mode-option:hover { border-color:var(--_primary,#b4befe); }
    .qs-entry-mode-active { border-color:var(--_primary,#b4befe); background:rgba(180,190,254,0.08); }
    .qs-entry-mode-option input { margin:0; }

    /* 字体大小 */
    .qs-font-row { margin-top:12px; display:flex; flex-direction:column; gap:4px; }
    .qs-font-label { font-size:13px; font-weight:500; }
    .qs-font-control { display:flex; align-items:center; gap:10px; }
    .qs-font-val { font-size:13px; min-width:30px; color:var(--_text-muted); font-variant-numeric:tabular-nums; }

    /* range 滑块 */
    .qs-range { flex:1; max-width:160px; margin:0; height:4px; -webkit-appearance:none; appearance:none; background:var(--_border,#585b70); border-radius:2px; outline:none; cursor:pointer; }
    .qs-range::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:14px; height:14px; border-radius:50%; background:var(--_primary,#b4befe); border:2px solid var(--_surface,#45475a); cursor:pointer; }
    .qs-range::-moz-range-track { height:4px; background:var(--_border,#585b70); border-radius:2px; }
    .qs-range::-moz-range-thumb { width:14px; height:14px; border-radius:50%; background:var(--_primary,#b4befe); border:2px solid var(--_surface,#45475a); cursor:pointer; }

    /* 关于 */
    .qs-about-row { display:flex; gap:16px; flex-wrap:wrap; margin-top:4px; font-size:13px; }
    .qs-about-item { color:var(--_text-muted); }
    .qs-about-link { color:var(--_primary,#b4befe); text-decoration:none; cursor:pointer; }
    .qs-about-link:hover { text-decoration:underline; }
    .qs-about-link svg { width:12px; height:12px; vertical-align:middle; margin-right:2px; }

    /* 确认弹窗 */
    .qc-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:100000; display:flex; align-items:center; justify-content:center; }
    .qc-edit-modal {
      background:var(--_bg,#313244); border:0; border-radius:12px; padding:20px; z-index:100001;
      min-width:380px; max-width:90%;
      color:var(--_text,#cdd6f4);
    }
    .qc-edit-title { font-size:16px; font-weight:600; margin-bottom:16px; }
    .qc-edit-field { margin-bottom:16px; }
    .qc-edit-input {
      width:100%; padding:8px 12px; border-radius:6px;
      border:1px solid rgba(128,128,128,0.3);
      background:rgba(0,0,0,0.2); color:inherit; font-size:13px; outline:none;
      box-sizing:border-box;
    }
    .qc-edit-input:focus { border-color:var(--primary-color,#3b82f6); }
    .qc-edit-footer { display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }
  `],
})
export class QuickCommandSettingsComponent {
  commands: QuickCommand[] = []
  groups: QuickCommandGroup[] = []
  lang: '' | 'zh-CN' | 'en-US' = (() => {
    const v = localStorage.getItem('qc-plus-locale')
    if (v === 'zh-CN' || v === 'en-US') return v
    return ''
  })()

  // 颜色主题（含配色预览色值）
  colorThemes = [
    { value: '',       label: 'Auto',   bg: '#313244', text: '#cdd6f4', primary: '#b4befe', surface: '#45475a', border: '#585b70', muted: '#6c7086' },
    { value: 'dark',  label: 'Dark',  bg: '#1e1e2e', text: '#cdd6f4', primary: '#89b4fa', surface: '#313244', border: '#45475a', muted: '#585b70' },
    { value: 'light', label: 'Light', bg: '#f0f4f8', text: '#333',    primary: '#3b82f6', surface: '#e5e7eb', border: '#d1d5db', muted: '#9ca3af' },
    { value: 'blue',  label: 'Blue',  bg: '#0b1929', text: '#e0e7ff', primary: '#60a5fa', surface: '#172554', border: '#1e3a5f', muted: '#64748b' },
    { value: 'green', label: 'Green', bg: '#0a2016', text: '#d1fae5', primary: '#34d399', surface: '#14532d', border: '#166534', muted: '#6b7280' },
    { value: 'purple',label: 'Purple',bg: '#160e23', text: '#eaddff', primary: '#a78bfa', surface: '#2e1065', border: '#4c1d95', muted: '#7c3aed' },
    { value: 'red',   label: 'Red',    bg: '#1a0808', text: '#fecaca', primary: '#f87171', surface: '#450a0a', border: '#991b1b', muted: '#dc2626' },
    { value: 'custom',label: 'Custom', bg: '#313244', text: '#cdd6f4', primary: '#b4befe', surface: '#45475a', border: '#585b70', muted: '#6c7086' },
  ]
  colorTheme: string = localStorage.getItem('qc-plus-theme') || ''
  colorPrimary: string = localStorage.getItem('qc-plus-color-primary') || ''
  colorBg: string = localStorage.getItem('qc-plus-color-bg') || ''
  colorText: string = localStorage.getItem('qc-plus-color-text') || ''
  colorSurface: string = localStorage.getItem('qc-plus-color-surface') || ''
  colorBorder: string = localStorage.getItem('qc-plus-color-border') || ''
  colorMuted: string = localStorage.getItem('qc-plus-color-text-muted') || ''

  // 字体大小（px）
  fontSize: number = +(localStorage.getItem('qc-plus-font-size') || '14')

  // 入口模式
  entryMode: 'floating' | 'toolbar' = new QuickCommandService().getEntryMode()

  private svc = new QuickCommandService()

  // 清空数据确认弹窗
  showClearConfirm = false
  clearConfirmInput = ''

  get effectiveLang(): 'zh-CN' | 'en-US' {
    if (this.lang === 'zh-CN' || this.lang === 'en-US') return this.lang
    return detectSystemLocale()
  }

  get namedGroups(): QuickCommandGroup[] {
    return this.groups.filter(g => g.name)
  }

  t(zh: string, en?: string): string {
    if (this.effectiveLang === 'en-US' && en) return en
    return zh
  }

  /** 获取颜色主题的本地化名称 */
  themeLabel(c: any): string {
    const labels: Record<string, [string, string]> = {
      '':      ['跟随系统', 'Auto'],
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

  constructor() {
    this.refresh()
    // 应用已保存的颜色主题
    if (this.colorPrimary && this.colorBg && this.colorText) {
      const root = document.documentElement
      root.style.setProperty('--qc-primary', this.colorPrimary)
      root.style.setProperty('--qc-bg', this.colorBg)
      root.style.setProperty('--qc-text', this.colorText)
      const brd = localStorage.getItem('qc-plus-color-border')
      const sfc = localStorage.getItem('qc-plus-color-surface')
      const hov = localStorage.getItem('qc-plus-color-hover')
      const ibg = localStorage.getItem('qc-plus-color-input-bg')
      const tmu = localStorage.getItem('qc-plus-color-text-muted')
      if (brd) root.style.setProperty('--qc-border', brd)
      if (sfc) root.style.setProperty('--qc-surface', sfc)
      if (hov) root.style.setProperty('--qc-hover', hov)
      if (ibg) root.style.setProperty('--qc-input-bg', ibg)
      if (tmu) root.style.setProperty('--qc-text-muted', tmu)
    }
    // 应用已保存的字体大小
    const savedFontSize = localStorage.getItem('qc-plus-font-size')
    if (savedFontSize) {
      document.documentElement.style.setProperty('--qc-font-size', savedFontSize + 'px')
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
    localStorage.setItem('qc-plus-locale', this.lang || 'auto')
    window.dispatchEvent(new CustomEvent('qc-plus-locale-changed', { detail: this.lang || 'auto' }))
    this.notifyPanels()
  }

  onFontSizeChange(val: number): void {
    this.fontSize = Math.max(11, Math.min(18, val))
    localStorage.setItem('qc-plus-font-size', String(this.fontSize))
    const root = document.documentElement
    root.style.setProperty('--qc-font-size', this.fontSize + 'px')
    this.notifyPanels()
  }

  onEntryModeChange(): void {
    new QuickCommandService().saveEntryMode(this.entryMode)
    // 通过 window 事件 + 全局回调 通知所有终端装饰器重建入口
    window.dispatchEvent(new CustomEvent('qc-plus-entry-mode-changed', { detail: this.entryMode }))
    // 全局回调兜底（设置面板先触发事件，等下一帧再触达已经就绪的监听器）
    if (typeof (window as any).__qcRebuildEntry === 'function') {
      ;(window as any).__qcRebuildEntry()
    }
    // 兜底：直接触发所有已知入口的 data 属性变更来触发重建
    try {
      const els = document.querySelectorAll('[data-qc-entry="1"]')
      for (let i = 0; i < els.length; i++) {
        const el = els[i]
        el.dispatchEvent(new CustomEvent('qc-mode-change', { bubbles: true }))
      }
    } catch {}
  }

  openGithub(): void {
    const url = 'https://github.com/DD1024z/Tabby-QuickCmd-Plus'
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

  setColorTheme(value: string): void {
    this.colorTheme = value
    localStorage.setItem('qc-plus-theme', value)

    if (value === 'custom') {
      // 从 localStorage 加载已保存的自定义值，避免被预设覆盖
      const savedPrimary = localStorage.getItem('qc-plus-color-primary')
      if (savedPrimary) {
        this.colorPrimary = savedPrimary
        this.colorBg = localStorage.getItem('qc-plus-color-bg') || '#313244'
        this.colorText = localStorage.getItem('qc-plus-color-text') || '#cdd6f4'
        this.colorSurface = localStorage.getItem('qc-plus-color-surface') || '#45475a'
        this.colorBorder = localStorage.getItem('qc-plus-color-border') || '#585b70'
        this.colorMuted = localStorage.getItem('qc-plus-color-text-muted') || '#6c7086'
      } else {
        this.colorPrimary = '#b4befe'
        this.colorBg = '#313244'
        this.colorText = '#cdd6f4'
        this.colorSurface = '#45475a'
        this.colorBorder = '#585b70'
        this.colorMuted = '#6c7086'
      }
      this.applyColorTheme()
      this.updateCustomPreview()
      return
    }

    const presets: Record<string, { primary: string; bg: string; text: string; border: string; surface: string; hover: string; inputBg: string; textMuted: string }> = {
      dark:   { primary: '#67676f', bg: '#1e1e2e', text: '#cdd6f4', border: '#585b70', surface: '#45475a', hover: '#585b70', inputBg: '#1e1e2e', textMuted: '#6c7086' },
      light:  { primary: '#2563eb', bg: '#ffffff', text: '#1a1a2e', border: '#d1d9e6', surface: '#f0f4f8', hover: '#e5e9f0', inputBg: '#ffffff', textMuted: '#8899aa' },
      blue:   { primary: '#3b9eff', bg: '#0b1929', text: '#e6f0ff', border: '#1e3a5f', surface: '#0d2240', hover: '#112a50', inputBg: '#091520', textMuted: '#5a7a9a' },
      green:  { primary: '#4ade80', bg: '#0a2016', text: '#e8fce8', border: '#1a5030', surface: '#0d2818', hover: '#103420', inputBg: '#081810', textMuted: '#3a7a5a' },
      purple: { primary: '#b794f4', bg: '#160e23', text: '#ebe0fc', border: '#3a2558', surface: '#1e1230', hover: '#281640', inputBg: '#120c20', textMuted: '#7a5a9a' },
      red:    { primary: '#f87171', bg: '#1a0808', text: '#ffe0dd', border: '#502020', surface: '#2a0e0e', hover: '#341212', inputBg: '#140606', textMuted: '#9a5a5a' },
    }

    if (value && presets[value]) {
      const p = presets[value]
      // 仅应用预设 CSS 到根元素，不覆盖 localStorage 中的自定义配色
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
      // Auto: clear custom vars
      this.colorPrimary = ''
      this.colorBg = ''
      this.colorText = ''
      this.clearColorVars()
    }
    this.notifyPanels()
  }

  applyColorTheme(): void {
    localStorage.setItem('qc-plus-theme', 'custom')
    this.colorTheme = 'custom'
    this.saveColorVars()
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
    const ks = ['primary','bg','text','border','surface','hover','inputBg','textMuted']
    const vals = [p?.primary ?? this.colorPrimary, p?.bg ?? this.colorBg, p?.text ?? this.colorText,
      p?.border ?? this.colorBorder, p?.surface ?? this.colorSurface, p?.hover ?? this.colorBorder,
      p?.inputBg ?? this.colorBg, p?.textMuted ?? this.colorMuted]
    ks.forEach((k, i) => localStorage.setItem(`qc-plus-color-${k}`, vals[i]))
  }

  private clearColorVars(): void {
    const root = document.documentElement
    const vars = ['--qc-primary','--qc-bg','--qc-text','--qc-border','--qc-surface','--qc-hover','--qc-input-bg','--qc-text-muted']
    vars.forEach(v => root.style.removeProperty(v))
    const allKeys = ['qc-plus-color-primary','qc-plus-color-bg','qc-plus-color-text',
      'qc-plus-color-border','qc-plus-color-surface','qc-plus-color-hover',
      'qc-plus-color-input-bg','qc-plus-color-text-muted']
    allKeys.forEach(k => localStorage.removeItem(k))
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
    this.svc['commands'] = []
    this.svc['groups'] = []
    this.svc['saveCommands']()
    this.svc['saveGroups']()
    this.refresh()
    alert(this.t('已清空所有数据', 'All data cleared'))
  }

  clearData(): void {
    if (confirm(this.t('确定清空所有命令数据？此操作不可撤销！', 'Clear all command data? This cannot be undone!'))) {
      this.svc['commands'] = []
      this.svc['groups'] = []
      this.svc['saveCommands']()
      this.svc['saveGroups']()
      this.refresh()
    }
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
      // 从预设值复制当前配色作为自定义起点
      const activeTheme = this.colorThemes.find(t => t.value === this.colorTheme)
      if (activeTheme) {
        this.colorPrimary = activeTheme.primary
        this.colorBg = activeTheme.bg
        this.colorText = activeTheme.text
        this.colorSurface = activeTheme.surface
        this.colorBorder = activeTheme.border
        this.colorMuted = activeTheme.muted
      }
      this.colorTheme = 'custom'
      localStorage.setItem('qc-plus-theme', 'custom')
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

  exportData(): void {
    const json = this.svc.exportAll()
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

  onImport(event: Event): void {
    const input = event.target as HTMLInputElement
    const file = input?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const ok = this.svc.importAll(reader.result as string)
      if (ok) alert(this.t('导入成功', 'Import successful'))
      else alert(this.t('导入失败：文件格式无效', 'Import failed: invalid file format'))
      this.refresh()
    }
    reader.readAsText(file)
    input.value = ''
  }
}

@Injectable()
export class QuickCommandSettingsTabProvider extends SettingsTabProvider {
  id = 'qc-settings'
  icon = 'fas fa-terminal'
  title = 'QuickCmd+'

  getComponentType(): any {
    return QuickCommandSettingsComponent
  }

  async getSettingsTabs() {
    return [{
      title: 'QuickCmd+',
      icon: 'fas fa-terminal',
      weight: 99,
      component: QuickCommandSettingsComponent,
    }]
  }
}
