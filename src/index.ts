/**
 * QuickCommand+ 插件入口
 * 功能描述：注册 TerminalDecorator（浮动入口）+ 浮动面板 + 设置页 + ConfigProvider
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   - 注册 QcConfigProvider（Tabby config.yaml 持久化）
 */
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgModule } from '@angular/core'
import TabbyCoreModule, { ConfigProvider, HotkeyProvider } from 'tabby-core'
import { ToolbarButtonProvider } from 'tabby-core/typings/api/toolbarButtonProvider'
import { SettingsTabProvider } from 'tabby-settings'
import { TerminalDecorator } from 'tabby-terminal'

import { QuickCommandTerminalDecorator } from './qc-terminal-decorator'
import { QuickCommandFloatingPanel } from './qc-floating-panel.component'
import { QuickCommandSettingsTabProvider, QuickCommandSettingsComponent } from './qc-settings.component'
import { QcConfigProvider } from './qc-config-provider'
import { QcHotkeyProvider } from './qc-hotkey-provider'
import { QcToolbarButtonProvider } from './qc-toolbar-button-provider'
// Auto 主题需按宿主背景亮度决定用 Dark 还是 Light 预设（与设置页同一判定口径）
import { parseColorLuminance } from '@common/utils'

/** 读取宿主 Tabby 的背景色（多级兜底：documentElement → body；读不到返回 ''） */
function readHostBodyBg(): string {
  try {
    const de = getComputedStyle(document.documentElement).getPropertyValue('--body-bg').trim()
    if (de) return de
  } catch { /* ignore */ }
  try {
    const b = document.body ? getComputedStyle(document.body).getPropertyValue('--body-bg').trim() : ''
    if (b) return b
  } catch { /* ignore */ }
  return ''
}

/**
 * 判定宿主是否为深色：背景亮度优先 → 文字色亮度 → 系统偏好兜底。
 * ⚠ 不要在插件加载的瞬间就下结论 —— 那时 Tabby 的主题变量往往尚未注入，会一路回退到
 *   prefers-color-scheme；若系统偏好与 Tabby 主题相反，就会把浅色界面里的面板渲染成深色。
 */
function isHostDark(): boolean {
  const bg = readHostBodyBg()
  if (bg) { const lum = parseColorLuminance(bg); if (lum >= 0) return lum < 128 }
  try {
    const tc = getComputedStyle(document.documentElement).getPropertyValue('--text-color').trim()
    if (tc) { const lum = parseColorLuminance(tc); if (lum >= 0) return lum > 128 }
  } catch { /* ignore */ }
  try { return window.matchMedia('(prefers-color-scheme: dark)').matches } catch { return true }
}

/** Auto 模式下、宿主为浅色时生效 Light 预设 */
function applyLightPreset(): void {
  const light: Record<string, string> = {
    primary: '#2563eb', bg: '#f0f4f8', text: '#333333', border: '#d1d5db',
    surface: '#e5e7eb', hover: '#dfe4ea', 'input-bg': '#ffffff', 'text-muted': '#9ca3af',
  }
  const root = document.documentElement
  for (const k of Object.keys(light)) root.style.setProperty(`--qc-${k}`, light[k])
}

/**
 * 应用已保存的颜色主题（幂等，可重复调用）。
 * Auto（无主题值）时：清掉 qc-plus-color-* 残留变量，再按宿主明暗决定走组件默认值（= Dark 预设）
 * 还是 Light 预设。
 */
function applySavedTheme(): void {
  try {
    const theme = localStorage.getItem('qc-plus-theme')
    if (!theme || theme === '') {
      const root = document.documentElement
      const vars = ['--qc-primary','--qc-bg','--qc-text','--qc-border','--qc-surface','--qc-hover','--qc-input-bg','--qc-text-muted']
      vars.forEach(v => root.style.removeProperty(v))
      if (!isHostDark()) applyLightPreset()
      return
    }
    const root = document.documentElement
    const keys = ['primary', 'bg', 'text', 'border', 'surface', 'hover', 'input-bg', 'text-muted']
    let applied = false
    for (const k of keys) {
      const val = localStorage.getItem(`qc-plus-color-${k}`)
      if (val) {
        root.style.setProperty(`--qc-${k}`, val)
        applied = true
      }
    }
    if (applied) {
      console.log('[QC+] Color theme applied')
      return
    }
    // 有主题名却读不到任何色值（历史残留 / 快照不完整）⇒ 按 Auto 处理：既清掉可能残留的变量，
    // 又补上浅色宿主的 Light 预设（否则重启后面板会停在错误的状态）
    const vars2 = ['--qc-primary','--qc-bg','--qc-text','--qc-border','--qc-surface','--qc-hover','--qc-input-bg','--qc-text-muted']
    vars2.forEach(v => root.style.removeProperty(v))
    if (!isHostDark()) applyLightPreset()
  } catch { /* ignore */ }
}

/**
 * Auto 主题的重判机制。
 * 判定依赖宿主主题变量，而插件加载时这些变量可能还没注入 ⇒ 只判一次会误判（浅色界面上出现深色面板）。
 * 故：① 启动后延迟再判（等主题注入）；② 面板每次打开时派发 `qc-plus-sync-theme` 触发重判 ——
 * 那一刻宿主主题必定就绪，也能跟上用户中途切换主题。
 */
function setupAutoThemeSync(): void {
  try {
    window.addEventListener('qc-plus-sync-theme', () => applySavedTheme())
    setTimeout(() => applySavedTheme(), 300)
    setTimeout(() => applySavedTheme(), 1500)
  } catch { /* ignore */ }
}

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    TabbyCoreModule,
  ],
  declarations: [
    QuickCommandFloatingPanel,
    QuickCommandSettingsComponent,
  ],
  providers: [
    { provide: TerminalDecorator, useClass: QuickCommandTerminalDecorator, multi: true },
    { provide: SettingsTabProvider, useClass: QuickCommandSettingsTabProvider, multi: true },
    { provide: ConfigProvider, useClass: QcConfigProvider, multi: true },
    { provide: HotkeyProvider, useClass: QcHotkeyProvider, multi: true },
    { provide: ToolbarButtonProvider, useClass: QcToolbarButtonProvider, multi: true },
  ],
})
export default class QuickCommandPlusModule {
  constructor() {
    applySavedTheme()
    setupAutoThemeSync()
    console.log('[QC+] Module loaded OK')
  }
}
