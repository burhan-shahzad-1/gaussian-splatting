import { SpatialHero } from "@/components/landing/spatial-hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { ExampleRooms } from "@/components/landing/example-rooms";
import { Button } from "@/components/ui/button";
import { GlassPanel } from "@/components/ui/panel";
import { Eyebrow, Reveal } from "@/components/ui/reveal";

const tech = ["360 capture", "Frame extraction", "Look around"];

export default function HomePage() {
  return (
    <main>
      <section className="page-shell grid items-start gap-12 pt-6 pb-16 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.22fr)] lg:items-stretch lg:gap-12 lg:pt-2 lg:pb-20 xl:min-h-[calc(100dvh-7.5rem)]">
        <div className="lg:self-center">
          <Reveal>
            <Eyebrow>3D rooms</Eyebrow>
          </Reveal>
          <Reveal delay={1}>
            <h1 className="type-display mt-5 max-w-[12ch]">
              Turn a room capture into a 3D environment you can look around.
            </h1>
          </Reveal>
          <Reveal delay={2}>
            <p className="type-body mt-6 max-w-md">
              Upload a 360 or walkthrough of one interior. We extract frames
              and build a 3D environment. Drag to look left, right, up, and
              down — you are not watching the video.
            </p>
          </Reveal>
          <Reveal delay={3}>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Button href="/projects/new" variant="primary">
                Create 3D scan
              </Button>
              <Button href="#how-it-works" variant="secondary">
                See how it works
              </Button>
            </div>
          </Reveal>
          <Reveal delay={4}>
            <ul className="mt-10 flex flex-wrap gap-2">
              {tech.map((item) => (
                <li key={item} className="tech-chip">
                  {item}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>

        <Reveal delay={2} className="h-full min-h-[380px] lg:self-stretch">
          <SpatialHero />
        </Reveal>
      </section>

      <HowItWorks />
      <ExampleRooms />

      <section className="page-shell pb-24">
        <Reveal>
          <GlassPanel className="final-cta rounded-[var(--radius-lg)] px-6 py-12 sm:px-12 sm:py-16">
            <Eyebrow>Begin with one room</Eyebrow>
            <h2 className="type-title mt-4 max-w-2xl">
              Film it once. Step back into the room whenever you need the space.
            </h2>
            <p className="type-body mt-4 max-w-xl">
              Start with a 360 clip of one room. Frames become a look-around
              environment, not a player for the original file.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button href="/projects/new" variant="copper">
                Create 3D scan
              </Button>
            </div>
          </GlassPanel>
        </Reveal>
      </section>
    </main>
  );
}
