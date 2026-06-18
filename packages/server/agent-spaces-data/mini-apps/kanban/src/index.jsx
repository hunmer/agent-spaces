const { useState, useEffect } = React;

function App() {
  const [board, setBoard] = useState(null);

  useEffect(() => {
    // configSnapshot 连入后建立缓存；轮询 getConfig 直到拿到 board.json
    const timer = setInterval(() => {
      const b = window.AgentSpaces?.getConfig?.('board.json');
      if (b) { setBoard(b); clearInterval(timer); }
    }, 100);
    return () => clearInterval(timer);
  }, []);

  if (!board) return <div className="p-4 text-sm text-muted-foreground">加载中...</div>;
  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-primary">{board.title}</h1>
      <p className="text-xs text-muted-foreground mt-1">layout: {board.layoutMode}</p>
    </div>
  );
}

export default App;
