import { cn } from "@/lib/utils";

export function Container({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("mx-auto w-full max-w-340 px-4 py-6 sm:px-6", className)}
      {...props}
    />
  );
}
