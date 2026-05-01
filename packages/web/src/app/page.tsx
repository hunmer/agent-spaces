"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Workspace } from "@agent-spaces/shared";

export default function HomePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [name, setName] = useState("");
  const [dir, setDir] = useState("");

  useEffect(() => {
    fetch("/api/workspaces")
      .then((r) => r.json())
      .then(setWorkspaces)
      .catch(console.error);
  }, []);

  const create = async () => {
    if (!name || !dir) return;
    const res = await fetch("/api/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, boundDirs: [dir] }),
    });
    const ws = await res.json();
    setWorkspaces((prev) => [...prev, ws]);
    setName("");
    setDir("");
  };

  return (
    <div className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-6">Agent Spaces</h1>

      <div className="flex gap-2 mb-8">
        <input
          className="border rounded px-3 py-1.5 text-sm"
          placeholder="Workspace name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="border rounded px-3 py-1.5 text-sm flex-1"
          placeholder="/path/to/project"
          value={dir}
          onChange={(e) => setDir(e.target.value)}
        />
        <Button onClick={create} disabled={!name || !dir}>
          Create
        </Button>
      </div>

      <div className="grid gap-3">
        {workspaces.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No workspaces yet. Create one above.
          </p>
        )}
        {workspaces.map((ws) => (
          <Link
            key={ws.id}
            href={`/workspace/${ws.id}`}
            className="border rounded-lg p-4 hover:bg-accent transition-colors block"
          >
            <div className="font-medium">{ws.name}</div>
            <div className="text-sm text-muted-foreground mt-1">
              {ws.boundDirs.join(", ")}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
