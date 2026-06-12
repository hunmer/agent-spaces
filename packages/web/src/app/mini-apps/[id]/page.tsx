import MiniAppEditorPageClient from './mini-app-editor-page-client';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function MiniAppEditorPage() {
  return <MiniAppEditorPageClient />;
}
