const path = require('path')
const webpack = require('webpack')

module.exports = {
  target: 'node',
  entry: './src/index.ts',
  devtool: 'source-map',
  context: __dirname,
  mode: 'development',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'index.js',
    libraryTarget: 'commonjs2',
    devtoolModuleFilenameTemplate: 'webpack-tabby-quick-command-plus:///[resource-path]',
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      // 指向仓库内副本（自包含，CI 可构建）；开发唯一真源仍是 monorepo 根
      // tabby-plugin-common，prebuild 时由 scripts/check-common-sync.mjs 自动同步进来
      '@common': path.resolve(__dirname, 'tabby-plugin-common/src'),
    },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: 'ts-loader',
      },
      {
        test: /\.scss$/,
        use: ['style-loader', 'css-loader', 'sass-loader'],
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.html$/,
        use: 'raw-loader',
      },
      {
        // 将 .po 文件内联为字符串，供 i18n 服务运行时解析（webpack5 内置，零依赖）
        test: /\.po$/,
        type: 'asset/source',
      },
    ],
  },
  plugins: [
    // 每次 build 注入构建时间戳（关于页展示，用于确认是否已重新打包）——与 SFTP+ 同机制
    new webpack.DefinePlugin({
      __QC_PLUS_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    }),
  ],
  externals: [
    'fs', 'path', 'os', 'crypto', 'net', 'stream', 'readline', 'electron',
    /^rxjs/,
    /^@angular/,
    function ({ request }, callback) {
      // tabby-core 的 ToolbarButtonProvider 类型仅存在于 typings/ 子路径（无 JS 文件）
      // 运行时需将子路径导入重定向到 tabby-core 主模块（该模块在 dist/index.js 中导出此类）
      if (request && request.startsWith('tabby-core/typings/')) {
        return callback(null, 'commonjs tabby-core')
      }
      if (request && /^tabby-/.test(request)) {
        return callback(null, 'commonjs ' + request)
      }
      callback()
    },
  ],
}
