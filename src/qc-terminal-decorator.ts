/**
 * QuickCommand+ 终端装饰器
 * 功能描述：在终端注入入口按钮（浮动或工具栏），管理浮动面板的创建/销毁/最小化/恢复
 *   面板直接作为 hostEl 的子元素（无覆盖层），根据入口按钮位置自动选择最佳显示方位
 *   支持两种入口模式：拖拽浮动入口 / 工具栏按钮（类似 SFTP+）
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-28
 *   新增工具栏按钮入口模式，通过 qc-plus-entry-mode localStorage 控制
 * 修改人：DD1024z + Deepseek-V4-Flash
 * 修改时间：2026-06-29
 *   替换入口按钮文本图标为 SVG 图标
 */
import { Injectable, Injector, ComponentFactoryResolver, ApplicationRef, NgZone, Optional } from '@angular/core'
import { TerminalDecorator } from 'tabby-terminal'
import { ConfigService, HotkeysService, AppService } from 'tabby-core'
import { openQuickCmdPlusSettings } from './qc-open-settings'
import { QuickCommandFloatingPanel } from './qc-floating-panel.component'
import { QuickCommandService } from './qc-command.service'
import { QuickCommandI18nService } from './qc-i18n.service'
import { QC_PLUS_TOGGLE_HOTKEY } from './qc-hotkey-provider'
import { isHotkeyRecordingActive } from './qc-hotkey-util'

/**
 * 跨插件共享的浮动层置顶计数器（与 SFTP+ 共用 window.__tabbyFloatZ）。
 * 保证"最后打开 / 获得焦点的面板"始终在最上层，避免硬编码 z-index 互相压盖。
 * 起点 900：高于终端内容(auto/0)，低于 Tabby 原生弹窗(backdrop=1050 / modal=1055)，
 * 这样浮动面板不会遮挡 Tabby 的配置/连接等原生弹窗（对齐 SFTP+ 2026-08-25 修复）。
 * 创建人：DD1024z + Hy3 / 修改人：DD1024z + WorkBuddy / 修改时间：2026-08-25
 */
function bringFloatToFront(el: HTMLElement): void {
  const w = window as any
  if (!w.__tabbyFloatZ || w.__tabbyFloatZ < 900) w.__tabbyFloatZ = 900
  w.__tabbyFloatZ += 1
  el.style.zIndex = String(w.__tabbyFloatZ)
}

/**
 * 入口按钮（工具栏按钮 / 浮动入口）的三态高亮样式 —— 与 SFTP+ 的 toolbar-btn-state 同款配色，
 * 保证两个插件的入口观感一致。
 * 三态：打开 = 灰蓝底 + 实线边框；最小化 = 灰蓝底 + 虚线边框；关闭 = 默认无高亮。
 * 刻意用中性灰蓝而非主色：面板打开时按钮不该比终端内容更抢眼。
 * 创建人：DD1024z + WorkBuddy / 创建时间：2026-09-30
 */
let _qcEntryStateStyleInjected = false
function ensureQcEntryStateStyle(): void {
  if (_qcEntryStateStyleInjected) return
  _qcEntryStateStyleInjected = true
  try {
    if (document.querySelector('style[data-qc-plus="entry-btn-state"]')) return
    const style = document.createElement('style')
    style.setAttribute('data-qc-plus', 'entry-btn-state')
    style.textContent = `
      [data-qc-entry="1"].qc-plus-btn-open {
        color: #64748b !important;
        background: rgba(100, 116, 139, 0.10) !important;
        border: 1px solid rgba(100, 116, 139, 0.55) !important;
        border-radius: 4px;
      }
      [data-qc-entry="1"].qc-plus-btn-open:hover {
        color: #475569 !important;
        background: rgba(100, 116, 139, 0.18) !important;
      }
      [data-qc-entry="1"].qc-plus-btn-minimized {
        color: #64748b !important;
        background: rgba(100, 116, 139, 0.10) !important;
        border: 1px dashed rgba(100, 116, 139, 0.55) !important;
        border-radius: 4px;
      }
    `
    document.head.appendChild(style)
  } catch { /* ignore */ }
}

@Injectable()
export class QuickCommandTerminalDecorator extends TerminalDecorator {
  /** 所有活跃终端入口的 rebuild 回调，供设置面板直接触发 */
  static rebuildRegistry = new Set<() => void>()
  private static _hotkeySubscribed = false
  /** 顶栏按钮Provider通过此静态引用触发面板切换 */
  private static _lastInstance: QuickCommandTerminalDecorator | null = null
  static togglePanelForActiveTerminalStatic(): void {
    QuickCommandTerminalDecorator._lastInstance?.togglePanelForActiveTerminal()
  }

  /** #1 修复：共享服务单例，避免每次 attach 创建新实例 */
  private static _sharedI18n: QuickCommandI18nService | null = null
  private static _sharedSvc: QuickCommandService | null = null
  static getSharedI18n(): QuickCommandI18nService {
    if (!QuickCommandTerminalDecorator._sharedI18n) QuickCommandTerminalDecorator._sharedI18n = new QuickCommandI18nService()
    return QuickCommandTerminalDecorator._sharedI18n
  }
  static getSharedSvc(): QuickCommandService {
    if (!QuickCommandTerminalDecorator._sharedSvc) QuickCommandTerminalDecorator._sharedSvc = new QuickCommandService()
    return QuickCommandTerminalDecorator._sharedSvc
  }

