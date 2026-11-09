import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({ label, value, hint, attention = false }: { label: string; value: number; hint: string; attention?: boolean }) {
  return (
    <Card className="gap-1 py-4 shadow-xs">
      <CardContent className="px-5">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={cn("num mt-1 font-mono text-3xl font-semibold tracking-tight", attention && value > 0 && "text-warning")}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}
