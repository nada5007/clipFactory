export function InsightPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-sm text-muted-foreground">
      <p className="font-medium">{title}</p>
      <p>준비 중입니다.</p>
    </div>
  );
}
