import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const resultSource = fs.readFileSync(new URL('./ImageResult.jsx', import.meta.url), 'utf8');
const shellSource = fs.readFileSync(new URL('./NodeShell.jsx', import.meta.url), 'utf8');

test('grouped output renders collapsible sections and label badges', () => {
  assert.match(resultSource, /groupOutputAssetItems\(list\)/);
  assert.match(resultSource, /aria-expanded=\{expanded\}/);
  assert.match(resultSource, /<OutputLabelBadge label=\{item\.label\}/);
  assert.match(resultSource, /right: 4px;/);
});

test('output preview receives resource metadata', () => {
  assert.match(shellSource, /resources=\{data\?\.output\?\.resources \|\| \[\]\} preview/);
});

test('reordering preserves URL and resource arrays separately', () => {
  assert.match(resultSource, /onReorderImages\(next\.map\(\(item\) => item\.url\), next\.map\(\(item\) => item\.resource\)\)/);
  assert.match(resultSource, /src: item\.url/);
});

test('gallery uses the same current output list as thumbnails', () => {
  assert.match(resultSource, /const galleryItems = list\.map/);
  assert.doesNotMatch(resultSource, /galleryOffset \+ index/);
});

test('display grouping and limits never become the reorder data source', () => {
  assert.match(resultSource, /const sections = useMemo\(\(\) => groupOutputAssetItems\(list\), \[list\]\)/);
  assert.match(resultSource, /const next = \[\.\.\.assetItems\]/);
  assert.match(resultSource, /from >= assetItems\.length \|\| to >= assetItems\.length/);
});

test('group display toggle only changes local expansion state', () => {
  const sectionSource = resultSource.slice(resultSource.indexOf('function OutputAssetSection'));
  assert.match(sectionSource, /setExpanded\(\(value\) => !value\)/);
  assert.doesNotMatch(sectionSource, /onRemoveImage|onReorderImages|onSwitchVersion/);
  assert.match(sectionSource, /nativeEvent\?\.stopImmediatePropagation/);
  assert.match(sectionSource, /onPointerDown=\{stopSectionEvent\}/);
});

test('history output selection stays display-only and never calls parent writeback', () => {
  assert.match(resultSource, /const \[displayVersion, setDisplayVersion\] = useState\(null\)/);
  assert.match(resultSource, /setDisplayVersion\(i\)/);
  assert.doesNotMatch(resultSource, /onSwitchVersion\(i\)/);
  assert.match(resultSource, /const isHistoricalView = !!displaySnapshot/);
  assert.match(resultSource, /const handleDisplayedRemove = \(ids\) =>/);
  assert.match(resultSource, /removeOutputAssetItems\(displayImages, displayResources, ids\)/);
});

test('historical delete delegates the selected version index for permanent persistence', () => {
  assert.match(resultSource, /onRemoveVersionImages\(displayVersion, ids\)/);
  assert.match(resultSource, /onRemoveVersionImages\(displayVersion, displayItems\.map\(\(item\) => item\.id\)\)/);
});

test('historical delete path keeps current output as its own source', () => {
  const canvasSource = fs.readFileSync(new URL('../Canvas.jsx', import.meta.url), 'utf8');
  const handler = canvasSource.slice(
    canvasSource.indexOf('const handleRemoveVersionImages = useCallback'),
    canvasSource.indexOf('// 产出图重排序', canvasSource.indexOf('const handleRemoveVersionImages = useCallback')),
  );
  assert.match(handler, /removeOutputVersionImages\(versions, versionIndex, ids\)/);
  assert.match(handler, /removeOutputAssetItems\(\s*currentOutput\.images,\s*currentOutput\.resources,\s*ids/);
  assert.doesNotMatch(handler, /patch\.output = \{[^}]*images: next\.images/);
});
