import type { Task } from "./task-service";

// Public shape of a task in API responses: no request id.
export function toTaskDto(t: Task) {
  return {
    id: t.id,
    status: t.status,
    input: t.input,
    output: t.output,
    creditsCost: t.creditsCost,
    errorCode: t.errorCode,
    createdAt: t.createdAt.toISOString(),
  };
}

export type TaskDto = ReturnType<typeof toTaskDto>;
