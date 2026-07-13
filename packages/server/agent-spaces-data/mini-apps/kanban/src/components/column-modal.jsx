import { useState, useEffect } from 'react';
import { t } from '../utils/i18n.js';

const { Layout, Sparkles, Input, Label, Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } = window.AgentSpacesUI;

const COLORS = {
  sky: '#0ea5e9', amber: '#f59e0b', emerald: '#10b981', rose: '#f43f5e', purple: '#a855f7', slate: '#78716c',
};

export default function ColumnModal({ isOpen, onClose, onCreate, onEdit, editingColumn }) {
  const [title, setTitle] = useState('');
  const [color, setColor] = useState('sky');

  useEffect(() => {
    if (isOpen) {
      if (editingColumn) { setTitle(editingColumn.title); setColor(editingColumn.color); }
      else { setTitle(''); setColor('sky'); }
    }
  }, [isOpen, editingColumn]);

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (editingColumn && onEdit) onEdit(editingColumn.id, title.trim(), color);
    else onCreate(title.trim(), color);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 py-4 border-b">
          <DialogTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {editingColumn ? t.editSection : t.newSection}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-5">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Layout className="h-3.5 w-3.5" />{t.sectionName}
            </Label>
            <Input type="text" required autoFocus placeholder={t.sectionNamePlaceholder} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={25} className="h-9 text-sm font-medium" />
          </div>
          <div className="space-y-2.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              <Sparkles className="h-3.5 w-3.5" />{t.theme}
            </Label>
            <div className="flex items-center gap-3 py-1">
              {['sky', 'amber', 'emerald', 'rose', 'purple', 'slate'].map((opt) => (
                <button key={opt} type="button" onClick={() => setColor(opt)} className={`h-7 w-7 rounded-full hover:scale-115 active:scale-95 transition-all duration-150 cursor-pointer ${color === opt ? 'ring-2 ring-stone-800 ring-offset-2' : 'opacity-85 hover:opacity-100'}`} style={{ backgroundColor: COLORS[opt] }} />
              ))}
            </div>
          </div>
        </form>
        <DialogFooter className="!-mx-0 !-mb-0 px-6 py-4 border-t flex-row justify-end sm:justify-end">
          <Button size="sm" variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button size="sm" onClick={handleSubmit} disabled={!title.trim()}>{editingColumn ? t.save : t.create}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
