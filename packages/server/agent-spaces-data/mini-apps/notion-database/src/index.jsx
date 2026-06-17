const { NotionEditor } = window.AgentSpacesUI;

export default function App() {
  return (
    <div style={{ padding: 24 }}>
      <NotionEditor content="<h2>hello</h2><p>tiptap sandbox ok</p>" onChange={() => {}} />
    </div>
  );
}
