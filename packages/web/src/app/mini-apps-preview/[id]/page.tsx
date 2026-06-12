import MiniAppPreviewPageClient from './preview-page-client';

export function generateStaticParams() {
  return [{ id: '_' }];
}

export default function MiniAppPreviewPage() {
  return <MiniAppPreviewPageClient />;
}