  /** #12 修复：使用 Symbol 避免全局命名空间污染 */
  private static readonly _SYM_ENTRY = Symbol('__qcEntry')
  private static readonly _SYM_TERMINAL = Symbol('__qcTerminal')
  private static readonly _SYM_PROFILE_ID = Symbol('__qcProfileId')
  private static readonly _SYM_PANEL_HOST = Symbol('__qcPanelHost')
  private static readonly _SYM_PANEL_OPEN = Symbol('__qcPanelOpen')
  private static readonly _SYM_MINIMIZED = Symbol('__qcMinimized')
  private static readonly _SYM_CMP_REF = Symbol('__qcCmpRef')
  private static readonly _SYM_MODE_LISTENER = Symbol('__qcModeListener')
  private static readonly _SYM_REBUILD_FN = Symbol('__qcRebuildFn')
  private static readonly _SYM_WAS_DRAG = Symbol('__qcWasDrag')
  private static readonly _SYM_STOP_VIS_SYNC = Symbol('__qcStopVisSync')

  /** #2 修复：MutationObserver 重入防护 */
  private static _observerReentryGuard = new WeakSet<HTMLElement>()

  constructor(
    private resolver: ComponentFactoryResolver,
    private appRef: ApplicationRef,
    private zone: NgZone,
    private injector: Injector,
    @Optional() private config?: ConfigService,
    @Optional() private app?: AppService,
  ) {
    super()
    QuickCommandTerminalDecorator._lastInstance = this
    // 确保颜色主题已应用（面板创建前就设置好 CSS 变量）
    this.applySavedTheme()
    console.log('[QC+] Decorator ready')
    this._subscribeHotkeys()
  }

  private _subscribeHotkeys(): void {
    if (QuickCommandTerminalDecorator._hotkeySubscribed) return
    let hotkeys: HotkeysService | null = null
    try {
      hotkeys = this.injector.get(HotkeysService as any, null) as HotkeysService | null
    } catch {
      hotkeys = null
    }
    const stream = (hotkeys as any)?.unfilteredHotkey$ || (hotkeys as any)?.hotkey$
    if (!stream?.subscribe) {
      console.warn('[QC+] HotkeysService unavailable, panel hotkey disabled')
      return
    }
    QuickCommandTerminalDecorator._hotkeySubscribed = true
    try {
      stream.subscribe((id: string) => {
        if (id !== QC_PLUS_TOGGLE_HOTKEY) return
        if (isHotkeyRecordingActive()) return
        console.log('[QC+] Panel hotkey triggered')
        this.zone.run(() => this.togglePanelForActiveTerminal())
      })
      console.log('[QC+] Panel hotkey subscribed')
    } catch (e) {
      QuickCommandTerminalDecorator._hotkeySubscribed = false
      console.warn('[QC+] Hotkey subscribe failed', e)
    }
  }

  /** 快捷键：切换当前 SSH 标签的 QuickCmd+ 面板 */
  togglePanelForActiveTerminal(): void {
    // 通过 Tabby 标签系统找到当前活跃的终端
    let hostEl: HTMLElement | null = null
    try {
      // 优先：AppService 中找活跃标签
      let tab: any = this.app?.activeTab
      if (tab) {
        if (typeof tab.getFocusedTab === 'function') {
          tab = tab.getFocusedTab() ?? tab
        }
        if (tab?.element?.nativeElement) {
          hostEl = tab.element.nativeElement as HTMLElement
        }
      }
    } catch { /* ignore */ }

    // 回退：通过 DOM 中入口按钮向上找 hostEl
    if (!hostEl || !(hostEl as any)[QuickCommandTerminalDecorator._SYM_TERMINAL]) {
      const entries = document.querySelectorAll('[data-qc-entry="1"]')
      if (entries.length > 0) {
        const entry = entries[entries.length - 1] as HTMLElement
        let el: HTMLElement | null = entry.parentElement
        while (el && !(el as any)[QuickCommandTerminalDecorator._SYM_TERMINAL]) {
          el = el.parentElement
        }
        if (el) hostEl = el
      }
    }

    if (!hostEl) return
    this.togglePanel(hostEl)
  }

  /** #11 修复：缓存已应用的主题，避免每次 attach 重复写入 CSS 变量 */
  private static _lastAppliedThemeKey = ''

