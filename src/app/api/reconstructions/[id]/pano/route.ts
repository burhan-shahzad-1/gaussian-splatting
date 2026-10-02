import { jobErrorResponse } from "@/lib/jobs/http";
import { requireReconstruction } from "@/lib/jobs/service";
import { getObjectStream } from "@/lib/uploads/s3";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const job = await requireReconstruction(id);
    const objectKey = job.thumbnailKey?.endsWith("pano.jpg")
      ? job.thumbnailKey
      : job.outputSplatKey?.endsWith("pano.jpg")
        ? job.outputSplatKey
        : null;
    if (!objectKey) {
      return new Response("No panorama.", { status: 404 });
    }

    const range = request.headers.get("range");
    const object = await getObjectStream(objectKey, range);
    if (!object.Body) {
      return new Response("Empty panorama object.", { status: 502 });
    }

    const headers = new Headers();
    headers.set("Content-Type", object.ContentType || "image/jpeg");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, max-age=3600");
    if (object.ContentLength != null) {
      headers.set("Content-Length", String(object.ContentLength));
    }
    if (object.ContentRange) {
      headers.set("Content-Range", object.ContentRange);
    }

    return new Response(object.Body.transformToWebStream(), {
      status: range && object.ContentRange ? 206 : 200,
      headers,
    });
  } catch (error) {
    return jobErrorResponse(error);
  }
}
