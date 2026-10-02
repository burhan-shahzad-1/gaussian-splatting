import type { Metadata } from "next";
import { CaptureGuidance } from "@/components/upload/capture-guidance";
import { ReconstructionUpload } from "@/components/upload/reconstruction-upload";
import { Eyebrow, Reveal } from "@/components/ui/reveal";

export const metadata: Metadata = {
  title: "New scan",
};

export default function NewProjectPage() {
  return (
    <main className="page-shell py-12 sm:py-16">
      <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="max-w-3xl">
          <Reveal>
            <Eyebrow>New reconstruction</Eyebrow>
            <h1 className="type-title mt-3">Create a 3D room</h1>
            <p className="type-body mt-4 max-w-2xl">
              Upload a 360 capture or a slow walkthrough of one interior. Frames
              are extracted on the reconstructor and turned into a look-around
              environment — not a video you press play on.
            </p>
          </Reveal>
          <Reveal delay={2} className="mt-10">
            <ReconstructionUpload />
          </Reveal>
        </div>
        <Reveal delay={1}>
          <CaptureGuidance />
        </Reveal>
      </div>
    </main>
  );
}
