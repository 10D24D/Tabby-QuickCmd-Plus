/**
 * QuickCmd+ 顶栏按钮提供者
 * 功能描述：在 Tabby 顶栏设置按钮左侧添加 QuickCmd+ 面板切换按钮
 *   完全不侵入终端 DOM，解决拆分窗口空白问题
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-07-25
 */
import { Injectable } from '@angular/core'
import { ToolbarButtonProvider } from 'tabby-core/typings/api/toolbarButtonProvider'
import type { ToolbarButton } from 'tabby-core/typings/api/toolbarButtonProvider'
import { QuickCommandTerminalDecorator } from './qc-terminal-decorator'

/** QC+ 面板切换按钮 SVG 图标（与终端入口按钮保持一致） */
const QC_ICON_SVG = '<svg viewBox="0 0 1024 1024" width="16" height="16" fill="currentColor"><path d="M89.6 806.4h844.8V217.6H89.6v588.8zM0 128h1024v768H0V128z m242.816 577.536L192 654.72l154.304-154.368L192 346.048l50.816-50.816L448 500.352 242.816 705.536z m584.32 13.248H512V640h315.072v78.72z"/></svg>'

@Injectable()
export class QcToolbarButtonProvider extends ToolbarButtonProvider {
  provide(): ToolbarButton[] {
    return [
      {
        icon: QC_ICON_SVG,
        title: 'QuickCmd+ 面板',
        weight: 5,
        showInToolbar: true,
        showInStartPage: false,
        click: () => {
          QuickCommandTerminalDecorator.togglePanelForActiveTerminalStatic()
        },
      },
    ]
  }
}
