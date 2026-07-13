import { Router, useRouter, Link } from "@agent-spaces/ui";
import ProfilePage from "./components/ProfilePage";
import HairstylePage from "./components/HairstylePage";
import OutfitPage from "./components/OutfitPage";

const { User, Scissors, Shirt } = window.AgentSpacesUI;

function App() {
  const { path, push } = useRouter();
  const tab = path[0] || "profile";

  return (
    <div className="fr-app">
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
        </nav>
      </header>

      <main className="fr-main">
        {tab === "profile" && <ProfilePage />}
        {tab === "hairstyle" && <HairstylePage />}
        {tab === "outfit" && <OutfitPage />}
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
