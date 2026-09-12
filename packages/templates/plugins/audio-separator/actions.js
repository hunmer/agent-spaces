const fs = require('fs')
const path = require('path')
const { checkService, submitSeparateJob, waitJob, downloadOutput } = require('./shared')

const CONFIG_PREFIX = '{{ __config__["workflow.audio-separator"]'

function configProperties(t) {
  return [
    {
      key: 'baseUrl',
      label: t('config.baseUrl.label', 'Service URL'),
      type: 'text',
      dataType: 'string',
      toolRequired: false,
      tooltip: t('config.baseUrl.tooltip', 'audio-separator HTTP service address'),
      default: `${CONFIG_PREFIX}["baseUrl"]}}`,
    },
    {
      key: 'apiToken',
      label: t('config.apiToken.label', 'API Token'),
      type: 'text',
      dataType: 'string',
      toolRequired: false,
      tooltip: t('config.apiToken.tooltip', 'Required only when the service sets AS_API_TOKEN'),
      default: `${CONFIG_PREFIX}["apiToken"]}}`,
    },
  ]
}

const MODEL_OPTIONS = [
  { label: 'UVR-MDX-NET-Inst_HQ_3.onnx (fast, default)', value: 'UVR-MDX-NET-Inst_HQ_3.onnx' },
  { label: 'model_bs_roformer_ep_317_sdr_12.9755.ckpt (best quality)', value: 'model_bs_roformer_ep_317_sdr_12.9755.ckpt' },
  { label: 'model_bs_roformer_ep_368_sdr_12.9628.ckpt (high quality)', value: 'model_bs_roformer_ep_368_sdr_12.9628.ckpt' },
  { label: 'model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt (high quality)', value: 'model_mel_band_roformer_ep_3005_sdr_11.4360.ckpt' },
  { label: 'UVR-MDX-NET-Inst_Main.onnx', value: 'UVR-MDX-NET-Inst_Main.onnx' },
]

function normalizeInput(ctx, p) {
  if (!p) return p
  if (ctx?.api?.resolveInputPath) return ctx.api.resolveInputPath(p)
  return p
}

function parseMaybeJson(value) {
  if (value == null) return value
  if (typeof value !== 'string') return value
  const s = value.trim()
  if (!s.startsWith('{') && !s.startsWith('[')) return value
  try {
    return JSON.parse(s)
  } catch {
    return value
  }
}

