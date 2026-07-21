'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Info, Loader2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { sdk } from '@/lib/sdk';

interface WorkspacePromptSectionProps {
  workspaceId: string;
  initialPrompt: string;
}

export function WorkspacePromptSection({ workspaceId, initialPrompt }: WorkspacePromptSectionProps) {
  const t = useTranslations('projectSettings');
  const [prompt, setPrompt] = useState(initialPrompt);
  const [savedPrompt, setSavedPrompt] = useState(initialPrompt);
  const [savingPrompt, setSavingPrompt] = useState(false);

  const promptChanged = prompt !== savedPrompt;

  const handleSavePrompt = async () => {
    if (savingPrompt) return;
    setSavingPrompt(true);
    try {
      const data = await sdk.workspace.updatePrompt(workspaceId, prompt);
      setPrompt(data.prompt);
      setSavedPrompt(data.prompt);
      toast.success(t('prompt.saveSuccess'));
    } catch (err) {
      toast.error(t('prompt.saveFailed'), {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingPrompt(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{t('prompt.title')}</h4>
        <TooltipProvider delay={200}>
          <Tooltip>
            <TooltipTrigger className="inline-flex">
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p>{t('prompt.description')}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="space-y-3">
        <Textarea
          id="workspace-prompt"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          className="min-h-36 resize-y text-sm dark:!text-gray-200"
        />
        <div className="flex justify-end">
          <Button type="button" size="sm" onClick={handleSavePrompt} disabled={savingPrompt || !promptChanged} className="dark:!text-gray-200">
            {savingPrompt && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
            {t('prompt.savePrompt')}
          </Button>
        </div>
      </div>
    </div>
  );
}
