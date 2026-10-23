/**
 * 构建后自动同步 根 package.json -> dist/package.json
 * 功能描述：让 dist/ 成为自包含、可被 Tabby 直接加载的插件包，同时消除「手工维护 dist/package.json」
 *          导致的版本号 / 字段漂移 —— 原 dist 清单长期停在 1.0.0 且 description 为 GBK 乱码。
 *          - main 改写为 index.js（dist 内入口）
 *          - 去掉仅开发期使用的脚本（prebuild / check-common / use-in-tabby）
 *          - 剔除 devDependencies / files（消费方无意义）
 * 来源说明：与 SFTP+ 的 scripts/copy-sftp-manifest.mjs 同源（逻辑与插件名无关），仅日志前缀不同。
 * 创建人：DD1024z + Hy3
 * 创建时间：2026-10-23
 *
 * 用法（在插件目录内执行）：node scripts/copy-qc-manifest.mjs
 * 依赖：process.cwd() 即插件根目录
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const srcPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

const distPkg = {
  name: srcPkg.name,
  version: srcPkg.version,
  description: srcPkg.description,
  keywords: srcPkg.keywords,
  // dist 内的入口是 index.js（而非 dist/index.js）
  main: 'index.js',
  scripts: {
    build: 'webpack --progress --color',
    watch: 'webpack --progress --color --watch',
    prepublishOnly: 'npm run build',
  },
  author: srcPkg.author,
  license: srcPkg.license,
  repository: srcPkg.repository,
  homepage: srcPkg.homepage,
  bugs: srcPkg.bugs,
}

const outPath = join(root, 'dist', 'package.json')
writeFileSync(outPath, JSON.stringify(distPkg, null, 2) + '\n', 'utf8')
console.log(`[copy-qc-manifest] wrote ${outPath} (v${distPkg.version}, main=${distPkg.main})`)
