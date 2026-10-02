import type { Metadata } from "next";
import { ReconstructionTheater } from "@/components/reconstruction/reconstruction-theater";
import { getRoomProject } from "@/lib/jobs/read";

export async function generateMetadata({
  params,
}: PageProps<"/projects/[id]">): Promise<Metadata> {
  const { id } = await params;
  const project = await getRoomProject(id);
  return { title: project?.name ?? "Room" };
}

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const initialProject = await getRoomProject(id);
  return <ReconstructionTheater id={id} initialProject={initialProject} />;
}
