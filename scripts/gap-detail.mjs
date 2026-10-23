/**
 * QuickCmd+ 翻译缺口精确导出器
 * 功能描述：复用 gen-locale 的 translate 逻辑，列出仍退回英文的 (英文源串 -> 缺失语言列表)，
 *          用于指导补齐 qc-overrides.mjs
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-22
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { OVERRIDES } from './qc-overrides.mjs'
import { PANEL, SETTINGS } from './qc-locale-source.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SFTP_LOCALE = path.resolve(ROOT, '../tabby-FTPS+/locale')

const LOCALES = [
  ['af-ZA', 'af_ZA'], ['bg-BG', 'bg_BG'], ['cs-CZ', 'cs_CZ'], ['da-DK', 'da_DK'],
  ['de-DE', 'de_DE'], ['en-GB', 'en_GB'], ['en-US', 'en_US'], ['es-ES', 'es_ES'],
  ['fr-FR', 'fr_FR'], ['hr-HR', 'hr_HR'], ['id-ID', 'id_ID'], ['it-IT', 'it_IT'],
  ['ja-JP', 'ja_JP'], ['ko-KR', 'ko_KR'], ['pl-PL', 'pl_PL'], ['pt-BR', 'pt_BR'],
  ['pt-PT', 'pt_PT'], ['ru-RU', 'ru_RU'], ['sr-Latn', 'sr_Latn'], ['sv-SE', 'sv_SE'],
  ['tr-TR', 'tr_TR'], ['uk-UA', 'uk_UA'], ['zh-CN', 'zh_CN'], ['zh-TW', 'zh_TW'],
]
const TARGET = LOCALES.map(x => x[0]).filter(c => !['en-US', 'en-GB', 'zh-CN'].includes(c))

function parsePo(content) {
  const map = {}
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  let key = '', val = '', inStr = false
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
function unq(s) {
  s = s.trim()
  if (s.startsWith('"')) s = s.slice(1)
  if (s.endsWith('"')) s = s.slice(0, -1)
  return s.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\')
}

const EN = PANEL.en
const ZH = PANEL.zh
for (const k of Object.keys(ZH)) if (k.startsWith('panel.memory_')) { delete ZH[k]; delete EN[k] }
const PANEL_KEYS = Object.keys(EN)

// SFTP+ 复用
const sftp = {}
const sftpEnMap = parsePo(fs.readFileSync(path.join(SFTP_LOCALE, 'en-US.po'), 'utf8'))
for (const [code] of LOCALES) {
  const f = path.join(SFTP_LOCALE, code + '.po')
  if (!fs.existsSync(f)) { sftp[code] = {}; continue }
  const m = parsePo(fs.readFileSync(f, 'utf8'))
  const eng2t = {}
  for (const k of Object.keys(sftpEnMap)) { const en = sftpEnMap[k]; if (m[k]) eng2t[en] = m[k] }
  sftp[code] = eng2t
}

function translate(code, en, zh) {
  if (code === 'en-US' || code === 'en-GB') return en
  if (code === 'zh-CN') return zh
  if (OVERRIDES[en] && OVERRIDES[en][code]) return OVERRIDES[en][code]
  if (sftp[code] && sftp[code][en]) return sftp[code][en]
  if (code === 'zh-TW') return OVERRIDES[en]?.['zh-TW'] || zh
  return en
}

// 收集：en 源串 -> 缺失语言列表
const missByEn = {}   // en -> Set(locale)
function hasOverride(en, code) {
  return code !== 'zh-TW' && OVERRIDES[en] && OVERRIDES[en][code] !== undefined
}
function record(en, zh) {
  for (const code of TARGET) {
    if (code === 'zh-TW') continue // zh-TW 有简体退回，不算缺口
    if (hasOverride(en, code)) continue // 有显式 override（含同形正确译法）不算缺口
    const t = translate(code, en, zh)
    if (t === en && zh !== en) {
      (missByEn[en] = missByEn[en] || new Set()).add(code)
    }
  }
}
for (const key of PANEL_KEYS) record(EN[key], ZH[key])
for (const [zh, en] of SETTINGS) record(en, zh)

const entries = Object.keys(missByEn).sort()
console.log('仍退回英文的独有串数：', entries.length)
console.log('====== 明细（英文串 => 缺失语言）======')
for (const en of entries) {
  console.log(JSON.stringify(en) + '  => ' + [...missByEn[en]].join(','))
}
// 便于补齐：输出所有缺失语言的并集
const allMiss = new Set()
for (const en of entries) for (const c of missByEn[en]) allMiss.add(c)
console.log('\n涉及语言：', [...allMiss].sort().join(', '))
