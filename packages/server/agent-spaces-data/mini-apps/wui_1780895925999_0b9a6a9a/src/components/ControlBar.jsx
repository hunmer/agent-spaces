const { useRef } = React;
const { Button, Badge, Alert, AlertDescription, Card, CardContent } = window.AgentSpacesUI;
import styles from '../utils/styles';

function ControlBar({ loading, error, audioUrl, onGenerate, bgmAudioRef, bgmUrl }) {
  const mainAudioRef = useRef(null);

  // 主音频开始播放 → 背景音乐从头同步播放
  const handleMainPlay = () => {
    const bgm = bgmAudioRef?.current;
    if (!bgm || !bgmUrl) return;
    bgm.currentTime = 0;
    bgm.play().catch(() => {});
  };

  // 主音频暂停/结束 → 背景音乐同步暂停
  const handleMainStop = () => {
    bgmAudioRef?.current?.pause();
  };

  return (
    <Card>
      <CardContent style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={styles.controlsRow}>
          <Button onClick={onGenerate} disabled={loading}>
            {loading ? '⏳ 合成中...' : '🎙️ 开始配音'}
          </Button>
          {loading && <Badge variant="secondary">正在生成语音，请稍候...</Badge>}

          {audioUrl && (
            <audio
              ref={mainAudioRef}
              style={styles.audioPlayerInline}
              controls
              autoPlay
              src={audioUrl}
              onPlay={handleMainPlay}
              onPause={handleMainStop}
              onEnded={handleMainStop}
            >
              您的浏览器不支持音频播放
            </audio>
          )}
        </div>

        {error && (
          <Alert variant="destructive" style={{ flex: '1' }}>
            <AlertDescription>❌ {error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export default ControlBar;