module.exports = (t) => [
  {
    name: 'audio_separate',
    label: t('action.separate.label', 'Audio Vocal Separation'),
    category: t('category', 'Audio Separator'),
    icon: 'Music',
    description: t(
      'action.separate.description',
      'Separate an audio file into vocals and instrumental stems via a local audio-separator HTTP service (GPU accelerated).'
    ),
    properties: [
      {
        key: 'input',
        label: t('field.input.label', 'Input Audio'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.input.tooltip', 'Local absolute file path or http(s) URL of the audio file'),
      },
      {
        key: 'model',
        label: t('field.model.label', 'Model'),
        type: 'select',
        dataType: 'string',
        default: 'UVR-MDX-NET-Inst_HQ_3.onnx',
        options: MODEL_OPTIONS,
        enum: MODEL_OPTIONS.map((o) => o.value),
        tooltip: t('field.model.tooltip', 'Separation model. First use of a model downloads it automatically.'),
      },
      {
        key: 'output_format',
        label: t('field.outputFormat.label', 'Output Format'),
        type: 'select',
        dataType: 'string',
        default: 'FLAC',
        options: [
          { label: 'FLAC', value: 'FLAC' },
          { label: 'WAV', value: 'WAV' },
          { label: 'MP3', value: 'MP3' },
        ],
        enum: ['FLAC', 'WAV', 'MP3'],
        tooltip: t('field.outputFormat.tooltip', 'Format of separated output files'),
      },
      {
        key: 'output_single_stem',
        label: t('field.singleStem.label', 'Single Stem'),
        type: 'select',
        dataType: 'string',
        default: '',
        options: [
          { label: 'All stems', value: '' },
          { label: 'Vocals only', value: 'Vocals' },
          { label: 'Instrumental only', value: 'Instrumental' },
        ],
        enum: ['', 'Vocals', 'Instrumental'],
        tooltip: t('field.singleStem.tooltip', 'Output only the selected stem, or all stems'),
      },
      {
        key: 'output_dir',
        label: t('field.outputDir.label', 'Output Dir'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.outputDir.tooltip', 'Directory to save separated files. Defaults to the input file directory (tmp dir for URL input).'),
      },
      {
        key: 'timeout',
        label: t('field.timeout.label', 'Timeout (seconds)'),
        type: 'number',
        dataType: 'number',
        default: 900,
        tooltip: t('field.timeout.tooltip', 'Max seconds to wait for the separation job'),
      },
    ],
    toolProperties: [
      {
        key: 'input',
        label: t('field.input.label', 'Input Audio'),
        type: 'text',
        dataType: 'string',
        required: true,
        tooltip: t('field.input.tooltip', 'Local absolute file path or http(s) URL of the audio file'),
      },
      {
        key: 'model',
        label: t('field.model.label', 'Model Filename'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.model.tool.tooltip', 'Model filename, e.g. UVR-MDX-NET-Inst_HQ_3.onnx. Use audio_separator_list_models to discover more.'),
      },
      {
        key: 'output_format',
        label: t('field.outputFormat.label', 'Output Format'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.outputFormat.tool.tooltip', 'FLAC / WAV / MP3 / M4A / OGG / AAC / WMA'),
      },
      {
        key: 'output_single_stem',
        label: t('field.singleStem.label', 'Single Stem'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.singleStem.tool.tooltip', 'Optional: Vocals / Instrumental. Empty outputs all stems.'),
      },
      {
        key: 'output_dir',
        label: t('field.outputDir.label', 'Output Dir'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.outputDir.tooltip', 'Directory to save separated files. Defaults to the input file directory (tmp dir for URL input).'),
      },
      {
        key: 'timeout',
        label: t('field.timeout.label', 'Timeout (seconds)'),
        type: 'number',
        dataType: 'number',
        default: 900,
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'jobId', type: 'string' },
          { key: 'durationMs', type: 'number', dataType: 'number' },
          {
            key: 'outputs',
            type: 'array',
            dataType: 'object[]',
            children: [
              { key: 'stem', type: 'string' },
              { key: 'filePath', type: 'string' },
              { key: 'filename', type: 'string' },
              { key: 'size', type: 'number', dataType: 'number' },
            ],
          },
        ],
      },
    ],
    run: async (ctx, args) => {
      const input = normalizeInput(ctx, args.input)
      if (!input) {
        return { success: false, message: t('message.missingInput', 'Input audio path or URL is required.') }
      }
      const isUrl = /^https?:\/\//i.test(input)
      if (!isUrl) {
        const exists = ctx?.api?.exists ? await ctx.api.exists(input) : fs.existsSync(input)
        if (!exists) {
          return { success: false, message: t('message.inputNotFound', 'Input file not found: {input}').replace('{input}', input) }
        }
      }

      try {
        await checkService(ctx, args)
      } catch (err) {
        return {
          success: false,
          message: t('message.serviceUnreachable', 'audio-separator service unreachable at {baseUrl}: {error}').replace('{baseUrl}', args.baseUrl || 'http://127.0.0.1:8365').replace('{error}', err.message),
        }
      }

      const params = {
        model: args.model || 'UVR-MDX-NET-Inst_HQ_3.onnx',
        output_format: args.output_format || 'FLAC',
        output_bitrate: args.output_bitrate || null,
        output_single_stem: args.output_single_stem || null,
        custom_output_names: parseMaybeJson(args.custom_output_names),
      }

      ctx.logger.info(`Separating: ${input} model=${params.model} format=${params.output_format}`)
      let job
      try {
        job = await submitSeparateJob(ctx, args, input, params)
        job = await waitJob(ctx, args, job.id, Number(args.timeout) > 0 ? Number(args.timeout) : 900)
      } catch (err) {
        return { success: false, message: t('message.jobFailed', 'Separation job failed: {error}').replace('{error}', err.message) }
      }

      if (job.status !== 'completed') {
        const detail = job.error || (job.log || []).slice(-3).join(' | ')
        return { success: false, message: t('message.jobFailed', 'Separation job failed: {error}').replace('{error}', `${job.status} ${detail}`) }
      }

      const outputDir = args.output_dir || (isUrl ? path.join(require('os').tmpdir(), 'audio-separator') : path.dirname(input))
      await fs.promises.mkdir(outputDir, { recursive: true })

      const outputs = []
      for (const o of job.outputs || []) {
        const savePath = path.join(outputDir, o.filename)
        await downloadOutput(ctx, args, o, savePath)
        outputs.push({ stem: o.stem, filePath: savePath, filename: o.filename, size: o.size })
        ctx.logger.info(`Saved stem [${o.stem}] -> ${savePath} (${o.size} bytes)`)
      }

      const stems = outputs.map((o) => o.stem).join(', ')
      return {
        success: true,
        message: t('message.separated', 'Separated into {count} stems ({stems})').replace('{count}', outputs.length).replace('{stems}', stems),
        data: {
          jobId: job.id,
          durationMs: job.duration_ms,
          outputs,
        },
      }
    },
  },
  {
    name: 'audio_separator_list_models',
    label: t('action.listModels.label', 'List Separation Models'),
    category: t('category', 'Audio Separator'),
    icon: 'ListMusic',
    description: t(
      'action.listModels.description',
      'List vocal separation models supported by the audio-separator service, with download status and SDR scores.'
    ),
    properties: [
      {
        key: 'filter',
        label: t('field.filter.label', 'Filter'),
        type: 'text',
        dataType: 'string',
        tooltip: t('field.filter.tooltip', 'Substring match on model name/filename, e.g. roformer'),
      },
      {
        key: 'limit',
        label: t('field.limit.label', 'Limit'),
        type: 'number',
        dataType: 'number',
        default: 20,
        tooltip: t('field.limit.tooltip', 'Max models to return, 0 for all'),
      },
      {
        key: 'downloaded_only',
        label: t('field.downloadedOnly.label', 'Downloaded Only'),
        type: 'checkbox',
        dataType: 'boolean',
        default: false,
        tooltip: t('field.downloadedOnly.tooltip', 'Only list models already downloaded locally'),
      },
    ],
    configProperties: configProperties(t),
    outputs: [
      { key: 'success', type: 'boolean', dataType: 'boolean' },
      { key: 'message', type: 'string' },
      {
        key: 'data',
        type: 'object',
        dataType: 'object',
        children: [
          { key: 'count', type: 'number', dataType: 'number' },
          { key: 'models', type: 'object', dataType: 'object', children: [] },
        ],
      },
    ],
    run: async (ctx, args) => {
      const { fetchJson, resolveEndpoint, authHeaders } = require('./shared')
      const qs = new URLSearchParams()
      if (args.filter) qs.set('filter', args.filter)
      if (Number(args.limit) > 0) qs.set('limit', String(args.limit))
      if (args.downloaded_only === true || args.downloaded_only === 'true') qs.set('downloaded_only', 'true')
      try {
        const res = await fetchJson(`${resolveEndpoint(args)}/api/models?${qs.toString()}`, { headers: authHeaders(args) })
        ctx.logger.info(`Listed ${res.count} models (filter=${args.filter || 'none'})`)
        return {
          success: true,
          message: t('message.modelsListed', 'Found {count} models.').replace('{count}', res.count),
          data: { count: res.count, models: res.models },
        }
      } catch (err) {
        return { success: false, message: t('message.serviceUnreachable', 'audio-separator service unreachable at {baseUrl}: {error}').replace('{baseUrl}', args.baseUrl || 'http://127.0.0.1:8365').replace('{error}', err.message) }
      }
    },
  },
]
