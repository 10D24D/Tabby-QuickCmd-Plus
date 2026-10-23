/**
 * 导出仍需人工翻译（退回英文）的英文串清单：面板 + 设置
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-22
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { OVERRIDES } from './qc-overrides.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SFTP_LOCALE = path.resolve(ROOT, '../tabby-FTPS+/locale')

function parsePo(content) {
  const map = {}
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  let key = '', val = '', inStr = false
  for (const line of lines) {
    if (line.startsWith('msgid ')) { if (key && val) map[key] = val; key = unq(line.slice(6)); val = ''; inStr = false }
    else if (line.startsWith('msgstr ')) { val = unq(line.slice(7)); inStr = true }
    else if (inStr && line.startsWith('"') && line.endsWith('"')) { val += unq(line) }
  }
  if (key && val) map[key] = val
  return map
}
function unq(s) { s = s.trim(); if (s.startsWith('"')) s = s.slice(1); if (s.endsWith('"')) s = s.slice(0, -1); return s.replace(/\\"/g, '"') }

const src = fs.readFileSync(path.resolve(ROOT, 'src/qc-i18n.service.ts'), 'utf8')
function grab(locale) {
  const re = new RegExp("'" + locale + "':\\s*\\{([\\s\\S]*?)\\n  \\}", 'm')
  const body = src.match(re)[1]
  const dict = {}
  const kvRe = /'([^']+)':\s*'((?:[^'\\]|\\.)*)'/g
  let x
  while ((x = kvRe.exec(body))) dict[x[1]] = x[2]
  return dict
}
const EN = grab('en-US')
for (const k of Object.keys(EN)) if (k.startsWith('panel.memory_')) delete EN[k]

const SETTINGS = [
  ['快捷命令管理面板，创建和管理常用命令。', 'Quick command panel, create and manage commands.'],
  ['语言', 'Language'], ['跟随Tabby', 'Follow Tabby'], ['界面', 'Interface'],
  ['主色调', 'Primary'], ['背景', 'Bg'], ['文字', 'Text'], ['标题栏', 'Surface'],
  ['边框', 'Border'], ['次要文字', 'Muted'], ['字体大小', 'Font Size'],
  ['入口模式', 'Entry Mode'], ['浮动按钮', 'Floating'], ['工具栏按钮', 'Toolbar'],
  ['面板快捷键', 'Panel Hotkey'], ['打开 QuickCmd+ 面板', 'Open QuickCmd+ panel'],
  ['点击设置快捷键', 'Click to set shortcut'], ['未绑定', 'Unbound'], ['按下按键...', 'Press keys...'],
  ['清除', 'Clear'], ['清空', 'Clear'], ['确认覆盖', 'Overwrite'], ['保存失败', 'Save failed'],
  ['录制超时', 'Recording timeout'], ['快捷键已清除', 'Hotkey cleared'], ['数据', 'Data'],
  ['导入数据', 'Import'], ['导出数据', 'Export'], ['清空数据', 'Clear All'],
  ['⚠️ 清空数据', '⚠️ Clear All Data'], ['⚠️ 修改配色', '⚠️ Modify Colors'],
  ['确定清空所有命令数据？此操作不可撤销！', 'Clear all command data? This cannot be undone!'],
  ['此操作将删除所有命令和分组数据，不可撤销！', 'This will delete all commands and groups, and cannot be undone!'],
  ['请输入 DELETE 确认：', 'Please type DELETE to confirm:'], ['已清空所有数据', 'All data cleared'],
  ['当前为自动/预设模式，修改将覆盖到自定义配色方案中。是否继续？', 'You are in Auto/Preset mode. Changes will overwrite the custom color scheme. Continue?'],
  ['导入成功', 'Import successful'], ['导入失败：文件格式无效', 'Import failed: invalid file format'],
  ['无效的数据格式。', 'Invalid data format.'], ['取消', 'Cancel'], ['关于', 'About'],
  ['版本', 'Version'], ['作者', 'Author'], ['意见反馈', 'Feedback'],
  ['点赞支持', 'Give a Star'], ['Github源码', 'GitHub Source'],
]

const sftpEnMap = parsePo(fs.readFileSync(path.join(SFTP_LOCALE, 'en-US.po'), 'utf8'))
const de = parsePo(fs.readFileSync(path.join(SFTP_LOCALE, 'de-DE.po'), 'utf8'))
const sftpReuse = new Set()
for (const k of Object.keys(sftpEnMap)) if (de[k]) sftpReuse.add(sftpEnMap[k])

function isGap(en) {
  if (OVERRIDES[en] && OVERRIDES[en]['de-DE']) return false
  if (sftpReuse.has(en)) return false
  return true
}

const panelGaps = [...new Set(Object.values(EN))].filter(isGap)
const settingsGaps = [...new Set(SETTINGS.map(s => s[1]))].filter(en => !panelGaps.includes(en) && isGap(en))

console.log('=== PANEL gaps (' + panelGaps.length + ') ===')
panelGaps.forEach(g => console.log(JSON.stringify(g)))
console.log('=== SETTINGS gaps (' + settingsGaps.length + ') ===')
settingsGaps.forEach(g => console.log(JSON.stringify(g)))
