// Eagle 插件动作聚合入口
// 各模块按职责拆分，由这里合并后交给 main.js 注册。
// 工具名全局唯一（均以 eagle_ 前缀）。
const itemActions = require('./item')
const folderActions = require('./folder')
const tagActions = require('./tag')
const miscActions = require('./misc')

module.exports = (t) => [
  ...itemActions(t),
  ...folderActions(t),
  ...tagActions(t),
  ...miscActions(t),
]
