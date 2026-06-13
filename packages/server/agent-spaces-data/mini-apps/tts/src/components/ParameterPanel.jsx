const { Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Slider, Separator } = window.AgentSpacesUI;
import { EMOTIONS } from '../utils/providers';
import styles from '../utils/styles';

function ParameterPanel({ provider, current, onUpdate }) {
  const update = (key, value) => {
    onUpdate({ ...current, [key]: value });
  };

  return (
    <>
      <Separator style={{ margin: '12px 0' }} />

      {/* minimax: 情绪 */}
      {provider === 'minimax' && (
        <>
          <Label>情绪</Label>
          <Select
            value={current.emotion || 'default'}
            onValueChange={(v) => update('emotion', v === 'default' ? '' : v)}
          >
            <SelectTrigger style={{ marginTop: '6px' }}>
              <SelectValue placeholder="选择情绪" />
            </SelectTrigger>
            <SelectContent>
              {EMOTIONS.map((e) => (
                <SelectItem key={e.value || 'default'} value={e.value || 'default'}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </>
      )}

      {/* 通用：语速 */}
      <Label style={{ marginTop: '12px' }}>语速</Label>
      <div style={styles.sliderRow}>
        <Slider
          style={{ flex: '1' }}
          min={0.5}
          max={2.0}
          step={0.1}
          value={[current.speed]}
          onValueChange={([v]) => update('speed', v)}
        />
        <span style={styles.sliderValue}>{current.speed.toFixed(1)}</span>
      </div>

      {/* minimax: 音量 (0-10) */}
      {provider === 'minimax' && (
        <>
          <Label style={{ marginTop: '12px' }}>音量</Label>
          <div style={styles.sliderRow}>
            <Slider
              style={{ flex: '1' }}
              min={0}
              max={10}
              step={0.5}
              value={[current.vol]}
              onValueChange={([v]) => update('vol', v)}
            />
            <span style={styles.sliderValue}>{current.vol.toFixed(1)}</span>
          </div>
        </>
      )}

      {/* fishaudio: 表现力 (temperature 0-1) */}
      {provider === 'fishaudio' && (
        <>
          <Label style={{ marginTop: '12px' }}>表现力 (Temperature)</Label>
          <div style={styles.sliderRow}>
            <Slider
              style={{ flex: '1' }}
              min={0}
              max={1}
              step={0.1}
              value={[current.temperature]}
              onValueChange={([v]) => update('temperature', v)}
            />
            <span style={styles.sliderValue}>{current.temperature.toFixed(1)}</span>
          </div>
        </>
      )}

      {/* qianyin: 音量 (0-100) */}
      {provider === 'qianyin' && (
        <>
          <Label style={{ marginTop: '12px' }}>音量</Label>
          <div style={styles.sliderRow}>
            <Slider
              style={{ flex: '1' }}
              min={0}
              max={100}
              step={5}
              value={[current.volume]}
              onValueChange={([v]) => update('volume', v)}
            />
            <span style={styles.sliderValue}>{current.volume}</span>
          </div>
        </>
      )}

      {/* minimax / qianyin: 语调 */}
      {(provider === 'minimax' || provider === 'qianyin') && (
        <>
          <Label style={{ marginTop: '12px' }}>语调</Label>
          <div style={styles.sliderRow}>
            <Slider
              style={{ flex: '1' }}
              min={-12}
              max={12}
              step={1}
              value={[current.pitch]}
              onValueChange={([v]) => update('pitch', v)}
            />
            <span style={styles.sliderValue}>{current.pitch}</span>
          </div>
        </>
      )}
    </>
  );
}

export default ParameterPanel;
