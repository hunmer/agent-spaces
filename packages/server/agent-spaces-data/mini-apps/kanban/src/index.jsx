import KanbanBoard from './components/kanban-board.jsx';

function App() {
  const workspaceId = new URLSearchParams(window.location.search).get('workspaceId') || '';
  return <KanbanBoard workspaceId={workspaceId} />;
}

export default App;
