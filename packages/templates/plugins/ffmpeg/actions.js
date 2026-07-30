const ffmpeg = require('@ts-ffmpeg/fluent-ffmpeg')
const path = require('path')
const fs = require('fs')
const frameActions = require('./frames')

function setFfmpegPath(ffmpegPath) {
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath)
}

function setFfprobePath(ffprobePath) {
  if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath)
}

function ffprobeFile(inputPath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, data) => {
      if (err) reject(err)
      else resolve(data)
    })
  })
}

// 将 "30/1" 这类分数帧率解析为浮点数
function parseFps(value) {
  if (!value || typeof value !== 'string') return null
  const [num, den] = value.split('/')
  const n = Number(num)
  const d = den ? Number(den) : 1
  if (!n || !d) return null
  return Math.round((n / d) * 1000) / 1000
}

function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// 把原始 ffprobe 流整理成精简结构
function formatStream(s) {
  return {
    index: s.index,
    codecType: s.codec_type,
    codecName: s.codec_name,
    codecLongName: s.codec_long_name,
    profile: s.profile || null,
    duration: toNumber(s.duration),
    bitRate: toNumber(s.bit_rate),
    ...(s.codec_type === 'video' ? {
      width: s.width,
      height: s.height,
      pixelFormat: s.pix_fmt,
      frameRate: parseFps(s.r_frame_rate || s.avg_frame_rate),
      level: s.level != null ? s.level : null,
    } : {}),
    ...(s.codec_type === 'audio' ? {
      sampleRate: toNumber(s.sample_rate),
      channels: s.channels,
      channelLayout: s.channel_layout,
    } : {}),
    ...(s.tags && s.tags.language ? { language: s.tags.language } : {}),
  }
}

function runCommand(cmd, outputPath, ctx) {
  return new Promise((resolve, reject) => {
    cmd
      .on('start', (line) => ctx.logger.info(`命令: ${line}`))
      .on('progress', (p) => ctx.logger.info(`进度: ${Math.round(p.percent || 0)}%`))
      .on('error', (err) => {
        ctx.logger.error(err.message)
        reject(err)
      })
      .on('end', () => resolve())
      .save(outputPath)
  })
}

