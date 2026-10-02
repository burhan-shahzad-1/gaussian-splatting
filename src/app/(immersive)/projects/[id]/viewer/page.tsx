import { redirect } from "next/navigation";

export default async function LegacyViewerPage({
  params,
}: PageProps<"/projects/[id]/viewer">) {
  const { id } = await params;
  redirect(`/viewer/${id}`);
}
