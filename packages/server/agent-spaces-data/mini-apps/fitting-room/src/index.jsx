import { Router, useRouter, Link } from "@agent-spaces/ui";
import ProfilePage from "./components/ProfilePage";
import HairstylePage from "./components/HairstylePage";
import OutfitPage from "./components/OutfitPage";
import TasksPage from "./components/TasksPage";
import useFittingTasks from "./hooks/useFittingTasks";

const { User, Scissors, Shirt, ListChecks } = window.AgentSpacesUI;

function App() {
  const { path, push } = useRouter();
  const tab = path[0] || "profile";
  const { tasks, pendingCount, removeTask, clearFinished, executorId } = useFittingTasks();

  // GenerateDialog 提交后跳到任务列表，让用户看到刚提交的 running 任务
  const handleSubmitted = () => {
    push("tasks");
  };

  return (
    <div className="fr-app" style={{ height: "100%" }}>
      <header className="fr-header">
        <div className="fr-header-title">👗 试衣间</div>
        <nav className="fr-tabs">
          <Link to="profile" className={`fr-tab${tab === "profile" ? " is-active" : ""}`}>
            <User className="fr-icon" />
            <span>我的形象</span>
          </Link>
          <Link to="hairstyle" className={`fr-tab${tab === "hairstyle" ? " is-active" : ""}`}>
            <Scissors className="fr-icon" />
            <span>发型库</span>
          </Link>
          <Link to="outfit" className={`fr-tab${tab === "outfit" ? " is-active" : ""}`}>
            <Shirt className="fr-icon" />
            <span>服装库</span>
          </Link>
          <Link to="tasks" className={`fr-tab${tab === "tasks" ? " is-active" : ""}`}>
            <ListChecks className="fr-icon" />
            <span>任务</span>
            {pendingCount > 0 && <span className="fr-tab-badge">{pendingCount}</span>}
          </Link>
        </nav>
      </header>

      <main className="fr-main">
        {tab === "profile" && <ProfilePage />}
        {tab === "hairstyle" && <HairstylePage onSubmitTask={handleSubmitted} />}
        {tab === "outfit" && <OutfitPage onSubmitTask={handleSubmitted} />}
        {tab === "tasks" && (
          <TasksPage
            tasks={tasks}
            executorId={executorId}
            onRemove={removeTask}
            onClearFinished={clearFinished}
          />
        )}
      </main>
    </div>
  );
}

export default function Root() {
  return (
    <Router>
      <App />
    </Router>
  );
}
