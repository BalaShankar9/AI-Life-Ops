import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SafetyPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-2xl font-bold text-foreground">Safety</h1>
          <p className="text-sm text-muted-foreground">
            AI Life Ops provides structured decision support. It is not medical,
            mental health, or legal advice.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">What this is</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>Deterministic planning support for high-pressure days.</li>
              <li>Clear, explainable recommendations based on your inputs.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base text-foreground">What this is not</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>Not a medical, mental health, or crisis service.</li>
              <li>Not a diagnosis, therapy, or legal advice platform.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base text-foreground">Crisis-safe policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              If a check-in note suggests self-harm or imminent danger, the app
              pauses normal planning and shows a safety notice encouraging immediate
              support.
            </p>
            <p className="font-semibold text-foreground">
              If you are in immediate danger
            </p>
            <p>
              Call your local emergency number or contact a trusted person right now.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
