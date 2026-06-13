const { useEffect } = React;
const { Slider, Label, Button, Separator } = window.AgentSpacesUI;
import styles from '../utils/styles';

function BackgroundMusic({ audioRef, url, onUrlChange, volume, onVolumeChange }) {
  // 音量同步到 audio 元素（音量或音频源变化时）
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume / 100;
  }, [volume, url, audioRef]);

  const handleFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUrlChange(URL.createObjectURL(file));
    e.target.value = '';
  };

  const clear = () => {
    onUrlChange((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return '';
    });
  };

  return (
    <>
      <Separator style={{ margin: '12px 0' }} />

      <Label>🎵 背景音乐</Label>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginTop: '8px' }}>
        <label
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            borderRadius: '6px',
            border: '1px solid var(--border, #444)',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          📁 选择文件
          <input type="file" accept="audio/*" onChange={handleFile} style={{ display: 'none' }} />
        </label>
        {url && (
          <Button size="sm" variant="ghost" onClick={clear}>
            移除
          </Button>
        )}
        {url && (
          <div style={{ ...styles.sliderRow, flex: '1', minWidth: '180px', margin: 0 }}>
            <span style={{ fontSize: '12px' }}>音量</span>
            <Slider
              style={{ flex: '1' }}
              min={0}
              max={100}
              step={1}
              value={[volume]}
              onValueChange={(v) => onVolumeChange(Array.isArray(v) ? v[0] : v)}
            />
            <span style={styles.sliderValue}>{volume}%</span>
          </div>
        )}
      </div>

      {/* 背景音乐播放器，不展示控件；由主音频事件驱动同步播放 */}
      {url && <audio ref={audioRef} src={url} loop style={{ display: 'none' }} />}
    </>
  );
}

export default BackgroundMusic;
