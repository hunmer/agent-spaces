'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { SearchSelect } from '@/components/ui/search-select';
import { X } from 'lucide-react';

import type { Channel } from '@agent-spaces/shared';

const channelTypeOptions = [
  { value: 'general', label: 'General' },
  { value: 'issue', label: 'Issue' },
  { value: 'agent', label: 'Agent' },
];

interface ChannelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  channel?: Channel | null;
  onSubmit: (data: { name: string; type: Channel['type']; members: string[] }) => void;
}

export function ChannelDialog({ open, onOpenChange, channel, onSubmit }: ChannelDialogProps) {
  const [name, setName] = useState('');
  const [type, setType] = useState<Channel['type']>('general');
  const [members, setMembers] = useState<string[]>([]);
  const [memberInput, setMemberInput] = useState('');

  useEffect(() => {
    if (open) {
      if (channel) {
        setName(channel.name);
        setType(channel.type);
        setMembers([...channel.members]);
      } else {
        setName('');
        setType('general');
        setMembers(['user']);
      }
      setMemberInput('');
    }
  }, [open, channel]);

  const addMember = () => {
    const m = memberInput.trim();
    if (m && !members.includes(m)) {
      setMembers([...members, m]);
      setMemberInput('');
    }
  };

  const removeMember = (m: string) => {
    setMembers(members.filter((x) => x !== m));
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSubmit({ name: name.trim(), type, members });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{channel ? '编辑频道' : '创建频道'}</DialogTitle>
          <DialogDescription>
            {channel ? '修改频道名称、类型和成员' : '创建一个新的频道'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">名称</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="channel-name"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">类型</label>
            <SearchSelect
              value={type}
              onChange={(v) => setType(v as Channel['type'])}
              options={channelTypeOptions}
              allowCustom={false}
              placeholder="选择类型"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">成员</label>
            <div className="flex gap-1.5">
              <Input
                value={memberInput}
                onChange={(e) => setMemberInput(e.target.value)}
                placeholder="添加成员"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { e.preventDefault(); addMember(); }
                }}
              />
              <Button type="button" variant="outline" size="sm" onClick={addMember}>
                添加
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <span key={m} className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
                  {m}
                  <button type="button" onClick={() => removeMember(m)} className="hover:text-destructive">
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={!name.trim()}>
              {channel ? '保存' : '创建'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
