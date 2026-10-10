import { expect, it } from "vitest";

import { toTaskDto } from "./task-dto";
import type { Task } from "./task-service";

it("leaves out the request id and serializes the date", () => {
  const task = {
    id: "t1",
    userId: "u1",
    requestId: "secret-request",
    status: "SUCCEEDED",
    input: "in",
    output: "OUT",
    creditsCost: 1,
    errorCode: null,
    createdAt: new Date("2026-10-10T00:00:00Z"),
  } as unknown as Task;
  expect(toTaskDto(task)).toEqual({
    id: "t1",
    status: "SUCCEEDED",
    input: "in",
    output: "OUT",
    creditsCost: 1,
    errorCode: null,
    createdAt: "2026-10-10T00:00:00.000Z",
  });
});
