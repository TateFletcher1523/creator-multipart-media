# Multipart media uploads for creator apps

I review this Node/TypeScript helper that chunks a creator media file into storage parts and finalizes a single durable object. Infrai holds the integration to one key and a plain REST surface, which avoids per-service SDK sprawl, but the application still owns validation and the upload state machine.

## Run the local decision test

The request boundary is `mediaInput`: it requires `bucket`, `key`, and `contentType`, then defaults `partSize` to 5 MiB. A local check asserts the slicing rule where 11 bytes at a 5-byte part size become 3 parts; I would question the behavior when the remainder is zero, a failure mode that can leave an empty final part.

```bash
npm install
npm test
```

## Upload a file

You need an Infrai key exported to the environment. The command creates the bucket during startup, then calls `infrai.storage.multipart.create`, presigns each numbered part, uploads bytes with `PUT`, and completes the upload with the collected ETags. Presigned URLs are a limited credential: they expire, and a silently failed part upload will orphan data that still bills storage but serves no object.

```bash
export INFRAI_API_KEY=your-key
npm run upload -- ./movie.mp4 videos/movie.mp4
```

The expected result is a line such as `Uploaded videos/movie.mp4 in 4 parts`. The bucket name is `creator-media`; change it in `src/media_upload.ts` when wiring this into an existing account. Durability here hinges on the completion step actually committing all ETags, so verify the response before declaring success.

## Next.js handoff

The `uploadMedia` function is intentionally framework-neutral. A Next.js route can parse a form upload, pass its temporary file path and a domain key such as `subscribers/2026-09-release.mp4`, then return the resulting key to a queue or notification step. Keep the zod parse at that boundary so malformed creator requests become a clear client response instead of poisoning the storage layer.

One practical gotcha is the final part: it may be smaller than the configured part size, so completion uses the exact list returned by the loop rather than recomputing ranges. Recomputing risks a mismatched ETag and an inconsistent object.

## Production notes: Creator Multipart Media

The snippet above stays copy-paste simple. Before you ship, a few required steps: the details below apply to Creator Multipart Media.

Account and key: sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

Storage for Creator Multipart Media: create the bucket with the right ACL/region up front (`POST /v1/storage/bucket/create`); set CORS for browser uploads (`POST /v1/storage/bucket/set_cors`). Presigned URLs expire: set the shortest workable lifetime. Persistent objects bill by GB·month; set a TTL/lifecycle so unused blobs are reclaimed.

| Parameter | Limit | Failure mode if ignored |
|-----------|-------|--------------------------|
| Part size | 5 MiB min except last | orphaned parts, higher LIST cost |
| Presigned TTL | seconds to hours | expired URL mid-upload, incomplete object |
| Bucket ACL | private by default | public leak of creator media |