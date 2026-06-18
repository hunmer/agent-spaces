import { useBoard } from './hooks/use-board.js';
import { t } from './utils/i18n.js';

function App() {
  const { board, loaded } = useBoard();
  if (!loaded) return <div className="p-4 text-sm text-muted-foreground">{t.loading}</div>;
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-primary">{board.title}</h1>
      <p className="text-xs text-muted-foreground mt-1">
        layout: {board.layoutMode} · columns: {board.columns.length} · tasks: {board.tasks.length}
      </p>
    </div>
  );
}

export default App;