  private applySavedTheme(): void {
    try {
      const root = document.documentElement

      // 从 Tabby 配置读取设置
      let fontSize = 14
      let theme = ''
      const colorMap: Record<string, string> = {}
      if (this.config?.store) {
        try {
          const cfg = this.config.store['tabby-quick-command-plus']
          if (cfg) {
            if (cfg.fontSize) fontSize = cfg.fontSize
            if (cfg.theme) theme = cfg.theme
            if (cfg.colorPrimary) { colorMap['primary'] = cfg.colorPrimary; colorMap['bg'] = cfg.colorBg; colorMap['text'] = cfg.colorText; colorMap['border'] = cfg.colorBorder; colorMap['surface'] = cfg.colorSurface }
          }
        } catch {}
      }

      // 构建缓存 key，相同配置跳过重复写入
      const cacheKey = `${theme}|${fontSize}|${Object.values(colorMap).join(',')}`
      if (cacheKey === QuickCommandTerminalDecorator._lastAppliedThemeKey) return
      QuickCommandTerminalDecorator._lastAppliedThemeKey = cacheKey

      // 先应用字体大小
      if (fontSize && fontSize !== 14) {
        root.style.setProperty('--qc-font-size', fontSize + 'px')
      }

      // 应用主题颜色
      if (Object.keys(colorMap).length > 0) {
        for (const [k, v] of Object.entries(colorMap)) {
          if (v) root.style.setProperty(`--qc-${k}`, v)
        }
        if (colorMap['border']) root.style.setProperty('--qc-hover', colorMap['border'])
        if (colorMap['bg']) root.style.setProperty('--qc-input-bg', colorMap['bg'])
        return
      }

      // 未配置颜色 → 使用预设色值
      if (!theme || theme === '') theme = this.detectTabbyTheme()
      const presets: Record<string, Record<string, string>> = {
        dark:   { primary:'#67676f', bg:'#1e1e2e', text:'#cdd6f4', border:'#585b70', surface:'#45475a', hover:'#585b70', 'input-bg':'#1e1e2e', 'text-muted':'#6c7086' },
        light:  { primary:'#2563eb', bg:'#ffffff', text:'#1a1a2e', border:'#d1d9e6', surface:'#f0f4f8', hover:'#e5e9f0', 'input-bg':'#ffffff', 'text-muted':'#8899aa' },
        blue:   { primary:'#3b9eff', bg:'#0b1929', text:'#e6f0ff', border:'#1e3a5f', surface:'#0d2240', hover:'#112a50', 'input-bg':'#091520', 'text-muted':'#5a7a9a' },
        green:  { primary:'#4ade80', bg:'#0a2016', text:'#e8fce8', border:'#1a5030', surface:'#0d2818', hover:'#103420', 'input-bg':'#081810', 'text-muted':'#3a7a5a' },
        purple: { primary:'#b794f4', bg:'#160e23', text:'#ebe0fc', border:'#3a2558', surface:'#1e1230', hover:'#281640', 'input-bg':'#120c20', 'text-muted':'#7a5a9a' },
        red:    { primary:'#f87171', bg:'#1a0808', text:'#ffe0dd', border:'#502020', surface:'#2a0e0e', hover:'#341212', 'input-bg':'#140606', 'text-muted':'#9a5a5a' },
      }
      const p = presets[theme] || presets['dark']
      for (const [k, v] of Object.entries(p)) {
        root.style.setProperty(`--qc-${k}`, v)
      }
    } catch { /* ignore */ }
  }

  /** 检测 Tabby 当前主题是亮色还是暗色 */
  private detectTabbyTheme(): 'light' | 'dark' {
    try {
      const bodyBg = getComputedStyle(document.body).backgroundColor
      if (!bodyBg || bodyBg === 'transparent' || bodyBg === 'rgba(0, 0, 0, 0)') {
        // 从 document 根元素取任意已知 CSS 变量
        const test = getComputedStyle(document.documentElement)
        // 尝试 Tabby 常用的主题 CSS 变量
        const tabbyBg = test.getPropertyValue('--body-bg').trim()
          || test.getPropertyValue('--body-background').trim()
          || test.getPropertyValue('--background').trim()
        if (tabbyBg) return isLightColor(tabbyBg) ? 'light' : 'dark'
        // 默认暗色
        return 'dark'
      }
      return isLightColor(bodyBg) ? 'light' : 'dark'
    } catch { return 'dark' }

    function isLightColor(color: string): boolean {
      const hex = color.replace(/[^0-9a-f]/gi, '')
      if (hex.length < 6) return false
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      // 亮度感知加权
      return (r * 299 + g * 587 + b * 114) / 1000 > 128
    }
  }

  override attach(terminal: any): void {
    super.attach(terminal)
    console.log('[QC+] attach called')

    // DOM 已就绪，重新应用主题（构造函数执行时可能过早）
    this.applySavedTheme()

    const entryI18n = QuickCommandTerminalDecorator.getSharedI18n()
    const qcSvc = QuickCommandTerminalDecorator.getSharedSvc()

    const tryInsert = (): boolean => {
      try {
        const hostEl = terminal?.element?.nativeElement as HTMLElement | null
        if (!hostEl) return false

        if (hostEl.querySelector('[data-qc-entry="1"]')) return true

        // 获取终端标识（SSH 会话或 profile ID）
        const ssh = terminal?.sshSession ?? terminal?._session ?? null
        let profileId = terminal?.profile?.id || ''
        if (!profileId && ssh?.host) {
          profileId = 'ssh:' + ssh.host
        }

        this.buildEntry(hostEl, terminal, ssh, profileId, entryI18n, qcSvc)
        this.listenEntryModeChange(hostEl)

        console.log('[QC+] Entry button injected')
        return true
      } catch (err) {
        console.warn('[QC+] tryInsert error', err)
        return false
      }
    }

    let attempts = 0
    const timer = setInterval(() => {
      attempts++
      if (tryInsert()) {
        clearInterval(timer)
        // 注入成功后，监听 hostEl DOM 变化：按钮被移除时自动重新注入（如 reconnect 重建工具栏）
        const hostEl = terminal?.element?.nativeElement as HTMLElement | null
        if (hostEl) {
          const obs = new MutationObserver(() => {
            if (QuickCommandTerminalDecorator._observerReentryGuard.has(hostEl)) return
            if (!hostEl.querySelector('[data-qc-entry="1"]')) {
              console.log('[QC+] Entry removed from DOM, re-injecting...')
              QuickCommandTerminalDecorator._observerReentryGuard.add(hostEl)
              tryInsert()
              setTimeout(() => QuickCommandTerminalDecorator._observerReentryGuard.delete(hostEl), 500)
            }
          })
          obs.observe(hostEl, { childList: true, subtree: true })
          this.subscribeUntilDetached(terminal, { unsubscribe: () => obs.disconnect() })
        }
        return
      }
      if (attempts > 20) {
        clearInterval(timer)
        console.log('[QC+] No terminal found after 20 attempts')
      }
    }, 500)
    this.subscribeUntilDetached(terminal, { unsubscribe: () => clearInterval(timer) })
  }