module.exports = (t) => [
  {
    name: 'ffmpeg_format_convert',
    label: t('action.formatConvert.label', 'Format Convert'),
    category: t('category', 'FFmpeg'),
    icon: 'FileVideo',
    description: t('action.formatConvert.description', 'Convert audio/video formats. Supports common format conversions.'),
    tool: false,
    properties: [
      { key: 'inputPath', label: t('field.inputPath.label', 'Input File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.inputPath.tooltip', 'Absolute path of the input file.') },
      { key: 'outputFormat', label: t('field.outputFormat.label', 'Output Format'), type: 'select', dataType: 'string', required: true, default: 'mp4', options: [
        { label: 'MP4', value: 'mp4' },
        { label: 'AVI', value: 'avi' },
        { label: 'MKV', value: 'mkv' },
        { label: 'MOV', value: 'mov' },
        { label: 'WebM', value: 'webm' },
        { label: 'FLV', value: 'flv' },
        { label: 'GIF', value: 'gif' },
        { label: 'MP3', value: 'mp3' },
        { label: 'WAV', value: 'wav' },
        { label: 'AAC', value: 'aac' },
        { label: 'FLAC', value: 'flac' },
        { label: 'OGG', value: 'ogg' },
      ] },
      { key: 'videoCodec', label: t('field.videoCodec.label', 'Video Codec'), type: 'select', dataType: 'string', options: [
        { label: t('field.codecAuto', 'Auto'), value: '' },
        { label: 'H.264', value: 'libx264' },
        { label: 'H.265', value: 'libx265' },
        { label: 'VP9', value: 'libvpx-vp9' },
        { label: 'AV1', value: 'libaom-av1' },
        { label: 'MPEG-4', value: 'mpeg4' },
      ] },
      { key: 'audioCodec', label: t('field.audioCodec.label', 'Audio Codec'), type: 'select', dataType: 'string', options: [
        { label: t('field.codecAuto', 'Auto'), value: '' },
        { label: 'AAC', value: 'aac' },
        { label: 'MP3', value: 'libmp3lame' },
        { label: 'FLAC', value: 'flac' },
        { label: 'Vorbis', value: 'libvorbis' },
        { label: 'Opus', value: 'libopus' },
      ] },
      { key: 'outputPath', label: t('field.outputPath.label', 'Output File Path'), type: 'text', dataType: 'string', tooltip: t('field.outputPathAuto.tooltip', 'Leave empty to auto-generate (same directory, new extension).') },
      { key: 'ffmpegPath', label: t('field.ffmpegPath.label', 'FFmpeg Path'), type: 'text', dataType: 'string', default: '{{ __config__["workflow.ffmpeg"]["ffmpegPath"] }}', tooltip: t('field.ffmpegPath.tooltip', 'Leave empty to use system PATH.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', children: [
        { key: 'outputPath', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      const inputPath = args.inputPath
      if (!fs.existsSync(inputPath)) {
        return { success: false, message: t('message.inputFileNotFound', 'Input file not found: {path}').replace('{path}', inputPath) }
      }
      setFfmpegPath(args.ffmpegPath)

      const ext = args.outputFormat || 'mp4'
      const outputPath = args.outputPath || inputPath.replace(/\.[^.]+$/, `_converted.${ext}`)
      const audioOnly = ['mp3', 'wav', 'aac', 'flac', 'ogg'].includes(ext)

      let cmd = ffmpeg(inputPath).format(ext)
      if (args.videoCodec) cmd = cmd.videoCodec(args.videoCodec)
      if (args.audioCodec) cmd = cmd.audioCodec(args.audioCodec)
      if (audioOnly) cmd = cmd.noVideo()

      ctx.logger.info(`格式转换: ${inputPath} -> ${outputPath}`)

      try {
        await runCommand(cmd, outputPath, ctx)
        return { success: true, message: t('message.formatConvertDone', 'Format conversion completed.'), data: { outputPath } }
      } catch (err) {
        return { success: false, message: t('message.formatConvertFailed', 'Conversion failed: {error}').replace('{error}', err.message) }
      }
    },
  },
  {
    name: 'ffmpeg_merge',
    label: t('action.merge.label', 'Merge Audio & Video'),
    category: t('category', 'FFmpeg'),
    icon: 'Combine',
    description: t('action.merge.description', 'Merge separate audio and video files into one.'),
    tool: false,
    properties: [
      { key: 'videoPath', label: t('field.videoPath.label', 'Video File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.videoPath.tooltip', 'Absolute path of the video file.') },
      { key: 'audioPath', label: t('field.audioPath.label', 'Audio File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.audioPath.tooltip', 'Absolute path of the audio file.') },
      { key: 'outputPath', label: t('field.outputPath.label', 'Output File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.outputPathRequired.tooltip', 'Output path for the merged file.') },
      { key: 'reEncode', label: t('field.reEncode.label', 'Re-encode'), type: 'boolean', dataType: 'boolean', default: false, tooltip: t('field.reEncode.tooltip', 'Disable to copy streams directly (faster, but formats must be compatible).') },
      { key: 'videoCodec', label: t('field.videoCodec.label', 'Video Codec'), type: 'select', dataType: 'string', options: [
        { label: 'H.264', value: 'libx264' },
        { label: 'H.265', value: 'libx265' },
        { label: 'VP9', value: 'libvpx-vp9' },
      ] },
      { key: 'audioCodec', label: t('field.audioCodec.label', 'Audio Codec'), type: 'select', dataType: 'string', options: [
        { label: 'AAC', value: 'aac' },
        { label: 'MP3', value: 'libmp3lame' },
        { label: 'Opus', value: 'libopus' },
      ] },
      { key: 'shortest', label: t('field.shortest.label', 'Use Shortest Stream'), type: 'boolean', dataType: 'boolean', default: true, tooltip: t('field.shortest.tooltip', 'When audio/video lengths differ, truncate to the shorter one.') },
      { key: 'ffmpegPath', label: t('field.ffmpegPath.label', 'FFmpeg Path'), type: 'text', dataType: 'string', default: '{{ __config__["workflow.ffmpeg"]["ffmpegPath"] }}', tooltip: t('field.ffmpegPath.tooltip', 'Leave empty to use system PATH.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'outputPath', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      if (!fs.existsSync(args.videoPath)) {
        return { success: false, message: t('message.videoFileNotFound', 'Video file not found: {path}').replace('{path}', args.videoPath) }
      }
      if (!fs.existsSync(args.audioPath)) {
        return { success: false, message: t('message.audioFileNotFound', 'Audio file not found: {path}').replace('{path}', args.audioPath) }
      }
      setFfmpegPath(args.ffmpegPath)

      let cmd = ffmpeg()
        .input(args.videoPath)
        .input(args.audioPath)

      if (args.shortest !== false) {
        cmd = cmd.outputOptions('-shortest')
      }

      if (args.reEncode) {
        if (args.videoCodec) cmd = cmd.videoCodec(args.videoCodec)
        if (args.audioCodec) cmd = cmd.audioCodec(args.audioCodec)
      } else {
        cmd = cmd.outputOptions(['-c:v', 'copy', '-c:a', 'copy'])
      }

      ctx.logger.info(`音视频合并: video=${args.videoPath}, audio=${args.audioPath}`)

      try {
        await runCommand(cmd, args.outputPath, ctx)
        return { success: true, message: t('message.mergeDone', 'Audio/video merge completed.'), data: { outputPath: args.outputPath } }
      } catch (err) {
        return { success: false, message: t('message.mergeFailed', 'Merge failed: {error}').replace('{error}', err.message) }
      }
    },
  },
  {
    name: 'ffmpeg_demux',
    label: t('action.demux.label', 'Demux Audio/Video'),
    category: t('category', 'FFmpeg'),
    icon: 'Split',
    description: t('action.demux.description', 'Extract audio track from video or remove audio track.'),
    tool: false,
    properties: [
      { key: 'inputPath', label: t('field.inputPath.label', 'Input File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.inputPath.tooltip', 'Absolute path of the input file.') },
      { key: 'mode', label: t('field.mode.label', 'Demux Mode'), type: 'select', dataType: 'string', required: true, default: 'extract_audio', options: [
        { label: t('field.modeOption.extractAudio', 'Extract Audio'), value: 'extract_audio' },
        { label: t('field.modeOption.extractVideo', 'Remove Audio (Video Only)'), value: 'extract_video' },
        { label: t('field.modeOption.extractBoth', 'Extract Both Audio and Video'), value: 'extract_both' },
      ] },
      { key: 'audioFormat', label: t('field.audioFormat.label', 'Audio Format'), type: 'select', dataType: 'string', default: 'mp3', options: [
        { label: 'MP3', value: 'mp3' },
        { label: 'WAV', value: 'wav' },
        { label: 'AAC', value: 'aac' },
        { label: 'FLAC', value: 'flac' },
        { label: 'OGG', value: 'ogg' },
      ] },
      { key: 'audioOutputPath', label: t('field.audioOutputPath.label', 'Audio Output Path'), type: 'text', dataType: 'string', tooltip: t('field.audioOutputPath.tooltip', 'Leave empty to auto-generate.') },
      { key: 'videoOutputPath', label: t('field.videoOutputPath.label', 'Video Output Path'), type: 'text', dataType: 'string', tooltip: t('field.videoOutputPath.tooltip', 'Leave empty to auto-generate.') },
      { key: 'ffmpegPath', label: t('field.ffmpegPath.label', 'FFmpeg Path'), type: 'text', dataType: 'string', default: '{{ __config__["workflow.ffmpeg"]["ffmpegPath"] }}', tooltip: t('field.ffmpegPath.tooltip', 'Leave empty to use system PATH.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'audioPath', type: 'string' },
        { key: 'videoPath', type: 'string' },
      ] },
    ],
    run: async (ctx, args) => {
      if (!fs.existsSync(args.inputPath)) {
        return { success: false, message: t('message.inputFileNotFound', 'Input file not found: {path}').replace('{path}', args.inputPath) }
      }
      setFfmpegPath(args.ffmpegPath)

      const dir = path.dirname(args.inputPath)
      const base = path.basename(args.inputPath, path.extname(args.inputPath))
      const mode = args.mode || 'extract_audio'
      const audioExt = args.audioFormat || 'mp3'
      const audioOut = args.audioOutputPath || path.join(dir, `${base}.${audioExt}`)
      const videoOut = args.videoOutputPath || path.join(dir, `${base}_noaudio${path.extname(args.inputPath)}`)

      const tasks = []

      if (mode === 'extract_audio' || mode === 'extract_both') {
        ctx.logger.info(`提取音频: ${args.inputPath} -> ${audioOut}`)
        const audioCmd = ffmpeg(args.inputPath).noVideo().format(audioExt)
        tasks.push(
          runCommand(audioCmd, audioOut, ctx)
            .then(() => ({ audioOut }))
        )
      }

      if (mode === 'extract_video' || mode === 'extract_both') {
        ctx.logger.info(`去除音频: ${args.inputPath} -> ${videoOut}`)
        const videoCmd = ffmpeg(args.inputPath).noAudio().outputOptions('-c:v', 'copy')
        tasks.push(
          runCommand(videoCmd, videoOut, ctx)
            .then(() => ({ videoOut }))
        )
      }

      try {
        await Promise.all(tasks)
        return {
          success: true,
          message: t('message.demuxDone', 'Audio/video demux completed.'),
          data: {
            audioPath: (mode === 'extract_audio' || mode === 'extract_both') ? audioOut : '',
            videoPath: (mode === 'extract_video' || mode === 'extract_both') ? videoOut : '',
          },
        }
      } catch (err) {
        return { success: false, message: t('message.demuxFailed', 'Demux failed: {error}').replace('{error}', err.message) }
      }
    },
  },
  {
    name: 'ffmpeg_probe',
    label: t('action.probe.label', 'Probe Media Info'),
    category: t('category', 'FFmpeg'),
    icon: 'FileSearch',
    description: t('action.probe.description', 'Parse media file metadata via ffprobe: container format, codecs, resolution, duration, bitrate and full stream list.'),
    tool: false,
    properties: [
      { key: 'inputPath', label: t('field.inputPath.label', 'Input File Path'), type: 'text', dataType: 'string', required: true, tooltip: t('field.inputUrlOrPath.tooltip', 'Local absolute path or a public http(s) URL of the media file.') },
      { key: 'ffprobePath', label: t('field.ffprobePath.label', 'FFprobe Path'), type: 'text', dataType: 'string', default: '{{ __config__["workflow.ffmpeg"]["ffprobePath"] }}', tooltip: t('field.ffprobePath.tooltip', 'Leave empty to use system PATH.') },
    ],
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      { key: 'data', type: 'object', dataType: 'object', children: [
        { key: 'format', type: 'object', dataType: 'object' },
        { key: 'video', type: 'object', dataType: 'object' },
        { key: 'audio', type: 'object', dataType: 'object' },
        { key: 'streams', type: 'array', dataType: 'array' },
        { key: 'duration', type: 'number', dataType: 'number' },
        { key: 'raw', type: 'object', dataType: 'object' },
      ] },
    ],
    run: async (ctx, args) => {
      const inputPath = args.inputPath
      const isUrl = /^(https?):\/\//i.test(inputPath || '')
      if (!isUrl && !fs.existsSync(inputPath)) {
        return { success: false, message: t('message.inputFileNotFound', 'Input file not found: {path}').replace('{path}', inputPath) }
      }
      setFfprobePath(args.ffprobePath)

      ctx.logger.info(`解析媒体信息: ${inputPath}`)

      try {
        const data = await ffprobeFile(inputPath)
        const format = data.format || {}
        const streams = (data.streams || []).map(formatStream)
        const videoRaw = (data.streams || []).find((s) => s.codec_type === 'video')
        const audioRaw = (data.streams || []).find((s) => s.codec_type === 'audio')
        const duration = toNumber(format.duration)

        return {
          success: true,
          message: t('message.probeDone', 'Media info parsed.'),
          data: {
            format: {
              name: format.format_name || null,
              longName: format.format_long_name || null,
              duration,
              size: toNumber(format.size),
              bitRate: toNumber(format.bit_rate),
              nbStreams: format.nb_streams,
            },
            video: videoRaw ? formatStream(videoRaw) : null,
            audio: audioRaw ? formatStream(audioRaw) : null,
            streams,
            duration,
            raw: data,
          },
        }
      } catch (err) {
        return { success: false, message: t('message.probeFailed', 'Probe failed: {error}').replace('{error}', err.message) }
      }
    },
  },
  // 帧处理 action（按帧截取 + 自定义命令），产物写入 mini-app data 目录
  ...(frameActions(t)),
]
