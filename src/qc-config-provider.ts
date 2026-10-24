/**
 * QuickCmd+ ConfigProvider — 向 Tabby 配置系统注册插件默认配置
 * 功能描述：声明 qc 配置段的默认值，让插件设置持久化到 config.yaml
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-29
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-10-27
 *   - 2026-10-27 (Deepseek-V4.1-Flash)：新增 broadcastExecEvents（命令执行后向其它插件广播刷新请求，默认关）
 *   - 2026-10-28 (Deepseek-V4.1-Flash)：新增 actionMode（命令行操作入口：悬停按钮 / 右键菜单 / 两者都支持，默认两者）
 */
import { ConfigProvider } from 'tabby-core'
import { QC_PLUS_TOGGLE_HOTKEY } from './qc-hotkey-provider'
import { Locale } from './qc-i18n.service'

export interface QcPluginConfig {
  lang: '' | Locale
  commands: any[]
  groups: any[]
  fontSize: number
  entryMode: 'floating' | 'toolbar'
  /** 布局模式：local = 每个标签页独立（入口在终端工具栏）；global = 面板跨标签常驻（入口在窗口工具栏），进设置页时隐藏 */
  layoutMode: 'local' | 'global'
  entryPos: { x: number; y: number } | null
  panelPos: { x: number; y: number } | null
  posMemoryByProfile: Record<string, any> | null
  theme: string
  colorPrimary: string
  colorBg: string
  colorText: string
  colorSurface: string
  colorBorder: string
  colorMuted: string
  pinPanel: boolean
  /** 面板整体透明度（0.5–1），默认 1 不透明 */
  panelOpacity: number
  /** 隐藏设置页关于区的插件作者信息 */
  hideAuthorInfo: boolean
  /** 隐藏面板标题栏的设置入口图标 */
  hidePanelSettingsEntry: boolean
  /** 快捷入口（书签）的显示顺序：命令 id 列表（与命令列表顺序解耦） */
  pinnedOrder: string[]
  /** 面板排序模式：manual = 拖拽顺序；name = 按名称；usage = 按执行次数 */
  sortMode: 'manual' | 'name' | 'usage'
  /** 命令列表滚动停止后是否吸附到整行（默认关闭） */
  scrollSnapEnabled: boolean
  /** 命令执行完毕后的焦点策略：terminal = 聚焦终端（默认）；panel = 回到面板（需面板常驻才有效） */
  focusAfterExec: 'panel' | 'terminal'
  /**
   * 命令行的操作入口：hover = 只在鼠标悬停时显示按钮（右键仍直接进编辑）；
   * menu = 只走右键菜单；both = 两者都支持（默认）。
   */
  actionMode: 'hover' | 'menu' | 'both'
  /**
   * 命令执行后向其它插件广播刷新请求（默认关）
   * 用途：SFTP+ 打开「执行 QuickCmd+ 命令后刷新列表」后，能收到本插件的事件并刷新文件列表。
   * ⛔ 默认关：没装接收方时广播纯属白费（虽然只是一次 window 事件），也让「是否外发」默认保守。
   */
  broadcastExecEvents: boolean
}

export function defaultQcConfig(): QcPluginConfig {
  return {
    lang: '',
    commands: [],
    groups: [],
    fontSize: 14,
    entryMode: 'toolbar',
    layoutMode: 'local',
    entryPos: null,
    panelPos: null,
    posMemoryByProfile: null,
    theme: '',
    colorPrimary: '',
    colorBg: '',
    colorText: '',
    colorSurface: '',
    colorBorder: '',
    colorMuted: '',
    pinPanel: true,
    panelOpacity: 1,
    hideAuthorInfo: false,
    hidePanelSettingsEntry: false,
    pinnedOrder: [],
    sortMode: 'manual',
    scrollSnapEnabled: false,
    focusAfterExec: 'terminal',
    actionMode: 'both',
    broadcastExecEvents: false,
  }
}

export class QcConfigProvider extends ConfigProvider {
  defaults = {
    'tabby-quick-command-plus': defaultQcConfig(),
    hotkeys: {
      [QC_PLUS_TOGGLE_HOTKEY]: [],
    },
  }
}
