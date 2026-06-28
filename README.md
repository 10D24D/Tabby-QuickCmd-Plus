# QuickCmd+ — Tabby 快捷命令面板

QuickCmd+ 是为 [Tabby Terminal](https://tabby.sh/) 开发的快捷命令管理插件，提供浮动命令面板、分组管理、拖拽入口和命令步骤延迟等功能。

## 功能特性

- **浮动命令面板** — 以 overlay 形式覆盖在终端上方，快速浏览和执行预定义命令
- **可拖拽入口** — 终端工具栏上的快捷按钮支持拖拽移动，位置可记忆
- **分组管理** — 命令按组分类，面板和设置页均支持增删改分组
- **模糊搜索** — 实时搜索命令名称和内容，快速定位
- **多行命令 + 步骤延迟** — 每条命令支持多行/多步骤，每步可独立设置延迟时间（0-60s）
- **参数输入** — 命令中支持参数占位符，执行时弹出输入框填写
- **钉选命令** — 常用命令可钉选到面板顶部，方便快速访问
- **拖拽排序** — 命令列表支持拖拽调整顺序
- **位置记忆** — 入口按钮位置和面板位置可按 SSH 连接独立记忆
- **SSH 感知** — 命令可按 SSH Profile 关联，仅对应连接可见
- **一键发送/执行** — 支持发送到终端（预览）或直接执行
- **i18n 国际化** — 中文（简体）和 English

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Angular 9 |
| 语言 | TypeScript 5.8 |
| 构建 | Webpack 5 |
| 样式 | 内联 CSS |
| 平台依赖 | tabby-core ^1.0.163, tabby-settings ^1.0.163, tabby-terminal ^1.0.163 |
| 持久化 | localStorage |
| 包管理 | npm |

## 目录结构

```
tabby-QuickCmd+/
├── package.json              # 项目配置、依赖声明
├── tsconfig.json             # TypeScript 编译配置
├── webpack.config.js         # Webpack 构建配置
├── README.md                 # 本文件
├── dist/                     # 构建输出（npm run build）
│   └── index.js              #   插件入口打包产物
└── src/                      # 源码目录
    ├── index.ts              #   插件入口 — Angular Module 注册
    ├── qc-floating-panel.component.ts  #   主面板组件（模板+样式+逻辑）
    ├── qc-terminal-decorator.ts        #   终端装饰器 — 注入快捷命令入口按钮
    ├── qc-command.service.ts           #   命令和分组的管理服务
    ├── qc-i18n.service.ts             #   国际化服务
    ├── qc-settings.component.ts        #   设置页组件
    └── tabby-shims.d.ts               #   Tabby 内部模块类型声明
```

## 使用说明

### 基本操作

1. 打开 SSH 连接（或本地终端），工具栏上会出现 `⚡` 快捷命令入口按钮
2. 点击按钮打开命令面板，浏览或搜索可用命令
3. 点击命令的 **发送** 按钮将命令文本发送到终端（可预览后回车执行）
4. 点击命令的 **执行** 按钮直接向终端写入命令并自动回车
5. 按住入口按钮可拖拽移动位置

### 钉选命令

- 在面板中点击命令右侧的 ☆ 图标钉选到顶部
- 钉选的命令始终显示在最前面，方便快速访问

### 步骤延迟

- 编辑命令时，可添加多行/多步骤，每步独立设置延迟
- 多步骤命令按顺序逐行发送，每行执行后等待指定延迟再发送下一行
- 适用于需要在命令间等待的场景（如等待服务启动）

### 参数输入

- 在命令文本中使用 `{{ param }}` 占位符
- 执行时面板会自动弹出参数输入框

### SSH Profile 关联

- 在设置页可以为命令选择关联的 SSH Profile
- 面板只显示当前 SSH 连接匹配的命令
- 不关联 profile 的命令在所有连接中均可见

## 构建与开发

```bash
# 安装依赖
npm install

# 开发模式（watch 自动构建）
npm run watch

# 生产构建
npm run build
```

构建产物 `dist/index.js` 即为 Tabby 插件包，放入 Tabby 插件目录并重启即可加载。

## License

MIT — 作者 DD1024z

## 说明

> 本插件的功能想法由作者（DD1024z）提供，主要实现代码使用 AI 自动编码生成。
> 如果你遇到任何问题或有功能建议，欢迎提交 [Issue](https://github.com/10D24D/Tabby-QuickCmd-Plus/issues) 或 Pull Request。
