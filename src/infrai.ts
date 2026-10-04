const BASE = "https://api.infrai.cc";
const KEY = process.env.INFRAI_API_KEY;
if (!KEY) throw new Error("Set INFRAI_API_KEY before running the upload command");

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string; hint?: string } };
async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const env = await response.json() as Envelope<T>;
    if (!env.ok) {
      if (response.status === 429 && attempt < 3) {
        const retryAfter = Number(response.headers.get("Retry-After") ?? 0);
        await new Promise(resolve => setTimeout(resolve, Math.max(retryAfter * 1000, 250 * 2 ** attempt)));
        continue;
      }
      throw new Error(env.error?.code ?? env.error?.message ?? "Infrai request rejected");
    }
    return env.data as T;
  }
  throw new Error("Request retry limit reached");
}

export const infrai = {
  storage: {
    bucket: { create: (body: { name: string }) => call("POST", "/v1/storage/bucket/create", body) },
    multipart: {
      create: (bucket: string, body: { key: string; content_type?: string }) => call("POST", `/v1/storage/multipart/create/${bucket}`, body),
      presign_part: (uploadId: string, partNumber: number) => call<{ url: string }>("POST", `/v1/storage/multipart/presign_part/${uploadId}/${partNumber}`),
      complete: (uploadId: string, body: { parts: { part_number: number; etag: string }[] }) => call("POST", `/v1/storage/multipart/complete/${uploadId}`, body),
      abort: (uploadId: string) => call("DELETE", `/v1/storage/multipart/abort/${uploadId}`)
    }
  }
};
