import type { FinancialStatements } from '../types/finance';

export async function consumeStatementStream(
  response: Response,
  onProgress: (data: FinancialStatements) => void,
  signal?: AbortSignal
): Promise<FinancialStatements> {
  if (!response.ok || !response.body) throw new Error(`财报请求失败：${response.status}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let final: FinancialStatements | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError');
    const event = JSON.parse(line);
    if (event.type === 'error') throw new Error(event.message || '财报拉取失败');
    if (event.type === 'progress') onProgress(event.data);
    if (event.type === 'complete') { final = event.data; onProgress(event.data); }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        consume(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
      }
      if (done) break;
    }
    consume(buffer);
    if (!final) throw new Error('财报连接中断，已收到的数据仍可查看，请重试补齐');
    return final;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
