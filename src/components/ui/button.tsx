import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

type Variant = "primary" | "copper" | "secondary" | "ghost";

type ButtonProps = {
  href?: string;
  variant?: Variant;
  size?: "md" | "sm";
  className?: string;
  children: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>;

const variants: Record<Variant, string> = {
  primary: "btn-primary",
  copper: "btn-copper",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
};

export function Button({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  const classes = cn("btn", variants[variant], size === "sm" && "btn-sm", className);

  if (href?.startsWith("#")) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
      </Link>
    );
  }

  return (
    <button className={classes} {...props}>
      {children}
    </button>
  );
}
