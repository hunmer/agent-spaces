// 视频帧处理 action：按帧截取 + 自定义命令。
// 产物写入当前 mini-app 的 data 目录（需 ctx.api.getMiniAppDataDir / saveMiniAppDataFile），
// 返回可直接用于 <img>/<video> 的 httpPath。
//
// 截帧直接 spawn ffmpeg 进程（绕过 fluent-ffmpeg screenshots API 的怪异行为），
// 能完整捕获 stderr 用于排错。
const { execFile } = require('child_process')
const ffmpeg = require('@ts-ffmpeg/fluent-ffmpeg')
const path = require('path')
const fs = require('fs')

function setFfmpegPath(ffmpegPath) {
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
}

function setFfprobePath(ffprobePath) {
  if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath)
}

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// 取 fluent-ffmpeg 内部记录的 ffmpeg 可执行路径（被 setFfmpegPath 设过），
// 兜底系统 PATH（直接用 'ffmpeg'）。
function resolveFfmpegBin(args) {
  const cfg = args.ffmpegPath || (ffmpeg._ffmpegPath)
  return cfg || 'ffmpeg'
}

function resolveFfprobeBin(args) {
  const cfg = args.ffprobePath || (ffmpeg._ffprobePath)
  return cfg || 'ffprobe'
}

// spawn 一个命令并收集 stdout/stderr；非 0 退出抛错（带 stderr 尾部）
function runBin(bin, runArgs, ctx) {
  return new Promise((resolve, reject) => {
    const proc = execFile(bin, runArgs, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        const tail = (stderr || '').split('\n').slice(-8).join('\n')
        ctx.logger.error(`${bin} 失败: ${tail || err.message}`)
        reject(new Error(tail || err.message))
        return
      }
      resolve({ stdout, stderr })
    })
    ctx.logger.info(`命令: ${bin} ${runArgs.join(' ')}`)
  })
}

// 用 ffprobe 取时长（秒）
async function probeDuration(inputPath, args, ctx) {
  try {
    const { stdout } = await runBin(resolveFfprobeBin(args), [
      '-v', 'error', '-show_entries', 'format=duration', '-of',
      'default=noprint_wrappers=1:nokey=1', inputPath,
    ], ctx)
    const d = toNumber(stdout.trim())
    return (d && d > 0) ? d : null
  } catch {
    return null
  }
}

