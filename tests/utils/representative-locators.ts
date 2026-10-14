import type { FrameLocator, Locator } from "@playwright/test";

export async function expenseTotal(frame: FrameLocator): Promise<Locator> {
  const identified = frame.getByTestId("expense-total");
  if (await identified.count()) return identified;
  const label = frame.getByText("总支出", { exact: true });
  const parentTag = await label.evaluate(node => node.parentElement?.tagName);
  if (!parentTag || parentTag === "BODY" || parentTag === "HTML") throw new Error("总支出标签的父元素不能是页面根节点");
  return label.locator("..");
}
