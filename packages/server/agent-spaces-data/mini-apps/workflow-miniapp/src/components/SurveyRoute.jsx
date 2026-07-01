import { useState } from "react";
import { submitWorkflowMiniApp } from "../utils/host";

const { Button, Card, CardContent, Textarea } = window.AgentSpacesUI;

export default function SurveyRoute({ payload }) {
  const question = typeof payload.question === "string" && payload.question
    ? payload.question
    : "How should the workflow proceed next?";
  const choices = Array.isArray(payload.choices) && payload.choices.length > 0
    ? payload.choices.filter((item) => typeof item === "string")
    : ["Continue", "Manual review", "Handle later"];
  const [selected, setSelected] = useState(choices[0] || "");
  const [note, setNote] = useState(typeof payload.note === "string" ? payload.note : "");

  return (
    <Card className="border-border/60">
      <CardContent className="space-y-4 p-5">
        <div>
          <div className="text-sm text-muted-foreground">Route 3 /survey</div>
          <h2 className="text-2xl font-semibold">{question}</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          {choices.map((choice) => (
            <Button
              key={choice}
              variant={selected === choice ? "default" : "outline"}
              size="sm"
              onClick={() => setSelected(choice)}
            >
              {choice}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">Extra note</div>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional note for the workflow"
            className="min-h-24"
          />
        </div>

        <Button
          onClick={() => submitWorkflowMiniApp({
            route: "survey",
            selectedChoice: selected,
            note,
            answeredAt: new Date().toISOString(),
          })}
        >
          Submit answer and continue
        </Button>
      </CardContent>
    </Card>
  );
}
