/**
 * 一次性引导脚本：从现有 en-US.po / zh-CN.po 抽取源字典，生成 qc-locale-source.mjs
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-23
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function parsePo(content) {
  const map = {}
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  let key = '', val = '', inStr = false
  const unq = (s) => {
    s = s.trim()
    if (s.startsWith('"')) s = s.slice(1)
    if (s.endsWith('"')) s = s.slice(0, -1)
    return s.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
  }
  for (const line of lines) {
    if (line.startsWith('msgid ')) {
      if (key && val) map[key] = val
      key = unq(line.slice(6)); val = ''; inStr = false
    } else if (line.startsWith('msgstr ')) {
      val = unq(line.slice(7)); inStr = true
    } else if (inStr && line.startsWith('"') && line.endsWith('"')) {
      val += unq(line)
    }
  }
  if (key && val) map[key] = val
  return map
}

function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

const enMap = parsePo(fs.readFileSync(path.resolve(ROOT, 'locale/en-US.po'), 'utf8'))
const zhMap = parsePo(fs.readFileSync(path.resolve(ROOT, 'locale/zh-CN.po'), 'utf8'))

const panelKeys = Object.keys(enMap).filter(k => k.includes('.'))
const settingsKeys = Object.keys(enMap).filter(k => k && !k.includes('.'))

let out = `/**
 * QuickCmd+ 多语言源字典（由 bootstrap-source.mjs 从 en-US.po/zh-CN.po 自动生成）
 * 维护说明：新增/修改文案时直接编辑本文件，然后运行 node scripts/gen-locale.mjs
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-23
 */

export const PANEL = {
  en: {
`
for (const k of panelKeys) {
  out += `    '${esc(k)}': '${esc(enMap[k])}',
`
}
out += `  },
  zh: {
`
for (const k of panelKeys) {
  out += `    '${esc(k)}': '${esc(zhMap[k] ?? enMap[k])}',
`
}
out += `  },
}

export const SETTINGS = [
`
for (const k of settingsKeys) {
  out += `  ['${esc(k)}', '${esc(enMap[k])}'],
`
}
out += `]
`

fs.writeFileSync(path.resolve(ROOT, 'scripts/qc-locale-source.mjs'), out, 'utf8')
console.log(`已生成 scripts/qc-locale-source.mjs：面板 key ${panelKeys.length} 个，设置串 ${settingsKeys.length} 条`)
