/**
 * 快捷命令数据服务
 * 功能描述：命令 CRUD + 分组管理 + localStorage 持久化
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 */

export interface CommandStep {
  text: string
  /** 该步骤执行后的延迟（秒），0 表示无延迟立即执行下一步 */
  delaySeconds: number
  /** 步骤类型：'command' 发送命令文本，'break' 发送 Ctrl+C 中断 */
  type?: 'command' | 'break'
}

export interface QuickCommand {
  id: string
  name: string
  /** 命令内容，多行文本（旧版兼容，新版使用 steps） */
  text: string
  /** 命令步骤列表（新版），每步包含命令内容和独立延迟时间 */
  steps?: CommandStep[]
  group: string         // 分组名，空字符串表示未分组
  appendCR: boolean     // 自动追加换行
  sendCtrlC?: boolean   // 执行前发送 Ctrl+C 终止当前命令
  sendCtrlCAfter?: boolean // 执行后发送 Ctrl+C 终止命令
  /** 全局步骤间延迟（秒），仅对 text 多行模式生效（旧版兼容） */
  delaySeconds?: number
  shortcut?: string     // 快捷键（可选）
  color?: string        // 显示颜色（可选）
  params?: string[]     // 变量参数名列表
  pinned?: boolean      // 是否固定在快捷入口
  createdAt: number
  updatedAt: number
  usageCount: number    // 使用频率
  sshProfiles?: string[] // SSH profile ID 列表，为空则表示所有都可用
}

export interface QuickCommandGroup {
  name: string
  color?: string
  expanded: boolean     // 是否在面板中展开
  order: number
}

export interface PositionMemoryData {
  entryX: number
  entryY: number
  panelX: number
  panelY: number
  panelScrollTop: number
  filterGroup?: string
  groupExpanded?: Record<string, boolean>
}

// ... existing interfaces ...

const STORAGE_KEY = 'qc-plus-commands-v1'
const GROUP_KEY = 'qc-plus-groups-v1'
const PINNED_ENTRY_POS_KEY = 'qc-plus-entry-pos'
const PANEL_POS_KEY = 'qc-plus-panel-pos'
const ENTRY_MODE_KEY = 'qc-plus-entry-mode'

/** 从命令中解析执行步骤列表（兼容旧版 text 模式 + sendCtrlC/sendCtrlCAfter） */
export function resolveSteps(cmd: QuickCommand): CommandStep[] {
  let steps: CommandStep[]
  if (cmd.steps && cmd.steps.length > 0) {
    steps = cmd.steps.map(s => ({ text: s.text, delaySeconds: s.delaySeconds || 0, type: s.type || 'command' }))
  } else {
    const lines = cmd.text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
    if (lines.length === 0) steps = [{ text: cmd.text, delaySeconds: 0, type: 'command' }]
    else {
      const globalDelay = cmd.delaySeconds || 0
      steps = lines.map((line, i) => ({
        text: line,
        delaySeconds: i < lines.length - 1 ? globalDelay : 0,
        type: 'command' as const,
      }))
    }
  }
  // 旧版兼容：sendCtrlC 在步骤前增加 break（如果首步还不是 break）
  if (cmd.sendCtrlC && steps[0]?.type !== 'break') {
    steps = [{ text: '', delaySeconds: 0, type: 'break' }, ...steps]
  }
  // 旧版兼容：sendCtrlCAfter 在步骤后增加 break（如果末步还不是 break）
  if (cmd.sendCtrlCAfter && steps[steps.length - 1]?.type !== 'break') {
    steps = [...steps, { text: '', delaySeconds: 0, type: 'break' }]
  }
  return steps
}

export class QuickCommandService {
  private commands: QuickCommand[] = []
  private groups: QuickCommandGroup[] = []

  constructor() {
    this.load()
  }

