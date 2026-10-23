/**
 * QuickCommand+ 国际化服务
 * 功能描述：加载 locale/*.po（24 语言）实现多语言，自动跟随 Tabby 系统语言，支持动态切换。
 *          t(key) 同时支持点号 key（面板文案，如 panel.pin）与中文串 key（设置页文案）。
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 * 修改人：DD1024z + Hy3
 * 修改时间：2026-10-12
 *   重构：从硬编码 zh/en 双语字典改为加载 24 语言 .po 文件（对齐 SFTP+ 多语言体系）
 *   新增 Locale 类型/LOCALES 列表/detectLocaleFromString，setLocale 支持 24 语言动态切换
 *   2026-10-12 (Hy3)：文件头举例的 key（原 app.title）已随标题改为固定品牌名而删除，换成现存 key
 */
import { detectTabbyLanguage } from '@common/utils'

export type Locale =
  | 'af-ZA' | 'bg-BG' | 'cs-CZ' | 'da-DK' | 'de-DE' | 'en-GB' | 'en-US' | 'es-ES'
  | 'fr-FR' | 'hr-HR' | 'id-ID' | 'it-IT' | 'ja-JP' | 'ko-KR' | 'pl-PL' | 'pt-BR'
  | 'pt-PT' | 'ru-RU' | 'sr-Latn' | 'sv-SE' | 'tr-TR' | 'uk-UA' | 'zh-CN' | 'zh-TW'

/** 语言下拉展示用（按语言代码排序），name 为该语言自称 */
export const LOCALES: { code: Locale; name: string }[] = [
  { code: 'af-ZA', name: 'Afrikaans' },
  { code: 'bg-BG', name: 'Български' },
  { code: 'cs-CZ', name: 'Čeština' },
  { code: 'da-DK', name: 'Dansk' },
  { code: 'de-DE', name: 'Deutsch' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'en-US', name: 'English (US)' },
  { code: 'es-ES', name: 'Español' },
  { code: 'fr-FR', name: 'Français' },
  { code: 'hr-HR', name: 'Hrvatski' },
  { code: 'id-ID', name: 'Indonesia' },
  { code: 'it-IT', name: 'Italiano' },
  { code: 'ja-JP', name: '日本語' },
  { code: 'ko-KR', name: '한국어' },
  { code: 'pl-PL', name: 'Polski' },
  { code: 'pt-BR', name: 'Português (BR)' },
  { code: 'pt-PT', name: 'Português (PT)' },
  { code: 'ru-RU', name: 'Русский' },
  { code: 'sr-Latn', name: 'Srpski' },
  { code: 'sv-SE', name: 'Svenska' },
  { code: 'tr-TR', name: 'Türkçe' },
  { code: 'uk-UA', name: 'Українська' },
  { code: 'zh-CN', name: '简体中文' },
  { code: 'zh-TW', name: '繁體中文' },
]

// 通过 webpack asset/source 内联 .po 文件内容
const PO_FILES: Record<Locale, string> = {
  'af-ZA': require('../locale/af-ZA.po'),
  'bg-BG': require('../locale/bg-BG.po'),
  'cs-CZ': require('../locale/cs-CZ.po'),
  'da-DK': require('../locale/da-DK.po'),
  'de-DE': require('../locale/de-DE.po'),
  'en-GB': require('../locale/en-GB.po'),
  'en-US': require('../locale/en-US.po'),
  'es-ES': require('../locale/es-ES.po'),
  'fr-FR': require('../locale/fr-FR.po'),
  'hr-HR': require('../locale/hr-HR.po'),
  'id-ID': require('../locale/id-ID.po'),
  'it-IT': require('../locale/it-IT.po'),
  'ja-JP': require('../locale/ja-JP.po'),
  'ko-KR': require('../locale/ko-KR.po'),
  'pl-PL': require('../locale/pl-PL.po'),
  'pt-BR': require('../locale/pt-BR.po'),
  'pt-PT': require('../locale/pt-PT.po'),
  'ru-RU': require('../locale/ru-RU.po'),
  'sr-Latn': require('../locale/sr-Latn.po'),
  'sv-SE': require('../locale/sv-SE.po'),
  'tr-TR': require('../locale/tr-TR.po'),
  'uk-UA': require('../locale/uk-UA.po'),
  'zh-CN': require('../locale/zh-CN.po'),
  'zh-TW': require('../locale/zh-TW.po'),
}

