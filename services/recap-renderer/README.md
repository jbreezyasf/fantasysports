# Big Exec Recap Renderer

Primary beta renderer: **self-hosted PixiJS + FFmpeg**.

The web app owns authoritative matchup facts and deterministic recap scenes. This service only turns those stored scenes into MP4 media. It never determines scores, winners, awards, or story facts.

## Architecture

1. `recap_scripts` + `recap_scenes` are created by Big Exec after a matchup is final.
2. `recap_renders` contains independent 16:9 and 9:16 jobs.
3. This worker claims only jobs whose `renderer_provider = self_hosted`.
4. PixiJS draws deterministic animation frames in headless Chromium.
5. FFmpeg encodes frames as H.264 MP4 with `faststart`.
6. The worker stores the file on its persistent volume and publishes it from `/renders/...`.
7. `complete_recap_render` records the media URL back in Supabase.
8. The Big Exec recap page automatically replaces the queued state with a playable video.

## Managed-provider backup

The database deliberately stores `renderer_provider` (`self_hosted` or `managed`). `RecapRenderer` is a provider-neutral interface. A future managed renderer only needs to implement that interface; the scene schema and web UI do not change.

Big Exec should keep self-hosted as the default while beta volume is low. At scale, managed rendering can be used for overflow, incident fallback, or selected premium workloads without vendor lock-in.

## Deploy

Copy `.env.example` to `.env`, set the Supabase service-role credentials and a public media origin such as `https://media.bigexecfs.com`. For R2 storage, also set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, and `R2_BUCKET`, then run:

```bash
docker compose up -d --build
```

The container exposes port `8787`. Put HTTPS/reverse-proxy termination in front of it and point `RECAP_PUBLIC_BASE_URL` at that public origin.

Health check: `/health`.

## Security

The worker uses the Supabase service-role key and must never expose that key to the browser. Queue RPCs are revoked from anon/authenticated users. Only the worker claims/completes/fails renders.

## Beta storage

Finished media remain on the worker's persistent Docker volume. When the four R2 variables are configured, the worker also uploads each MP4 to R2 and records its public `RECAP_PUBLIC_BASE_URL` URL in Supabase.
