import { WorkspaceClient } from "./workspace-client";

export function generateStaticParams() {
  return [{ id: "_" }];
}

export default function WorkspacePage() {
  return <WorkspaceClient />;
}
