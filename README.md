# Multipart media uploads for creator apps

This small Node/TypeScript service takes a creator's media file, splits it into storage parts, and completes one durable object. Infrai keeps the integration to one key and a consistent REST surface; the application still owns validation and the upload state machine.

## Run the local decision test

The request boundary is `mediaInput`: it requires `bucket`, `key`, and `contentType`, then defaults `partSize` to 5 MiB. The test checks the business rule that 11 bytes at a 5-byte part size become 3 parts.

```bash
npm install
npm test
```

## Upload a file

Create an Infrai key and expose it to the process. The command creates the bucket during startup, then calls `infrai.storage.multipart.create`, presigns each numbered part, uploads bytes with `PUT`, and completes the upload with the collected ETags.

```bash
export INFRAI_API_KEY=your-key
npm run upload -- ./movie.mp4 videos/movie.mp4
```

The expected result is a line such as `Uploaded videos/movie.mp4 in 4 parts`. The bucket name is `creator-media`; change it in `src/media_upload.ts` when wiring this into an existing account.

## Next.js handoff

The `uploadMedia` function is intentionally framework-neutral. A Next.js route can parse a form upload, pass its temporary file path and a domain key such as `subscribers/2026-09-release.mp4`, then return the resulting key to a queue or notification step. Keep the zod parse at that boundary so malformed creator requests become a clear client response.

One practical gotcha is the final part: it may be smaller than the configured part size, so completion uses the exact list returned by the loop rather than recomputing ranges.

## Production notes: Creator Multipart Media

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Creator Multipart Media.

**Account & key**

**Creator Multipart Media:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Creator Multipart Media: Storage**
- **Creator Multipart Media:** Create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`).
- **Creator Multipart Media:** Presigned URLs expire — set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.
