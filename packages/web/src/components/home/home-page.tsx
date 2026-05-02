"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus, FolderOpen, ArrowRight } from "lucide-react";
import type { Workspace } from "@agent-spaces/shared";

export function HomePage({ initialWorkspaces }: { initialWorkspaces: Workspace[] }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces);
  const [name, setName] = useState("");
  const [dir, setDir] = useState("");
  const [showCreate, setShowCreate] = useState(false);

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
    setShowCreate(false);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground text-xs font-semibold">A</span>
            </div>
            <span className="font-heading text-lg font-semibold text-foreground">Agent Spaces</span>
          </div>
          <Button
            onClick={() => setShowCreate(!showCreate)}
            size="sm"
            className="rounded-full px-4"
          >
            <Plus className="size-3.5" />
            New Workspace
          </Button>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16">
        <h1 className="font-heading text-5xl font-semibold leading-[1.10] text-foreground max-w-2xl">
          Multi-Agent
          <br />
          Collaborative Coding
        </h1>
        <p className="mt-4 text-lg text-muted-foreground leading-relaxed max-w-xl">
          Create workspaces, bind local code directories, and let AI agents plan, execute, review, and merge — together.
        </p>
      </section>

      {/* Create Form */}
      {showCreate && (
        <section className="max-w-6xl mx-auto px-6 pb-10">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
            <h3 className="font-heading text-xl font-semibold mb-4">Create Workspace</h3>
            <div className="flex gap-3">
              <input
                className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all w-64"
                placeholder="Workspace name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
              <input
                className="rounded-xl border border-border bg-background px-4 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all flex-1"
                placeholder="/path/to/project"
                value={dir}
                onChange={(e) => setDir(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
              />
              <Button onClick={create} disabled={!name || !dir} className="rounded-xl px-6">
                Create
              </Button>
            </div>
          </div>
        </section>
      )}

      {/* Workspace Grid */}
      <section className="max-w-6xl mx-auto px-6 pb-20">
        {workspaces.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-16 text-center">
            <FolderOpen className="size-10 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground text-sm">
              No workspaces yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {workspaces.map((ws) => (
              <Link
                key={ws.id}
                href={`/workspace/${ws.id}`}
                className="group rounded-2xl border border-border bg-card p-5 hover:shadow-card-hover transition-all duration-200 block"
              >
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <FolderOpen className="size-5 text-primary" />
                  </div>
                  <ArrowRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity mt-1" />
                </div>
                <h3 className="font-heading text-lg font-semibold mt-3">{ws.name}</h3>
                <p className="text-sm text-muted-foreground mt-1 truncate">
                  {ws.boundDirs.join(", ")}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
