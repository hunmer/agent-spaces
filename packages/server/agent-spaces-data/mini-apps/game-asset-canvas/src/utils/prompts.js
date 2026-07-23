/**
 * 内置提示词库：从 sprite-sheet-creator 项目抽取并整理的游戏资产生成提示词。
 *
 * 数据结构：{ id, category, title, desc, prompt, scene, aspect? }
 * - category: 分组（角色/精灵图动画/背景/图像转换）
 * - scene:    适用场景 'text'(文生图) | 'edit'(编辑图片) | 'both'(两者皆可)
 *   表单打开提示词选择器时按自身类型过滤可见条目。
 * - aspect?:  建议比例（选填）。选中该条目时联动设置表单的比例下拉。
 *   例：横版攻击动画 21:9、竖向攻击 9:16、视差背景 21:9；缺省表示不改比例。
 *
 * 提示词正文多为英文（图生模型对英文提示词响应更好），title/desc 为中文便于检索。
 */

export const PROMPT_CATEGORIES = [
  { id: 'character', label: '角色生成', icon: '🧙' },
  { id: 'sprite', label: '精灵图动画', icon: '🎞️' },
  { id: 'background', label: '背景场景', icon: '🏞️' },
  { id: 'convert', label: '图像转换', icon: '🔄' },
];

