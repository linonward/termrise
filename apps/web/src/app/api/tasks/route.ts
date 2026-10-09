import { getTaskService, toTaskDto } from "@/features/tasks/tasks";
import { readJson } from "@/server/http/respond";
import { userRoute } from "@/server/http/user-route";

export const GET = userRoute(async ({ user }) => {
  const service = getTaskService();
  await service.failStaleTasks(user.id);
  const tasks = await service.list(user.id);
  return Response.json({ items: tasks.map(toTaskDto) });
});

export const POST = userRoute(
  { rateLimit: "task" },
  async ({ request, user }) => {
    const task = await getTaskService().run(user.id, await readJson(request));
    return Response.json(toTaskDto(task), { status: 201 });
  },
);
