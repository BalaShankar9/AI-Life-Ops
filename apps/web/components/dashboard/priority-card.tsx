import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Priority = {
  title: string;
  category: string;
  effort: number;
  time_estimate_min: number;
};

export function PriorityCard({
  priority,
  rank,
}: {
  priority: Priority;
  rank: number;
}) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur transition-colors hover:border-primary/30">
      <CardContent className="flex items-center gap-4 p-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 font-mono text-sm font-bold text-primary">
          {rank}
        </span>
        <div className="flex-1">
          <p className="font-medium text-foreground">{priority.title}</p>
          <p className="text-xs text-muted-foreground">
            ~{priority.time_estimate_min}min &middot; Effort {priority.effort}/5
          </p>
        </div>
        <Badge variant="outline" className="text-xs">
          {priority.category}
        </Badge>
      </CardContent>
    </Card>
  );
}
