import { readJson } from "@/server/http/respond";
import { userRoute } from "@/server/http/user-route";
import { getUploadService } from "@/server/storage/storage";

export const POST = userRoute(
  { rateLimit: "upload" },
  async ({ request, user }) =>
    Response.json(
      await getUploadService().createUpload(user.id, await readJson(request)),
    ),
);