  /** 根据当前入口模式构建入口 */
  private buildEntry(hostEl: HTMLElement, terminal: any, ssh: any, profileId: string, i18n: QuickCommandI18nService, qcSvc: QuickCommandService): void {
    // ⚠️ 终端实例与连接标识必须**无条件**记录：面板发送命令完全依赖它们
    //    （`if (!this.terminalRef) return` 会让所有执行静默失效）。
    //    之前把这两行放在函数末尾，导致「全局布局提前 return」时它们一起被跳过 ⇒ 全局模式下根本无法执行命令。
    ;(hostEl as any)[QuickCommandTerminalDecorator._SYM_TERMINAL] = terminal
    ;(hostEl as any)[QuickCommandTerminalDecorator._SYM_PROFILE_ID] = profileId

    // 全局布局：面板跨标签常驻、入口在窗口顶栏 —— 终端工具栏不再显示 QC+，
    // 否则每个标签都会有一个入口，还会在某个标签的工具条上高亮（用户明确不希望）。
    if (qcSvc.getLayoutMode() === 'global') return
    const entryMode: 'floating' | 'toolbar' = qcSvc.getEntryMode()
    let entry: HTMLElement

    if (entryMode === 'toolbar') {
      entry = this.createToolbarEntry(hostEl, i18n)
    } else {
      entry = this.createFloatingEntry(hostEl, qcSvc, profileId, i18n)
      this.setupFloatingDrag(entry, hostEl, qcSvc, profileId)
    }

    if (!entry) return
    entry.setAttribute('data-qc-entry', '1')

    this.setupEntryClick(entry, hostEl, terminal, i18n, entryMode)

    ;(hostEl as any)[QuickCommandTerminalDecorator._SYM_ENTRY] = entry
    ;(hostEl as any)[QuickCommandTerminalDecorator._SYM_TERMINAL] = terminal
    ;(hostEl as any)[QuickCommandTerminalDecorator._SYM_PROFILE_ID] = profileId
    this.setupSSHDisconnect(entry, terminal, ssh, i18n)
  }

  /** 监听入口模式切换，即时重建 */
  private listenEntryModeChange(hostEl: HTMLElement): void {
    if ((hostEl as any)[QuickCommandTerminalDecorator._SYM_MODE_LISTENER]) return
    const SYM = QuickCommandTerminalDecorator
    const rebuild = () => {
      // 清除旧入口
      const oldEntry = (hostEl as any)[SYM._SYM_ENTRY] as HTMLElement | null
      if (oldEntry) {
        oldEntry.remove()
        delete (hostEl as any)[SYM._SYM_ENTRY]
      }
      // 关闭面板
      if ((hostEl as any)[SYM._SYM_PANEL_OPEN]) this.closePanel(hostEl)
      // 重建
      const terminal = (hostEl as any)[SYM._SYM_TERMINAL]
      const ssh = terminal?.sshSession ?? terminal?._session ?? null
      let profileId = terminal?.profile?.id || ''
      if (!profileId && ssh?.host) profileId = 'ssh:' + ssh.host
      this.buildEntry(hostEl, terminal, ssh, profileId, QuickCommandTerminalDecorator.getSharedI18n(), QuickCommandTerminalDecorator.getSharedSvc())
    }

    // 三通道触发重建
    window.addEventListener('qc-plus-entry-mode-changed', rebuild)
    window.addEventListener('qc-plus-layout-mode-changed', rebuild)
    hostEl.addEventListener('qc-mode-change', rebuild)
    QuickCommandTerminalDecorator.rebuildRegistry.add(rebuild)

    ;(hostEl as any)[SYM._SYM_MODE_LISTENER] = true
    ;(hostEl as any)[SYM._SYM_REBUILD_FN] = rebuild

    // 终端分离时自动清理监听器
    const terminal = (hostEl as any)[SYM._SYM_TERMINAL]
    if (terminal) {
      this.subscribeUntilDetached(terminal, {
        unsubscribe: () => {
          window.removeEventListener('qc-plus-entry-mode-changed', rebuild)
          window.removeEventListener('qc-plus-layout-mode-changed', rebuild)
          hostEl.removeEventListener('qc-mode-change', rebuild)
          QuickCommandTerminalDecorator.rebuildRegistry.delete(rebuild)
          delete (hostEl as any)[SYM._SYM_MODE_LISTENER]
          delete (hostEl as any)[SYM._SYM_REBUILD_FN]
        }
      })
    }
  }

  /** 供设置面板直接调用的全局重建入口 */
  static rebuildAll(): void {
    for (const fn of QuickCommandTerminalDecorator.rebuildRegistry) {
      try { fn() } catch {}
    }
  }

