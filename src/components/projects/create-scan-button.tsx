import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function CreateScanButton({
  size = "md",
  variant = "copper",
  className,
}: {
  size?: "md" | "sm";
  variant?: "primary" | "copper" | "secondary" | "ghost";
  className?: string;
}) {
  return (
    <Button href="/projects/new" variant={variant} size={size} className={cn(className)}>
      Create 3D scan
    </Button>
  );
}