/** 解析 GNU gettext .po 内容为 msgid -> msgstr（last-wins） */
function parsePo(content: string): Record<string, string> {
  const map: Record<string, string> = {}
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  let key = ''
  let val = ''
  let inStr = false
  const unq = (s: string): string => {
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

const PO_TRANSLATIONS = {} as Record<Locale, Record<string, string>>
for (const { code } of LOCALES) PO_TRANSLATIONS[code] = parsePo(PO_FILES[code])

/** 根据语言字符串检测对应 Locale */
function detectLocaleFromString(lang: string): Locale | null {
  const l = (lang || '').toLowerCase()
  const map: Record<string, Locale> = {
    'zh': 'zh-CN', 'zh-cn': 'zh-CN', 'zh-hans': 'zh-CN', 'zh-tw': 'zh-TW', 'zh-hk': 'zh-TW', 'zh-hant': 'zh-TW',
    'en': 'en-US', 'en-us': 'en-US', 'en-gb': 'en-GB',
    'ja': 'ja-JP', 'ja-jp': 'ja-JP', 'ko': 'ko-KR', 'ko-kr': 'ko-KR',
    'fr': 'fr-FR', 'fr-fr': 'fr-FR', 'de': 'de-DE', 'de-de': 'de-DE',
    'es': 'es-ES', 'es-es': 'es-ES', 'pt': 'pt-BR', 'pt-br': 'pt-BR', 'pt-pt': 'pt-PT',
    'ru': 'ru-RU', 'ru-ru': 'ru-RU', 'it': 'it-IT', 'it-it': 'it-IT',
    'id': 'id-ID', 'id-id': 'id-ID', 'cs': 'cs-CZ', 'cs-cz': 'cs-CZ',
    'da': 'da-DK', 'da-dk': 'da-DK', 'hr': 'hr-HR', 'hr-hr': 'hr-HR',
    'pl': 'pl-PL', 'pl-pl': 'pl-PL', 'sv': 'sv-SE', 'sv-se': 'sv-SE',
    'tr': 'tr-TR', 'tr-tr': 'tr-TR', 'bg': 'bg-BG', 'bg-bg': 'bg-BG',
    'sr': 'sr-Latn', 'sr-latn': 'sr-Latn', 'uk': 'uk-UA', 'uk-ua': 'uk-UA',
    'af': 'af-ZA', 'af-za': 'af-ZA',
  }
  if (map[l]) return map[l]
  const base = l.split('-')[0]
  return map[base] || null
}

export class QuickCommandI18nService {
  private locale: Locale = 'en-US'

  constructor() {
    this.detectLocale()
  }

  private detectLocale(): void {
    // 策略0：设置页手动选择（localStorage，最高优先级）
    const saved = localStorage.getItem('qc-plus-locale')
    if (saved && saved !== 'auto') {
      const s = detectLocaleFromString(saved) || (PO_TRANSLATIONS[saved as Locale] ? (saved as Locale) : null)
      if (s) { this.locale = s; return }
    }

    // 策略1：Tabby config.yaml
    const tabbyLang = detectTabbyLanguage()
    if (tabbyLang) {
      const detected = detectLocaleFromString(String(tabbyLang))
      if (detected) { this.locale = detected; return }
    }

    // 策略2：navigator.languages
    try {
      const langs = navigator.languages || [navigator.language]
      for (const l of langs) {
        const detected = detectLocaleFromString(l)
        if (detected) { this.locale = detected; return }
      }
    } catch {}

    // 最终回退：英文
    this.locale = 'en-US'
  }

  t(key: string, params?: Record<string, string | number>): string {
    let text = PO_TRANSLATIONS[this.locale]?.[key]
    if (text === undefined) text = PO_TRANSLATIONS['en-US']?.[key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, String(v))
      }
    }
    return text
  }

  setLocale(locale: Locale | 'auto'): void {
    localStorage.setItem('qc-plus-locale', locale)
    if (locale === 'auto') {
      this.detectLocale()
    } else {
      this.locale = locale
    }
  }

  getLocale(): Locale {
    return this.locale
  }

  /** 返回当前保存的选择（含 'auto'），供设置页下拉回显 */
  getSavedLocale(): Locale | 'auto' {
    const saved = localStorage.getItem('qc-plus-locale')
    return (saved as Locale | 'auto') || 'auto'
  }
}