module.exports = (t) => [
  {
    name: 'ffmpeg_extract_frames',
    label: t('action.extractFrames.label', '按帧截取'),
    category: t('category', 'FFmpeg'),
    icon: 'Film',
    description: t('action.extractFrames.description', '从视频中按数量或帧率截取帧图片，返回可直接访问的图片 URL 数组。'),
    tool: false,
    properties: [
      { key: 'inputPath', label: t('field.inputPath.label', 'Video URL or Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.inputUrlOrPath.tooltip', 'Local absolute path or a public http(s) URL of the video file.') },
      { key: 'mode', label: t('field.frameMode.label', 'Extract Mode'), type: 'select', dataType: 'string', default: 'count', options: [
        { label: t('field.frameModeOption.count', 'By Count'), value: 'count' },
        { label: t('field.frameModeOption.fps', 'By FPS'), value: 'fps' },
      ] },
      { key: 'count', label: t('field.frameCount.label', 'Frame Count'), type: 'number', dataType: 'number', default: 8, tooltip: t('field.frameCount.tooltip', 'Number of frames to extract (mode=By Count).') },
      { key: 'fps', label: t('field.fps.label', 'FPS'), type: 'number', dataType: 'number', default: 1, tooltip: t('field.fps.tooltip', 'Frames per second to extract (mode=By FPS).') },
      { key: 'maxWidth', label: t('field.maxWidth.label', 'Max Width'), type: 'number', dataType: 'number', tooltip: t('field.maxWidth.tooltip', 'Scale frames to this max width (keeps aspect ratio).') },
      { key: 'maxHeight', label: t('field.maxHeight.label', 'Max Height'), type: 'number', dataType: 'number', tooltip: t('field.maxHeight.tooltip', 'Scale frames to this max height (keeps aspect ratio).') },
      { key: 'ffmpegPath', label: t('field.ffmpegPath.label', 'FFmpeg Path'), type: 'text', dataType: 'string', default: '{{ __config__["workflow.ffmpeg"]["ffmpegPath"] }}', tooltip: t('field.ffmpegPath.tooltip', 'Leave empty to use system PATH.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'frames', type: 'array', dataType: 'array' },
        { key: 'frameCount', type: 'number', dataType: 'number' },
        { key: 'dir', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      let inputPath = args.inputPath
      if (!inputPath) return { success: false, message: t('message.inputRequired', 'inputPath is required') }
      // 规整：/static/uploads/xxx → 本地绝对路径；http(s):// 原样
      if (ctx.api.resolveInputPath) inputPath = ctx.api.resolveInputPath(inputPath)

      const dataDir = ctx.api.getMiniAppDataDir && ctx.api.getMiniAppDataDir()
      if (!dataDir) {
        return { success: false, message: t('message.noDataDir', 'Mini-app data directory unavailable (not called from a mini-app context).') }
      }

      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const dir = path.join(dataDir, 'video-frames', id)
      await fs.promises.mkdir(dir, { recursive: true })

      const mode = args.mode === 'fps' ? 'fps' : 'count'
      const count = Math.max(1, toNumber(args.count) || 8)
      const fps = Math.max(0.1, toNumber(args.fps) || 1)
      const maxW = toNumber(args.maxWidth)
      const maxH = toNumber(args.maxHeight)

      // scale 滤镜：W:H，-1 = 按比例自适应
      const scalePart = (maxW || maxH) ? `,scale=${maxW || -1}:${maxH || -1}` : ''
      // 逐帧 seek 时单独的 vf（scale 滤镜，无则不传 -vf）
      const seekVf = (maxW || maxH) ? [`-vf`, `scale=${maxW || -1}:${maxH || -1}`] : []
      const bin = resolveFfmpegBin(args)
      const outPattern = path.join(dir, 'frame-%04d.jpg')

      ctx.logger.info(`按帧截取: ${inputPath} (mode=${mode}, count=${count}, fps=${fps}) -> ${dir}`)

      try {
        // 统一用 fps 滤镜抽帧（比逐帧 -ss seek 稳定，不会因 duration 偏差 EOF）：
        // - fps 模式：直接用 fps 值
        // - count 模式：探测 duration，算 fps = count / duration（探测失败回退 fps=1）
        // - count=1 特殊处理：取中点单帧 seek（fps 滤镜不好控制只出 1 帧）
        let ffArgs
        if (mode === 'fps') {
          ffArgs = ['-y', '-i', inputPath, '-vf', `fps=${fps}${scalePart}`, '-q:v', '2', outPattern]
        } else if (count === 1) {
          // 单帧：取视频中点（避免首末帧边界问题）
          const duration = await probeDuration(inputPath, args, ctx)
          const t = duration ? duration / 2 : 1
          await runBin(bin, [
            '-y', '-ss', t.toFixed(3), '-i', inputPath,
            '-frames:v', '1', ...seekVf, '-q:v', '2',
            path.join(dir, 'frame-0001.jpg'),
          ], ctx)
          ffArgs = null
        } else {
          // count>1：算出等价 fps，让 ffmpeg 用 fps 滤镜均匀抽帧
          const duration = await probeDuration(inputPath, args, ctx)
          // 留 5% 余量算 fps，避免末尾帧取不到（fps 滤镜按时间均匀，末尾可能差一帧）
          const effDur = duration ? duration * 0.95 : Math.max(1, count)
          const targetFps = count / effDur
          ffArgs = ['-y', '-i', inputPath, '-vf', `fps=${targetFps.toFixed(4)}${scalePart}`, '-q:v', '2', outPattern]
        }

        if (ffArgs) {
          await runBin(bin, ffArgs, ctx)
        }

        // 收集产物并转成 httpPath
        const entries = await fs.promises.readdir(dir)
        const files = entries
          .filter((f) => /^frame.*\.jpe?g$/i.test(f))
          .sort()
        const frames = []
        for (const f of files) {
          const abs = path.join(dir, f)
          const rel = path.relative(dataDir, abs).split(path.sep).join('/')
          const buffer = await fs.promises.readFile(abs)
          const saved = ctx.api.saveMiniAppDataFile && ctx.api.saveMiniAppDataFile(rel, buffer)
          frames.push(saved?.httpPath || rel)
        }

        if (!frames.length) {
          return { success: false, message: t('message.noFrames', 'No frames extracted. Check ffmpeg is installed (in PATH) and the video URL/path is valid. See server logs for ffmpeg stderr.') }
        }

        return {
          success: true,
          message: t('message.extractFramesDone', 'Extracted {n} frames.').replace('{n}', frames.length),
          data: {
            frames,
            frameCount: frames.length,
            dir: `video-frames/${id}`,
          },
        }
      } catch (err) {
        ctx.logger.error(`截帧失败: ${err?.stack || err}`)
        return { success: false, message: t('message.extractFramesFailed', 'Frame extraction failed: {error}').replace('{error}', err.message) }
      }
    },
  },
  {
    name: 'ffmpeg_custom',
    label: t('action.custom.label', 'Custom FFmpeg Command'),
    category: t('category', 'FFmpeg'),
    icon: 'Terminal',
    description: t('action.custom.description', 'Run a custom ffmpeg command string. Output is saved to the mini-app data directory and returned as an http URL.'),
    tool: false,
    properties: [
      { key: 'inputPath', label: t('field.inputPath.label', 'Input File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.inputUrlOrPath.tooltip', 'Local absolute path or a public http(s) URL of the input file.') },
      { key: 'args', label: t('field.args.label', 'FFmpeg Args'), type: 'text', dataType: 'string', required: true, tooltip: t('field.args.tooltip', 'ffmpeg arguments without the input, e.g. "-vf scale=640:-1 -c:a copy".') },
      { key: 'outputExt', label: t('field.outputExt.label', 'Output Extension'), type: 'text', dataType: 'string', default: 'mp4', tooltip: t('field.outputExt.tooltip', 'Output file extension (mp4, webm, gif, ...).') },
      { key: 'ffmpegPath', label: t('field.ffmpegPath.label', 'FFmpeg Path'), type: 'text', dataType: 'string', default: '{{ __config__["workflow.ffmpeg"]["ffmpegPath"] }}', tooltip: t('field.ffmpegPath.tooltip', 'Leave empty to use system PATH.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'httpPath', type: 'string' },
        { key: 'dir', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      let inputPath = args.inputPath
      const argStr = (args.args || '').trim()
      if (!inputPath) return { success: false, message: t('message.inputRequired', 'inputPath is required') }
      if (!argStr) return { success: false, message: t('message.argsRequired', 'args is required') }
      if (ctx.api.resolveInputPath) inputPath = ctx.api.resolveInputPath(inputPath)

      const dataDir = ctx.api.getMiniAppDataDir && ctx.api.getMiniAppDataDir()
      if (!dataDir) {
        return { success: false, message: t('message.noDataDir', 'Mini-app data directory unavailable (not called from a mini-app context).') }
      }

      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const dir = path.join(dataDir, 'video-output')
      await fs.promises.mkdir(dir, { recursive: true })
      const ext = (args.outputExt || 'mp4').replace(/^\.+/, '')
      const outFile = path.join(dir, `${id}.${ext}`)
      const bin = resolveFfmpegBin(args)

      ctx.logger.info(`自定义命令: ${bin} -i ${inputPath} ${argStr} -> ${outFile}`)

      try {
        // 解析参数字符串为 token（支持引号）
        const tokens = argStr.match(/(?:[^\s"]+|"[^"]*")+/g) || []
        const outputArgs = tokens.map((tok) => tok.replace(/^"(.*)"$/, '$1'))
        await runBin(bin, ['-y', '-i', inputPath, ...outputArgs, outFile], ctx)

        const rel = path.relative(dataDir, outFile).split(path.sep).join('/')
        const buffer = await fs.promises.readFile(outFile)
        const saved = ctx.api.saveMiniAppDataFile && ctx.api.saveMiniAppDataFile(rel, buffer)
        const httpPath = saved?.httpPath || rel

        return {
          success: true,
          message: t('message.customDone', 'Custom command completed.'),
          data: { httpPath, dir: `video-output/${id}.${ext}` },
        }
      } catch (err) {
        ctx.logger.error(`自定义命令失败: ${err?.stack || err}`)
        return { success: false, message: t('message.customFailed', 'Custom command failed: {error}').replace('{error}', err.message) }
      }
    },
  },
]
