import { CatalogCard } from "@/components/landing/catalog-card";
import { Button } from "@/components/ui/button";
import { Eyebrow, Reveal } from "@/components/ui/reveal";
import { CATALOG_ROOMS } from "@/lib/catalog";

export function ExampleRooms() {
  const [featured, ...rest] = CATALOG_ROOMS;

  return (
    <section id="examples" className="page-shell scroll-mt-28 py-20 sm:py-28">
      <Reveal>
        <Eyebrow>Example reconstruction</Eyebrow>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
          <h2 className="type-title max-w-2xl">What a finished interior feels like in the studio.</h2>
          <Button href="/projects" variant="ghost" size="sm">
            Open studio
          </Button>
        </div>
        <p className="type-body mt-4 max-w-xl">
          These are design studies, not scans from an account. Your rooms appear
          in the studio only after you upload a 360 or walkthrough.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-5">
        {featured ? (
          <Reveal delay={2}>
            <CatalogCard room={featured} />
          </Reveal>
        ) : null}
        {rest.map((room) => (
          <Reveal key={room.id} delay={3}>
            <CatalogCard room={room} />
          </Reveal>
        ))}
      </div>
    </section>
  );
}
