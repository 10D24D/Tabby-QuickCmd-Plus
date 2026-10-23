/**
 * QuickCmd+ 热键提供者
 * 在 Tabby「设置 → 快捷键」中注册可绑定项
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-07-15
 */
import { Injectable } from '@angular/core'
import { HotkeyProvider } from 'tabby-core'

export const QC_PLUS_TOGGLE_HOTKEY = 'qc-plus-toggle-panel'

@Injectable()
export class QcHotkeyProvider extends HotkeyProvider {
  constructor() {
    super()
  }

  async provide(): Promise<Array<{ id: string; name: string }>> {
    return [
      {
        id: QC_PLUS_TOGGLE_HOTKEY,
        name: '打开 QuickCmd+ 面板 / Open QuickCmd+ panel',
      },
    ]
  }
}
