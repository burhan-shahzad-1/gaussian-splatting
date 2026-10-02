import { Atmosphere } from "@/components/atmosphere";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import type { ReactNode } from "react";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-full flex-col">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Atmosphere />
      <SiteHeader />
      <div id="main" className="relative z-10 flex-1 pt-24 sm:pt-28">
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
