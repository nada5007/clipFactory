export function PlaceholderPage({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-bold">{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      <div className="mt-6 flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">
        준비 중입니다.
      </div>
    </div>
  );
}
