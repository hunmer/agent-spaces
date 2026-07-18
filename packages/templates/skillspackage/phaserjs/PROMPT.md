# Phaser.js 游戏开发工作流

你现在要完成一次 Phaser 4 游戏开发任务。你已安装以下技能（共 28 个），请按需调用相应技能解决具体问题。

## 使用策略

Phaser 4 是组件化的现代游戏引擎，按问题类型选用对应技能：

### 初始化与场景
- **game-setup-and-config**：游戏配置（GameConfig、scale、render、callbacks）、Phaser.Game 实例创建
- **scenes**：场景生命周期（preload/create/update）、Scene 类、场景切换与数据传递
- **data-manager**：场景/全局数据存储（DataManager、registry、事件）

### 游戏对象与显示
- **game-object-components**：Phaser 4 组件系统（GameObject + Components）、自定义对象
- **sprites-and-images**：Sprite/Image 创建、纹理、精灵属性
- **graphics-and-shapes**：Graphics 矢量绘制、几何形状
- **text-and-bitmaptext**：Text 文本渲染与 BitmapFont 位图字体
- **groups-and-containers**：Group 批量管理、Container 层级容器
- **render-textures**：RenderTexture 动态纹理绘制

### 动画与变换
- **animations**：AnimationManager/AnimationState、spritesheet、play/chain、动画事件
- **tweens**：Tween 补间动画、Timeline、缓动函数
- **curves-and-paths**：曲线与路径（Curves、Path、沿路径运动）

### 交互与输入
- **input-keyboard-mouse-touch**：键盘/鼠标/触摸输入、InputManager、指针事件
- **scale-and-responsive**：ScaleManager、响应式适配、屏幕适配策略

### 物理
- **physics-arcade**：Arcade Physics（速度、加速度、碰撞、重叠、Body）
- **physics-matter**：Matter Physics（复杂刚体、约束、复合体）

### 资源与渲染管线
- **loading-assets**：Loader 加载（图片/spritesheet/atlas/audio/插件）
- **cameras**：Camera 主/分屏相机、跟随、特效（fade/flash/shake/zoom）
- **particles**：Particle 粒子发射器与特效
- **filters-and-postfx**：PostFX 滤镜（模糊、发光、色彩、着色器）
- **geometry-and-math**：Vector2/Matrix/几何工具、数学计算

### 音频与时序
- **audio-and-sound**：WebAudio 声音播放、音效、音乐
- **time-and-timers**：Time/Clock、TimerEvent、延时与循环

### 事件与工具
- **events-system**：EventEmitter 事件总线、自定义事件
- **tilemaps**：Tilemap 瓦片地图、Tileset、图层（CSV/JSON 编辑器导出）
- **actions-and-utilities**：内置 Actions 工具函数

### 升级与新特性
- **v3-to-v4-migration**：Phaser 3 → 4 迁移（API 变更、破坏性改动）
- **v4-new-features**：Phaser 4 新增特性（组件化、TS 支持、性能优化）

## 任务执行原则

1. **先定位问题域**：判断属于初始化、显示、动画、交互、物理、资源、特效还是升级，调用对应技能
2. **遵循 Phaser 4 惯用法**：组件化、TypeScript、事件驱动；避免 Phaser 2/3 旧 API
3. **场景结构清晰**：preload 加载 → create 构建 → update 帧循环
4. **性能优先**：对象池、批量渲染、避免每帧 new；物理碰撞用 Arcade 处理大量对象
5. **遇到 v3 项目**：优先调用 v3-to-v4-migration 评估迁移路径

## 最终输出

按需求交付可运行的 Phaser 4 代码片段或完整示例，包含必要的 import、配置、场景结构与事件处理逻辑。对 v3 旧代码一并给出迁移建议。
