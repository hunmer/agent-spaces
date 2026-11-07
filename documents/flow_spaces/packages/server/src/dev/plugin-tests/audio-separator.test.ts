import assert from 'node:assert/strict'
import type { LoadedPlugin } from '../plugin-test-harness.js'

// 需要 audio-separator HTTP 服务在 http://127.0.0.1:8365 运行（D:\audio-separator-service\start.bat）。
// 服务未启动时跳过断言，避免环境不具备时测试失败。
export default async function run(plugin: LoadedPlugin) {
  const health = (await plugin.runAction('audio_separator_list_models', { filter: 'roformer', limit: 1 })) as { success: boolean; message?: string }
  if (!health.success) {
    console.log('[audio-separator.test] service not running, skip:', health.message)
    return { success: true, skipped: true }
  }

  assert.equal(health.success, true)

  const result = (await plugin.runAction('audio_separate', {
    input: 'D:/audio-separator-service/test_input.mp3',
    model: 'UVR-MDX-NET-Inst_HQ_3.onnx',
    output_format: 'MP3',
    output_dir: 'D:/audio-separator-service/plugin_out',
  })) as {
    success?: boolean
    message?: string
    data?: { outputs?: Array<{ stem?: string; filePath?: string; size?: number }> }
  }

  assert.equal(result.success, true, result.message || 'separate failed')
  const outputs = result.data?.outputs || []
  assert.ok(outputs.length >= 1, 'expected at least one output stem')
  const stems = outputs.map((o) => o.stem)
  assert.ok(stems.includes('Vocals'), `expected Vocals stem, got ${stems.join(',')}`)

  return { success: true, stems }
}
