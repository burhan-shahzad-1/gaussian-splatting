import type { Metadata } from "next";
import { ImmersiveViewer } from "@/components/viewer/immersive-viewer";
import { getCatalogRoom } from "@/lib/catalog";
import { getRoomProject } from "@/lib/jobs/read";

type ViewerParams = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: ViewerParams;
}): Promise<Metadata> {
  const { id } = await params;
  const project = await getRoomProject(id);
  const demo = getCatalogRoom(id);
  return { title: project?.name ?? demo?.name ?? "Viewer" };
}

export default async function ViewerPage({ params }: { params: ViewerParams }) {
  const { id } = await params;
  const initialProject = await getRoomProject(id);
  return <ImmersiveViewer id={id} initialProject={initialProject} />;
}
