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
  /** 该步骤是否启用；默认 true，禁用后执行时跳过 */
  enabled?: boolean
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
  /** 执行前是否需要二次确认（危险命令防误触） */
  confirmBeforeRun?: boolean
  /** 简称：固定快捷入口（书签）上显示的短名称；留空则回退显示 name */
  shortName?: string
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
  profileIds?: string[] // 限制在特定配置连接中可见，空/undefined = 所有可见
}

/** 按连接记忆的界面状态：分组筛选 + 搜索词 */
export interface ConnectionFilterData {
  filterGroup: string
  searchText: string
}

const STORAGE_KEY = 'qc-plus-commands-v1'
const GROUP_KEY = 'qc-plus-groups-v1'
const PINNED_ENTRY_POS_KEY = 'qc-plus-entry-pos'
const PANEL_POS_KEY = 'qc-plus-panel-pos'
const ENTRY_MODE_KEY = 'qc-plus-entry-mode'
const FILTER_GROUP_KEY = 'qc-plus-filter-group' // 旧版全局筛选（仅用于向后迁移）
const PINNED_ORDER_KEY = 'qc-plus-pinned-order' // 快捷入口（书签）的独立显示顺序
const CONN_FILTER_PREFIX = 'qc-plus-conn-filter-'

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

/** 从命令中解析执行步骤列表（兼容旧版 text 模式 + sendCtrlC/sendCtrlCAfter） */
export function resolveSteps(cmd: QuickCommand): CommandStep[] {
  let steps: CommandStep[]
  const hasSteps = cmd.steps && cmd.steps.length > 0
  if (hasSteps) {
    steps = cmd.steps
      .filter(s => s.enabled !== false)
      .map(s => ({ text: s.text, delaySeconds: s.delaySeconds || 0, type: s.type || 'command', enabled: s.enabled !== false }))
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
  // 旧版兼容：仅 text 模式（无步骤）时，sendCtrlC/sendCtrlCAfter 才追加 break
  // 步骤模式下用户已可显式添加 break 步骤，不应被旧标志干扰
  if (!hasSteps) {
    if (cmd.sendCtrlC && steps[0]?.type !== 'break') {
      steps = [{ text: '', delaySeconds: 0, type: 'break' }, ...steps]
    }
    if (cmd.sendCtrlCAfter && steps[steps.length - 1]?.type !== 'break') {
      steps = [...steps, { text: '', delaySeconds: 0, type: 'break' }]
    }
  }
  return steps
}

export class QuickCommandService {
  private commands: QuickCommand[] = []
  private groups: QuickCommandGroup[] = []
  /** 快捷入口（书签）的独立显示顺序（命令 id 列表）；与命令列表顺序解耦，
   *  这样拖动快捷条只改书签顺序，不会打乱列表（分组内）的排列 */
  private pinnedOrder: string[] = []
  private _configService: any = null
  /** #5 修复：分组数据脏标记，避免 getGroups() 每次调用都执行昂贵的合并/持久化 */
  private _groupsDirty = true

  /** 获取 Tabby 配置段（用于初始加载和设置页面同步） */
  get configStore(): any {
    return this._configService?.store?.['tabby-quick-command-plus'] || null
  }

  constructor(configService?: any) {
    this._configService = configService || null
    this.load()
  }

  /* ---- 持久化（高频 → localStorage，低频 → config） ---- */
  private load(): void {
    // 优先从 Tabby 配置加载
    if (this.configStore) {
      if (Array.isArray(this.configStore.commands)) this.commands = this.configStore.commands
      if (Array.isArray(this.configStore.groups)) this.groups = this.configStore.groups
      // 合并 localStorage 数据（可能含有 config 尚未同步的 profileIds 等字段）
      this.mergeLocalGroups()
      this.loadPinnedOrder()
      return
    }
    // 回退：从 localStorage 加载
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) this.commands = JSON.parse(raw)
    } catch { this.commands = [] }
    try {
      const raw = localStorage.getItem(GROUP_KEY)
      if (raw) this.groups = JSON.parse(raw)
    } catch { this.groups = [] }
    this.loadPinnedOrder()
  }

  /** 将 localStorage 中的分组数据合并到当前 groups（保留 profileIds 等高频更新字段） */
  private mergeLocalGroups(): void {
    try {
      const raw = localStorage.getItem(GROUP_KEY)
      if (!raw) return
      const localGroups: QuickCommandGroup[] = JSON.parse(raw)
      for (const lg of localGroups) {
        const existing = this.groups.find(g => g.name === lg.name)
        if (existing) {
          // localStorage 中有 profileIds 但 config 中没有 → 补上
          if (lg.profileIds?.length && !existing.profileIds?.length) {
            existing.profileIds = lg.profileIds
          }
          // 合并其他字段
          if (lg.expanded !== undefined && existing.expanded === undefined) existing.expanded = lg.expanded
          if (lg.order !== undefined && existing.order === undefined) existing.order = lg.order
        } else {
          this.groups.push(lg)
        }
      }
    } catch {}
  }

  /** 重新加载数据（解决跨实例同步问题） */
  reload(): void {
    this._groupsDirty = true
    this.load()
  }

  private saveCommands(): void {
    // 命令变更 → 标记分组需要重新合并
    this._groupsDirty = true
    // 高频：写入 localStorage（#10 修复：try-catch 防止 QuotaExceededError）
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this.commands)) } catch (e) { console.warn('[QC+] saveCommands localStorage failed', e) }
    // 低频：同步到 Tabby 配置
    if (this.configStore) {
      try { this.configStore.commands = this.commands; this._configService.save() } catch {}
    }
  }

  private saveGroups(): void {
    this._groupsDirty = true
    this._persistGroups()
  }

  /** 内部持久化（不设置脏标记），供 getGroups() 内部调用 */
  private _persistGroups(): void {
    // #10 修复：try-catch 防止 QuotaExceededError
    try { localStorage.setItem(GROUP_KEY, JSON.stringify(this.groups)) } catch (e) { console.warn('[QC+] saveGroups localStorage failed', e) }
    if (this.configStore) {
      try { this.configStore.groups = this.groups; this._configService.save() } catch {}
    }
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

  /** 快捷入口（书签）命令：按用户拖拽排定的顺序返回；未登记的按列表顺序追加在后（稳定排序） */
  getPinned(): QuickCommand[] {
    const pinned = this.commands.filter(c => c.pinned)
    if (this.pinnedOrder.length === 0) return pinned
    const rank = new Map(this.pinnedOrder.map((id, i) => [id, i]))
    return pinned
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const ra = rank.has(a.c.id) ? rank.get(a.c.id)! : Number.MAX_SAFE_INTEGER
        const rb = rank.has(b.c.id) ? rank.get(b.c.id)! : Number.MAX_SAFE_INTEGER
        return ra === rb ? a.i - b.i : ra - rb
      })
      .map(x => x.c)
  }

  /** 供导出使用的书签顺序（当前实际显示顺序） */
  getPinnedOrder(): string[] {
    return this.getPinned().map(c => c.id)
  }

  /** 重排快捷入口（书签）顺序：只改书签自身顺序，不影响命令列表 */
  reorderPinned(ids: string[]): void {
    this.applyPinnedOrder(ids)
  }

  /** 应用一份书签顺序（去重 + 只保留当前确实被钉住的命令 + 补上未包含的书签） */
  applyPinnedOrder(ids: string[]): void {
    const pinnedIds = new Set(this.commands.filter(c => c.pinned).map(c => c.id))
    const ordered: string[] = []
    const seen = new Set<string>()
    for (const id of ids || []) {
      if (typeof id === 'string' && pinnedIds.has(id) && !seen.has(id)) { ordered.push(id); seen.add(id) }
    }
    // 补上未包含的书签，避免漏项
    for (const c of this.commands) {
      if (c.pinned && !seen.has(c.id)) { ordered.push(c.id); seen.add(c.id) }
    }
    this.pinnedOrder = ordered
    this.savePinnedOrder()
  }

  /** 持久化书签顺序：高频 localStorage + 同步 Tabby 配置 */
  private savePinnedOrder(): void {
    try { localStorage.setItem(PINNED_ORDER_KEY, JSON.stringify(this.pinnedOrder)) } catch (e) { console.warn('[QC+] savePinnedOrder localStorage failed', e) }
    try {
      if (this.configStore) { this.configStore.pinnedOrder = this.pinnedOrder; this._configService.save() }
    } catch { /* ignore */ }
  }

  /** 加载书签顺序（localStorage 优先，回退 config） */
  private loadPinnedOrder(): void {
    try {
      const raw = localStorage.getItem(PINNED_ORDER_KEY)
      if (raw) {
        const arr = JSON.parse(raw)
        if (Array.isArray(arr)) { this.pinnedOrder = arr.filter((x: any) => typeof x === 'string'); return }
      }
    } catch { /* ignore */ }
    try {
      const fromCfg = this.configStore?.pinnedOrder
      if (Array.isArray(fromCfg)) this.pinnedOrder = fromCfg.filter((x: any) => typeof x === 'string')
    } catch { /* ignore */ }
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

  /** 重置所有命令的执行次数，返回被重置的命令数量 */
  resetUsageCount(): number {
    let n = 0
    for (const cmd of this.commands) {
      if (cmd.usageCount) {
        cmd.usageCount = 0
        n++
      }
    }
    if (n > 0) this.saveCommands()
    return n
  }

  reorder(ids: string[]): void {
    console.log('[QC+] reorder called with ' + ids.length + ' ids:', JSON.stringify(ids))
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
    // #5 修复：脏标记为 false 且已有分组数据时，跳过昂贵的合并逻辑
    if (!this._groupsDirty && this.groups.length > 0) {
      return this.groups
    }
    this._groupsDirty = false

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
    let changed = false
    if (JSON.stringify(merged) !== JSON.stringify(this.groups)) {
      this.groups = merged
      changed = true
    }

    // 按 order 排序（仅在顺序实际变化时才标记为 changed）
    let orderChanged = false
    for (let i = 0; i < this.groups.length - 1; i++) {
      if ((this.groups[i].order ?? 999) > (this.groups[i + 1].order ?? 999)) {
        orderChanged = true
        break
      }
    }
    if (orderChanged) {
      this.groups.sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
      changed = true
    }

    if (changed) {
      // #5 修复：使用 _persistGroups() 避免重新标记脏
      this._persistGroups()
    }

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

  updateGroupProfiles(name: string, profileIds: string[]): void {
    const g = this.groups.find(gr => gr.name === name)
    if (g) { g.profileIds = profileIds.length > 0 ? profileIds : undefined; this.saveGroups() }
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

  /* ---- 入口位置（高频操作 → localStorage，设置页面同步到 config） ---- */
  getEntryPosition(): { x: number; y: number } {
    try {
      const raw = localStorage.getItem(PINNED_ENTRY_POS_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return { x: 20, y: 60 }
  }

  saveEntryPosition(pos: { x: number; y: number }): void {
    localStorage.setItem(PINNED_ENTRY_POS_KEY, JSON.stringify(pos))
  }

  /**
   * 面板位置（全局统一，所有连接/标签共享同一个位置）
   * 修改人：DD1024z + Hy3
   * 修改时间：2026-07-22
   *   移除三态位置记忆（off/profile/global），面板位置永远全局统一
   */
  getPanelPosition(): { x: number; y: number } {
    try {
      const raw = localStorage.getItem(PANEL_POS_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return { x: 20, y: 60 }
  }

  savePanelPosition(pos: { x: number; y: number }): void {
    localStorage.setItem(PANEL_POS_KEY, JSON.stringify(pos))
  }

  /* ---- 入口模式：浮动按钮 / 工具栏 ---- */
  getEntryMode(): 'floating' | 'toolbar' {
    // 优先从 Tabby 配置读取
    if (this.configStore?.entryMode === 'toolbar' || this.configStore?.entryMode === 'floating') {
      return this.configStore.entryMode
    }
    try {
      const raw = localStorage.getItem(ENTRY_MODE_KEY)
      if (raw === 'toolbar') return 'toolbar'
      if (raw === 'floating') return 'floating'
    } catch {}
    return 'toolbar'
  }

  saveEntryMode(mode: 'floating' | 'toolbar'): void {
    localStorage.setItem(ENTRY_MODE_KEY, mode)
    if (this.configStore) {
      try { this.configStore.entryMode = mode; this._configService.save() } catch {}
    }
  }

  /* ---- 按连接记忆：分组筛选 + 搜索词（高频操作 → localStorage） ----
   * 修改人：DD1024z + Hy3
   * 修改时间：2026-07-22
   *   由全局单 key 改为按 profileId 存储；新增 searchText 持久化
   */
  private connFilterKey(profileId: string): string {
    return CONN_FILTER_PREFIX + (profileId || '__global__')
  }

  getConnectionFilter(profileId: string): ConnectionFilterData {
    try {
      const raw = localStorage.getItem(this.connFilterKey(profileId))
      if (raw) {
        const d = JSON.parse(raw)
        return { filterGroup: d.filterGroup || '', searchText: d.searchText || '' }
      }
    } catch {}
    // 旧版兼容：迁移全局 filterGroup（仅首次，无连接级记录时）
    try {
      const legacy = this.configStore?.filterGroup || localStorage.getItem(FILTER_GROUP_KEY) || ''
      if (legacy) return { filterGroup: legacy, searchText: '' }
    } catch {}
    return { filterGroup: '', searchText: '' }
  }

  saveConnectionFilter(profileId: string, data: ConnectionFilterData): void {
    try { localStorage.setItem(this.connFilterKey(profileId), JSON.stringify(data)) } catch {}
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
      if (data.commands) this.commands = data.commands.map((c: QuickCommand) => ({ ...c, id: generateId() }))
      if (data.groups) this.groups = data.groups
      this.saveCommands()
      this.saveGroups()
      return true
    } catch { return false }
  }

  /** #17 修复：公开替换全部数据（供设置页导入使用，避免 bracket notation 访问私有成员） */
  replaceAll(commands: QuickCommand[], groups: QuickCommandGroup[]): void {
    this.commands = commands
    this.groups = groups
    this.saveCommands()
    this.saveGroups()
  }

  /** #17 修复：公开清空全部数据（供设置页重置使用） */
  clearAll(): void {
    this.commands = []
    this.groups = []
    this.saveCommands()
    this.saveGroups()
  }
}
