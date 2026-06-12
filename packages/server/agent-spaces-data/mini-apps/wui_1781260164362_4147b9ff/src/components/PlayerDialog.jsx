const { Dialog, DialogContent, DialogHeader, DialogTitle } = window.AgentSpacesUI;

// 音视频播放弹窗。src 取本地 media_url（httpPath）。
export default function PlayerDialog({ item, onClose }) {
  const open = !!item;
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item?.title}</DialogTitle>
        </DialogHeader>
        {item && (
          item.type === 'video' ? (
            <video src={item.media_url} controls autoPlay className="w-full rounded-md max-h-[70vh]" />
          ) : (
            <audio src={item.media_url} controls autoPlay className="w-full" />
          )
        )}
      </DialogContent>
    </Dialog>
  );
}
