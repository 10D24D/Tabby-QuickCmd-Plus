/**
 * QuickCommand+ 国际化服务
 * 功能描述：五级回退语言检测 + 中英双语翻译
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 */

const translations: Record<string, Record<string, string>> = {
  'zh-CN': {
    'app.name': 'QuickCmd+',
    'app.title': '快捷命令',
    'app.search': '搜索命令...',
    'app.ungrouped': '未分组',
    'app.noresults': '没有匹配的命令',
    'app.pinned': '常用',
    'app.all_groups': '全部分组',

    'entry.title': 'QuickCmd+ — 拖拽移动，点击打开面板',
    'entry.disconnected': 'SSH 已断开',

    'panel.minimize': '最小化',
    'panel.close': '关闭',
    'panel.restore': '恢复面板',
    'panel.add': '新建命令',
    'panel.edit': '编辑',
    'panel.delete': '删除',
    'panel.delete_confirm': '确定删除 "{name}" 吗？',
    'panel.pin': '固定在快捷入口',
    'panel.unpin': '取消固定',
    'panel.hint.search': '搜索或输入自定义命令',
    'panel.execute': '点击执行',
    'panel.send_and_exec': '发送并执行',
    'panel.send_to_line': '仅发送',
    'panel.multi_step_title': '多步命令提示',
    'panel.multi_step_hint': '该命令包含 {count} 个步骤，是否拼接为一行发送？',
    'panel.param_hint': '输入参数值',
    'panel.send_all_tabs': '发送到所有标签页',
    'panel.copy': '复制命令',

    'panel.drag_reorder': '拖拽排序',
    'panel.drag_reorder_group': '拖拽排序分组',

    'settings.title': 'QuickCmd+',
    'settings.add_cmd': '添加命令',
    'settings.edit_cmd': '编辑命令',
    'settings.name': '名称',
    'settings.text': '命令内容',
    'settings.group': '分组',
    'settings.shortcut': '快捷键',
    'settings.append_cr': '发送并执行',
    'settings.params': '变量参数',
    'settings.pinned': '固定在快捷入口',
    'settings.delay': '步骤延迟(秒)',
    'settings.delay_hint': '延迟执行时间',
    'settings.delay_short': '延迟',
    'settings.add_step': '添加命令',
    'settings.add_break': '添加中断',
    'settings.send_ctrlc': 'Ctrl+C 中断',
    'settings.usage_count': '执行次数',
    'settings.reset': '重置',
    'settings.step_placeholder': '命令',
    'settings.step_type_cmd': '切换为命令模式',
    'settings.step_type_break': '切换为中断',
    'panel.memory_on': '位置记忆已启用',
    'panel.memory_off': '启用位置记忆',
    'settings.ssh_profiles': 'SSH 连接作用域（留空表示全部）',
    'settings.save': '保存',
    'settings.cancel': '取消',
    'settings.ok': '确定',
    'settings.delete': '删除',
    'settings.export': '导出',
    'settings.import': '导入',
    'settings.clear': '清空数据',
    'settings.confirm_delete': '确定删除此命令？',
    'settings.confirm_clear': '确定清空所有命令数据？此操作不可撤销！',
    'settings.language': '界面语言',
    'settings.lang_auto': '自动',
    'settings.lang_zh': '中文',
    'settings.lang_en': 'English',
    'settings.data_management': '数据管理',

    'group.add': '新建分组',
    'group.name': '分组名称',
    'group.delete': '删除分组（命令移至未分组）',
    'group.rename': '重命名',
    'group.edit': '修改分组',
    'group.order': '排序',
    'group.manage': '管理分组',
    'group.delete_confirm': '确定删除分组 "{name}" 吗？分组内的命令将移至未分组。',

    'notify.executed': '命令已执行',
    'notify.copied': '命令已复制',
    'notify.import_ok': '导入成功',
    'notify.import_fail': '导入失败：数据格式无效',
    'notify.cleared': '数据已清空',
    'notify.no_ssh': '当前标签页不是 SSH 连接',
  },
  'en-US': {
    'app.name': 'QuickCmd+',
    'app.title': 'Quick Commands',
    'app.search': 'Search commands...',
    'app.ungrouped': 'Ungrouped',
    'app.noresults': 'No matching commands',
    'app.pinned': 'Favorites',
    'app.all_groups': 'All groups',

    'entry.title': 'QuickCmd+ — drag to move, click to toggle',
    'entry.disconnected': 'SSH disconnected',

    'panel.minimize': 'Minimize',
    'panel.close': 'Close',
    'panel.restore': 'Restore panel',
    'panel.add': 'New command',
    'panel.edit': 'Edit',
    'panel.delete': 'Delete',
    'panel.delete_confirm': 'Delete "{name}"?',
    'panel.pin': 'Pin to quick entry',
    'panel.unpin': 'Unpin',
    'panel.hint.search': 'Search or type custom command',
    'panel.execute': 'Click to execute',
    'panel.send_and_exec': 'Send & Execute',
    'panel.send_to_line': 'Send only',
    'panel.multi_step_title': 'Multi-step Command',
    'panel.multi_step_hint': 'This command has {count} steps. Join into one line?',
    'panel.param_hint': 'Enter parameter value',
    'panel.send_all_tabs': 'Send to all tabs',
    'panel.copy': 'Copy command',

    'panel.drag_reorder': 'Drag to reorder',
    'panel.drag_reorder_group': 'Drag to reorder group',

    'settings.title': 'QuickCmd+',
    'settings.add_cmd': 'Add Command',
    'settings.edit_cmd': 'Edit Command',
    'settings.name': 'Name',
    'settings.text': 'Command Text',
    'settings.group': 'Group',
    'settings.shortcut': 'Shortcut',
    'settings.append_cr': 'Send & Execute',
    'settings.params': 'Parameters',
    'settings.pinned': 'Pin to quick entry',
    'settings.delay': 'Step delay (s)',
    'settings.delay_hint': 'Delay execution time',
    'settings.delay_short': 'Delay',
    'settings.add_step': 'Add Command',
    'settings.add_break': 'Add Break',
    'settings.send_ctrlc': 'Ctrl+C Break',
    'settings.usage_count': 'Usage',
    'settings.reset': 'Reset',
    'settings.step_placeholder': 'Command',
    'settings.step_type_cmd': 'Switch to command',
    'settings.step_type_break': 'Switch to break',
    'panel.memory_on': 'Position memory ON',
    'panel.memory_off': 'Enable position memory',
    'settings.ssh_profiles': 'SSH profile (leave empty for all)',
    'settings.save': 'Save',
    'settings.cancel': 'Cancel',
    'settings.ok': 'OK',
    'settings.delete': 'Delete',
    'settings.export': 'Export',
    'settings.import': 'Import',
    'settings.clear': 'Clear all data',
    'settings.confirm_delete': 'Delete this command?',
    'settings.confirm_clear': 'Clear all command data? This cannot be undone!',
    'settings.language': 'Language',
    'settings.lang_auto': 'Auto',
    'settings.lang_zh': '中文',
    'settings.lang_en': 'English',
    'settings.data_management': 'Data Management',

    'group.add': 'New Group',
    'group.name': 'Group Name',
    'group.order': 'Order',
    'group.delete': 'Delete group (commands become ungrouped)',
    'group.rename': 'Rename',
    'group.edit': 'Edit Group',
    'group.manage': 'Manage Groups',
    'group.delete_confirm': 'Delete group "{name}"? Commands inside will become ungrouped.',

    'notify.executed': 'Command executed',
    'notify.copied': 'Command copied',
    'notify.import_ok': 'Import successful',
    'notify.import_fail': 'Import failed: invalid data format',
    'notify.cleared': 'Data cleared',
    'notify.no_ssh': 'Current tab is not an SSH connection',
  },
}

