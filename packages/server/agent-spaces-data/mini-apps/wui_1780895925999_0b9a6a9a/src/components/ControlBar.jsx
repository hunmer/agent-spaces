const { useRef } = React;
const { Button, Badge, Alert, AlertDescription, Card, CardContent } = window.AgentSpacesUI;
import styles from '../utils/styles';

function ControlBar({ loading, error, audioUrl, onGenerate }) {
  const audioRef = useRef(null);

  return (
    <Card>
      <CardContent style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={styles.controlsRow}>
          <Button onClick={onGenerate} disabled={loading}>
            {loading ? '⏳ 合成中...' : '🎙️ 开始配音'}
          </Button>
          {loading && <Badge variant="secondary">正在生成语音，请稍候...</Badge>}

          {audioUrl && (
            <audio ref={audioRef} style={styles.audioPlayerInline} controls autoPlay src={audioUrl}>
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
