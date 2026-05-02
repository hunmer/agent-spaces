export type SlashCommandItem = {
  id: string;
  title: string;
  description: string;
};

export const COMMANDS: SlashCommandItem[] = [
  {
    id: 'heading1',
    title: '标题 1',
    description: '切换为一级标题',
  },
  {
    id: 'blockquote',
    title: '引用',
    description: '切换为引用块',
  },
  {
    id: 'divider',
    title: '分割线',
    description: '插入一条分割线',
  },
  {
    id: 'attach',
    title: '添加附件',
    description: '打开文件选择器',
  },
];
