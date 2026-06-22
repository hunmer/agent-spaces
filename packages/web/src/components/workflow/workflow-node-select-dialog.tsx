'use client';

import { useMemo, useState } from 'react';
import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import type { NodeTypeDefinition, Workflow } from '@agent-spaces/shared';
import { getAllNodeDefinitions, useLocalizedNodeDefinitionsByCategory, useLocalizedSearchNodeDefinitions } from '@/lib/workflow-nodes';
import { toPinyinSearchKey } from '@/lib/utils';
import { resolveServerAssetUrl } from '@/lib/server';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Shapes, Workflow as WorkflowIcon, Sparkles, MousePointerClick, Monitor, Wrench, Database, BookOpen } from 'lucide-react';
import { PluginIcon } from './workflow-plugin-icon';
import { WorkflowNodeDefinitionIcon, type WorkflowNodeIconDefinition } from './workflow-node-icon';

type WorkflowNodeSelectDialogProps = {
  open: boolean;
  workflow: Workflow;
  onOpenChange: (open: boolean) => void;
  onSelect: (type: string) => void;
};

function canCreateNode(workflow: Workflow, definition: NodeTypeDefinition): boolean {
  if (definition.manualCreate === false) return false;
  if (!definition.singleton) return true;
  return !workflow.nodes.some(node => node.type === definition.type);
}

function getCreatableNodes(workflow: Workflow, nodes: NodeTypeDefinition[]): NodeTypeDefinition[] {
  return nodes.filter(node => node.manualCreate !== false && canCreateNode(workflow, node));
}

// 内置分类 -> 图标组件（按原始 i18n category key 映射）
const BUILTIN_CATEGORY_ICONS: Partial<Record<string, ComponentType<{ className?: string }>>> = {
  'nodes.categories.flowControl': WorkflowIcon,
  'nodes.categories.ai': Sparkles,
  'nodes.categories.interaction': MousePointerClick,
  'nodes.categories.display': Monitor,
  'nodes.categories.utilities': Wrench,
  'nodes.categories.sqlite': Database,
  'nodes.categories.knowledgeBase': BookOpen,
};

export function WorkflowNodeSelectDialog({
  open,
  workflow,
  onOpenChange,
  onSelect,
}: WorkflowNodeSelectDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const t = useTranslations('workflows');

  const allCategories = useLocalizedNodeDefinitionsByCategory();
  const searchResults = useLocalizedSearchNodeDefinitions(searchQuery);

  const categories = useMemo(() => Object.keys(allCategories), [open, allCategories]);

  // 翻译后的分类名 -> 原始 category key（用于内置分类图标映射）
  const rawCategoryByTranslated = useMemo(() => {
    const map: Record<string, string> = {};
    const toTranslated = (raw: string) => {
      if (!raw.startsWith('nodes.')) return raw;
      try {
        return t(raw as Parameters<typeof t>[0]);
      } catch {
        return raw;
      }
    };
    for (const def of getAllNodeDefinitions()) {
      const raw = def.category;
      if (!map[raw]) map[toTranslated(raw)] = raw;
    }
    return map;
  }, [t]);

  const renderCategoryIcon = (category: string) => {
    // 插件分类：取该分类下任一带 pluginId 的节点显示插件图标
    const pluginNode = (allCategories[category] || []).find(
      node => Boolean((node as WorkflowNodeIconDefinition).pluginId),
    ) as WorkflowNodeIconDefinition | undefined;
    const pluginId = pluginNode?.pluginId;
    if (pluginId) {
      return (
        <PluginIcon
          source={{ type: 'url', url: resolveServerAssetUrl(`/api/plugins/${encodeURIComponent(pluginId)}/icon`) }}
          className="h-3.5 w-3.5 shrink-0"
        />
      );
    }
    // 内置分类：按原始 category key 命中图标
    const Icon = BUILTIN_CATEGORY_ICONS[rawCategoryByTranslated[category] ?? ''];
    return Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null;
  };

  const filteredNodes = useMemo(() => {
    const query = searchQuery.trim();
    if (query) {
      // 文本匹配（label/type）+ 拼音匹配（label 全拼/首字母），结果合并去重
      const q = query.toLowerCase();
      const textMatches = getCreatableNodes(workflow, searchResults);
      const matchedTypes = new Set(textMatches.map(node => node.type));
      const pinyinMatches = getCreatableNodes(workflow, Object.values(allCategories).flat()).filter(
        node => !matchedTypes.has(node.type) && toPinyinSearchKey(node.label).includes(q),
      );
      return [...textMatches, ...pinyinMatches];
    }

    if (selectedCategory) {
      return getCreatableNodes(workflow, allCategories[selectedCategory] || []);
    }

    return getCreatableNodes(workflow, Object.values(allCategories).flat());
  }, [open, workflow, searchQuery, selectedCategory, allCategories, searchResults]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setSearchQuery('');
      setSelectedCategory(null);
    }
    onOpenChange(nextOpen);
  };

  const handleSelect = (type: string) => {
    onSelect(type);
    setSearchQuery('');
    setSelectedCategory(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[640px] p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-4 pb-3">
          <DialogTitle className="text-sm">{t('nodeSelect.title')}</DialogTitle>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t('nodeSelect.searchPlaceholder')}
              className="h-7 pl-8 text-xs"
            />
          </div>
        </DialogHeader>

        <div className="flex h-[380px] border-t border-border">
          <div className="w-36 shrink-0 border-r border-border bg-muted/30">
            <ScrollArea className="h-full">
              <div className="space-y-0.5 p-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={`h-7 w-full justify-start gap-1.5 px-2.5 text-xs ${selectedCategory === null ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                  onClick={() => setSelectedCategory(null)}
                >
                  <Shapes className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{t('nodeSelect.allNodes')}</span>
                </Button>
                {categories.map(category => (
                  <Button
                    key={category}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={`h-7 w-full justify-start gap-1.5 truncate px-2.5 text-xs ${selectedCategory === category ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}
                    onClick={() => setSelectedCategory(category)}
                  >
                    {renderCategoryIcon(category)}
                    <span className="truncate">{category}</span>
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="min-w-0 flex-1">
            <ScrollArea className="h-full">
              {filteredNodes.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 p-3">
                  {filteredNodes.map(node => (
                    <Button
                      key={node.type}
                      type="button"
                      variant="outline"
                      className="group h-auto min-h-24 flex-col gap-1.5 p-3 text-center hover:border-primary/50 hover:bg-primary/5"
                      onClick={() => handleSelect(node.type)}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                        <WorkflowNodeDefinitionIcon definition={node} className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary" />
                      </span>
                      <span className="line-clamp-2 w-full text-[11px] leading-tight">{node.label}</span>
                    </Button>
                  ))}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center text-xs text-muted-foreground">
                  {t('nodeSelect.noMatch')}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