  /* ---- 持久化 ---- */
  private load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) this.commands = JSON.parse(raw)
    } catch { this.commands = [] }

    try {
      const raw = localStorage.getItem(GROUP_KEY)
      if (raw) this.groups = JSON.parse(raw)
    } catch { this.groups = [] }
  }

  /** 从 localStorage 重新加载数据（解决跨实例同步问题） */
  reload(): void {
    this.load()
  }

  private saveCommands(): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.commands))
  }

  private saveGroups(): void {
    localStorage.setItem(GROUP_KEY, JSON.stringify(this.groups))
  }

  /* ---- 命令操作 ---- */
  getAll(): QuickCommand[] {
    return [...this.commands]
  }

  getByGroup(group: string): QuickCommand[] {
    return this.commands.filter(c => c.group === group).sort((a, b) => b.usageCount - a.usageCount)
  }

  getBySSHProfile(profileId: string): QuickCommand[] {
    return this.commands.filter(c => {
      if (!c.sshProfiles || c.sshProfiles.length === 0) return true
      return c.sshProfiles.includes(profileId)
    })
  }

  getPinned(): QuickCommand[] {
    return this.commands.filter(c => c.pinned).slice(0, 3)
  }

  getById(id: string): QuickCommand | undefined {
    return this.commands.find(c => c.id === id)
  }

  add(cmd: Omit<QuickCommand, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>): QuickCommand {
    const now = Date.now()
    const newCmd: QuickCommand = {
      ...cmd,
      id: 'qc_' + now + '_' + Math.random().toString(36).slice(2, 8),
      createdAt: now,
      updatedAt: now,
      usageCount: 0,
    }
    this.commands.push(newCmd)
    this.saveCommands()
    return newCmd
  }

  update(id: string, partial: Partial<QuickCommand>): boolean {
    const idx = this.commands.findIndex(c => c.id === id)
    if (idx === -1) return false
    this.commands[idx] = { ...this.commands[idx], ...partial, updatedAt: Date.now() }
    this.saveCommands()
    return true
  }

  remove(id: string): boolean {
    const idx = this.commands.findIndex(c => c.id === id)
    if (idx === -1) return false
    this.commands.splice(idx, 1)
    this.saveCommands()
    return true
  }

  incrementUsage(id: string): void {
    const cmd = this.commands.find(c => c.id === id)
    if (cmd) {
      cmd.usageCount = (cmd.usageCount || 0) + 1
      this.saveCommands()
    }
  }

  reorder(ids: string[]): void {
    const map = new Map(this.commands.map(c => [c.id, c]))
    const reordered: QuickCommand[] = []
    const seen = new Set<string>()
    for (const id of ids) {
      const cmd = map.get(id)
      if (cmd && !seen.has(id)) {
        reordered.push(cmd)
        seen.add(id)
      }
    }
    // 补上未包含在 ids 中的命令（避免跨组拖动时丢失）
    for (const cmd of this.commands) {
      if (!seen.has(cmd.id)) {
        reordered.push(cmd)
        seen.add(cmd.id)
      }
    }
    this.commands = reordered
    this.saveCommands()
  }

  /** 重排分组顺序（去重） */
  reorderGroups(names: string[]): void {
    const deduped: QuickCommandGroup[] = []
    const seen = new Set<string>()
    for (const g of this.groups) {
      if (!seen.has(g.name)) {
        deduped.push(g)
        seen.add(g.name)
      }
    }
    this.groups = deduped
    const map = new Map(this.groups.map(g => [g.name, g]))
    const reordered: QuickCommandGroup[] = []
    const seen2 = new Set<string>()
    for (const name of names) {
      const group = map.get(name)
      if (group && !seen2.has(name)) {
        reordered.push(group)
        seen2.add(name)
      }
    }
    for (const g of this.groups) {
      if (!seen2.has(g.name)) {
        reordered.push(g)
        seen2.add(g.name)
      }
    }
    this.groups = reordered
    this.saveGroups()
  }

  /* ---- 分组操作 ---- */
  getGroups(): QuickCommandGroup[] {
    // 从命令中自动发现分组
    const usedGroups = new Set(this.commands.map(c => c.group).filter(Boolean))
    const merged: QuickCommandGroup[] = []
    const seen = new Set<string>()
    let hasUngrouped = false

    // 先按已有顺序加载存在的组（去重：name='' 只取第一个）
    for (const g of this.groups) {
      if (seen.has(g.name)) continue
      seen.add(g.name)
      if (usedGroups.has(g.name)) {
        merged.push(g)
        usedGroups.delete(g.name)
      } else if (g.name && !usedGroups.has(g.name)) {
        // 保留空分组（有分组名但没有命令关联）
        merged.push(g)
      } else if (g.name === '' && !hasUngrouped) {
        hasUngrouped = true
        merged.push(g)
      }
    }
    // 新分组追加
    for (const name of usedGroups) {
      merged.push({ name, expanded: true, order: merged.length })
    }
    // 确保"未分组"在最后（仅当有未分组命令且未添加过时才加）
    if (!hasUngrouped) {
      const hasUncategorized = this.commands.some(c => !c.group)
      if (hasUncategorized) {
        merged.push({ name: '', expanded: false, order: merged.length })
      }
    }

    // 清理重复数据后写回
    if (JSON.stringify(merged) !== JSON.stringify(this.groups)) {
      this.groups = merged
      this.saveGroups()
    }

    // 按 order 排序
    this.groups.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
    this.saveGroups()

    return this.groups
  }

  toggleGroupExpanded(name: string): void {
    const g = this.groups.find(gr => gr.name === name)
    if (g) g.expanded = !g.expanded
    else this.groups.push({ name, expanded: true, order: this.groups.length })
    this.saveGroups()
  }

  addGroup(name: string, order?: number): void {
    if (!name) return
    if (!this.groups.find(g => g.name === name)) {
      this.groups.push({ name, expanded: true, order: order ?? this.groups.length })
      this.saveGroups()
    }
  }

  updateGroupOrder(name: string, order: number): void {
    const g = this.groups.find(gr => gr.name === name)
    if (g) { g.order = order; this.saveGroups() }
  }

  removeGroup(name: string): void {
    // 将属于该分组的命令移到"未分组"
    this.commands.forEach(c => {
      if (c.group === name) c.group = ''
    })
    this.saveCommands()
    const idx = this.groups.findIndex(g => g.name === name)
    if (idx !== -1) this.groups.splice(idx, 1)
    this.saveGroups()
  }

  renameGroup(oldName: string, newName: string): void {
    if (!newName || oldName === newName) return
    // 更新所有属于该分组的命令
    this.commands.forEach(c => {
      if (c.group === oldName) c.group = newName
    })
    this.saveCommands()
    // 更新分组名
    const g = this.groups.find(gr => gr.name === oldName)
    if (g) {
      g.name = newName
      this.saveGroups()
    }
  }

  /* ---- 入口位置 ---- */
  getEntryPosition(): { x: number; y: number } {
    try {
      const raw = localStorage.getItem(PINNED_ENTRY_POS_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return { x: 20, y: 60 }
  }

  saveEntryPosition(pos: { x: number; y: number }): void {
    localStorage.setItem(PINNED_ENTRY_POS_KEY, JSON.stringify(pos))
  }

  getPanelPosition(): { x: number; y: number } {
    try {
      const raw = localStorage.getItem(PANEL_POS_KEY)
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return { x: 20, y: 60 }
  }

  savePanelPosition(pos: { x: number; y: number }): void {
    localStorage.setItem(PANEL_POS_KEY, JSON.stringify(pos))
  }

  /* ---- 按连接记忆位置 ---- */
  private posMemoryKey(profileId: string): string {
    return `qc-plus-pos-memory-${profileId}`
  }

  getPositionMemory(profileId: string): PositionMemoryData | null {
    if (!profileId) return null
    try {
      const raw = localStorage.getItem(this.posMemoryKey(profileId))
      if (raw) return JSON.parse(raw)
    } catch { /* ignore */ }
    return null
  }

  savePositionMemory(profileId: string, data: Partial<PositionMemoryData>): void {
    if (!profileId) return
    const existing = this.getPositionMemory(profileId) || { entryX: 20, entryY: 60, panelX: 20, panelY: 60, panelScrollTop: 0 }
    const merged = { ...existing, ...data }
    localStorage.setItem(this.posMemoryKey(profileId), JSON.stringify(merged))
  }

  clearPositionMemory(profileId: string): void {
    if (!profileId) return
    localStorage.removeItem(this.posMemoryKey(profileId))
  }

  hasPositionMemory(profileId: string): boolean {
    if (!profileId) return false
    try {
      return localStorage.getItem(this.posMemoryKey(profileId)) !== null
    } catch { return false }
  }

  togglePositionMemory(profileId: string): boolean {
    if (this.hasPositionMemory(profileId)) {
      this.clearPositionMemory(profileId)
      return false // now off
    }
    // 首次启用：保存当前位置
    this.savePositionMemory(profileId, {})
    return true // now on
  }

  /* ---- 入口模式：浮动按钮 / 工具栏 ---- */
  getEntryMode(): 'floating' | 'toolbar' {
    try {
      const raw = localStorage.getItem(ENTRY_MODE_KEY)
      if (raw === 'toolbar') return 'toolbar'
      if (raw === 'floating') return 'floating'
    } catch { /* ignore */ }
    return 'toolbar' // 默认工具栏入口
  }

  saveEntryMode(mode: 'floating' | 'toolbar'): void {
    localStorage.setItem(ENTRY_MODE_KEY, mode)
  }

  /* ---- 导入/导出 ---- */
  exportAll(): string {
    return JSON.stringify({ commands: this.commands, groups: this.groups }, null, 2)
  }

  importAll(json: string): boolean {
    try {
      const data = JSON.parse(json)
      if (!data || typeof data !== 'object') return false
      // 基本 schema 校验
      if (data.commands) {
        if (!Array.isArray(data.commands)) return false
        for (const cmd of data.commands) {
          if (!cmd.id || !cmd.name || cmd.text === undefined) return false
        }
      }
      if (data.groups) {
        if (!Array.isArray(data.groups)) return false
        for (const g of data.groups) {
          if (g.name === undefined) return false
        }
      }
      if (data.commands) this.commands = data.commands
      if (data.groups) this.groups = data.groups
      this.saveCommands()
      this.saveGroups()
      return true
    } catch { return false }
  }
}
