// 共享「生成数量 + 并发」控件：文生图 / 编辑图片 / 生成配音 / 生成视频 四个节点复用。
// - 生成数量（count）：number 输入，范围 1..maxCount（默认 maxCount=20）
// - 并发（concurrency）：仅当 count > 1 时展示，Slider 范围 1..count
//
// 设计点：
// 1. count 减小到 < 当前 concurrency 时，自动把 concurrency 收敛到 count（避免出现 concurrency > count 的非法态）
// 2. props.onChange(patch) 由调用方在 set() 里合并到 params，与其他参数一致
// 3. concurrency 默认 1（保守）；用户主动调高时才并发提交
import { NumberInput, Slider } from '@agent-spaces/ui';

export default function CountAndConcurrency({
  count,
  concurrency,
  onChange,
  maxCount = 20,
}) {
  const n = Math.max(1, Math.min(maxCount, Number(count) || 1));
  const c = Math.max(1, Math.min(n, Number(concurrency) || 1));
  const showConcurrency = n > 1;

  const handleCountChange = (next) => {
    const v = Math.max(1, Math.min(maxCount, Number(next) || 1));
    // 收敛 concurrency：若当前并发超过新 count，压到 count
    const newConc = Math.max(1, Math.min(v, Number(concurrency) || 1));
    onChange({ count: v, concurrency: newConc });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">生成数量</span>
        <NumberInput
          value={n}
          min={1}
          max={maxCount}
          step={1}
          onChange={(v) => handleCountChange(v)}
          className="h-7 w-24"
        />
      </label>
      {showConcurrency && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">并发</span>
            <span className="text-xs tabular-nums text-muted-foreground">{c} / {n}</span>
          </div>
          <Slider
            value={[c]}
            min={1}
            max={n}
            step={1}
            onValueChange={(arr) => {
              const v = Math.max(1, Math.min(n, Number(arr?.[0]) || 1));
              onChange({ concurrency: v });
            }}
          />
        </div>
      )}
    </div>
  );
}
