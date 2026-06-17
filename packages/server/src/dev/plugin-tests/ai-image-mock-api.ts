// Mock ctx.api for ai-image plugin tests.
// 模拟 comfly 风格的 OpenAI 兼容异步图像 API：
//   - postJson: 提交任务（generations）→ 返回 submitResponse
//   - getJson : 查询任务 → 按 pollSequence 依次返回（模拟 NOT_START→IN_PROGRESS→SUCCESS）
//   - savePublicFile: b64_json 落盘 → 返回 httpPath
// __setScenario 在每个用例前重置状态。

type Scenario = {
  submitResponse?: unknown;
  pollSequence: unknown[];
};

const DEFAULT: Scenario = { submitResponse: { task_id: 'task-mock' }, pollSequence: [] };

let scenario: Scenario = { ...DEFAULT };
let pollIndex = 0;
const saved: Array<{ ext: string; size: number }> = [];

export default {
  __setScenario(next: Scenario): void {
    scenario = { ...DEFAULT, ...next };
    pollIndex = 0;
    saved.length = 0;
  },
  __saved(): Array<{ ext: string; size: number }> {
    return saved;
  },
  async postJson(_url: string, _opts?: unknown): Promise<unknown> {
    return scenario.submitResponse;
  },
  async getJson(_url: string, _opts?: unknown): Promise<unknown> {
    const seq = scenario.pollSequence;
    const item = seq.length ? seq[Math.min(pollIndex, seq.length - 1)] : undefined;
    pollIndex += 1;
    return item;
  },
  savePublicFile(buffer: Buffer, ext: string): { filePath: string; httpPath: string } {
    saved.push({ ext, size: buffer.length });
    const n = saved.length;
    return {
      filePath: `/tmp/mock-${n}.${ext}`,
      httpPath: `http://localhost:3100/static/uploads/mock-${n}.${ext}`,
    };
  },
};