export class QuickCommandI18nService {
  private locale: string = 'zh-CN'

  constructor() {
    this.detectLocale()
  }

  private detectLocale(): void {
    const saved = localStorage.getItem('qc-plus-locale')
    if (saved && saved !== 'auto') {
      this.locale = saved === 'en-US' ? 'en-US' : 'zh-CN'
      return
    }
    // Auto 模式：逐级检测
    const checks: (() => string | null)[] = [
      // 1. Tabby localStorage
      () => {
        const keys = ['locale', 'language', 'tabby-language', 'tabby-locale',
          'config', 'tabby-config', 'settings', 'tabby-settings', 'tabby-config.json']
        for (const key of keys) {
          const raw = localStorage.getItem(key)
          if (!raw) continue
          if (/^zh/i.test(raw)) return 'zh-CN'
          if (/^en/i.test(raw)) return 'en-US'
          try {
            const obj = JSON.parse(raw)
            const lang = obj?.appearance?.language || obj?.appearance?.locale
              || obj?.language || obj?.locale || obj?.app?.language || obj?.general?.language
            if (lang) return /^zh/i.test(String(lang)) ? 'zh-CN' : 'en-US'
          } catch {}
        }
        return null
      },
      // 2. Electron process.env
      () => {
        try {
          const e = (typeof process !== 'undefined' && process.env)
          if (e) {
            const lc = e.LC_ALL || e.LANG || e.LANGUAGE || ''
            if (/^zh/i.test(lc)) return 'zh-CN'
            if (/^en/i.test(lc)) return 'en-US'
          }
        } catch {}
        return null
      },
      // 3. document.documentElement.lang
      () => {
        try {
          const dl = document.documentElement?.lang || ''
          if (/^zh/i.test(dl)) return 'zh-CN'
          if (/^en/i.test(dl)) return 'en-US'
        } catch {}
        return null
      },
      // 4. navigator.languages（先扫 zh，再扫 en）
      () => {
        try {
          const nl = navigator.languages || [navigator.language]
          for (const lang of nl) { if (lang.startsWith('zh')) return 'zh-CN' }
          for (const lang of nl) { if (lang.startsWith('en')) return 'en-US' }
        } catch {}
        return null
      },
    ]
    for (const check of checks) {
      const result = check()
      if (result) { this.locale = result; return }
    }
    // 默认中文
    this.locale = 'zh-CN'
  }

  t(key: string, params?: Record<string, string | number>): string {
    let text = translations[this.locale]?.[key] ?? translations['en-US']?.[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v))
      }
    }
    return text
  }

  setLocale(locale: string): void {
    localStorage.setItem('qc-plus-locale', locale)
    if (locale === 'auto') {
      this.detectLocale()
    } else {
      this.locale = locale === 'en-US' ? 'en-US' : 'zh-CN'
    }
  }

  getLocale(): string {
    return this.locale
  }
}
