/**
 * 构建期复制内置 SVG 图标到 dist
 * 功能描述：将 src/assets/icons/*.svg 复制到 dist/assets/icons/，供设置页「关于」区
 *          通过 file:// 路径引用内置图标（如 npm.svg）—— 与 SFTP+ 的 copy-icons.mjs 同机制。
 *          因为 npm publish 只包含 dist/，图标必须随构建产物一起落地，
 *          否则打包发布后设置页图标会加载失败。
 *          - 幂等：目标已存在则覆盖；源目录不存在则静默跳过
 *          - 零新依赖，纯 node fs
 * @创建人：DD1024z + Hy3
 * @创建时间：2026-10-12
 */
import { mkdirSync, readdirSync, copyFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const src = join(root, 'src', 'assets', 'icons')
const dest = join(root, 'dist', 'assets', 'icons')

if (!existsSync(src)) {
  console.log('[copy-icons] 源目录不存在，跳过：', src)
  process.exit(0)
}

mkdirSync(dest, { recursive: true })
let count = 0
for (const f of readdirSync(src)) {
  if (f.toLowerCase().endsWith('.svg')) {
    copyFileSync(join(src, f), join(dest, f))
    count++
    console.log('[copy-icons]', f)
  }
}
console.log(`[copy-icons] 已复制 ${count} 个图标到 dist/assets/icons/`)
