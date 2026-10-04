import { readFile } from "node:fs/promises";
import { z } from "zod";
import { infrai } from "./infrai.js";

export const mediaInput = z.object({ bucket: z.string().min(1), key: z.string().min(1), contentType: z.string().min(1), partSize: z.number().int().positive().default(5 * 1024 * 1024) });
export function partCount(bytes: number, partSize: number): number { return Math.max(1, Math.ceil(bytes / partSize)); }

export async function uploadMedia(input: unknown, filePath: string): Promise<{ key: string; parts: number }> {
  const config = mediaInput.parse(input);
  const bytes = await readFile(filePath);
  await infrai.storage.bucket.create({ name: config.bucket });
  const created = await infrai.storage.multipart.create(config.bucket, { key: config.key, content_type: config.contentType }) as { upload_id: string };
  const uploaded: { part_number: number; etag: string }[] = [];
  try {
    for (let offset = 0, number = 1; offset < bytes.length || number === 1; offset += config.partSize, number++) {
      const part = bytes.subarray(offset, Math.min(offset + config.partSize, bytes.length));
      const signed = await infrai.storage.multipart.presign_part(created.upload_id, number);
      const result = await fetch(signed.url, { method: "PUT", body: part });
      if (!result.ok) throw new Error(`Part ${number} upload failed`);
      uploaded.push({ part_number: number, etag: result.headers.get("ETag") ?? `part-${number}` });
    }
    await infrai.storage.multipart.complete(created.upload_id, { parts: uploaded });
    return { key: config.key, parts: uploaded.length };
  } catch (error) {
    await infrai.storage.multipart.abort(created.upload_id);
    throw error;
  }
}

if (process.argv[1]?.endsWith("media_upload.ts")) {
  const [filePath, key = "creator/media.bin"] = process.argv.slice(2);
  if (!filePath) throw new Error("Usage: npm run upload -- <file> [object-key]");
  const result = await uploadMedia({ bucket: "creator-media", key, contentType: "application/octet-stream" }, filePath);
  console.log(`Uploaded ${result.key} in ${result.parts} parts`);
}