  /** 创建浮动入口（可拖拽） */
  private createFloatingEntry(hostEl: HTMLElement, qcSvc: QuickCommandService, profileId: string, i18n: QuickCommandI18nService): HTMLElement | null {
    const entry = document.createElement('div')
    entry.style.cssText = `
      position: absolute; z-index: 50;
      cursor: move; user-select: none;
      display: flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 6px;
      background: var(--qc-surface, #45475a);
      border: 0.5px solid var(--qc-primary, #b6b6c3);
      font-size: var(--qc-font-size, 12px); color: var(--qc-primary, #b6b6c3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.4;
      pointer-events: auto;
      transition: opacity 0.2s;
      opacity: 0.85;
    `
    entry.title = 'QuickCmd+'
    entry.innerHTML = '<svg viewBox="0 0 1024 1024" width="12" height="12" fill="currentColor" style="vertical-align:middle"><path d="M89.6 806.4h844.8V217.6H89.6v588.8zM0 128h1024v768H0V128z m242.816 577.536L192 654.72l154.304-154.368L192 346.048l50.816-50.816L448 500.352 242.816 705.536z m584.32 13.248H512V640h315.072v78.72z"/></svg>&nbsp;QC+ <span style="color:var(--qc-text-muted,#6c7086);font-size:calc(var(--qc-font-size,14px) - 1px);">&#x22EE;&#x22EE;</span>'

    // 位置恢复（入口按钮位置全局统一）
    {
      const savedPos = qcSvc.getEntryPosition()
      const isDefault = savedPos.x === 20 && savedPos.y === 60
      if (isDefault) {
        entry.style.top = '60px'
        entry.style.right = '16px'
      } else {
        entry.style.left = savedPos.x + 'px'
        entry.style.top = savedPos.y + 'px'
      }
    }

    entry.addEventListener('mouseenter', () => { entry.style.opacity = '1' })
    entry.addEventListener('mouseleave', () => { entry.style.opacity = '0.85' })

    hostEl.style.position = 'relative'
    hostEl.appendChild(entry)
    return entry
  }

  /** 创建工具栏按钮入口（类似 SFTP+） */
  private createToolbarEntry(hostEl: HTMLElement, i18n: QuickCommandI18nService): HTMLElement | null {
    // 查找工具栏容器（兼容多种 Tabby 版本）
    const toolbar =
      hostEl.querySelector('.terminal-toolbar') ??
      hostEl.querySelector('terminal-toolbar') ??
      hostEl.querySelector('.btn-toolbar')

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'btn btn-sm btn-link me-2'
    btn.setAttribute('data-qc-entry', '1')
    btn.innerHTML = '<svg viewBox="0 0 1024 1024" width="13" height="13" fill="currentColor" style="vertical-align:middle"><path d="M89.6 806.4h844.8V217.6H89.6v588.8zM0 128h1024v768H0V128z m242.816 577.536L192 654.72l154.304-154.368L192 346.048l50.816-50.816L448 500.352 242.816 705.536z m584.32 13.248H512V640h315.072v78.72z"/></svg>&nbsp;QC+'
    btn.title = 'QuickCmd+'
    btn.style.pointerEvents = 'auto'

    if (toolbar) {
      // 有工具栏 → 作为工具栏按钮插入
      btn.style.position = 'relative'
      btn.style.zIndex = '10'

      const allButtons = Array.from(toolbar.querySelectorAll('button'))
      // 优先插入到 SFTP+ 按钮后面（保持顺序一致）
      const sftpBtn = allButtons.find(b => b.getAttribute('data-tabby-sftp-plus-button') === '1')
      if (sftpBtn?.parentElement) {
        sftpBtn.parentElement.insertBefore(btn, sftpBtn.nextSibling)
      } else {
        const reconnectButton = allButtons.find(b => /reconnect|переподключ/i.test(`${b.textContent ?? ''} ${b.title ?? ''}`))
        if (reconnectButton?.parentElement) {
          reconnectButton.parentElement.insertBefore(btn, reconnectButton.nextSibling)
        } else {
          toolbar.appendChild(btn)
        }
      }
    } else {
      // 无工具栏（cmd/powershell 等本地终端）→ 右上角浮动定位
      btn.style.position = 'absolute'
      btn.style.top = '8px'
      btn.style.right = '8px'
      btn.style.zIndex = '50'
      btn.style.border = '0.5px solid var(--qc-primary, #b6b6c3)'
      btn.style.borderRadius = '6px'
      btn.style.padding = '3px 8px'
      btn.style.background = 'var(--qc-surface, #45475a)'
      btn.style.color = 'var(--qc-primary, #b6b6c3)'
      btn.style.fontSize = 'var(--qc-font-size, 12px)'
      btn.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
      btn.style.lineHeight = '1.4'
      btn.style.cursor = 'pointer'
      btn.style.opacity = '0.85'
      btn.style.transition = 'opacity 0.2s'
      btn.addEventListener('mouseenter', () => { btn.style.opacity = '1' })
      btn.addEventListener('mouseleave', () => { btn.style.opacity = '0.85' })

      hostEl.style.position = 'relative'
      hostEl.appendChild(btn)
    }

    return btn
  }

