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
