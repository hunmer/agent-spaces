import { useState, useEffect } from 'react';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Switch, Label, Sparkles, Loader2,
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} = window.AgentSpacesUI;

export default function MusicGenerator({ open, onClose, onGenerate, onGenerateStart, onGenerateEnd, initialPrompt = '', initialLyrics = '' }) {
  const [prompt, setPrompt] = useState('');
  const [lyrics, setLyrics] = useState('');

  // 当弹窗打开时，同步翻写传入的初始值
  useEffect(() => {
    if (open) {
      setPrompt(initialPrompt);
      setLyrics(initialLyrics);
    }
  }, [open, initialPrompt, initialLyrics]);
  const [engine, setEngine] = useState('minimax'); // 'minimax' | 'suno'
  const [model, setModel] = useState('music-2.6');
  const [isInstrumental, setIsInstrumental] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingLyrics, setGeneratingLyrics] = useState(false);
  const [error, setError] = useState('');

  // Suno 模型选项（customMode 下需提供 style/title；这里用 prompt 作 style 派生）
  const sunoModels = [
    { value: 'V4', label: 'V4（最高音质，4 分钟）' },
    { value: 'V4_5', label: 'V4_5（进阶，8 分钟）' },
    { value: 'V4_5PLUS', label: 'V4_5PLUS（更丰富音色）' },
    { value: 'V4_5ALL', label: 'V4_5ALL（更强结构）' },
    { value: 'V5', label: 'V5（更快更好）' },
    { value: 'V5_5', label: 'V5_5（自定义音色）' },
  ];

  // 切换引擎时重置为该引擎默认模型
  const handleEngineChange = (next) => {
    setEngine(next);
    setModel(next === 'suno' ? 'V4_5' : 'music-2.6');
  };

  const handleGenerateLyrics = async (provider = 'minimax') => {
    if (generatingLyrics) return;
    if (!prompt.trim() && !lyrics.trim()) return;

    setGeneratingLyrics(provider);
    setError('');

    try {
      let lyricsText = '';

      if (provider === 'suno') {
        // Suno 歌词为异步任务：提交后需开启 wait 轮询到 SUCCESS
        const res = await window.AgentSpaces.callPluginTool(
          'workflow.suno',
          'suno_lyrics',
          {
            prompt: prompt.trim() || '请根据已有歌词续写完整歌词',
            wait: true,
            pollInterval: 10,
            maxWait: 300,
          }
        );
        const result = res.result || res;
        if (result.success) {
          // 返回结构：result.data.data[] 为歌词数组，取首个；兼容 result.data.text 单首
          const arr = Array.isArray(result.data?.data) ? result.data.data : [];
          lyricsText = (arr[0]?.text) || result.data?.text || '';
        }
        if (!lyricsText) {
          setError(result.message || 'Suno 歌词生成失败，请重试');
          return;
        }
      } else {
        // MiniMax：同步返回
        const res = await window.AgentSpaces.callPluginTool(
          'workflow.minimax',
          'minimax_lyrics_generation',
          {
            prompt: prompt.trim() || '请根据已有歌词续写完整歌词',
            ...(lyrics.trim() && { mode: 'edit', lyrics: lyrics.trim() }),
          }
        );
        const result = res.result || res;
        if (result.success && result.data?.lyrics) {
          lyricsText = result.data.lyrics;
        } else {
          setError(result.message || '歌词生成失败，请重试');
          return;
        }
      }

      setLyrics(lyricsText);
    } catch (err) {
      setError('歌词生成失败：' + (err.message || '未知错误'));
    } finally {
      setGeneratingLyrics(false);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || generating) return;

    setGenerating(true);
    setError('');

    // Close dialog and show alert immediately
    if (onGenerateStart) onGenerateStart();

    try {
      let songs = [];

      if (engine === 'suno') {
        // Suno：异步任务，开启 wait 轮询；customMode 下需要 style/title
        const hasLyrics = !!lyrics.trim();
        const res = await window.AgentSpaces.callPluginTool(
          'workflow.suno',
          'suno_generate',
          {
            prompt: prompt.trim(),
            model,
            instrumental: isInstrumental,
            // 有歌词时走自定义模式，把歌词作为生成依据；Suno 用 prompt 描述风格
            ...(hasLyrics && { customMode: true, style: prompt.trim(), title: (prompt.trim().slice(0, 20) || 'AI Music'), prompt: lyrics.trim() }),
            wait: true,
            pollInterval: 10,
            maxWait: 600,
          }
        );
        const result = res.result || res;
        if (result.success) {
          // 返回结构：result.data.sunoData[] 为音频数组，一次可能返回多首
          const arr = Array.isArray(result.data?.sunoData) ? result.data.sunoData : [];
          songs = arr
            .map((item) => ({
              audioUrl: item.audioUrl || item.audio_url || '',
              title: item.title || prompt.trim(),
              prompt: prompt.trim(),
              lyrics: lyrics.trim(),
              artist: 'Suno AI',
            }))
            .filter((s) => s.audioUrl);
        }
        if (!songs.length) {
          setError(result.message || 'Suno 生成失败，未获取到音频地址');
          if (onGenerateEnd) onGenerateEnd();
          setGenerating(false);
          return;
        }
      } else {
        const res = await window.AgentSpaces.callPluginTool(
          'workflow.minimax',
          'minimax_music_generation',
          {
            prompt: prompt.trim(),
            ...(lyrics.trim() && { lyrics: lyrics.trim() }),
            model,
            isInstrumental,
          }
        );
        const result = res.result || res;
        const audioUrl = result.success ? (result.data?.audioHex?.trim() || '') : '';
        if (!audioUrl) {
          setError(result.message || '音乐已生成，但未获取到音频地址');
          if (onGenerateEnd) onGenerateEnd();
          setGenerating(false);
          return;
        }
        songs = [{ audioUrl, title: prompt.trim(), prompt: prompt.trim(), lyrics: lyrics.trim(), artist: 'MiniMax Music AI' }];
      }

      onGenerate({ songs, prompt: prompt.trim(), lyrics: lyrics.trim() });
      setPrompt('');
      setLyrics('');
    } catch (err) {
      setError('生成失败：' + (err.message || '未知错误'));
    } finally {
      setGenerating(false);
      if (onGenerateEnd) onGenerateEnd();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !generating) onClose(); }}>
      <DialogContent className="bg-popover text-popover-foreground border-border max-w-[60vw] flex flex-col overflow-hidden">
        {/* Header - fixed */}
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-xl">AI 音乐创作</DialogTitle>
          <DialogDescription>
            描述你想要的音乐风格，AI 将为你生成独一无二的音乐
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 space-y-4 flex-1 min-h-0">
          {/* Prompt */}
          <div className="space-y-2">
            <Label className="text-sm">音乐风格描述 *</Label>
            <Textarea
              placeholder="例如：流行音乐, 难过, 适合在下雨的晚上"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
              className="border-border placeholder:text-muted-foreground bg-background/40 resize-none max-h-[30vh] overflow-y-auto"
            />
          </div>

          {/* Lyrics */}
          <div className="space-y-2">
            <Label className="text-sm">歌词（可选）</Label>
            <div className="relative">
              <Textarea
                placeholder={"[Verse]\n在这里写歌词...\n\n[Chorus]\n副歌部分..."}
                value={lyrics}
                onChange={(e) => setLyrics(e.target.value)}
                rows={5}
                className="border-border placeholder:text-muted-foreground bg-background/40 resize-none pb-9 max-h-[35vh] overflow-y-auto"
              />
              <DropdownMenu>
                <DropdownMenuTrigger
                  type="button"
                  disabled={!!generatingLyrics || (!prompt.trim() && !lyrics.trim())}
                  className="absolute bottom-2 right-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title="AI 生成歌词（选择引擎）"
                >
                  {generatingLyrics ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={4}
                  className="min-w-[180px] w-auto bg-popover text-popover-foreground border-border"
                >
                  <DropdownMenuItem
                    className="cursor-pointer"
                    disabled={generatingLyrics === 'suno'}
                    onClick={() => handleGenerateLyrics('minimax')}
                  >
                    MiniMax 歌词（快速，同步）
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    disabled={generatingLyrics === 'minimax'}
                    onClick={() => handleGenerateLyrics('suno')}
                  >
                    Suno 歌词（异步轮询）
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Engine Select */}
          <div className="space-y-2">
            <Label className="text-sm">生成引擎</Label>
            <Select value={engine} onValueChange={handleEngineChange}>
              <SelectTrigger className="border-border bg-background/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground border-border">
                <SelectItem value="minimax">MiniMax（同步）</SelectItem>
                <SelectItem value="suno">Suno（异步轮询）</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Model Select */}
          <div className="space-y-2">
            <Label className="text-sm">模型</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="border-border bg-background/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground border-border">
                {engine === 'suno' ? (
                  sunoModels.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))
                ) : (
                  <>
                    <SelectItem value="music-2.6">Music 2.6（默认）</SelectItem>
                    <SelectItem value="music-2.6-free">Music 2.6 Free</SelectItem>
                    <SelectItem value="music-cover">翻唱模式</SelectItem>
                    <SelectItem value="music-cover-free">翻唱模式 Free</SelectItem>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-between">
            <Label className="text-sm">纯音乐（无人声）</Label>
            <Switch
              checked={isInstrumental}
              onCheckedChange={setIsInstrumental}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="text-red-400 text-sm bg-red-400/10 p-3 rounded-lg">
              {error}
            </div>
          )}
        </div>

        {/* Footer - fixed */}
        <div className="mt-4 flex-shrink-0">
          <Button
            onClick={handleGenerate}
            disabled={!prompt.trim() || generating}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 h-11 text-base"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                正在生成...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                生成音乐
              </span>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
