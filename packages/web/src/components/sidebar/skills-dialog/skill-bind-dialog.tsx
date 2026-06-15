'use client';

import { useTranslations } from 'next-intl';
import { AgentPickerDialog } from '@/components/common/agent-picker-dialog';
import type { AgentCandidate, SkillInfo } from './types';

interface SkillBindDialogProps {
  skill: SkillInfo | null;
  titleOverride?: string;
  descriptionOverride?: string;
  agents: AgentCandidate[];
  initialSelected: string[];
  onClose: () => void;
  onSubmit: (selectedIds: string[]) => void;
}

export function SkillBindDialog({ skill, titleOverride, descriptionOverride, agents, initialSelected, onClose, onSubmit }: SkillBindDialogProps) {
  const t = useTranslations('skills');
  const tc = useTranslations('common');

  return (
    <AgentPickerDialog
      open={!!skill}
      onClose={onClose}
      onSubmit={onSubmit}
      title={titleOverride || t('bindTitle', { name: skill?.name || '' })}
      description={descriptionOverride || t('bindDescription')}
      agents={agents}
      initialSelected={initialSelected}
      cancelText={tc('cancel')}
      confirmText={tc('confirm')}
    />
  );
}
