const { Badge } = window.AgentSpacesUI;
import { usePodcast } from './hooks/usePodcast.js';
import { Toolbar } from './components/Toolbar.jsx';
import { ChapterList } from './components/ChapterList.jsx';
import { ChapterView } from './components/ChapterView.jsx';
import { PodcastPanel } from './components/PodcastPanel.jsx';
import { styles } from './utils/styles.js';

function App() {
  const s = usePodcast();

  if (!s.ready) {
    return (
      <div style={styles.empty}>
        <Badge variant="secondary">初始化中…</Badge>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      <Toolbar
        bookMeta={s.bookMeta}
        parsing={s.parsing}
        presets={s.presets}
        agentConfigId={s.agentConfigId}
        onPresetChange={s.onPresetChange}
        onFile={s.handleUpload}
        error={s.error}
        toast={s.toast}
      />
      <div style={styles.body}>
        <ChapterList
          bookMeta={s.bookMeta}
          chapters={s.chapters}
          selectedIndex={s.selectedIndex}
          onSelect={s.selectChapter}
        />
        <ChapterView
          label={s.currentLabel}
          text={s.chapterText}
          loading={s.loadingChapter}
          generating={s.generating}
          onGenerate={s.generatePodcast}
        />
        <PodcastPanel
          podcast={s.podcast}
          generating={s.generating}
          onCopy={s.copyScript}
        />
      </div>
    </div>
  );
}

export default App;
