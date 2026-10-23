# QuickCmd+ — Tabby 快捷命令面板

**中文 | [English](https://github.com/10D24D/Tabby-QuickCmd-Plus/blob/main/README.en.md)**

[![Version](https://img.shields.io/github/package-json/v/10D24D/Tabby-QuickCmd-Plus?style=for-the-badge&label=版本&color=7B68EE)](https://github.com/10D24D/Tabby-QuickCmd-Plus)
[![Stars](https://img.shields.io/github/stars/10D24D/Tabby-QuickCmd-Plus?style=for-the-badge&label=Stars&color=orange)](https://github.com/10D24D/Tabby-QuickCmd-Plus/stargazers)
[![License](https://img.shields.io/github/license/10D24D/Tabby-QuickCmd-Plus?style=for-the-badge&label=License&color=green)](https://github.com/10D24D/Tabby-QuickCmd-Plus)

QuickCmd+ 是为 [Tabby Terminal](https://tabby.sh/) 开发的快捷命令管理插件：把常用的长命令、多步骤流程存成条目，用浮动面板随时唤起、一键发送或执行。支持分组与筛选、模糊搜索、参数占位符、按连接（SSH Profile）隔离、固定到快捷条，以及危险命令的二次确认。

---

## 📋 功能一览

### 命令管理

- **浮动命令面板** — 以 overlay 形式覆盖在终端上方，随叫随到，不打断操作
- **分组与筛选** — 命令按组归类；搜索行可按分组筛选，选「自动」时只显示与当前连接相关的分组
- **模糊搜索** — 实时匹配命令名称、简称与命令内容
- **命令简称** — 固定到快捷条时可显示更短的名字，留空则沿用完整名称；搜索同样命中简称
- **多行 / 多步骤命令** — 每条命令可拆成多步，每步独立设置延迟（0–60s），适合「等服务起来再执行下一步」
- **参数占位符** — 命令中用 `{{param}}` 占位，执行前弹出输入框
- **右键直接编辑** — 在列表里右键命令即可进入编辑
- **勾选式导入导出** — 导出时可只选「命令与分组 / 界面与外观 / 窗口行为与位置」，适合分批备份与迁移

### 执行

- **发送 / 执行两种方式** — 点命令为「发送到终端」（可先预览再回车），行内 ⏎ 为「发送并执行」
- **执行时确认** — 可对危险命令开启二次确认：执行前展示将要发送的完整内容（多步骤按顺序分行），确认后才发送；带参数的命令顺序为「确认 → 填参 → 执行」
- **执行前终止** — 可选先发送 `Ctrl+C`，避免上一条命令还在跑

### 面板与外观

- **面板常驻** — 开启后执行命令或失焦都不会自动收起；面板标题栏图钉与设置页双向同步
- **四边四角自由缩放** — 从任意边或角调整尺寸，最小高度 200px
- **多列布局** — 面板拉宽后列表自动分列，宽屏下减少滚动
- **排序模式切换** — 标题栏按钮循环「拖拽顺序 → 名称 → 执行次数」
- **滚动整行对齐** — 可选开关：滚动停止后对齐到整行，避免条目被裁掉一半（默认关闭）
- **自动主题** — 面板配色跟随当前 Tabby 主题的深/浅色，也可另选内置预设或自定义颜色
- **24 种语言** — 中英日韩德法西葡俄等，随 Tabby 界面语言切换

### 入口与位置

- **可拖拽入口** — 终端工具栏上的 `⚡` 按钮支持拖拽移动，位置可记忆
- **固定到快捷条** — 常用命令钉在面板顶部作为快捷芯片，可拖拽排序；悬停片刻后出现 ✕ 可直接移除（避免误点）
- **位置记忆** — 入口按钮与面板位置均可按 SSH 连接独立记忆
- **SSH 感知** — 命令与分组可关联 SSH Profile，只在对应连接中显示
- **快捷键** — 面板唤起、快捷条等可自定义

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Angular 9 |
| 语言 | TypeScript 5.8 |
| 构建 | Webpack 5 |
| 样式 | 组件内联 CSS（主题变量驱动） |
| 平台依赖 | tabby-core ^1.0.163, tabby-settings ^1.0.163, tabby-terminal ^1.0.163 |
| 持久化 | Tabby 配置（config.yaml）+ localStorage 缓存 |
| 国际化 | gettext（`.po`，24 种语言） |
| 包管理 | npm |

## 目录结构

```
tabby-QuickCmd+/
├── package.json                 # 项目配置、依赖声明
├── tsconfig.json                # TypeScript 编译配置
├── webpack.config.js            # Webpack 构建配置
├── README.md / README.en.md     # 说明文档（中 / 英）
├── CHANGELOG.md / .en.md        # 更新日志（中 / 英）
├── .github/                     # Issue 表单与 npm 发布 workflow
├── locale/                      # 24 种语言的 .po 文件
├── scripts/                     # 构建与生成脚本（图标、清单、多语言）
├── tabby-plugin-common/         # 与 SFTP+ 共用的常量与工具
├── dist/                        # 构建输出（npm run build）
│   ├── index.js                 #   插件入口打包产物
│   └── package.json             #   插件清单（构建期自动生成）
└── src/                         # 源码目录
    ├── index.ts                 #   插件入口 — 模块注册、主题同步
    ├── qc-floating-panel.component.ts  # 主面板（模板 + 样式 + 交互）
    ├── qc-settings.component.ts        # 设置页（含关于区）
    ├── qc-command.service.ts           # 命令与分组的读写
    ├── qc-i18n.service.ts              # 国际化服务
    ├── qc-terminal-decorator.ts        # 注入工具栏入口、管理面板实例
    ├── qc-config-provider.ts           # 配置项默认值
    ├── qc-toolbar-button-provider.ts   # 工具栏按钮提供者
    ├── qc-hotkey-provider.ts           # 快捷键注册
    ├── qc-open-settings.ts             # 打开设置页的辅助方法
    └── assets/icons/                   # 内置图标（npm.svg / kofi.svg）
```

## 使用说明

### 基本操作

1. 打开 SSH 连接或本地终端，工具栏上出现 `⚡` 快捷命令入口
2. 点击打开命令面板，浏览或搜索可用命令（可按分组筛选）
3. 点命令即「发送到终端」，再次回车才执行；点行内 ⏎ 直接执行
4. 按住入口按钮可拖拽调整位置

### 固定到快捷条

- 点命令右侧的 ☆ 固定，命令会出现在面板顶部的快捷条
- 快捷条上的芯片可拖动排序；悬停约 0.6 秒后出现 ✕，点它取消固定

### 执行时确认

- 编辑命令时勾选「执行时确认」
- 之后执行该命令会先弹出确认框，展示将要发送的完整内容
- 多步骤命令按顺序分行展示；带参数的命令先确认、再填参数

### 步骤延迟

- 编辑命令时可添加多个步骤，每步独立设置延迟
- 执行时按顺序逐条发送，每条之后等待对应延迟再发下一条
- 适合「启动服务 → 等待几秒 → 查状态」这类流程

### 参数输入

- 在命令中使用 `{{param}}` 占位符
- 执行时面板弹出输入框，填完再发送

### SSH Profile 关联

- 在设置页为命令或分组选择关联的 SSH Profile
- 面板只显示与当前连接匹配的命令；未关联的在所有连接中可见

### 导入导出与备份

- 设置页「导出数据」可勾选类别，只导出需要的那部分
- 导入采用「字段不存在则不覆盖」的合并策略，不会清掉未导出的配置

## 构建与开发

```bash
# 安装依赖
npm install

# 开发模式（watch 自动构建）
npm run watch

# 生产构建（含图标与插件清单生成）
npm run build
```

构建产物 `dist/index.js` 即为 Tabby 插件包，放入 Tabby 插件目录并重启即可加载。

## License

MIT — 作者 DD1024z

## 📜 版本历史

最新版本 **v2.0.0**（2026-10-23）— [完整更新日志](CHANGELOG.md)

## 说明

> 本插件的功能想法由作者（DD1024z）提供，主要实现代码使用 AI 自动编码生成。
> 如果你遇到任何问题或有功能建议，欢迎提交 [Issue](https://github.com/10D24D/Tabby-QuickCmd-Plus/issues) 或 Pull Request。
> 如果 QuickCmd+ 对你有帮助，欢迎 [请喝咖啡 ☕](https://ko-fi.com/dd1024z) 支持一下。

## 免责声明

> QuickCmd+ 是一个免费的开源项目。作者不对插件的完整性、可靠性或适用性作任何保证。使用本插件即表示你同意承担相关风险，开发者不对因使用插件导致的任何问题或损失负责，使用前请自行评估风险。
