/**
 * Tabby 模块类型声明（shim）
 * 功能描述：为 tabby-core、tabby-terminal、tabby-settings 提供最小类型声明
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-09-24 — 新增 PlatformService（getAppVersion/getOSRelease/openExternal）与 HostAppService
 *              声明（反馈预填环境信息需要 Tabby 版本与宿主平台名）
 */
declare module 'tabby-core' {
  const TabbyCoreModule: any
  export default TabbyCoreModule
  export class AppService {
    activeTab: any
    /** 当前所有打开的标签（BaseTabComponent 实例数组） */
    tabs: any[]
    /** 聚焦某个已存在的标签 */
    selectTab(tab: any): void
    openNewTab(options: any): any
    openNewTabRaw(options: any): any
    closeTab(tab: any, checkCanClose?: boolean): void
  }
  export class NotificationsService {
    error(title: string, message: string): void
    notice(title: string, message?: string): void
  }
  export class LogService {
    create(name: string): any
  }
  export class PlatformService {
    getAppVersion(): string
    getOSRelease(): string
    openExternal(url: string): void
  }
  /** 宿主平台信息（platform: 'Windows' | 'macOS' | 'Linux' | 'Web'） */
  export class HostAppService {
    get platform(): string
  }
  export class HotkeysService {
    hotkey$: any
  }
  export abstract class HotkeyProvider {
    abstract provide(): Promise<Array<{ id: string; name: string }>>
  }
  export class BaseTabComponent {
    parent: any
    title: string
    customTitle: string
    hasActivity: boolean
    icon?: string
    _injector: any
    constructor(injector: any)
    closeTab(): void
    destroy(): void
    getRecoveryToken(): Promise<any>
  }
  export abstract class Theme {
    name: string
    css: string
    terminalBackground: string
  }
  export class ThemesService {
    findCurrentTheme(): Theme
    findTheme(name: string): Theme | null
    applyTheme(theme: Theme): void
    get themeChanged$(): any
  }

  /**
   * ConfigService — Tabby 配置读写核心服务
   */
  export class ConfigService {
    store: any
    readonly ready$: any
    readonly changed$: any
    save(): Promise<void>
    load(): Promise<void>
  }

  /**
   * ConfigProvider — 插件声明默认配置的基类
   */
  export abstract class ConfigProvider {
    defaults: any
    platformDefaults: Record<string, any>
  }
}

declare module 'tabby-terminal' {
  export class TerminalDecorator {
    attach(terminal: any): void
    subscribeUntilDetached(terminal: any, sub: any): void
  }
  export class BaseTerminalTabComponent {
    element?: any
    sshSession?: any
    profile?: any
    customTitle?: string
    title?: string
  }
}

declare module 'tabby-settings' {
  /** 设置页标签组件（面板齿轮跳转时用于 instanceof 判定已有设置 tab） */
  export class SettingsTabComponent {
    element?: { nativeElement?: any }
  }
  export abstract class SettingsTabProvider {
    getComponentType?(): any
    abstract getSettingsTabs(): Promise<Array<{
      title: string
      icon?: string
      weight?: number
      component: any
    }>>
  }
}
