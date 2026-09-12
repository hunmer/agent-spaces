# audio-separator 人声分离插件

调用本地部署的 [audio-separator HTTP 服务](https://github.com/nomadkaraoke/python-audio-separator)（FastAPI 封装，GPU 加速），把音频分离为人声（Vocals）与伴奏（Instrumental）。

## 前置条件

先启动本地服务（部署目录 `D:\audio-separator-service`，接口文档见该目录下 `API.md`）：

```powershell
cd D:\audio-separator-service
.\start.bat        # 默认监听 http://127.0.0.1:8365
```

## Actions

### audio_separate 音频人声分离

| 参数 | 说明 |
|---|---|
| input | 本地音频绝对路径或 http(s) URL（必填） |
| model | 模型文件名，默认 `UVR-MDX-NET-Inst_HQ_3.onnx`（快），高质量可选 `model_bs_roformer_ep_317_sdr_12.9755.ckpt` |
| output_format | FLAC（默认）/ WAV / MP3 |
| output_single_stem | 留空输出全部音轨，或 `Vocals` / `Instrumental` 只取一轨 |
| output_dir | 结果保存目录，默认为输入文件所在目录 |
| timeout | 等待任务完成的超时秒数，默认 900 |

返回 `data.outputs[]`（stem / filePath / filename / size），文件已下载到本地 output_dir。

### audio_separator_list_models 列出分离模型

查询服务支持的模型清单（可按 filter 过滤、只看已下载），返回 SDR 得分供选型参考。

## 插件配置

| 配置 | 默认值 | 说明 |
|---|---|---|
| baseUrl | `http://127.0.0.1:8365` | 服务地址 |
| apiToken | 空 | 服务设置 `AS_API_TOKEN` 时填写 |

## 本地测试

```bash
pnpm --filter @agent-spaces/server dev:plugin -- --plugin ../../packages/templates/plugins/audio-separator --code "const r = await plugin.runAction('audio_separator_list_models', { filter: 'roformer', limit: 3 }); if (!r.success) throw new Error(r.message); return r;"
```
