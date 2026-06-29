// 右侧图库：标题栏（清空按钮）+ 网格 + 空状态
import StickerCard from './StickerCard';

const { Button, Badge, History, Trash2, ImageOff } = window.AgentSpacesUI;

export default function Gallery({ history, running, onPreview, onDelete, onClear }) {
  return (
    <section className="sg-gallery">
      <div className="sg-gallery-head">
        <div className="sg-gallery-title">
          <History className="sg-icon-sm" />
          <span>我的贴图</span>
          <Badge variant="secondary">{history.length}</Badge>
        </div>
        <Button size="sm" variant="outline" onClick={onClear} disabled={!history.length || running}>
          <Trash2 className="sg-icon-xs" /> 清空
        </Button>
      </div>

      {history.length === 0 ? (
        <div className="sg-empty">
          <ImageOff className="sg-icon-lg" />
          <p className="sg-empty-title">还没有贴图</p>
          <p className="sg-empty-desc">在左侧输入提示词、选择风格，点击「生成贴图」开始创作</p>
        </div>
      ) : (
        <div className="sg-grid">
          {history.map((item) => (
            <StickerCard key={item.id} item={item} onPreview={onPreview} onDelete={onDelete} />
          ))}
        </div>
      )}
    </section>
  );
}
