/**
 * Tabby 模块类型声明（shim）
 * 功能描述：为 tabby-core、tabby-terminal、tabby-settings 提供最小类型声明
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 */
declare module 'tabby-core' {
  const TabbyCoreModule: any
  export default TabbyCoreModule
  export class AppService {
    activeTab: any
    openNewTab(options: any): any
    closeTab(tab: any): void
  }
  export class NotificationsService {
    error(title: string, message: string): void
    notice(title: string, message?: string): void
  }
  export class LogService {
    create(name: string): any
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
  export abstract class SettingsTabProvider {
    getComponentType?(): any
    abstract getSettingsTabs(): Promise<Array<{
      title: string
      icon?: string
      weight?: number
      component: any
    }>>
  }
  export class ConfigService {
    get(): any
    changed$: any
  }
}
