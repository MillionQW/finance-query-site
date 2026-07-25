export class SingleFlight {
  private readonly requests = new Map<string, Promise<unknown>>();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.requests.get(key) as Promise<T> | undefined;
    if (existing) {
      return existing;
    }

    const request = Promise.resolve()
      .then(task)
      .finally(() => {
        if (this.requests.get(key) === request) {
          this.requests.delete(key);
        }
      });
    this.requests.set(key, request);
    return request;
  }
}
