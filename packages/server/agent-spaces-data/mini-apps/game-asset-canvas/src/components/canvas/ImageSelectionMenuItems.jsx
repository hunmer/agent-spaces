import { useState } from 'react';
import { Download, FolderPlus, Loader2, Scissors, SquarePen, toast, X, ZoomIn } from '@agent-spaces/ui';
import { downloadImages } from '../../utils/export';

/** 图片选择工具栏与右键菜单共用的动作清单和调用逻辑。 */
export default function ImageSelectionMenuItems({
  selectedUrls, onEditImages, onCutoutCreate, onProcessImage, onAddToAssets, onClear,
  renderItem, renderSeparator,
}) {
  const [downloading, setDownloading] = useState(false);
  const urls = selectedUrls || [];

  const handleDownload = async () => {
    if (!urls.length || downloading) return;
    setDownloading(true);
    try {
      const { ok, total, failed } = await downloadImages(urls);
      if (failed > 0) toast.warning(`已下载 ${ok}/${total} 张，${failed} 张失败`);
      else toast.success(`已下载 ${ok} 张图片${total > 1 ? '（zip）' : ''}`);
    } catch (err) {
      toast.error(err?.message || '下载失败');
    } finally {
      setDownloading(false);
    }
  };

  const actions = [
    { id: 'edit', label: '编辑', Icon: SquarePen, onClick: () => onEditImages(urls), disabled: !urls.length },
    { id: 'cutout', label: '抠图', Icon: Scissors, onClick: () => onCutoutCreate(urls), disabled: !urls.length },
    { id: 'enhance', label: '放大', Icon: ZoomIn, onClick: () => onProcessImage(urls, 'enhance'), disabled: !urls.length },
    { id: 'download', label: '下载', Icon: downloading ? Loader2 : Download, onClick: handleDownload, disabled: !urls.length || downloading, loading: downloading },
    { id: 'assets', label: '素材库', Icon: FolderPlus, onClick: () => onAddToAssets(urls), disabled: !urls.length },
  ];

  return (
    <>
      {actions.map(renderItem)}
      {renderSeparator?.()}
      {renderItem({ id: 'clear', label: '取消选择', Icon: X, onClick: onClear, disabled: false })}
    </>
  );
}