export const PROMPT_LIBRARY = [
  // ============ 角色生成（文生图） ============
  {
    id: 'char-pixel-character',
    category: 'character',
    title: '像素角色立绘',
    desc: '生成单个游戏角色，32 位像素风，正面/3/4 视角站姿',
    scene: 'text',
    prompt: `Generate a single character only, centered in the frame on a plain white background.
The character should be rendered in detailed 32-bit pixel art style (like PlayStation 1 / SNES era games).
Include proper shading, highlights, and anti-aliased edges for a polished look.
The character should have well-defined features, expressive details, and rich colors.
Show in a front-facing or 3/4 view pose, standing idle, suitable for sprite sheet animation.`,
  },
  {
    // 来源：FrameRonin · nanobanana RpgMaker角色生成 V3（Gemini Gem）
    // 依赖参考图，按 R0/R1 关键字切换两张参考图。
    id: 'char-rpgmaker-v3',
    category: 'character',
    title: 'RpgMaker角色生成 V3（R0/R1）',
    desc: '按 R0/R1 关键字切换参考图生成角色 spritesheet，网格布局，白/绿底，1:1',
    scene: 'edit',
    references: ['assets/references/char-rpgmaker-v3/ref1.png', 'assets/references/char-rpgmaker-v3/ref2.png'],
    prompt: `你是一个自身的像素动画师，专门用来设计像素角色动画。
你将严格按照网格布局生成像素角色的spritesheet。
你会默认把背景设置为白色或绿色。
图片中不出现任何文字，不出现任何网格线和数字。
画面比例1:1
生成的角色朝向与参考图一致
如果用户提示词中有R0就参考第一张图生成：
如果用户提示词中有R1就参考第二张图生成：`,
  },

  // ============ 精灵图动画（编辑图片，需角色参考图） ============
  {
    id: 'sprite-walk',
    category: 'sprite',
    title: '行走动画（2x2 横版）',
    desc: '4 帧行走循环，2x2 网格，白底，面向右侧',
    scene: 'edit',
    prompt: `Create a 4-frame pixel art walk cycle sprite sheet of this character.

Arrange the 4 frames in a 2x2 grid on white background. The character is walking to the right.

Top row (frames 1-2):
Frame 1 (top-left): Right leg forward, left leg back - stride position
Frame 2 (top-right): Legs close together, passing/crossing - transition

Bottom row (frames 3-4):
Frame 3 (bottom-left): Left leg forward, right leg back - opposite stride
Frame 4 (bottom-right): Legs close together, passing/crossing - transition back

Each frame shows a different phase of the walking motion. This creates a smooth looping walk cycle.

Use detailed 32-bit pixel art style with proper shading and highlights. Same character design in all frames. Character facing right.`,
  },
  {
    id: 'sprite-jump',
    category: 'sprite',
    title: '跳跃动画（2x2 横版）',
    desc: '4 帧跳跃：蓄力/上升/顶点/落地',
    scene: 'edit',
    prompt: `Create a 4-frame pixel art jump animation sprite sheet of this character.

Arrange the 4 frames in a 2x2 grid on white background. The character is jumping.

Top row (frames 1-2):
Frame 1 (top-left): Crouch/anticipation - character slightly crouched, knees bent, preparing to jump
Frame 2 (top-right): Rising - character in air, legs tucked up, arms up, ascending

Bottom row (frames 3-4):
Frame 3 (bottom-left): Apex/peak - character at highest point of jump, body stretched or tucked
Frame 4 (bottom-right): Landing - character landing, slight crouch to absorb impact

Use detailed 32-bit pixel art style with proper shading and highlights. Same character design in all frames. Character facing right.`,
  },
  {
    id: 'sprite-attack',
    category: 'sprite',
    title: '攻击动画（2x2 横版）',
    desc: '4 帧攻击：蓄力/挥击/命中/收招',
    scene: 'edit',
    aspect: '21:9',
    prompt: `Create a 4-frame pixel art attack animation sprite sheet of this character.

Arrange the 4 frames in a 2x2 grid on white background. The character is performing an attack that fits their design - could be a sword slash, magic spell, punch, kick, or energy blast depending on what suits the character best.

Top row (frames 1-2):
Frame 1 (top-left): Wind-up/anticipation - character preparing to attack, pulling back weapon or gathering energy
Frame 2 (top-right): Attack in motion - the strike or spell being unleashed

Bottom row (frames 3-4):
Frame 3 (bottom-left): Impact/peak - maximum extension of attack, weapon fully swung or spell at full power
Frame 4 (bottom-right): Recovery - returning to ready stance

Use detailed 32-bit pixel art style with proper shading and highlights. Same character design in all frames. Character facing right. Make the attack visually dynamic and exciting.`,
  },
  {
    id: 'sprite-idle',
    category: 'sprite',
    title: '待机/呼吸动画（2x2 横版）',
    desc: '4 帧微幅待机呼吸循环',
    scene: 'edit',
    prompt: `Create a 4-frame pixel art idle/breathing animation sprite sheet of this character.

Arrange the 4 frames in a 2x2 grid on white background. The character is standing still but with subtle idle animation.

Top row (frames 1-2):
Frame 1 (top-left): Neutral standing pose - relaxed stance
Frame 2 (top-right): Slight inhale - chest/body rises subtly, maybe slight arm movement

Bottom row (frames 3-4):
Frame 3 (bottom-left): Full breath - slight upward posture
Frame 4 (bottom-right): Exhale - returning to neutral, slight settle

Keep movements SUBTLE - this is a gentle breathing/idle loop, not dramatic motion. Character should look alive but relaxed.

Use detailed 32-bit pixel art style with proper shading and highlights. Same character design in all frames. Character facing right.`,
  },
  {
    id: 'sprite-walk-iso-down',
    category: 'sprite',
    title: '等距行走-向下（俯视 RPG）',
    desc: '4 帧行走，3/4 俯视，朝向镜头（南）',
    scene: 'edit',
    prompt: `Create a 4-frame pixel art walk cycle sprite sheet of this character walking DOWNWARD (toward the camera) in a top-down isometric RPG perspective (3/4 overhead view, like a classic top-down RPG).

Arrange the 4 frames in a 2x2 grid on white background. The character is walking toward the viewer (south/down).

Top row (frames 1-2):
Frame 1 (top-left): Left foot forward stride, arms swinging naturally
Frame 2 (top-right): Feet together, passing/transition pose

Bottom row (frames 3-4):
Frame 3 (bottom-left): Right foot forward stride, arms swinging naturally
Frame 4 (bottom-right): Feet together, passing/transition back

We see the character's front/face. Top-down 3/4 view - we see the top of their head slightly. This creates a smooth looping walk cycle.

Use detailed 32-bit pixel art style with proper shading and highlights. Same character design in all frames.`,
  },
  {
    id: 'sprite-walk-iso-up',
    category: 'sprite',
    title: '等距行走-向上（俯视 RPG）',
    desc: '4 帧行走，3/4 俯视，背向镜头（北）',
    scene: 'edit',
    prompt: `Create a 4-frame pixel art walk cycle sprite sheet of this character walking UPWARD (away from the camera) in a top-down isometric RPG perspective (3/4 overhead view, like a classic top-down RPG).

Arrange the 4 frames in a 2x2 grid on white background. The character is walking away from the viewer (north/up).

Top row (frames 1-2):
Frame 1 (top-left): Left foot forward stride, arms swinging naturally — BACK VIEW
Frame 2 (top-right): Feet together, passing/transition pose — BACK VIEW

Bottom row (frames 3-4):
Frame 3 (bottom-left): Right foot forward stride, arms swinging naturally — BACK VIEW
Frame 4 (bottom-right): Feet together, passing/transition back — BACK VIEW

CRITICAL: ALL 4 frames must show the character from EXACTLY the same angle — their BACK, facing directly away from the camera. Do NOT rotate or twist the character between frames. The ONLY difference between frames should be the leg and arm positions for the walk cycle. The character's body angle, head direction, and facing must be IDENTICAL in every frame — always showing the back of the character. A simple back view with only legs alternating.

Use detailed 32-bit pixel art style with proper shading and highlights. Same character design in all frames.`,
  },
  {
    id: 'sprite-walk-iso-side',
    category: 'sprite',
    title: '等距行走-侧向（俯视 RPG）',
    desc: '4 帧行走，3/4 俯视，面向右侧',
    scene: 'edit',
    prompt: `Create a 4-frame pixel art walk cycle sprite sheet of this character WALKING TO THE RIGHT in a top-down isometric RPG perspective (3/4 overhead view, like a classic top-down RPG).

Arrange the 4 frames in a 2x2 grid on white background. The character is FACING RIGHT and WALKING RIGHT.

Top row (frames 1-2):
Frame 1 (top-left): Right leg forward, left leg back - stride position, arms swinging
Frame 2 (top-right): Legs close together, passing/crossing - transition pose

Bottom row (frames 3-4):
Frame 3 (bottom-left): Left leg forward, right leg back - opposite stride, arms swinging
Frame 4 (bottom-right): Legs close together, passing/crossing - transition back

We see the character's RIGHT-facing side profile from a top-down 3/4 overhead angle. This creates a smooth looping walk cycle.

Use detailed 32-bit pixel art style with proper shading and highlights. Same character design in all frames. Character facing RIGHT.`,
  },
  {
    // 来源：FrameRonin · nanobanana 连生动作V4Tx3（Gemini Gem）
    // 通过 A0/A1/A2 关键字触发三套不同动作，原 Gem 仅一张参考图。
    id: 'sprite-v4tx3-actions',
    category: 'sprite',
    title: '连生动作V4Tx3（A0/A1/A2）',
    desc: '按 A0/A1/A2 关键字生成不同动作 spritesheet，5 行网格，绿底，1:1',
    scene: 'edit',
    references: ['assets/references/sprite-v4tx3-actions/ref1.png'],
    prompt: `你是一个自身的像素动画师，专门用来设计像素角色动画。
你将严格按照网格布局生成像素角色的spritesheet。
你会默认把背景设置为绿色。
图片中不出现任何文字，不出现任何网格线和数字。
角色的动作严格按照参考图生成。
每行的帧数严格按照参考图生成。
画面比例1:1
如果用户提示词中有A0就参考第一张图生成：
第一行： 向左走动（6帧）
第二行： 向下走动（6帧）
第三行： 向上走动（6帧）
第四行： 向左跑动（6帧）
第五行： 向下跑动（6帧）
如果用户提示词中有A1就参考第二张图生成：
第一行： 向上跑动（6帧）
第二行： 下蹲（6帧）
第三行： 抛掷（6帧）
第四行： 抛掷后续（2帧）、正面站立（1帧）、反面站立（1帧）、跳跃（2帧）
第五行： 其他
如果用户提示词中有A2就参考第三张图生成：
第一行、第二行、第三行：挥剑动作 （9帧）
第四行、第五行： 刺枪动作（8帧）`,
  },
  {
    // 来源：FrameRonin · nanobanana 角色生成 V3（Gemini Gem）
    id: 'sprite-char-v3',
    category: 'sprite',
    title: '角色生成 V3',
    desc: '网格布局生成角色 spritesheet，白/绿底',
    scene: 'edit',
    references: ['assets/references/sprite-char-v3/ref1.png'],
    prompt: `你是一个自身的像素动画师，专门用来设计像素角色动画。
你将严格按照网格布局生成像素角色的spritesheet。
你会默认把背景设置为白色或绿色。`,
  },
  {
    // 来源：FrameRonin · nanobanana预设像素角色生成器V2.3OT（Gemini Gem）
    // 支持更大的像素和2:1角色。4 行网格布局，含跑动/闲置/准备姿态。
    id: 'sprite-char-v23ot',
    category: 'sprite',
    title: '预设像素角色生成器 V2.3OT',
    desc: '4 行网格：向下/向右/向上跑动 + 闲置 + 准备姿态，1:1',
    scene: 'edit',
    references: [
      'assets/references/sprite-char-v23ot/ref1.png',
      'assets/references/sprite-char-v23ot/ref2.png',
      'assets/references/sprite-char-v23ot/ref3.png',
    ],
    prompt: `你是一个自身的像素动画师，专门用来设计像素角色动画。
你将严格按照网格布局生成像素角色的spritesheet。
你会默认把背景设置为白色或绿色。
图片中不出现任何文字，不出现任何网格线和数字。
画面比例1:1
第一行： 向下跑动（6帧）
第二行： 向右跑动（6帧）和向下、向上闲置（各1帧）
第三行： 向上跑动（6帧）和向左闲置、向右闲置（各1帧）
第四行： 准备姿态`,
  },
  {
    // 来源：FrameRonin · nanobanana 横版人物生成（Gemini Gem）
    // 6 行网格：跑/走/跳/idle/die/挥剑攻击（两种宽度）。
    id: 'sprite-horizontal-char',
    category: 'sprite',
    title: '横版人物生成',
    desc: '6 行网格：跑/走/跳/idle+die/挥剑攻击×2，1:1',
    scene: 'edit',
    references: ['assets/references/sprite-horizontal-char/ref1.png'],
    prompt: `你是一个自身的像素动画师，专门用来设计像素角色动画。
你将严格按照网格布局生成像素角色的spritesheet。
你会默认把背景设置为白色或绿色。
图片中不出现任何文字，不出现任何网格线和数字。
画面比例1:1
第一行： 向右跑动（8帧）
第二行： 向右走动（8帧）
第三行： 跳（8帧）
第四行： idle（前4帧）die（后4帧）
第五行：挥剑攻击 宽4帧
第六行：挥剑攻击 宽3帧`,
  },
  {
    // 来源：FrameRonin · nanobanana 八方向 TopDown 角色生成（Gemini Gem）
    // 5 行网格，左下/左/左上/上/下 跑动各 6 帧。
    id: 'sprite-8dir-topdown',
    category: 'sprite',
    title: '八方向 TopDown 角色生成',
    desc: '5 行网格：左下/左/左上/上/下跑动各 6 帧，1:1',
    scene: 'edit',
    references: ['assets/references/sprite-8dir-topdown/ref1.png'],
    prompt: `你是一个自身的像素动画师，专门用来设计像素角色动画。
你将严格按照网格布局生成像素角色的spritesheet。
你会默认把背景设置为白色或绿色。
图片中不出现任何文字，不出现任何网格线和数字。
画面比例1:1
第一行： 向左下跑动（6帧）
第二行： 向左跑动（6帧）
第三行： 向左上跑动（6帧）
第四行： 向上跑动（6帧）
第五行： 向下跑动（6帧）`,
  },
  {
    // 来源：FrameRonin · nanobanana 骑马动作生成（Gemini Gem）
    id: 'sprite-horse-riding',
    category: 'sprite',
    title: '骑马动作生成',
    desc: '像素角色骑马 spritesheet，网格布局，白/绿底，1:1',
    scene: 'edit',
    references: [
      'assets/references/sprite-horse-riding/ref1.png',
      'assets/references/sprite-horse-riding/ref2.png',
    ],
    prompt: `你是一个自身的像素动画师，专门用来设计像素角色动画。
你将严格按照网格布局生成像素角色的spritesheet。
像素角色在骑马
你会默认把背景设置为白色或绿色。
图片中不出现任何文字，不出现任何网格线和数字。
画面比例1:1`,
  },
  {
    // 来源：FrameRonin · nanobanana 一图全动作2（Gemini Gem）
    // 角色手里不拿武器，朝向与参考图一致。
    id: 'sprite-one-image-all-actions-2',
    category: 'sprite',
    title: '一图全动作2',
    desc: '角色不拿武器，朝向与参考图一致，网格布局，1:1',
    scene: 'edit',
    references: ['assets/references/sprite-one-image-all-actions-2/ref1.png'],
    prompt: `你是一个自身的像素动画师，专门用来设计像素角色动画。
你将严格按照网格布局生成像素角色的spritesheet。
你会默认把背景设置为白色或绿色。
图片中不出现任何文字，不出现任何网格线和数字。
画面比例1:1
角色手里不拿武器
生成的角色朝向与参考图一致`,
  },
  {
    // 来源：FrameRonin · nanobanana 僵尸 B1（Gemini Gem）
    // 怪物角色 spritesheet，攻击+死亡两组参考图。
    id: 'sprite-zombie-b1',
    category: 'sprite',
    title: '僵尸 B1',
    desc: '怪物攻击+死亡 spritesheet，手不拿道具，姿态与参考图一致，1:1',
    scene: 'edit',
    references: [
      'assets/references/sprite-zombie-b1/ref1.png',
      'assets/references/sprite-zombie-b1/ref2.png',
    ],
    prompt: `你是一个自身的像素动画师，专门用来设计像素角色动画。
你将严格按照网格布局生成像素角色的spritesheet。
你会默认把背景设置为白色或绿色。
图片中不出现任何文字，不出现任何网格线和数字。
画面比例1:1
角色姿态与朝向跟参考图一致，手里不拿道具。
参考图1为攻击动作参考，参考图2为死亡动作参考。`,
  },
  {
    // 来源：FrameRonin · nanobanana 狗（Gemini Gem）
    // 像素宠物 spritesheet。
    id: 'sprite-pet-dog',
    category: 'sprite',
    title: '像素宠物-狗',
    desc: '像素宠物 spritesheet，姿态与参考图一致，1:1',
    scene: 'edit',
    references: ['assets/references/sprite-pet-dog/ref1.png'],
    prompt: `你是一个资深的像素动画师，专门用来设计像素宠物动画。
你将严格按照网格布局生成像素宠物的spritesheet。
你会默认把背景设置为白色或绿色。
图片中不出现任何文字，不出现任何网格线和数字。
画面比例1:1
宠物姿态与朝向跟参考图一致。`,
  },
  {
    // 来源：用户提供的像素怪物动画提示词（鸟）
    id: 'sprite-monster-bird',
    category: 'sprite',
    title: '像素怪物-鸟',
    desc: '像素怪物 spritesheet，朝向与参考图一致，1:1',
    scene: 'edit',
    references: ['assets/references/sprite-monster-bird/ref1.png'],
    prompt: `你是一个资深的像素动画师，专门用来设计像素怪物动画。
你将严格按照网格布局生成像素怪物的spritesheet。
图片中不出现任何文字、网格线和数字。
画面比例1:1，生成的怪物朝向与参考图一致。`,
  },

  // ============ 背景场景（编辑图片，需角色参考图） ============
  {
    id: 'bg-sky-layer',
    category: 'background',
    title: '天空/远景层（视差）',
    desc: '横版视差背景最远层：天空、远山、云',
    scene: 'edit',
    aspect: '21:9',
    prompt: `Create the SKY/BACKDROP layer for a side-scrolling pixel art game parallax background.

Create an environment that fits the character's world. This is the FURTHEST layer - only sky and very distant elements (distant mountains, clouds, horizon).

Style: Pixel art, 32-bit retro game aesthetic, matching the character's style.
This is a wide panoramic scene.`,
  },
  {
    id: 'bg-midground-layer',
    category: 'background',
    title: '中景层（视差）',
    desc: '视差中景：角色标志性场景（村庄/战场/地标），透明底',
    scene: 'edit',
    aspect: '21:9',
    prompt: `Create the MIDDLE layer of a 3-layer parallax background for a side-scrolling pixel art game.

Create the character's ICONIC/CANONICAL location from their story. Use their most recognizable setting - home village, famous landmarks, signature battlegrounds.
Examples: a hero's home village with monument, a world tournament arena, a castle.

Elements should fill the frame from middle down to bottom.

Style: Pixel art matching the other images.
IMPORTANT: Use a transparent background (checkerboard pattern) so this layer can overlay the others.`,
  },
  {
    id: 'bg-foreground-layer',
    category: 'background',
    title: '前景层（视差）',
    desc: '视差前景：地面/草丛/岩石/平台，透明底',
    scene: 'edit',
    aspect: '21:9',
    prompt: `Create the FOREGROUND layer of a 3-layer parallax background for a side-scrolling pixel art game.

Create the closest foreground elements (ground, grass, rocks, platforms - whatever fits the character's world) that complete the scene.

Style: Pixel art matching the other images.
IMPORTANT: Use a transparent background (checkerboard pattern) so this layer can overlay the others.`,
  },
  {
    id: 'bg-isometric-map',
    category: 'background',
    title: '等距 RPG 世界地图',
    desc: '俯视大地图：路径、水域、建筑、地形，不含角色',
    scene: 'edit',
    prompt: `Create a large, detailed top-down isometric pixel art game world map. Do not place any character on the map.

Style: Classic RPG top-down map, 3/4 overhead perspective.

The map should include a cohesive world with:
- Winding dirt/stone paths connecting areas
- A small body of water (pond, river, or stream)
- A few small buildings or structures that fit the world
- Rocky areas or hills
- Various terrain types for visual interest

This is a single large continuous map image (NOT tiled, NOT a tileset). It should look like a complete, explorable game world viewed from above.

Use detailed 32-bit pixel art style. Make it colorful and inviting. Fill the entire image with map content - no empty borders.`,
  },
  {
    // 来源：FrameRonin · nanobanana 像素场景-正视角（Gemini Gem）
    // 文生图生成全景场景（16:9）；含「提取物件」/「去除物件」关键字做编辑操作，故 scene=both。
    id: 'bg-scene-topdown-front',
    category: 'background',
    title: '像素场景-正视角',
    desc: '俯视正视角全景场景，不出现人物；支持「提取物件」「去除物件」关键字，16:9',
    scene: 'both',
    aspect: '16:9',
    prompt: `你是一名资深的像素场景画师，你将根据用户描述的场景生成一个topdown类型的俯视正视角的全景像素风场景，不出现人物。长宽比16:9
如果用户提示词中有关键字"提取物件"，那么请基于已经生成的场景，将场景中的物件单独提取（物件包括树木），并有序排列，物件与物件之间保持一定距离，避免后期提取的时候混淆。物件的大小与原场景一致。并且用一个纯黑色背景色填充。
如果没有出现 提取物件 这个关键字就不触发物件提取功能，仅单独生成场景。
如果用户提示词中有关键字"去除物件"，那么请基于已经生成的场景，让场景只剩下场地，包括树木也一并除去，但是不包括地面和草地。`,
  },
  {
    // 来源：FrameRonin · nanobanana 像素场景-街机（Gemini Gem）
    // 横版街机侧视全景场景，多视差层。
    id: 'bg-scene-arcade',
    category: 'background',
    title: '像素场景-街机',
    desc: '2D 横版侧视街机全景场景，多视差层（远/中/前景），不出现人物',
    scene: 'text',
    prompt: `你是一名资深的像素横版街机场景画师。你将根据用户描述，生成一张 2D 横版侧视（Side-scrolling Arcade perspective） 的全景像素场景，风格参考经典动作/格斗街机游戏。
画面规范：

视角： 严格的 2D 侧视视角，展现一个流动的、具有电影感的动作关卡。
构图： 强调水平方向的推进感（Level Flow）。场景必须包含多个视差层（Parallax Layers），以模拟深度：
远景（Far Background）： 遥远的地标（如城市天际线、山脉、巨大的月亮），细节简化。
中景（Midground）： 主要的可通行区域（如街道、平台、工厂内部），细节丰富，包含障碍物。
前景（Foreground）： 快速掠过的景物（如电线杆、栏杆、破碎的车辆），用于增强速度感和深度。
所有的建筑都是正朝镜头。
风格细节： >     * 色彩与光影： 色彩鲜明、饱和度高，具有强烈的戏剧性或环境光效（如霓虹灯、爆炸后的余晖、激光）。光影更强调氛围而非写实。
细节丰富： 场景充满生活气息或破坏痕迹，例如：涂鸦墙、垃圾桶、霓虹招牌、蒸汽管道、破损的机械。
禁忌： 不出现任何玩家人物、UI 界面或文字。`,
  },
  {
    // 来源：FrameRonin · nanobanana 像素场景-45度（Gemini Gem）
    // 俯视45度全景场景；含「提取物件」/「去除物件」关键字做编辑操作，故 scene=both。
    id: 'bg-scene-topdown-45',
    category: 'background',
    title: '像素场景-45度',
    desc: '俯视45度全景场景，不出现人物/山体/天空，建筑朝向45度；支持「提取物件」「去除物件」关键字',
    scene: 'both',
    prompt: `你是一名资深的像素场景画师，你将根据用户描述的场景生成一个topdown类型的俯视45视角的全景像素风场景，不出现人物，山体，天空。建筑朝向都是45度的
如果用户提示词中有关键字"提取物件"，那么请基于已经生成的场景，将场景中的物件与建筑单独提取（物件包括树木），并有序排列，物件与物件之间保持一定距离，避免后期提取的时候混淆。物件的大小与原场景一致。并且用一个纯色的区别的物件颜色背景色填充。
如果没有出现 提取物件 这个关键字就不触发物件提取功能，仅单独生成场景。
如果用户提示词中有关键字"去除物件"，那么请基于已经生成的场景，让场景只剩下场地，包括树木也一并除去，但是不包括地面和草地。`,
  },
  {
    // 来源：FrameRonin · nanobanana 像素场景-泰拉（Gemini Gem）
    // 泰拉瑞亚风横版侧切面全景场景，Tile-based。
    id: 'bg-scene-terraria',
    category: 'background',
    title: '像素场景-泰拉',
    desc: '泰拉瑞亚风 2D 横版侧切面全景场景，Tile 拼接质感，不出现人物',
    scene: 'text',
    prompt: `你是一名资深的像素横版场景画师。你将根据用户描述，生成一张 2D 横版侧视（Side-scrolling perspective） 的全景像素场景，风格参考《泰拉瑞亚》。
画面规范：

视角： 严格的 2D 侧切面视角（Cross-section view），展现地表、天空或地底的纵深感。
构图： 强调层次感，包含远景（背景山峦/天空）、中景（环境装饰/墙壁）和前景（可交互的方块/平台）。
风格细节： >     * Tile-based 质感： 场景元素呈现出由 16x16 或 32x32 像素图块拼接而成的特征。
色彩与光影： 色彩鲜明，具有强烈的环境光效（如发光的矿石、火把或魔法植物）。
生物群落特征： 根据描述突出特定的生物群落（如森林、丛林、腐化之地或地牢）。
禁忌： 不出现任何人物、UI 界面或文字。`,
  },

  // ============ 图像转换（编辑图片） ============
  {
    id: 'convert-to-pixel',
    category: 'convert',
    title: '转 32 位像素风',
    desc: '把任意图片转成 PS1/SNES 风格像素立绘，全身居中白底',
    scene: 'edit',
    prompt: `Transform this character into detailed 32-bit pixel art style (like PlayStation 1 / SNES era games).
IMPORTANT: Must be a FULL BODY shot showing the entire character from head to feet.
Keep the character centered in the frame on a plain white background.
Include proper shading, highlights, and anti-aliased edges for a polished look.
The character should have well-defined features, expressive details, and rich colors.
Show in a front-facing or 3/4 view pose, standing idle, suitable for sprite sheet animation.
Maintain the character's key features, colors, and identity while converting to pixel art.`,
  },
  {
    id: 'convert-remove-bg',
    category: 'convert',
    title: '抠图/去背景',
    desc: '移除背景，保留主体，输出透明 PNG',
    scene: 'edit',
    prompt: `Remove the background completely. Keep the main subject with clean edges and full detail. Output a transparent background (PNG with alpha). Do not alter the subject's colors, proportions, or features.`,
  },
  {
    id: 'convert-change-bg',
    category: 'convert',
    title: '更换背景',
    desc: '保留主体，替换为新背景场景',
    scene: 'edit',
    prompt: `Keep the main subject unchanged (same pose, identity, colors, proportions). Replace only the background with a new scene that fits the subject. Ensure natural blending between subject and new background with consistent lighting and shadows.`,
  },
];

/** 按适用场景过滤提示词（'text' 文生图 / 'edit' 编辑图片）。'both' 两边都返回。 */
export function getPromptsByScene(scene) {
  return PROMPT_LIBRARY.filter((p) => p.scene === scene || p.scene === 'both');
}

/**
 * 判断表单是否有有效提示词：pickedPrompt（提示词库选中）或 prompt（输入框）任一非空即可。
 * 节点提交按钮的 disabled 条件统一用此 helper，避免两处（文生图/编辑图片）逻辑漂移。
 * @param {{ pickedPrompt?: string, prompt?: string }} params
 * @returns {boolean}
 */
export function hasPrompt(params) {
  const { pickedPrompt, prompt } = params || {};
  return Boolean((pickedPrompt || '').trim()) || Boolean((prompt || '').trim());
}
