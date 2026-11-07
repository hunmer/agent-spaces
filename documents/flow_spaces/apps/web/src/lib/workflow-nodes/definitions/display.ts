import type { NodeTypeDefinition } from '@agent-spaces/shared';
import { CodeRenderView, FileDisplayView, GalleryPreviewView, MusicPlayerView, TableDisplayView } from '@/components/workflow/display-node-views';
import { MarkdownNodeView } from '@/components/workflow/markdown-node-view';
import { StickyNoteView } from '@/components/workflow/sticky-note-view';

const CODE_RENDER_DEFAULT_REACT = `export default function View() {
  const { Card, CardContent, Badge } = window.AgentSpacesUI;

  return (
    <div className="h-full w-full bg-background p-2">
      <Card className="h-full rounded-md shadow-none">
        <CardContent className="space-y-2 p-3">
          <Badge variant="secondary">React</Badge>
          <div className="text-sm font-medium">Code Render</div>
        </CardContent>
      </Card>
    </div>
  );
}
`;

export const displayNodes: NodeTypeDefinition[] = [
  {
    type: 'gallery_preview',
    label: 'nodes.gallery_preview.label',
    category: 'nodes.categories.display',
    icon: 'Image',
    description: 'nodes.gallery_preview.description',
    readonlyOutputs: true,
    inputMiddleware: {
      type: 'stringArrayToObjectArray',
      sourceKey: 'items',
      targetKey: 'items',
      valueKey: 'src',
      copyValueToKeys: ['thumb'],
      defaults: { type: 'image', caption: '' },
    },
    outputMiddleware: { type: 'arrayItemField', sourceKey: 'items', itemKey: 'src', targetKey: 'urls' },
    customView: GalleryPreviewView,
    customViewMinSize: { width: 220, height: 180 },
    properties: [
      {
        key: 'items',
        label: 'nodes.gallery_preview.props.items.label',
        type: 'array',
        required: true,
        tooltip: 'nodes.gallery_preview.props.items.tooltip',
        itemTemplate: { id: '', src: '', thumb: '', type: 'image', caption: '' },
        fields: [
          { key: 'src', label: 'nodes.gallery_preview.props.items.fields.src', type: 'text', required: true, placeholder: 'nodes.gallery_preview.props.items.fields.src_placeholder' },
          { key: 'thumb', label: 'nodes.gallery_preview.props.items.fields.thumb', type: 'text', placeholder: 'nodes.gallery_preview.props.items.fields.thumb_placeholder' },
          {
            key: 'type',
            label: 'nodes.gallery_preview.props.items.fields.type.label',
            type: 'select',
            default: 'image',
            options: [
              { label: 'nodes.gallery_preview.props.items.fields.type.image', value: 'image' },
              { label: 'nodes.gallery_preview.props.items.fields.type.video', value: 'video' },
            ],
          },
          { key: 'caption', label: 'nodes.gallery_preview.props.items.fields.caption', type: 'text', placeholder: 'nodes.gallery_preview.props.items.fields.caption_placeholder' },
        ],
      },
      {
        key: 'carousel',
        label: 'nodes.gallery_preview.props.carousel',
        type: 'checkbox',
        default: false,
        tooltip: 'nodes.gallery_preview.props.carousel_tooltip',
      },
    ],
    outputs: [
      { key: 'urls', type: 'string[]', description: 'nodes.gallery_preview.outputs.urls' },
    ],
  },
  {
    type: 'music_player',
    label: 'nodes.music_player.label',
    category: 'nodes.categories.display',
    icon: 'Music',
    description: 'nodes.music_player.description',
    readonlyOutputs: true,
    customView: MusicPlayerView,
    customViewMinSize: { width: 260, height: 150 },
    properties: [
      {
        key: 'tracks',
        label: 'nodes.music_player.props.tracks.label',
        type: 'array',
        required: true,
        tooltip: 'nodes.music_player.props.tracks.tooltip',
        itemTemplate: { id: '', src: '', title: '', cover: '', duration: 0 },
        fields: [
          { key: 'src', label: 'nodes.music_player.props.tracks.fields.src', type: 'text', required: true, placeholder: 'nodes.music_player.props.tracks.fields.src_placeholder' },
          { key: 'title', label: 'nodes.music_player.props.tracks.fields.title', type: 'text', placeholder: 'nodes.music_player.props.tracks.fields.title_placeholder' },
          { key: 'cover', label: 'nodes.music_player.props.tracks.fields.cover', type: 'text', placeholder: 'nodes.music_player.props.tracks.fields.cover_placeholder' },
          { key: 'duration', label: 'nodes.music_player.props.tracks.fields.duration', type: 'number', placeholder: 'nodes.music_player.props.tracks.fields.duration_placeholder' },
        ],
      },
      {
        key: 'volume',
        label: 'nodes.music_player.props.volume',
        type: 'number',
        default: 80,
        tooltip: 'nodes.music_player.props.volume_tooltip',
      },
      {
        key: 'loop',
        label: 'nodes.music_player.props.loop',
        type: 'checkbox',
        default: false,
        tooltip: 'nodes.music_player.props.loop_tooltip',
      },
    ],
  },
  {
    type: 'table_display',
    label: 'nodes.table_display.label',
    category: 'nodes.categories.display',
    icon: 'Table',
    description: 'nodes.table_display.description',
    readonlyOutputs: true,
    customView: TableDisplayView,
    customViewMinSize: { width: 320, height: 200 },
    properties: [
      {
        key: 'headers',
        label: 'nodes.table_display.props.headers.label',
        type: 'array',
        required: true,
        tooltip: 'nodes.table_display.props.headers.tooltip',
        itemTemplate: { id: '', title: '', type: 'string' },
        fields: [
          { key: 'id', label: 'nodes.table_display.props.headers.fields.id', type: 'text', required: true, placeholder: 'header1' },
          { key: 'title', label: 'nodes.table_display.props.headers.fields.title', type: 'text', required: true, placeholder: 'nodes.table_display.props.headers.fields.title_placeholder' },
          {
            key: 'type',
            label: 'nodes.table_display.props.headers.fields.type.label',
            type: 'select',
            default: 'string',
            options: [
              { label: 'nodes.table_display.props.headers.fields.type.string', value: 'string' },
              { label: 'nodes.table_display.props.headers.fields.type.number', value: 'number' },
              { label: 'nodes.table_display.props.headers.fields.type.boolean', value: 'boolean' },
            ],
          },
        ],
      },
      {
        key: 'cells',
        label: 'nodes.table_display.props.cells.label',
        type: 'array',
        required: true,
        tooltip: 'nodes.table_display.props.cells.tooltip',
        itemTemplate: { id: '', data: '{}' },
        fields: [
          { key: 'id', label: 'nodes.table_display.props.cells.fields.id', type: 'text', required: true, placeholder: 'row1' },
          { key: 'data', label: 'nodes.table_display.props.cells.fields.data', type: 'text', required: true, placeholder: '{"header1": "value"}' },
        ],
      },
      {
        key: 'selectionMode',
        label: 'nodes.table_display.props.selectionMode.label',
        type: 'select',
        default: 'none',
        required: true,
        options: [
          { label: 'nodes.table_display.props.selectionMode.none', value: 'none' },
          { label: 'nodes.table_display.props.selectionMode.single', value: 'single' },
          { label: 'nodes.table_display.props.selectionMode.multi', value: 'multi' },
        ],
      },
    ],
    outputs: [
      { key: 'selectedRows', type: 'any' },
      { key: 'selectedCount', type: 'number' },
    ],
  },
  {
    type: 'code_render',
    label: 'nodes.code_render.label',
    category: 'nodes.categories.display',
    icon: 'Code2',
    description: 'nodes.code_render.description',
    readonlyOutputs: true,
    customView: CodeRenderView,
    customViewMinSize: { width: 280, height: 180 },
    properties: [
      {
        key: 'renderType',
        label: 'nodes.code_render.props.renderType.label',
        type: 'select',
        default: 'react',
        required: true,
        options: [
          { label: 'nodes.code_render.props.renderType.react', value: 'react' },
          { label: 'nodes.code_render.props.renderType.html', value: 'html' },
        ],
      },
      {
        key: 'code',
        label: 'nodes.code_render.props.code.label',
        type: 'code',
        required: true,
        default: CODE_RENDER_DEFAULT_REACT,
        language: 'javascript',
        tooltip: 'nodes.code_render.props.code.tooltip',
      },
    ],
    handles: { source: false, target: false },
    debuggable: false,
  },
  {
    type: 'sticky_note',
    label: 'nodes.sticky_note.label',
    category: 'nodes.categories.display',
    icon: 'StickyNote',
    description: 'nodes.sticky_note.description',
    readonlyOutputs: true,
    customView: StickyNoteView,
    customViewMinSize: { width: 180, height: 120 },
    properties: [
      { key: 'content', label: 'nodes.sticky_note.props.content', type: 'textarea', tooltip: 'nodes.sticky_note.props.content_tooltip' },
    ],
    handles: { source: false, target: false },
    debuggable: false,
  },
  {
    type: 'markdown',
    label: 'nodes.markdown.label',
    category: 'nodes.categories.display',
    icon: 'AlignLeft',
    description: 'nodes.markdown.description',
    readonlyOutputs: true,
    customView: MarkdownNodeView,
    customViewMinSize: { width: 220, height: 150 },
    properties: [
      { key: 'content', label: 'nodes.markdown.props.content', type: 'textarea', tooltip: 'nodes.markdown.props.content_tooltip' },
    ],
    handles: { source: false, target: false },
    debuggable: false,
  },
  {
    type: 'file_display',
    label: 'nodes.file_display.label',
    category: 'nodes.categories.display',
    icon: 'FileText',
    description: 'nodes.file_display.description',
    readonlyOutputs: true,
    customView: FileDisplayView,
    customViewMinSize: { width: 260, height: 120 },
    properties: [
      {
        key: 'src',
        label: 'nodes.file_display.props.src',
        type: 'text',
        required: true,
        tooltip: 'nodes.file_display.props.src_tooltip',
        placeholder: 'nodes.file_display.props.src_placeholder',
      },
      {
        key: 'fileName',
        label: 'nodes.file_display.props.fileName',
        type: 'text',
        tooltip: 'nodes.file_display.props.fileName_tooltip',
        placeholder: 'nodes.file_display.props.fileName_placeholder',
      },
      {
        key: 'fileSize',
        label: 'nodes.file_display.props.fileSize',
        type: 'number',
        tooltip: 'nodes.file_display.props.fileSize_tooltip',
        placeholder: 'nodes.file_display.props.fileSize_placeholder',
      },
    ],
    handles: { source: false, target: false },
    debuggable: false,
  },
];
