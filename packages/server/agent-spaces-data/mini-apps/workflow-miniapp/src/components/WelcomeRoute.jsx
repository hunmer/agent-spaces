import { submitWorkflowMiniApp } from "../utils/host";

const { Button, Card, CardContent, Badge } = window.AgentSpacesUI;

export default function WelcomeRoute({ payload }) {
  const title = typeof payload.title === "string" && payload.title ? payload.title : "Welcome to the miniapp";
  const summary = typeof payload.summary === "string" && payload.summary
    ? payload.summary
    : "Use this route to show a summary and let the user confirm the next step.";
  const tags = Array.isArray(payload.tags) ? payload.tags.filter((item) => typeof item === "string") : [];

  return (
    <Card className="border-border/60">
      <CardContent className="space-y-4 p-5">
        <div className="space-y-2">
          <div className="text-sm text-muted-foreground">Route 1 /welcome</div>
          <h2 className="text-2xl font-semibold">{title}</h2>
          <p className="text-sm leading-6 text-muted-foreground">{summary}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {tags.length > 0 ? tags.map((tag) => (
            <Badge key={tag} variant="outline">{tag}</Badge>
          )) : <Badge variant="outline">No extra tags</Badge>}
        </div>

        <Button
          onClick={() => submitWorkflowMiniApp({
            route: "welcome",
            action: "started",
            receivedTitle: title,
            viewedAt: new Date().toISOString(),
          })}
        >
          Start and continue workflow
        </Button>
      </CardContent>
    </Card>
  );
}
