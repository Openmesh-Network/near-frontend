import { cn } from "@/lib/utils";

export function Section({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-col", className)}>
      <Title title={title} />
      {children}
    </div>
  );
}

export function Title({
  title,
  className,
}: {
  title: string;
  className?: string;
}) {
  return (
    <span
      id={title.replace(" ", "_")}
      className={cn("text-xl font-semibold mb-1", className)}
    >
      {title}
    </span>
  );
}
