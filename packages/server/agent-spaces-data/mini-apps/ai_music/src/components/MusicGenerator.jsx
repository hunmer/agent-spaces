import { useState, useEffect } from 'react';

const {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
  Button, Textarea, Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  Switch, Label, Sparkles, Loader2,
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
  const [model, setModel] = useState('music-2.6');
  const [isInstrumental, setIsInstrumental] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generatingLyrics, setGeneratingLyrics] = useState(false);
  const [error, setError] = useState('');

  const handleGenerateLyrics = async () => {
    if (generatingLyrics) return;
    if (!prompt.trim() && !lyrics.trim()) return;

    setGeneratingLyrics(true);
    setError('');

    try {
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
        setLyrics(result.data.lyrics);
      } else {
        setError(result.message || '歌词生成失败，请重试');
      }
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
      if (result.success) {
        if (result.data?.audioHex) {
          onGenerate({ audioUrl: result.data.audioHex.trim(), prompt: prompt.trim(), lyrics: lyrics.trim() });
          setPrompt('');
          setLyrics('');
        } else {
          setError('音乐已生成，但未获取到音频地址');
        }
      } else {
        setError(result.message || '生成失败，请重试');
      }
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
              <button
                type="button"
                onClick={handleGenerateLyrics}
                disabled={generatingLyrics || (!prompt.trim() && !lyrics.trim())}
                className="absolute bottom-2 right-2 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="AI 生成歌词"
              >
                {generatingLyrics ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Model Select */}
          <div className="space-y-2">
            <Label className="text-sm">模型</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="border-border bg-background/40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover text-popover-foreground border-border">
                <SelectItem value="music-2.6">Music 2.6（默认）</SelectItem>
                <SelectItem value="music-2.6-free">Music 2.6 Free</SelectItem>
                <SelectItem value="music-cover">翻唱模式</SelectItem>
                <SelectItem value="music-cover-free">翻唱模式 Free</SelectItem>
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
