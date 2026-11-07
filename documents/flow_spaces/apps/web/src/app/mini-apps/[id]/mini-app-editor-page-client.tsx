"use client";

import { useParams } from 'next/navigation';
import { MiniAppEditor } from '@/components/mini-apps/mini-app-editor';

function decodeRouteParam(value: string) {
  try { return decodeURIComponent(value); }
  catch { return value; }
}

export default function MiniAppEditorPageClient() {
  const params = useParams<{ id: string }>();
  return <MiniAppEditor projectId={decodeRouteParam(params.id)} />;
}