  /** 浮动入口拖拽逻辑 */
  private setupFloatingDrag(entry: HTMLElement, hostEl: HTMLElement, qcSvc: QuickCommandService, profileId: string): void {
    const SYM_WAS_DRAG = QuickCommandTerminalDecorator._SYM_WAS_DRAG
    ;(entry as any)[SYM_WAS_DRAG] = false

    entry.addEventListener('mousedown', (ev: MouseEvent) => {
      ev.stopPropagation()
      ;(entry as any)[SYM_WAS_DRAG] = false
    })

    let dragging = false
    let offsetX = 0, offsetY = 0
    let entryStartX = 0, entryStartY = 0

    entry.addEventListener('mousedown', (ev: MouseEvent) => {
      if (ev.button !== 0) return
      const rect = entry.getBoundingClientRect()
      const hr = hostEl.getBoundingClientRect()
      offsetX = ev.clientX - rect.left
      offsetY = ev.clientY - rect.top
      entryStartX = ev.clientX
      entryStartY = ev.clientY
      dragging = false

      const onMove = (me: MouseEvent) => {
        me.preventDefault()
        if (Math.abs(me.clientX - entryStartX) > 4 || Math.abs(me.clientY - entryStartY) > 4) {
          dragging = true
          ;(entry as any)[SYM_WAS_DRAG] = true
        }
        if (!dragging) return
        let nl = me.clientX - hr.left - offsetX
        let nt = me.clientY - hr.top - offsetY
        const ew = entry.offsetWidth, eh = entry.offsetHeight
        nl = Math.max(0, Math.min(nl, hostEl.clientWidth - ew))
        nt = Math.max(0, Math.min(nt, hostEl.clientHeight - eh))
        entry.style.top = nt + 'px'
        entry.style.right = 'auto'
        entry.style.left = nl + 'px'
        me.stopPropagation()
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        if (dragging) {
          const x = parseInt(entry.style.left) || 0
          const y = parseInt(entry.style.top) || 0
          qcSvc.saveEntryPosition({ x, y })
        }
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  }

  /** 共享点击处理：打开/切换面板 */
  private setupEntryClick(entry: HTMLElement, hostEl: HTMLElement, terminal: any, i18n: QuickCommandI18nService, entryMode: string): void {
    const isButton = entry.tagName === 'BUTTON'
    const SYM_WAS_DRAG = QuickCommandTerminalDecorator._SYM_WAS_DRAG
    entry.addEventListener('click', (ev: MouseEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      // 拖拽后不触发面板（仅浮动入口有拖拽）
      if ((entry as any)[SYM_WAS_DRAG]) {
        ;(entry as any)[SYM_WAS_DRAG] = false
        return
      }
      const ssh = terminal?.sshSession ?? terminal?._session ?? null
      if (ssh && (ssh.open === false || ssh.closed)) {
        entry.style.opacity = '0.3'
        if (isButton) (entry as HTMLButtonElement).disabled = true
        entry.title = i18n.t('entry.disconnected')
        return
      }
      this.togglePanel(hostEl)
    })
  }

  /** 共享 SSH 断开检测 */
  private setupSSHDisconnect(entry: HTMLElement, terminal: any, ssh: any, i18n: QuickCommandI18nService): void {
    if (!ssh) return
    const isButton = entry.tagName === 'BUTTON'
    const markDisconnected = () => {
      entry.style.opacity = '0.3'
      entry.style.cursor = 'not-allowed'
      if (isButton) (entry as HTMLButtonElement).disabled = true
      entry.title = i18n.t('entry.disconnected')
    }
    try {
      if (ssh?.closed$) {
        const sub = ssh.closed$.subscribe(markDisconnected)
        this.subscribeUntilDetached(terminal, { unsubscribe: () => { try { sub.unsubscribe() } catch {} } })
      } else if (typeof ssh?.closed?.then === 'function') {
        ssh.closed.then(markDisconnected).catch(() => {})
      }
    } catch { /* ignore */ }
  }

  private togglePanel(hostEl: HTMLElement): void {
    const SYM = QuickCommandTerminalDecorator
    if ((hostEl as any)[SYM._SYM_PANEL_OPEN] && (hostEl as any)[SYM._SYM_MINIMIZED]) {
      this.restorePanel(hostEl)
      return
    }
    if ((hostEl as any)[SYM._SYM_PANEL_OPEN]) {
      this.closePanel(hostEl)
      return
    }

    this.zone.run(() => {
      try {
        // 挂到 document.body 下（与 SFTP+ overlay 同源），保证跨插件共享同一 body 层叠上下文，
        // 这样共享 z-index 计数器(__tabbyFloatZ)才能正确比较"谁后开/谁点击谁在最上"。
        // 若挂在 hostEl(终端 pane) 内，面板 z-index 会被 pane 自身的层叠上下文封顶，永远浮不出
        // 该子树，导致 QC+ 无法压在 SFTP+ overlay(body 级) 之上。
        const panelHost = document.createElement('div')
        panelHost.setAttribute('data-qc-panel-host', '1')
        document.body.appendChild(panelHost)
        ;(hostEl as any)[SYM._SYM_PANEL_HOST] = panelHost
        ;(hostEl as any)[SYM._SYM_PANEL_OPEN] = true
        ;(hostEl as any)[SYM._SYM_MINIMIZED] = false
        this._syncQcEntryState(hostEl)

        const factory = this.resolver.resolveComponentFactory(QuickCommandFloatingPanel)
        const cmpRef = factory.create(this.injector, [], panelHost)
        const cmp = cmpRef.instance
        ;(hostEl as any)[SYM._SYM_CMP_REF] = cmpRef

        cmp.terminalRef = (hostEl as any)[SYM._SYM_TERMINAL]
        cmp.profileId = (hostEl as any)[SYM._SYM_PROFILE_ID] || ''
        cmp.terminalHostEl = hostEl

        // 根据入口按钮位置计算面板最佳位置
        this.positionPanelAtDefault(hostEl, cmp)

        cmp.onClose = () => {
          this.zone.run(() => { this.closePanel(hostEl) })
        }
        // 面板标题栏齿轮 → 打开 Tabby 设置页并定位到 QuickCmd+ 菜单（同 SFTP+ open-settings 策略）
        cmp.onOpenSettings = () => {
          this.zone.run(() => {
            try { if (this.app) openQuickCmdPlusSettings(this.app) } catch { /* ignore */ }
          })
        }
        cmp.onMinimize = () => {
          this.zone.run(() => {
            const ph = (hostEl as any)[SYM._SYM_PANEL_HOST] as HTMLElement
            if (ph) ph.style.display = 'none'
            ;(hostEl as any)[SYM._SYM_MINIMIZED] = true
            cmp.minimized = true
            this._syncQcEntryState(hostEl)
          })
        }

        // 面板切换：入口隐藏时按下ESC或其他方式关闭入口时也关闭面板
        this.appRef.attachView(cmpRef.hostView)
        cmpRef.changeDetectorRef.detectChanges()

        // 确保 terminalRef/profileId 已就绪后应用位置记忆
        cmp.applyPositionMemory()
        // 再次触发变更检测确保 filterGroup 等状态正确渲染
        cmpRef.changeDetectorRef.detectChanges()

        // 置顶：刚打开的面板应在最上层（跨插件共用计数器，避免被 SFTP+ 等压盖）
        const panelEl = panelHost.querySelector('.qc-panel') as HTMLElement | null
        if (panelEl) {
          bringFloatToFront(panelEl)
          panelEl.addEventListener('mousedown', () => bringFloatToFront(panelEl), true)
        }

        // 阻止面板区域内鼠标事件冒泡到终端
        panelHost.addEventListener('mousedown', (ev: MouseEvent) => ev.stopPropagation())
        panelHost.addEventListener('click', (ev: MouseEvent) => ev.stopPropagation())

        // 可见性同步（与 SFTP+ 同思路）：面板挂到 body 后需自行跟随所属 pane 的显示状态，
        // 否则会脱离"按 split 隔离"——pane 断开 / 标签切换 / 非活动 split 时面板应隐藏，
        // pane 重新可见再显示。避免 body 挂载导致跨 tab / 跨 split 残留。
        let rafId: number | null = null
        let qcVisible = true
        let lastPaneW = -1
        let lastPaneH = -1
        const syncVisibility = () => {
          if (!document.body.contains(panelHost)) return
          // 全局布局：面板跨标签常驻 —— 与「宿主 pane 是否属于当前活动标签」无关，
          // 只有切到 Tabby 设置页时才隐藏（局部布局则维持原有的归属判断）
          const isGlobal = QuickCommandTerminalDecorator.getSharedSvc().getLayoutMode() === 'global'
          if (!hostEl.isConnected && !isGlobal) {
            if (qcVisible) { panelHost.style.display = 'none'; qcVisible = false }
            rafId = requestAnimationFrame(syncVisibility)
            return
          }
          const rect = hostEl.getBoundingClientRect()
          // ★ 拆分比例 / 窗口尺寸变化时，让面板几何跟着 pane 自适应（对齐 SFTP+ 的 followWindow 思路）：
          //   仅在 pane 尺寸真的变化时重算，避免每帧写属性造成无谓的变更检测
          if (rect.width !== lastPaneW || rect.height !== lastPaneH) {
            lastPaneW = rect.width; lastPaneH = rect.height
            if (rect.width > 0 && rect.height > 0) this.zone.run(() => cmp.clampToHostPane(hostEl))
          }
          // ★ 修复：仅靠 rect==0 判断"宿主不可见"不覆盖设置页场景 —— 活动标签切到设置等
          // 非终端 tab 时宿主 pane 虽被隐藏，但部分 Tabby 版本下 rect 检测不可靠，面板会残留。
          // 这里加一层归属判断：活动 tab 的 DOM 必须包含本面板的宿主 pane，否则一律隐藏。
          // 注意必须用 hostView.rootNodes[0]（typings 确认的 tab 宿主节点），不能用运行时挂的
          // tab.element —— element 指向的是共享挂载容器，contains(宿主 pane) 恒为 true，判断失效。
          // app 注入失败 / 拿不到宿主节点时退回纯 rect 逻辑。
          const at: any = this.app?.activeTab ?? null
          const atRoot = (at?.hostView?.rootNodes?.[0] ?? null) as HTMLElement | null
          const isSettingsTab = !!(at && ((at as any).settingsProviders || at.constructor?.name === 'SettingsTabComponent'))
          const ownerVisible = isGlobal
            ? !isSettingsTab
            : (!at || !atRoot || atRoot.contains(hostEl))
          const hidden = isGlobal
            ? isSettingsTab
            : (!ownerVisible || (rect.width === 0 && rect.height === 0))
          if (hidden) {
            if (qcVisible) { panelHost.style.display = 'none'; qcVisible = false }
          } else if (!qcVisible && !(hostEl as any)[SYM._SYM_MINIMIZED]) {
            panelHost.style.display = ''
            qcVisible = true
          }
          rafId = requestAnimationFrame(syncVisibility)
        }
        ;(hostEl as any)[SYM._SYM_STOP_VIS_SYNC] = () => {
          if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null }
        }
        syncVisibility()

        console.log('[QC+] Panel opened')
      } catch (e) {
        console.error('[QC+] Panel error', e)
      }
    })
  }

  /**
   * 根据入口按钮位置，自动选择面板的最佳显示方位
   * 使用 getBoundingClientRect 确保位置精确
   * 面板尺寸 320x420，紧贴按钮旁展开，避免超出边界
   */
  /**
   * 面板默认位置：**收口到面板组件自身的 computeDefaultPos()**（右缘对齐 SFTP+、顶边高一个标题栏）。
   * ⚠️ 不要在装饰器里再复制一份公式 —— 两处实现必然漂移（本轮就是因此出现「标题栏被顶栏压住」）。
   */
  private positionPanelAtDefault(hostEl: HTMLElement, cmp: QuickCommandFloatingPanel): void {
    const r = hostEl.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    const pos = cmp.computeDefaultPos(hostEl)
    cmp.panelX = pos.x
    cmp.panelY = pos.y
  }

  private closePanel(hostEl: HTMLElement): void {
    const SYM = QuickCommandTerminalDecorator
    try {
      const cmpRef = (hostEl as any)[SYM._SYM_CMP_REF]
      if (cmpRef) { try { cmpRef.destroy() } catch {} }
      const ph = (hostEl as any)[SYM._SYM_PANEL_HOST] as HTMLElement
      if (ph) { try { ph.remove() } catch {} }
    } catch {}
    // 取消可见性同步 rAF
    try { (hostEl as any)[SYM._SYM_STOP_VIS_SYNC]?.() } catch { /* ignore */ }
    try { delete (hostEl as any)[SYM._SYM_STOP_VIS_SYNC] } catch { /* ignore */ }
    delete (hostEl as any)[SYM._SYM_PANEL_OPEN]
    delete (hostEl as any)[SYM._SYM_MINIMIZED]
    delete (hostEl as any)[SYM._SYM_PANEL_HOST]
    delete (hostEl as any)[SYM._SYM_CMP_REF]
    this._syncQcEntryState(hostEl)
  }

  private restorePanel(hostEl: HTMLElement): void {
    const SYM = QuickCommandTerminalDecorator
    const ph = (hostEl as any)[SYM._SYM_PANEL_HOST] as HTMLElement
    const cmpRef = (hostEl as any)[SYM._SYM_CMP_REF] as any
    if (ph) {
      ph.style.display = ''
      // 置顶：从最小化恢复时，面板应回到最上层（原先仅恢复显示、位置不变，会被后开的面板压住）
      const panelEl = ph.querySelector('.qc-panel') as HTMLElement | null
      if (panelEl) bringFloatToFront(panelEl)
      ;(hostEl as any)[SYM._SYM_MINIMIZED] = false
      if (cmpRef?.instance) {
        cmpRef.instance.minimized = false
        // 恢复时重新定位
        this.positionPanelAtDefault(hostEl, cmpRef.instance)
      }
    }
    this._syncQcEntryState(hostEl)
  }

  /**
   * 同步入口按钮（工具栏按钮 / 浮动入口）的高亮态 —— 参考 SFTP+ `_syncToolbarBtnState`。
   * 三态：打开 = 灰蓝 + 实线边框；最小化 = 灰蓝 + 虚线边框（面板仍在，点击可恢复）；关闭 = 无高亮。
   * 同时更新 title 提示当前状态；面板打开/最小化/恢复/关闭四个时机均需调用。
   */
  private _syncQcEntryState(hostEl: HTMLElement): void {
    try {
      ensureQcEntryStateStyle()
      const SYM = QuickCommandTerminalDecorator
      let entry = (hostEl as any)[SYM._SYM_ENTRY] as HTMLElement | null
      if (!entry || !entry.isConnected) {
        entry = hostEl.querySelector?.('[data-qc-entry="1"]') as HTMLElement | null
        if (entry) (hostEl as any)[SYM._SYM_ENTRY] = entry
      }
      if (!entry) return

      entry.classList.remove('qc-plus-btn-open', 'qc-plus-btn-minimized')
      // 禁用态（如 SSH 已断开）不高亮，避免给出"面板可用"的错误暗示
      if ((entry as HTMLButtonElement).disabled) return

      const open = !!(hostEl as any)[SYM._SYM_PANEL_OPEN]
      const minimized = !!(hostEl as any)[SYM._SYM_MINIMIZED]
      const i18n = QuickCommandTerminalDecorator.getSharedI18n()
      if (!open) {
        entry.title = 'QuickCmd+'
        return
      }
      if (minimized) {
        entry.classList.add('qc-plus-btn-minimized')
        entry.title = 'QuickCmd+（' + i18n.t('entry.minimized') + '）'
      } else {
        entry.classList.add('qc-plus-btn-open')
        entry.title = 'QuickCmd+（' + i18n.t('entry.opened') + '）'
      }
    } catch { /* ignore */ }
  }
}

/* #12 修复：移除全局 window.__qcRebuildEntry，改用 rebuildRegistry
 * 设置面板应通过 QuickCommandTerminalDecorator.rebuildAll() 触发重建 */
