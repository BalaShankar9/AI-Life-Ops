import { Card, CardContent } from "@/components/ui/card";
import { Sparkles } from "lucide-react";

export function InsightCard({ text }: { text: string }) {
  return (
    <Card className="border-secondary/20 bg-secondary/5">
      <CardContent className="flex items-start gap-3 p-4">
        <Sparkles className="mt-0.5 h-4 w-4 text-secondary" />
        <p className="text-sm text-foreground/80">{text}</p>
      </CardContent>
    </Card>
  );
}
