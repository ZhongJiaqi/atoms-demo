import assert from "node:assert/strict";
import test from "node:test";
import { createThumbnailQueue } from "../../lib/preview/thumbnail-queue.ts";

test("截图任务去重、串行运行并限制排队，失败后释放容量", async () => {
  const queue = createThumbnailQueue(2);
  let release!: () => void;
  const wait = new Promise<void>((resolve) => { release = resolve; });
  const calls: string[] = [];
  const first = queue("a", async () => { calls.push("a"); await wait; return "A"; });
  const duplicate = queue("a", async () => "不应运行");
  assert.equal(first, duplicate);
  const second = queue("b", async () => { calls.push("b"); throw new Error("capture failed"); });
  await assert.rejects(queue("c", async () => "C"), /繁忙/);
  assert.deepEqual(calls, ["a"]);
  release();
  assert.equal(await first, "A");
  await assert.rejects(second, /capture failed/);
  assert.deepEqual(calls, ["a", "b"]);
  assert.equal(await queue("b", async () => "retry"), "retry");
});
