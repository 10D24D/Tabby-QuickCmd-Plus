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
 */
import { Injectable, Injector, ComponentFactoryResolver, ApplicationRef, NgZone } from '@angular/core'
import { TerminalDecorator } from 'tabby-terminal'
import { QuickCommandFloatingPanel } from './qc-floating-panel.component'
import { QuickCommandService } from './qc-command.service'
import { QuickCommandI18nService } from './qc-i18n.service'

@Injectable()
export class QuickCommandTerminalDecorator extends TerminalDecorator {
  /** 所有活跃终端入口的 rebuild 回调，供设置面板直接触发 */
  static rebuildRegistry = new Set<() => void>()

  constructor(
    private resolver: ComponentFactoryResolver,
    private appRef: ApplicationRef,
    private zone: NgZone,
    private injector: Injector,
  ) {
    super()
    // 确保颜色主题已应用（面板创建前就设置好 CSS 变量）
    this.applySavedTheme()
    console.log('[QC+] Decorator ready')
  }

  private applySavedTheme(): void {
    try {
      // 先应用字体大小（不依赖主题设置）
      const root = document.documentElement
      const savedFontSize = localStorage.getItem('qc-plus-font-size')
      if (savedFontSize && !root.style.getPropertyValue('--qc-font-size')) {
        root.style.setProperty('--qc-font-size', savedFontSize + 'px')
      }

      // 如果是 Auto 模式（theme 为空），不做颜色设置
      const theme = localStorage.getItem('qc-plus-theme')
      if (!theme || theme === '') return

      const keys = ['primary', 'bg', 'text', 'border', 'surface', 'hover', 'input-bg', 'text-muted']
      let applied = false
      for (const k of keys) {
        const val = localStorage.getItem(`qc-plus-color-${k}`)
        if (val && !root.style.getPropertyValue(`--qc-${k}`)) {
          root.style.setProperty(`--qc-${k}`, val)
          applied = true
        }
      }
      if (applied) console.log('[QC+] Color theme applied')
    } catch { /* ignore */ }
  }

