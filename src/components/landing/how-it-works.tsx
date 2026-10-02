import { Eyebrow, Reveal } from "@/components/ui/reveal";

const steps = [
  {
    index: "01",
    title: "Capture the room",
    copy: "Film one interior, ideally as 360. Stand in the center, keep the camera steady, and cover every wall.",
  },
  {
    index: "02",
    title: "Extract frames",
    copy: "The reconstructor keeps your stills. Whatever you filmed — a corner or the full room — is what you look around in.",
  },
  {
    index: "03",
    title: "Look around in 3D",
    copy: "Open the environment and drag left, right, up, and down. You inspect the room — the source video is not what you watch.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="page-shell scroll-mt-28 py-20 sm:py-28">
      <Reveal>
        <Eyebrow>How it works</Eyebrow>
        <h2 className="type-title mt-4 max-w-2xl">From a room capture to a 3D environment you can look around in.</h2>
      </Reveal>

      <ol className="mt-12 grid gap-0 md:grid-cols-3 md:gap-8">
        {steps.map((step, index) => (
          <li key={step.index} className="how-step">
            <Reveal delay={Math.min(index + 1, 5) as 1 | 2 | 3}>
              <p className="type-mono">{step.index}</p>
              <h3 className="type-heading mt-5">{step.title}</h3>
              <p className="type-caption mt-3 max-w-sm">{step.copy}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}
