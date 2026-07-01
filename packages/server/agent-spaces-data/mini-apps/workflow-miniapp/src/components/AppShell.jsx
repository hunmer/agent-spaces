import { useRouter } from "@agent-spaces/ui";
import WelcomeRoute from "./WelcomeRoute";
import ApprovalRoute from "./ApprovalRoute";
import SurveyRoute from "./SurveyRoute";
import { getPayloadFromQuery } from "../utils/payload";

const { Button, Card, CardContent, Badge } = window.AgentSpacesUI;

const ROUTES = [
  { key: "welcome", label: "Welcome" },
  { key: "approval", label: "Approval" },
  { key: "survey", label: "Survey" },
];

export default function AppShell() {
  const router = useRouter();
  const currentRoute = ROUTES.some((item) => item.key === router.path[0]) ? router.path[0] : "welcome";
  const payload = getPayloadFromQuery(router.query);

  const navigate = (nextRoute) => {
    router.push([nextRoute], router.query);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 p-4">
        <Card className="border-border/60 bg-card/95 shadow-sm">
          <CardContent className="flex flex-col gap-4 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <Badge variant="secondary">workflow-miniapp demo</Badge>
                <div>
                  <h1 className="text-xl font-semibold">Workflow miniapp interaction demo</h1>
                  <p className="text-sm text-muted-foreground">
                    The route reads params from query.payload. Buttons submit results through postMessage so the workflow can continue.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {ROUTES.map((item) => (
                  <Button
                    key={item.key}
                    variant={currentRoute === item.key ? "default" : "outline"}
                    size="sm"
                    onClick={() => navigate(item.key)}
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-dashed border-border/70 bg-muted/30 p-3">
              <div className="mb-1 text-xs font-medium text-foreground">Payload received</div>
              <pre className="overflow-auto whitespace-pre-wrap break-all text-xs text-muted-foreground">
                {JSON.stringify(payload, null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>

        {currentRoute === "approval" ? (
          <ApprovalRoute payload={payload} />
        ) : currentRoute === "survey" ? (
          <SurveyRoute payload={payload} />
        ) : (
          <WelcomeRoute payload={payload} />
        )}
      </div>
    </main>
  );
}
