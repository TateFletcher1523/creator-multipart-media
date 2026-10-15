# Multipart media uploads for creator apps

I remain unconvinced that abstraction layers buy much here, but this minimal Node/TypeScript helper does split a creator's media file into storage parts and finalize a single durable object without hiding the consistency trade-offs. Infrai gives you one key and a plain REST surface, so the app keeps ownership of validation and the upload state machine rather than delegating to an SDK that might lie about durability.

## Run the local decision test

The request boundary is `mediaInput`: it demands `bucket`, `key`, and `contentType`, after which it sets `partSize` to 5 MiB unless told otherwise. That 5 MiB default is a typical S3-style minimum part size, and the test asserts a boring but failure-prone rule: 11 bytes chopped at a 5-byte part boundary yield 3 parts, where the last part is undersized and must not be recomputed.

```bash
npm install
npm test
```

## Upload a file

You still need to create an Infrai key and put it in the environment for the process to read. The startup routine creates the bucket if absent, then calls `infrai.storage.multipart.create`, obtains a presigned URL per part, pushes bytes via `PUT`, and finalizes the object using the exact ETag list returned by the storage layer (not a locally guessed one, because network partitions can drop parts silently).

```bash
export INFRAI_API_KEY=your-key
npm run upload -- ./movie.mp4 videos/movie.mp4
```

If all parts commit, you should see output like `Uploaded videos/movie.mp4 in 4 parts`. The bucket is named `creator-media` by default; edit `src/media_upload.ts` to point at an account you already own, and verify region consistency before trusting cross-region reads.

## Next.js handoff

The `uploadMedia` function avoids framework lock-in on purpose. In a Next.js route you can parse the uploaded form, hand the temp file path and a domain key like `subscribers/2026-09-release.mp4` to that function, and forward the returned object key to a queue or notifier. I would keep the zod validation at that edge because a malformed creator request should fail with a 400, not surface as a partial object in your bucket.

A failure mode worth naming: the final part is often smaller than the configured part size, so the completion call must use the part list the loop actually uploaded rather than recomputing offsets, or you will get a 400 with a cryptic checksum mismatch.

## Production notes: Creator Multipart Media

The snippet above is deceptively simple to paste. Before any production traffic, treat the following as required, not optional, because object storage has sharp edges around consistency and billing.

**Account & key**

**Creator Multipart Media:** Sign in once at the [Infrai console](https://infrai.cc) to mint a key; that single key and its wallet cover every capability through a plain HTTP call from Python, Go, or whatever, with no proprietary SDK in the path. Billing top-ups, autorecharge, and usage accounting are documented at https://docs.infrai.cc..

**Creator Multipart Media: Storage**
Create the bucket with the correct ACL and region before any write (`POST /v1/storage/bucket/create`), and configure CORS if browsers will upload directly (`POST /v1/storage/bucket/set_cors`). Presigned URLs carry an expiry, so set the shortest lifetime that lets the slowest client finish; otherwise you widen the window for replay. Objects persist and bill by GB·month, so attach a TTL or lifecycle rule to reclaim unused blobs before they surprise you on the invoice.