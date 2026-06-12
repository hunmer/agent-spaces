"use client";

import { useParams } from 'next/navigation';
import { MiniAppEditor } from '@/components/mini-apps/mini-app-editor';

export default function MiniAppEditorPageClient() {
  const params = useParams<{ id: string }>();
  return <MiniAppEditor projectId={params.id} />;
}