  override attach(terminal: any): void {
    super.attach(terminal)
    console.log('[QC+] attach called')

    const entryI18n = new QuickCommandI18nService()
    const qcSvc = new QuickCommandService()

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
      if (tryInsert() || attempts > 20) {
        clearInterval(timer)
        if (attempts > 20) console.log('[QC+] No terminal found after 20 attempts')
      }
    }, 500)
    this.subscribeUntilDetached(terminal, { unsubscribe: () => clearInterval(timer) })
  }

  /** 根据当前入口模式构建入口 */
  private buildEntry(hostEl: HTMLElement, terminal: any, ssh: any, profileId: string, i18n: QuickCommandI18nService, qcSvc: QuickCommandService): void {
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

    ;(hostEl as any).__qcEntry = entry
    ;(hostEl as any).__qcTerminal = terminal
    ;(hostEl as any).__qcProfileId = profileId
    this.setupSSHDisconnect(entry, terminal, ssh, i18n)
  }

  /** 监听入口模式切换，即时重建 */
  private listenEntryModeChange(hostEl: HTMLElement): void {
    if ((hostEl as any).__qcModeListener) return

    const rebuild = () => {
      // 清除旧入口
      const oldEntry = (hostEl as any).__qcEntry as HTMLElement | null
      if (oldEntry) {
        oldEntry.remove()
        delete (hostEl as any).__qcEntry
      }
      // 关闭面板
      if ((hostEl as any).__qcPanelOpen) this.closePanel(hostEl)
      // 重建
      const terminal = (hostEl as any).__qcTerminal
      const ssh = terminal?.sshSession ?? terminal?._session ?? null
      let profileId = terminal?.profile?.id || ''
      if (!profileId && ssh?.host) profileId = 'ssh:' + ssh.host
      this.buildEntry(hostEl, terminal, ssh, profileId, new QuickCommandI18nService(), new QuickCommandService())
    }

    // 三通道触发重建
    window.addEventListener('qc-plus-entry-mode-changed', rebuild)
    hostEl.addEventListener('qc-mode-change', rebuild)
    QuickCommandTerminalDecorator.rebuildRegistry.add(rebuild)

    ;(hostEl as any).__qcModeListener = true
    ;(hostEl as any).__qcRebuildFn = rebuild

    // 终端分离时自动清理监听器
    const terminal = (hostEl as any).__qcTerminal
    if (terminal) {
      this.subscribeUntilDetached(terminal, {
        unsubscribe: () => {
          window.removeEventListener('qc-plus-entry-mode-changed', rebuild)
          hostEl.removeEventListener('qc-mode-change', rebuild)
          QuickCommandTerminalDecorator.rebuildRegistry.delete(rebuild)
          delete (hostEl as any).__qcModeListener
          delete (hostEl as any).__qcRebuildFn
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
      position: absolute; z-index: 99997;
      cursor: move; user-select: none;
      display: flex; align-items: center; gap: 4px;
      padding: 3px 8px; border-radius: 6px;
      background: var(--qc-surface, #45475a);
      border: 0.5px solid var(--qc-primary, #b4befe);
      font-size: var(--qc-font-size, 12px); color: var(--qc-primary, #b4befe);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      line-height: 1.4;
      pointer-events: auto;
      transition: opacity 0.2s;
      opacity: 0.85;
    `
    entry.title = i18n.t('entry.title')
    entry.innerHTML = '&gt;_&nbsp;QC+ <span style="color:var(--qc-text-muted,#6c7086);font-size:calc(var(--qc-font-size,14px) - 1px);">&#x22EE;&#x22EE;</span>'

    // 位置恢复
    const mem = profileId ? qcSvc.getPositionMemory(profileId) : null
    if (mem) {
      entry.style.left = mem.entryX + 'px'
      entry.style.top = mem.entryY + 'px'
    } else {
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
    btn.innerHTML = '&gt;_&nbsp;QC+'
    btn.title = i18n.t('entry.title')
    btn.style.pointerEvents = 'auto'

    if (toolbar) {
      // 有工具栏 → 作为工具栏按钮插入
      btn.style.position = 'relative'
      btn.style.zIndex = '10'

      const allButtons = Array.from(toolbar.querySelectorAll('button'))
      const reconnectButton = allButtons.find(b => /reconnect|переподключ/i.test(`${b.textContent ?? ''} ${b.title ?? ''}`))
      if (reconnectButton?.parentElement) {
        reconnectButton.parentElement.insertBefore(btn, reconnectButton.nextSibling)
      } else {
        toolbar.appendChild(btn)
      }
    } else {
      // 无工具栏（cmd/powershell 等本地终端）→ 右上角浮动定位
      btn.style.position = 'absolute'
      btn.style.top = '8px'
      btn.style.right = '8px'
      btn.style.zIndex = '99997'
      btn.style.border = '0.5px solid var(--qc-primary, #b4befe)'
      btn.style.borderRadius = '6px'
      btn.style.padding = '3px 8px'
      btn.style.background = 'var(--qc-surface, #45475a)'
      btn.style.color = 'var(--qc-primary, #b4befe)'
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
    (entry as any).__qcWasDrag = false

    entry.addEventListener('mousedown', (ev: MouseEvent) => {
      ev.stopPropagation()
      ;(entry as any).__qcWasDrag = false
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
          ;(entry as any).__qcWasDrag = true
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
          if (profileId && qcSvc.hasPositionMemory(profileId)) {
            qcSvc.savePositionMemory(profileId, { entryX: x, entryY: y })
          } else {
            qcSvc.saveEntryPosition({ x, y })
          }
        }
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    })
  }

  /** 共享点击处理：打开/切换面板 */
  private setupEntryClick(entry: HTMLElement, hostEl: HTMLElement, terminal: any, i18n: QuickCommandI18nService, entryMode: string): void {
    const isButton = entry.tagName === 'BUTTON'
    entry.addEventListener('click', (ev: MouseEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      // 拖拽后不触发面板（仅浮动入口有拖拽）
      if ((entry as any).__qcWasDrag) {
        ;(entry as any).__qcWasDrag = false
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
    if ((hostEl as any).__qcPanelOpen && (hostEl as any).__qcMinimized) {
      this.restorePanel(hostEl)
      return
    }
    if ((hostEl as any).__qcPanelOpen) {
      this.closePanel(hostEl)
      return
    }

    this.zone.run(() => {
      try {
        // 直接挂到 hostEl 下（无覆盖层）
        const panelHost = document.createElement('div')
        panelHost.setAttribute('data-qc-panel-host', '1')
        hostEl.appendChild(panelHost)
        ;(hostEl as any).__qcPanelHost = panelHost
        ;(hostEl as any).__qcPanelOpen = true
        ;(hostEl as any).__qcMinimized = false

        const factory = this.resolver.resolveComponentFactory(QuickCommandFloatingPanel)
        const cmpRef = factory.create(this.injector, [], panelHost)
        const cmp = cmpRef.instance
        ;(hostEl as any).__qcCmpRef = cmpRef

        cmp.terminalRef = (hostEl as any).__qcTerminal
        cmp.profileId = (hostEl as any).__qcProfileId || ''

        // 根据入口按钮位置计算面板最佳位置
        this.positionPanelNearEntry(hostEl, cmp)

        cmp.onClose = () => {
          this.zone.run(() => { this.closePanel(hostEl) })
        }
        cmp.onMinimize = () => {
          this.zone.run(() => {
            const ph = (hostEl as any).__qcPanelHost as HTMLElement
            if (ph) ph.style.display = 'none'
            ;(hostEl as any).__qcMinimized = true
            cmp.minimized = true
          })
        }

        // 面板切换：入口隐藏时按下ESC或其他方式关闭入口时也关闭面板
        this.appRef.attachView(cmpRef.hostView)
        cmpRef.changeDetectorRef.detectChanges()

        // 确保 terminalRef/profileId 已就绪后应用位置记忆
        cmp.applyPositionMemory()
        // 再次触发变更检测确保 filterGroup 等状态正确渲染
        cmpRef.changeDetectorRef.detectChanges()

        // 阻止面板区域内鼠标事件冒泡到终端
        panelHost.addEventListener('mousedown', (ev: MouseEvent) => ev.stopPropagation())
        panelHost.addEventListener('click', (ev: MouseEvent) => ev.stopPropagation())

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
  private positionPanelNearEntry(hostEl: HTMLElement, cmp: QuickCommandFloatingPanel): void {
    const entry = (hostEl as any).__qcEntry as HTMLElement
    if (!entry) return

    const hostRect = hostEl.getBoundingClientRect()
    const entryRect = entry.getBoundingClientRect()

    // 入口相对于 hostEl 的位置
    const entryLeft = entryRect.left - hostRect.left
    const entryTop = entryRect.top - hostRect.top
    const entryW = entryRect.width
    const entryH = entryRect.height

    const hostW = hostEl.clientWidth
    const hostH = hostEl.clientHeight
    const panelW = 320
    const panelH = 420
    const gap = 4

    let px: number, py: number

    // 水平：按钮在哪侧，面板就贴在哪侧
    if (entryLeft + entryW / 2 < hostW / 2) {
      px = entryLeft + entryW + gap  // 按钮右侧
    } else {
      px = entryLeft - panelW - gap  // 按钮左侧
    }

    // 垂直：按钮在哪侧，面板就贴在哪侧
    if (entryTop + entryH / 2 < hostH / 2) {
      py = entryTop                        // 按钮下方
    } else {
      py = entryTop - panelH + entryH      // 按钮上方
    }

    // 边界约束
    px = Math.max(4, Math.min(px, hostW - panelW - 4))
    py = Math.max(4, Math.min(py, hostH - panelH - 4))

    cmp.panelX = Math.round(px)
    cmp.panelY = Math.round(py)
  }

  private closePanel(hostEl: HTMLElement): void {
    try {
      const cmpRef = (hostEl as any).__qcCmpRef
      if (cmpRef) { try { cmpRef.destroy() } catch {} }
      const ph = (hostEl as any).__qcPanelHost as HTMLElement
      if (ph) { try { ph.remove() } catch {} }
    } catch {}
    delete (hostEl as any).__qcPanelOpen
    delete (hostEl as any).__qcMinimized
    delete (hostEl as any).__qcPanelHost
    delete (hostEl as any).__qcCmpRef
  }

  private restorePanel(hostEl: HTMLElement): void {
    const ph = (hostEl as any).__qcPanelHost as HTMLElement
    const cmpRef = (hostEl as any).__qcCmpRef as any
    if (ph) {
      ph.style.display = ''
      ;(hostEl as any).__qcMinimized = false
      if (cmpRef?.instance) {
        cmpRef.instance.minimized = false
        // 恢复时重新定位
        this.positionPanelNearEntry(hostEl, cmpRef.instance)
      }
    }
  }
}

/* 全局回调：由设置面板 onEntryModeChange 触发重建 */
;(window as any).__qcRebuildEntry = () => QuickCommandTerminalDecorator.rebuildAll()
