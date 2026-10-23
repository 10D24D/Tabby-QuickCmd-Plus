/**
 * QuickCmd+ ConfigProvider — 向 Tabby 配置系统注册插件默认配置
 * 功能描述：声明 qc 配置段的默认值，让插件设置持久化到 config.yaml
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-29
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
}

export function defaultQcConfig(): QcPluginConfig {
  return {
    lang: '',
    commands: [],
    groups: [],
    fontSize: 14,
    entryMode: 'toolbar',
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
