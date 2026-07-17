"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  Download,
  GalleryVerticalEnd,
  Loader2,
  PlayCircle,
  RefreshCw,
  Terminal,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { isElectronEnvironment, getElectronSetupAPI } from "@/lib/electron";

type Phase = "checking" | "not-installed" | "installing" | "starting" | "ready" | "no-electron";

type LogLine = { id: number; stream: "stdout" | "stderr"; line: string; ts: number };

const DOCS_URL =
  "https://github.com/hunmer/agent-spaces/blob/main/documents/docs/getting-started/installation.mdx";
const DEFAULT_REGISTRY = "https://registry.npmmirror.com";

export default function SetupPage() {
  const isElectron = isElectronEnvironment();
  const setupApi = getElectronSetupAPI();

  const [phase, setPhase] = useState<Phase>(isElectron ? "checking" : "no-electron");
  const [status, setStatus] = useState<{ installed: boolean; running: boolean } | null>(null);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [progress, setProgress] = useState(0);
  const [registry, setRegistry] = useState(DEFAULT_REGISTRY);
  const [registries, setRegistries] = useState<Array<{ value: string; label: string }>>([
    { value: DEFAULT_REGISTRY, label: "npmmirror 国内镜像（推荐）" },
    { value: "https://registry.npmjs.org", label: "npm 官方源" },
  ]);
  const logSeq = useRef(0);
  const logBoxRef = useRef<HTMLDivElement>(null);

  const appendLog = useCallback((stream: "stdout" | "stderr", line: string) => {
    setLogs((prev) => {
      const next = [...prev, { id: logSeq.current++, stream, line, ts: Date.now() }];
      return next.length > 300 ? next.slice(-300) : next;
    });
  }, []);

  // 日志滚动到底部。
  useEffect(() => {
    const el = logBoxRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const finishReady = useCallback(() => {
    setPhase("ready");
    try {
      localStorage.setItem("setup-completed", "true");
    } catch {}
  }, []);

  // 加载可选安装源。
  useEffect(() => {
    setupApi?.getRegistries().then((list) => {
      if (list?.length) {
        setRegistries(list);
        setRegistry(list[0].value);
      }
    });
  }, [setupApi]);

  // 订阅 IPC 事件。
  useEffect(() => {
    if (!setupApi) return;
    const offProgress = setupApi.onInstallProgress((e) => {
      appendLog(e.stream, e.line);
      if (/added\s+\d+/.test(e.line)) setProgress(85);
      else if (/packages are looking|idealTree|reify/i.test(e.line)) setProgress((p) => Math.min(p + 5, 80));
    });
    const offDone = setupApi.onInstallDone((e) => {
      if (e.success) {
        appendLog("stdout", "✅ 安装完成");
        setProgress(100);
        setPhase("starting");
        void setupApi.start().then((r) => {
          if (r.ok) finishReady();
          else appendLog("stderr", r.error || "启动失败");
        });
      } else {
        appendLog("stderr", e.error || "安装失败");
        setPhase("not-installed");
        setProgress(0);
      }
    });
    const offLog = setupApi.onServerLog((e) => appendLog(e.stream, e.line));
    return () => {
      offProgress();
      offDone();
      offLog();
    };
  }, [setupApi, appendLog, finishReady]);

  // 初始检测 + 自动启动。
  useEffect(() => {
    if (!setupApi) return;
    let cancelled = false;

    const check = async () => {
      const s = await setupApi.checkStatus();
      if (cancelled) return;
      setStatus(s);
      if (s.running) {
        finishReady();
      } else if (s.installed) {
        setPhase("starting");
        appendLog("stdout", "检测到已安装，正在自动启动…");
        const r = await setupApi.start();
        if (cancelled) return;
        if (r.ok) finishReady();
        else {
          appendLog("stderr", r.error || "启动失败");
          setPhase("not-installed");
        }
      } else {
        setPhase("not-installed");
      }
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, [setupApi, appendLog, finishReady]);

  const onInstallClick = () => {
    if (!setupApi) return;
    setLogs([]);
    setProgress(5);
    setPhase("installing");
    appendLog("stdout", `$ npm i @agent-spaces/server -g --registry=${registry}`);
    void setupApi.install(registry);
  };

  const onEnter = () => {
    window.location.href = "/";
  };

  const onRetry = async () => {
    if (!setupApi) return;
    setLogs([]);
    setProgress(0);
    setPhase("checking");
    const s = await setupApi.checkStatus();
    setStatus(s);
    setPhase(s.running ? "ready" : s.installed ? "starting" : "not-installed");
  };

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* 左栏：操作区 */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="/" className="flex items-center gap-2 font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GalleryVerticalEnd className="size-4" />
            </div>
            Agent Spaces
          </a>
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-1">
              <h1 className="text-xl font-semibold">初始化 Agent Spaces Server</h1>
              <p className="text-sm text-muted-foreground">
                桌面端需要本机运行 <code className="rounded bg-muted px-1 py-0.5 text-xs">@agent-spaces/server</code>，
                下面的向导会检测、安装并启动它。
              </p>
            </div>

            {phase === "no-electron" && <NoElectronGuide />}

            {phase !== "no-electron" && (
              <div className="space-y-4">
                <StatusBadge phase={phase} status={status} />

                {phase === "not-installed" && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="registry">安装源</Label>
                        <Select value={registry} onValueChange={(v) => v && setRegistry(v)}>
                        <SelectTrigger id="registry" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {registries.map((r) => (
                            <SelectItem key={r.value} value={r.value}>
                              {r.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button className="w-full" onClick={onInstallClick}>
                      <Download className="size-4" />
                      一键全局安装
                    </Button>
                  </div>
                )}

                {(phase === "installing" || phase === "starting") && (
                  <div className="space-y-2">
                    <Progress value={progress} />
                    <p className="text-xs text-muted-foreground">
                      {phase === "installing" ? "正在安装，请稍候…" : "正在启动服务，等待 /api/health 就绪…"}
                    </p>
                  </div>
                )}

                {phase === "ready" && (
                  <Button className="w-full" onClick={onEnter}>
                    <CheckCircle2 className="size-4" />
                    进入 Agent Spaces
                  </Button>
                )}

                {(phase === "not-installed" || phase === "ready") && (
                  <Button variant="ghost" size="sm" className="w-full" onClick={onRetry}>
                    <RefreshCw className="size-4" />
                    重新检测
                  </Button>
                )}

                <LogBox ref={logBoxRef} logs={logs} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 右栏：hero + 文档速查 */}
      <div className="relative hidden bg-white dark:bg-black lg:block">
        <div className="absolute inset-0 [background-size:40px_40px] [background-image:linear-gradient(to_right,#e4e4e7_1px,transparent_1px),linear-gradient(to_bottom,#e4e4e7_1px,transparent_1px)] dark:[background-image:linear-gradient(to_right,#262626_1px,transparent_1px),linear-gradient(to_bottom,#262626_1px,transparent_1px)]" />
        <div className="pointer-events-none absolute inset-0 bg-white [mask-image:radial-gradient(ellipse_at_center,transparent_20%,black)] dark:bg-black" />
        <div className="relative z-10 flex h-full items-center justify-center p-10">
          <div className="max-w-sm space-y-4 text-sm">
            <h2 className="text-lg font-semibold text-foreground">手动安装参考</h2>
            <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 text-xs leading-relaxed text-muted-foreground">
{`# 环境要求：Node.js >= 20
npm i @agent-spaces/server -g \\
  --registry https://registry.npmmirror.com

# 启动后访问 http://localhost:3100
agent-spaces-server`}
            </pre>
            <a
              href={DOCS_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLink className="size-3" />
              查看完整安装文档
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({
  phase,
  status,
}: {
  phase: Phase;
  status: { installed: boolean; running: boolean } | null;
}) {
  const map: Partial<Record<Phase, { icon: React.ReactNode; text: string; tone: string }>> = {
    checking: { icon: <Loader2 className="size-4 animate-spin" />, text: "正在检测…", tone: "text-muted-foreground" },
    "not-installed": { icon: <Download className="size-4" />, text: "未安装", tone: "text-amber-600 dark:text-amber-500" },
    installing: { icon: <Loader2 className="size-4 animate-spin" />, text: "安装中", tone: "text-blue-600 dark:text-blue-400" },
    starting: { icon: <PlayCircle className="size-4" />, text: "启动中", tone: "text-blue-600 dark:text-blue-400" },
    ready: { icon: <CheckCircle2 className="size-4" />, text: "服务已就绪", tone: "text-emerald-600 dark:text-emerald-500" },
  };
  const m = map[phase];
  if (!m) return null;
  return (
    <div className={`flex flex-wrap items-center gap-2 text-sm font-medium ${m.tone}`}>
      {m.icon}
      {m.text}
      {status && (
        <span className="text-xs text-muted-foreground">
          (installed: {String(status.installed)}, running: {String(status.running)})
        </span>
      )}
    </div>
  );
}

const LogBox = React.forwardRef<HTMLDivElement, { logs: LogLine[] }>(function LogBox(
  { logs },
  ref,
) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Terminal className="size-3.5" />
        日志
      </div>
      <div
        ref={ref}
        className="h-44 overflow-auto rounded-md border bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-300"
      >
        {logs.length === 0 ? (
          <div className="text-zinc-600">（暂无输出）</div>
        ) : (
          logs.map((l) => (
            <div key={l.id} className={l.stream === "stderr" ? "text-red-400" : undefined}>
              <span className="mr-2 text-zinc-600">{new Date(l.ts).toLocaleTimeString()}</span>
              {l.line}
            </div>
          ))
        )}
      </div>
    </div>
  );
});

function NoElectronGuide() {
  return (
    <div className="space-y-3 rounded-md border border-dashed p-4 text-sm">
      <p className="font-medium">当前不在桌面客户端内</p>
      <p className="text-muted-foreground">
        该向导依赖桌面客户端能力。你可以：
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>使用桌面客户端启动以获得一键安装能力；或</li>
        <li>在终端手动执行下方命令。</li>
      </ul>
      <pre className="overflow-x-auto rounded-md bg-muted/60 p-3 text-xs leading-relaxed">
{`npm i @agent-spaces/server -g \\
  --registry https://registry.npmmirror.com
agent-spaces-server`}
      </pre>
      <a
        href={DOCS_URL}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <ExternalLink className="size-3" />
        查看完整安装文档
      </a>
    </div>
  );
}
