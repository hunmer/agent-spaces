---
name: add-game-prompt
description: 把用户提供的 AI 提示词快速、规范地添加到 game-asset-canvas 的内置提示词库（utils/prompts.js）。当用户说「添加提示词」「录入提示词」「加到提示词库」，或直接给出一段 prompt 正文（含名称/分类/参考图链接）想存进画布的提示词库时，使用此 skill。覆盖单条录入、批量录入、带参考图（自动下载到本地并生成 references 字段）等场景。
---

# add-game-prompt

把用户提供的提示词录入 `game-asset-canvas` 内置提示词库，包含参考图本地化与语法校验。

## 适用场景

- 用户给出一段提示词（可能带名称、分类、参考图链接），要存进画布提示词库
- 批量录入多条提示词
- 提示词带 Google Drive / 其他外链参考图，需下载到本地

## 关键路径

- **提示词库**：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/prompts.js`
- **参考图目录**：`packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/assets/references/<promptId>/refN.png`
- **校验脚本**：本 skill 目录下 `scripts/verify-prompts.js`

## 条目数据结构

`prompts.js` 的 `PROMPT_LIBRARY` 是数组，每条结构：

```js
{
  id: 'sprite-xxx',           // 必填。kebab-case，全局唯一。前缀按分类：sprite-/char-/bg-/convert-
  category: 'sprite',          // 必填。character | sprite | background | convert
  title: '中文标题',           // 必填。用户在提示词选择器看到的名字
  desc: '一句话描述',          // 必填。检索用，说清用途/帧数/视角/比例
  scene: 'edit',               // 必填。text(文生图) | edit(编辑图片，需参考图/输入图) | both(两者皆可)
  references: ['assets/references/<id>/ref1.png'],  // 可选。相对 src 的路径数组；有参考图才填
  aspect: '16:9',              // 可选。选中时联动比例下拉。值必须在 ASPECT_OPTIONS 内：21:9/16:9/9:16/1:1/4:3/3:4
  prompt: `提示词正文`,        // 必填。原样保留用户给的正文，英文或中文均可
}
```

**分类语义**（`PROMPT_CATEGORIES` 已定义）：
- `character` 角色生成（立绘、单角色）
- `sprite` 精灵图动画（spritesheet、动作序列）
- `background` 背景场景（环境、地图、视差层）
- `convert` 图像转换（抠图、换背景、转像素风）

**scene 判定**：
- 纯文生图（无参考图、描述一个新画面）→ `text`
- 依赖参考图/输入图做编辑（spritesheet 动画、换背景）→ `edit`
- 既能文生图又能编辑（如带「提取物件」关键字可二次编辑的场景）→ `both`

## 工作流程

### 1. 解析用户输入

从用户给的内容里识别出：名称、分类（不确定就问）、prompt 正文、参考图链接（Google Drive 或其他）、建议比例。

如果用户没给分类或 scene，**根据 prompt 正文内容判断**（见上「分类语义」「scene 判定」），不要反复追问。只有真有歧义时才用 AskUserQuestion。

### 2. 生成 id

- kebab-case，前缀按分类：`sprite-`/`char-`/`bg-`/`convert-`
- 名字有多个版本号时带版本：`sprite-char-v23ot`、`char-rpgmaker-v3`
- 写入前 grep 确认 id 未被占用：`grep -n "id: '<新id>'" prompts.js`

### 3. 处理参考图（如果有）

参考图链接常见为 Google Drive 形式：`https://drive.usercontent.google.com/download?id=<FILE_ID>&export=view`

下载到 `src/assets/references/<promptId>/refN.png`：

```bash
mkdir -p "packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/assets/references/<promptId>"
curl -sL -o ".../ref1.png" "https://drive.usercontent.google.com/download?id=<FILE_ID>&export=view"
```

**必须验证下载结果**（Google Drive 偶尔返回 HTML 错误页而非图片）：
```bash
file ".../ref1.png"   # 应显示 "PNG image data" 或 "JPEG image data"；显示 "HTML document" 就是下载失败
```

多张参考图命名为 `ref1.png`、`ref2.png`...，顺序与 prompt 正文里「参考图1/参考图2」一致。

条目的 `references` 字段填**相对 src 目录**的路径数组：
```js
references: ['assets/references/<promptId>/ref1.png', 'assets/references/<promptId>/ref2.png']
```

**重要**：填了 `references` 字段后，要从 `prompt` 正文里**删掉参考图链接行**（链接已在 references 里，prompt 正文里留链接是冗余且会干扰模型）。如果 prompt 正文对某张参考图有特殊说明（如「参考图1为攻击、参考图2为死亡」），保留这句说明但删掉 URL。

### 4. 插入 prompts.js

找到对应分类的分组位置（代码里有注释标记 `// ============ 角色生成 ============` 等），用 Edit 工具在该分类末尾插入新条目。**保持与同分类其他条目的风格一致**（注释、缩进、字段顺序）。

格式模板：

```js
  {
    // 来源：<可选，标注来源如 Gemini Gem / 用户提供>
    id: '<id>',
    category: '<category>',
    title: '<title>',
    desc: '<desc>',
    scene: '<scene>',
    references: ['assets/references/<id>/ref1.png'],  // 无参考图删此行
    aspect: '<aspect>',                                 // 无指定比例删此行
    prompt: `<prompt 正文>`,
  },
```

### 5. 语法校验（必做）

```bash
cd "G:/agent_spaces" && node --input-type=commonjs -e "require('@babel/standalone').transform(require('fs').readFileSync('packages/server/agent-spaces-data/mini-apps/game-asset-canvas/src/utils/prompts.js','utf8'),{presets:['react']}); console.log('语法 OK')"
```

### 6. 一致性校验（推荐）

运行本 skill 的验证脚本，检查所有条目的 references 字段指向的文件是否真实存在：

```bash
node "G:/agent_spaces/.agents/skills/add-game-prompt/scripts/verify-prompts.js"
```

会输出：条目总数、带参考图条目数、references 路径文件缺失情况。

## 批量录入

用户一次给多条时，**先全部解析好**（id、分类、参考图），**一次性批量下载参考图**，再**逐条 Edit 插入**（或合并成一次大 Edit）。最后统一做一次语法校验。避免逐条来回。

## 常见坑

1. **Google Drive 链接下载失败**：返回 HTML 而非图片。`file` 命令验证；失败的换 `confirm=t` 参数重试，或让用户另存。
2. **参考图未删链接**：prompt 正文里残留 URL 会干扰图生模型，必须移到 references 字段。
3. **id 重复**：写入前 grep 确认。
4. **aspect 值不在白名单**：ASPECT_OPTIONS 只有 `21:9/16:9/9:16/1:1/4:3/3:4`，超出范围会导致下拉无法选中，需先在 `utils/constants.js` 的 ASPECT_OPTIONS 补充。
5. **scene 选错**：edit 类型的提示词不会出现在文生图表单的提示词选择器里（被 scene 过滤）。判断不准时看 prompt 是否依赖输入图。

## 录入后告知用户

录入完成后，简短告知：
- 录入了哪条（title + id）
- 分类、scene、是否有参考图（几张）
- 提示词库条目总数变化

**不要自动重启服务或 commit**——提示词库是 mini-app 源码，刷新即生效；commit 按用户要求来。
