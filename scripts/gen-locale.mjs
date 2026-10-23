/**
 * QuickCmd+ 多语言 .po 生成器
 * 功能描述：以 SFTP+ 的 24 语言 .po 为翻译源（按英文串匹配复用），
 *          对 QuickCmd+ 独有文案用 OVERRIDES 补齐，生成 locale/*.po（dot-key 作 msgid，设置页文案以中文串作 msgid）
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-07-22
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const SFTP_LOCALE = path.resolve(ROOT, '../tabby-FTPS+/locale')
const OUT = path.resolve(ROOT, 'locale')

const LOCALES = [
  ['af-ZA', 'af_ZA'], ['bg-BG', 'bg_BG'], ['cs-CZ', 'cs_CZ'], ['da-DK', 'da_DK'],
  ['de-DE', 'de_DE'], ['en-GB', 'en_GB'], ['en-US', 'en_US'], ['es-ES', 'es_ES'],
  ['fr-FR', 'fr_FR'], ['hr-HR', 'hr_HR'], ['id-ID', 'id_ID'], ['it-IT', 'it_IT'],
  ['ja-JP', 'ja_JP'], ['ko-KR', 'ko_KR'], ['pl-PL', 'pl_PL'], ['pt-BR', 'pt_BR'],
  ['pt-PT', 'pt_PT'], ['ru-RU', 'ru_RU'], ['sr-Latn', 'sr_Latn'], ['sv-SE', 'sv_SE'],
  ['tr-TR', 'tr_TR'], ['uk-UA', 'uk_UA'], ['zh-CN', 'zh_CN'], ['zh-TW', 'zh_TW'],
]

/* ---------- 解析 .po ---------- */
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
function esc(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

/* ---------- 从 qc-locale-source.mjs 读取 QC 源文案 ---------- */
import { PANEL, SETTINGS } from './qc-locale-source.mjs'

const EN = PANEL.en
const ZH = PANEL.zh
// 移除已废弃的位置记忆 key
for (const k of Object.keys(ZH)) if (k.startsWith('panel.memory_')) { delete ZH[k]; delete EN[k] }

// 面板 key 列表（保持 en-US 顺序）
const PANEL_KEYS = Object.keys(EN)

/* ---------- 加载 SFTP+ 24 语言：english -> translated ---------- */
const sftp = {}   // locale -> {en -> translated}
const sftpEnMap = parsePo(fs.readFileSync(path.join(SFTP_LOCALE, 'en-US.po'), 'utf8')) // key -> en
for (const [code] of LOCALES) {
  const f = path.join(SFTP_LOCALE, code + '.po')
  if (!fs.existsSync(f)) { sftp[code] = {}; continue }
  const m = parsePo(fs.readFileSync(f, 'utf8'))
  const eng2t = {}
  for (const k of Object.keys(sftpEnMap)) {
    const en = sftpEnMap[k]
    if (m[k]) eng2t[en] = m[k]
  }
  sftp[code] = eng2t
}

/* ---------- QC 独有文案的人工翻译覆盖（英文串 -> {locale: 译文}） ---------- */
// 先留空，跑一版看缺口，再补
import { OVERRIDES } from './qc-overrides.mjs'

/* ---------- 生成 ---------- */
function translate(code, en, zh) {
  if (code === 'en-US' || code === 'en-GB') return en
  if (code === 'zh-CN') return zh
  if (OVERRIDES[en] && OVERRIDES[en][code]) return OVERRIDES[en][code]
  if (sftp[code] && sftp[code][en]) return sftp[code][en]
  if (code === 'zh-TW') return OVERRIDES[en]?.['zh-TW'] || zh // 退回简体
  return en // 最终退回英文
}

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true })

const gaps = {}
for (const [code, langTag] of LOCALES) {
  let out = ''
  out += 'msgid ""\nmsgstr ""\n'
  out += '"Content-Type: text/plain; charset=UTF-8\\n"\n'
  out += '"Language: ' + langTag + '\\n"\n\n'
  let gapCount = 0
  // 是否有显式 override（含与英文同形的正确同词翻译，不算缺口）
  const hasOverride = (en) => code !== 'zh-TW' && OVERRIDES[en] && OVERRIDES[en][code] !== undefined
  // 面板 key
  for (const key of PANEL_KEYS) {
    const en = EN[key], zh = ZH[key]
    let t = translate(code, en, zh)
    if (code !== 'en-US' && code !== 'en-GB' && code !== 'zh-CN' && t === en && zh !== en && !hasOverride(en)) { gapCount++ }
    out += 'msgid "' + esc(key) + '"\nmsgstr "' + esc(t) + '"\n\n'
  }
  // 设置页（中文串作 msgid）
  for (const [zh, en] of SETTINGS) {
    let t = translate(code, en, zh)
    if (code !== 'en-US' && code !== 'en-GB' && code !== 'zh-CN' && t === en && !hasOverride(en)) { gapCount++ }
    out += 'msgid "' + esc(zh) + '"\nmsgstr "' + esc(t) + '"\n\n'
  }
  fs.writeFileSync(path.join(OUT, code + '.po'), out, 'utf8')
  gaps[code] = gapCount
}

console.log('生成完成：', Object.keys(gaps).length, '个 .po 文件')
console.log('面板 key 数：', PANEL_KEYS.length, ' 设置串数：', SETTINGS.length, ' 合计：', PANEL_KEYS.length + SETTINGS.length)
console.log('各语言未翻译（退回英文）串数：')
for (const [code] of LOCALES) if (!['en-US', 'en-GB', 'zh-CN'].includes(code)) console.log('  ' + code + ': ' + gaps[code])
