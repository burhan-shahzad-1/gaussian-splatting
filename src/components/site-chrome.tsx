"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/panel";
import { cn } from "@/lib/cn";

const links = [
  { href: "/projects", label: "Rooms" },
  { href: "/#how-it-works", label: "How it works" },
];

function isActive(pathname: string, href: string) {
  if (href === "/projects") {
    return pathname === "/projects";
  }
  return false;
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="pointer-events-none fixed top-0 right-0 left-0 z-30 px-[var(--page-x)] pt-4 sm:pt-5">
      <GlassPanel className="nav-island pointer-events-auto mx-auto flex max-w-[1120px] flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center justify-between gap-4 px-3 py-1.5">
          <Link href="/" className="flex items-baseline gap-3">
            <span className="font-serif text-[1.35rem] leading-none tracking-tight">GSplat</span>
            <span className="type-mono hidden md:inline">Room reconstruction</span>
          </Link>
          <button
            type="button"
            className="btn btn-ghost btn-sm sm:hidden"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls={menuId}
          >
            Menu
          </button>
        </div>

        <nav
          id={menuId}
          className={cn(
            "flex flex-col gap-1 px-2 pb-3 sm:flex-row sm:items-center sm:pb-0 sm:pr-1",
            open ? "flex" : "hidden sm:flex",
          )}
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className={cn(
                "rounded-full px-3 py-2 text-sm transition-colors duration-300",
                isActive(pathname, link.href)
                  ? "bg-white/8 text-paper"
                  : "text-mist hover:text-paper",
              )}
            >
              {link.label}
            </Link>
          ))}
          <Button href="/projects/new" variant="copper" size="sm" className="sm:ml-2">
            Create 3D Scan
          </Button>
        </nav>
      </GlassPanel>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative z-10 mt-auto">
      <div className="rule mx-auto max-w-[1120px]" />
      <div className="page-shell flex flex-col gap-2 py-8 text-sm text-mist sm:flex-row sm:items-center sm:justify-between">
        <p>Phone capture in. Interactive space out. Draft reconstruction stays off Next.js.</p>
        <p className="type-mono">GSplat · studio</p>
      </div>
    </footer>
  );
}
