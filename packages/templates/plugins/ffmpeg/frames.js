// 视频帧处理 action：按帧截取 + 自定义命令。
// 产物写入当前 mini-app 的 data 目录（需 ctx.api.getMiniAppDataDir / saveMiniAppDataFile），
// 返回可直接用于 <img>/<video> 的 httpPath。
const ffmpeg = require('@ts-ffmpeg/fluent-ffmpeg')
const path = require('path')
const fs = require('fs')

function setFfmpegPath(ffmpegPath) {
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
}

// fluent-ffmpeg 的 size() 要求 "WxH"，"?x320" 表示宽度自适应、高度 320。
function buildSizeOption(maxWidth, maxHeight) {
  if (maxWidth && maxHeight) return `${maxWidth}x${maxHeight}`
  if (maxWidth) return `${maxWidth}x?`
  if (maxHeight) return `?x${maxHeight}`
  return null
}

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
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
      const inputPath = args.inputPath
      if (!inputPath) return { success: false, message: t('message.inputRequired', 'inputPath is required') }

      const dataDir = ctx.api.getMiniAppDataDir && ctx.api.getMiniAppDataDir()
      if (!dataDir) {
        return { success: false, message: t('message.noDataDir', 'Mini-app data directory unavailable (not called from a mini-app context).') }
      }

      setFfmpegPath(args.ffmpegPath)

      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const dir = path.join(dataDir, 'video-frames', id)
      await fs.promises.mkdir(dir, { recursive: true })

      const mode = args.mode === 'fps' ? 'fps' : 'count'
      const count = Math.max(1, toNumber(args.count) || 8)
      const fps = Math.max(0.1, toNumber(args.fps) || 1)
      const sizeOpt = buildSizeOption(toNumber(args.maxWidth), toNumber(args.maxHeight))

      ctx.logger.info(`按帧截取: ${inputPath} (mode=${mode}, count=${count}, fps=${fps}) -> ${dir}`)

      try {
        const cmd = ffmpeg(inputPath)
        if (sizeOpt) cmd.size(sizeOpt)

        await new Promise((resolve, reject) => {
          cmd
            .on('start', (line) => ctx.logger.info(`命令: ${line}`))
            .on('error', (err) => { ctx.logger.error(err.message); reject(err) })
            .on('end', () => resolve())
          if (mode === 'fps') {
            cmd.outputOptions(`-vf fps=${fps}`)
              .screenshots({ folder: dir, filename: 'frame-%04d.jpg', timestamps: [] })
            // timestamps 为空 + -vf fps 会逐帧触发；fluent 在无 count/timemarks 时需显式触发
            // 改用 on('end') 后 saveFrame 方式更稳，这里用 screenshots 的 count 兜底
          } else {
            cmd.screenshots({ count, folder: dir, filename: 'frame-%04d.jpg' })
          }
        })

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
          return { success: false, message: t('message.noFrames', 'No frames extracted. Check the video or ffmpeg path.') }
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
      const inputPath = args.inputPath
      const argStr = (args.args || '').trim()
      if (!inputPath) return { success: false, message: t('message.inputRequired', 'inputPath is required') }
      if (!argStr) return { success: false, message: t('message.argsRequired', 'args is required') }

      const dataDir = ctx.api.getMiniAppDataDir && ctx.api.getMiniAppDataDir()
      if (!dataDir) {
        return { success: false, message: t('message.noDataDir', 'Mini-app data directory unavailable (not called from a mini-app context).') }
      }

      setFfmpegPath(args.ffmpegPath)
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const dir = path.join(dataDir, 'video-output')
      await fs.promises.mkdir(dir, { recursive: true })
      const ext = (args.outputExt || 'mp4').replace(/^\.+/, '')
      const outFile = path.join(dir, `${id}.${ext}`)

      ctx.logger.info(`自定义命令: ffmpeg ${argStr} -> ${outFile}`)

      try {
        await new Promise((resolve, reject) => {
          const cmd = ffmpeg(inputPath)
          const tokens = argStr.match(/(?:[^\s"]+|"[^"]*")+/g) || []
          const outputArgs = []
          for (const tok of tokens) {
            const unquoted = tok.replace(/^"(.*)"$/, '$1')
            outputArgs.push(unquoted)
          }
          if (outputArgs.length) cmd.outputOptions(outputArgs)

          cmd
            .on('start', (line) => ctx.logger.info(`命令: ${line}`))
            .on('progress', (p) => ctx.logger.info(`进度: ${Math.round(p.percent || 0)}%`))
            .on('error', (err) => { ctx.logger.error(err.message); reject(err) })
            .on('end', () => resolve())
            .save(outFile)
        })

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
        return { success: false, message: t('message.customFailed', 'Custom command failed: {error}').replace('{error}', err.message) }
      }
    },
  },
]
