---
name: build-skills-package
description: 把若干 skill 文件夹（每个含 SKILL.md）封装成 Agent Spaces 技能包（skillspackage）。生成符合 packages/templates/skillspackage 规范的 {slug}.zip（内含 manifest.json + PROMPT.md + skills/*.zip）并自动重建商店索引。Use when 用户要把一组 skills 打包成技能包、提到 skillspackage、技能包封装、skill package zip，或要把现成的 skill 集合发布到 Agent Store。
---

# Build Skills Package

把一组 skill 文件夹封装成 Agent Spaces 技能包，落地到 `packages/templates/skillspackage/`，并重建商店索引。

## 何时触发

用户表达了下列意图之一：

- 「把 XXX 这些 skill 打包成技能包 / skillspackage / skill package」
- 「封装 skill 集合到商店」
- 「把这堆 skill 文件夹做成一个专家包」
- 操作目标路径含 `packages/templates/skillspackage`

## 前置约定（Agent Spaces 技能包规范）

**zip 是唯一真相源**：`skillspackage/{slug}.zip` 是源，不再维护源目录。扫描器（`generate-index.mjs` 的 `scanSkillsPackageStore`）只遍历 zip、从 zip 内读 manifest 生成 `index.json`。

外层 zip 内部布局（注意 `{slug}/` 目录前缀）：

```
{slug}.zip
└─ {slug}/
    ├─ manifest.json      # 元数据
    ├─ PROMPT.md          # 系统提示词
    └─ skills/
        ├─ {skill-1}.zip  # 内层 zip：SKILL.md 必须在根目录
        └─ {skill-2}.zip
```

**源 skills 目录**：每个子目录必须含 `SKILL.md`（frontmatter 含 `name`/`description`），可有 `references/`、`scripts/` 等附属文件。

**manifest.json 必填字段**：`type`（固定 `skillhub-expert-package`）、`slug`、`displayName`、`summary`、`skillSlugs`（数组，与 skills 目录名一致）。可选：`tools`（合法内置工具名数组，默认空 = 最小权限）、`modelProvider`、`modelId`、`icon`、`avatarUrl`。

## 快速开始

直接调用脚本（零依赖、跨平台）：

```bash
# 最小用法：自动用 slug 作 displayName，summary 留空，PROMPT.md 用占位模板
node .agents/skills/build-skills-package/scripts/build-skills-package.cjs \
  --slug <slug> --src <skills-dir>

# 完整用法
node .agents/skills/build-skills-package/scripts/build-skills-package.cjs \
  --slug phaserjs \
  --src G:/game/skills \
  --name "Phaser.js 游戏开发专家" \
  --summary "Phaser 4 全套技能：场景/精灵/动画/物理..." \
  --prompt ./my-prompt.md \
  --tools read,write
```

脚本会：

1. 校验 slug 格式（小写字母/数字/连字符）和源目录
2. 收集 `--src` 下所有含 `SKILL.md` 的子目录，**按目录名排序**
3. 每个 skill 打成内层 zip（`SKILL.md` 在根）
4. 与 `manifest.json`、`PROMPT.md` 一起打成外层 `{slug}.zip`，写入 `packages/templates/skillspackage/`
5. 自动调用 `generate-index.mjs` 重建 `index.json`

## 工作流

封装一个新技能包时按此清单走：

1. **收集源信息**
   - [ ] 源 skills 目录在哪？每个子目录是否都含 `SKILL.md`？
   - [ ] slug（小写、连字符分隔，如 `phaserjs`、`tech-code-refactoring`）
   - [ ] displayName（中文显示名）
   - [ ] summary（一句话概括，会进商店列表）
   - [ ] PROMPT.md 内容（系统提示词，串联这些 skill 的工作流）
   - [ ] 是否需要开 tools？（默认不开，最小权限）

2. **PROMPT.md 优先级**（脚本按此顺序查找）
   - `--prompt <file>` 显式指定 → 用它
   - 源目录下有 `PROMPT.md` → 用它
   - 都没有 → 生成占位模板（建议事后替换为真实工作流）

3. **执行打包**：调用上面的脚本

4. **验证产物**
   - [ ] `skillspackage/{slug}.zip` 已生成
   - [ ] 索引输出 `[skillspackage] N packages`，N 比之前 +1
   - [ ] `index.json` 出现新条目，`skillCount` 与源 skill 数一致

5. **抽检验证 zip 结构**（推荐）：
   ```bash
   cd /tmp && rm -rf v && mkdir v && cd v && \
     unzip -q <repo>/packages/templates/skillspackage/{slug}.zip && find . | head -20
   # 应看到 ./{slug}/manifest.json、./{slug}/PROMPT.md、./{slug}/skills/*.zip
   # 再解一个内层 zip 验证 SKILL.md 在根：
   unzip -q ./{slug}/skills/<某skill>.zip && ls  # 应直接看到 SKILL.md
   ```

## 关键约束

- **slug 命名**：仅 `[a-z0-9-]`，作为 zip 名、目录前缀、manifest.slug、商店 id，必须稳定（改名 = 新建一个包）
- **skillSlugs 与目录名**：脚本的 `skillSlugs` 直接取自源目录名排序结果，要剔除某个 skill 就别把它的目录放进 `--src`
- **SKILL.md 必须在内层 zip 根目录**：这是后端 `installSkillsPackage` 的硬约束（`packages/server/src/services/skills-package.ts` 校验 `targetDir/SKILL.md` 存在）
- **不要手维护源目录**：历史上 `skillspackage/{slug}/` 源目录已废弃，所有内容都在 zip 里
- **覆盖保护**：默认不覆盖已存在的 `{slug}.zip`，加 `--force` 才覆盖

## 常见坑

| 现象 | 原因 | 处理 |
|------|------|------|
| `[skillspackage] N` 没增加 | manifest 解析失败 / slug 与 zip 名不匹配 | 解压 zip 检查 `{slug}/manifest.json` 是否存在且 `slug` 字段正确 |
| 商店里 skill 数为 0 | 内层 zip 里 SKILL.md 不在根 | 确认源 skill 目录结构，重新打包 |
| 重复条目 | 同 slug 的旧 zip 未删 | 加 `--force` 覆盖，或先 `rm` 旧 zip |
| 中文乱码 | Windows 终端编码 | 文件本身是 UTF-8，终端显示乱码不影响功能 |

## 参考

- 规范来源：`documents/docs/features/agent-store.mdx`（技能包章节）
- 扫描器：`packages/templates/generate-index.mjs` 的 `scanSkillsPackageStore`
- 安装端：`packages/server/src/services/skills-package.ts` 的 `installSkillsPackage`
- 现有样例：`packages/templates/skillspackage/tech-code-refactoring.zip`、`phaserjs.zip`
