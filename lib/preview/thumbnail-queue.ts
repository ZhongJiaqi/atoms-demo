export function createThumbnailQueue(capacity: number) {
  const jobs = new Map<string, Promise<unknown>>();
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(key: string, task: () => Promise<T>): Promise<T> => {
    const existing = jobs.get(key);
    if (existing) return existing as Promise<T>;
    if (jobs.size >= capacity) return Promise.reject(new Error("截图服务繁忙，请稍后重试。"));
    const job = tail.then(task).finally(() => { jobs.delete(key); });
    jobs.set(key, job);
    tail = job.catch(() => undefined);
    return job;
  };
}
