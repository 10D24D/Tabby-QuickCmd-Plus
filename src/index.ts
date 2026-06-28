/**
 * QuickCommand+ 插件入口
 * 功能描述：注册 TerminalDecorator（浮动入口）+ 浮动面板 + 设置页
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-27
 *   模块启动时自动应用已保存的颜色主题
 */
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { NgModule } from '@angular/core'
import TabbyCoreModule from 'tabby-core'
import { SettingsTabProvider } from 'tabby-settings'
import { TerminalDecorator } from 'tabby-terminal'

import { QuickCommandTerminalDecorator } from './qc-terminal-decorator'
import { QuickCommandFloatingPanel } from './qc-floating-panel.component'
import { QuickCommandSettingsTabProvider, QuickCommandSettingsComponent } from './qc-settings.component'

/** 启动时应用已保存的颜色主题 */
function applySavedTheme(): void {
  try {
    const theme = localStorage.getItem('qc-plus-theme')
    if (!theme || theme === '') {
      // Auto 模式：确保清除所有残留的 --qc-* CSS 变量
      const root = document.documentElement
      const vars = ['--qc-primary','--qc-bg','--qc-text','--qc-border','--qc-surface','--qc-hover','--qc-input-bg','--qc-text-muted']
      vars.forEach(v => root.style.removeProperty(v))
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
    if (applied) console.log('[QC+] Color theme applied')
  } catch { /* ignore */ }
}
applySavedTheme()

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
  ],
})
export default class QuickCommandPlusModule {
  constructor() {
    console.log('[QC+] Module loaded OK')
  }
}
