# CueBall

A shared watch-party queue for YouTube. Everyone in a room adds videos from
their own phone/laptop and votes on what plays next; the queue's order
stays synced in real time, and (optionally) mirrors a real YouTube
playlist the host can just open on their TV.

Built as a portfolio piece focused on real-time systems and WebSocket
architecture (React + Node.js), with a guest-first, two-tier auth model.

> Status: rooms (create/join/presence), queue + live voting, YouTube
> playlist sync, and optional real accounts (email/password, with room
> history) are all working end to end. The guest/participant flow still
> works fully without an account.

## How it works

- A host creates a room and gets a shareable join code/link.
- Guests join with just a nickname, no account required.
- Anyone in the room can paste a YouTube URL to add it to the queue,
  as long as it's 12 minutes or shorter. Participants upvote/downvote
  queued items; the queue reorders live by score, broadcast to everyone
  in the room over Socket.io.
- The host can remove a participant (e.g. a duplicate from someone
  rejoining on another device), which disconnects them from the room
  immediately.
- The host can optionally connect their YouTube account (OAuth). CueBall
  then creates a real, unlisted YouTube playlist for the room and keeps it
  in sync as the queue changes, so the actual video can just play from the
  native YouTube app on a TV, with a link and QR code shown in the room
  for anyone to open it directly.
- Presence (who's connected right now) is tracked in Redis so reconnecting
  is instant and doesn't lose your spot in the room.
- Signing up (email/password, or "Continue with Google") is optional. It
  links your name to rooms you create or join, so you get a "your rooms"
  history to jump back into, but it's never required to use the app.

Earlier drafts of this project explored two other approaches for the
"plays on the TV" part: embedding a YouTube IFrame Player synced across
every browser via a playback heartbeat, and driving a Chromecast session
via the Cast SDK. We landed on real playlist sync instead, since it's the
simplest approach that actually matches the intended use case (add from
your phone, play from the TV's own YouTube app).

## Tech stack

- **Server**: Node.js, Express, Socket.io
- **Database**: PostgreSQL via Prisma
- **Cache / pub-sub**: Redis, tracks live presence for instant reconnects,
  and backs the Socket.io Redis adapter for multi-instance scaling
- **Web**: React via Next.js (App Router), Tailwind CSS + a small
  hand-integrated shadcn-style UI kit, `lucide-react` icons
- **Video**: YouTube only. Pasted links are resolved via the oEmbed
  endpoint for the in-app queue, checked against a 12-minute length cap
  via the YouTube Data API v3 (API key, optional), and optionally synced
  to a real playlist via the same Data API (OAuth)
- **Auth**: guests join with a nickname only (JWT-based participant
  session token for reconnect); optional real accounts (email/password
  bcrypt-hashed, or Google sign-in, both issuing the same JWT session
  token) link a participant to a room history
- **Local dev**: Docker Compose (Postgres, Redis, server, web)

## Project structure

```
apps/
  server/
    src/
      sockets/         room, queue, and YouTube playlist-sync handlers
      routes/          REST endpoints (room create/preview, YouTube OAuth)
      services/        room/queue services, YouTube oEmbed + Data API + OAuth
      redis/           Redis client, presence tracking
    prisma/            schema.prisma, migrations
  web/
    app/               Next.js App Router pages
    components/        one folder per component (Component.tsx + test + index.ts)
      ui/              small shadcn-style primitives (Button, Card, Input...)
    context/           RoomContext (socket lifecycle), ThemeContext
    api/               REST client
    utils/             helpers (session storage, JWT decode, cn())
packages/
  shared/              TS types and socket event contracts shared between
                       server and web (single source of truth)
docker-compose.yml
```

## Getting started

### Prerequisites

- Node.js 20+
- Docker (for Postgres and Redis, or the whole stack)

### Run everything with Docker Compose

```bash
docker compose up
```

This starts Postgres, Redis, the server (`:4000`), and the web app
(`:3000`).

### Run locally against Dockerized Postgres/Redis

```bash
npm install

docker compose up -d postgres redis

cp apps/server/.env.example apps/server/.env
cp apps/web/.env.example apps/web/.env

npm run --workspace=apps/server prisma:migrate

npm run dev
```

`npm run dev` runs the server and web app together;
`npm run dev:server` / `npm run dev:web` run them individually.

### Google OAuth (optional)

One Google Cloud OAuth client powers two independent, optional features.
The app works fully without either: room creation/join/queue/voting never
require Google at all.

- **YouTube playlist sync**: lets a room host mirror the queue to a real
  YouTube playlist. Skipped if unconfigured; the connect button 503s.
- **"Continue with Google" sign-in**: an alternative to email/password for
  the optional account system. Skipped if unconfigured; the button
  redirects back with an error instead of crashing.

Setup:

1. [console.cloud.google.com](https://console.cloud.google.com) → create a
   project → APIs & Services → Library → enable **YouTube Data API v3**
   (only needed for playlist sync, not for sign-in).
2. APIs & Services → OAuth consent screen → User type **External** → fill
   in an app name/contact email → add scopes `.../auth/youtube` and
   `openid`/`email`/`profile` → under **Test users**, add the Google
   account(s) you'll test with (stay in "Testing" status, no Google
   review needed for personal use).
3. APIs & Services → Credentials → Create Credentials → **OAuth client
   ID** → Application type **Web application** → Authorized redirect
   URIs, add both:
   - `http://localhost:4000/api/youtube/callback`
   - `http://localhost:4000/api/auth/google/callback`
4. Copy the Client ID/Secret into `apps/server/.env`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   GOOGLE_REDIRECT_URI=http://localhost:4000/api/youtube/callback
   GOOGLE_AUTH_REDIRECT_URI=http://localhost:4000/api/auth/google/callback
   ```

Either feature can be left unconfigured independently: they only share
the client credentials, not a config flag.

### Video length check (optional)

Adding a video over 12 minutes is rejected with an error, but this needs
a video's duration, which the oEmbed endpoint used for title/thumbnail
doesn't return. It's looked up via the YouTube Data API v3 instead, using
a plain API key (not the OAuth client above):

1. Same Google Cloud project → APIs & Services → Credentials → Create
   Credentials → **API key**. Optionally restrict it to YouTube Data API
   v3 (already enabled in the OAuth setup above).
2. Copy it into `apps/server/.env`:
   ```
   YOUTUBE_API_KEY=...
   ```

Left unset, the length check is skipped entirely and videos of any
length are allowed through, rather than blocking adds altogether.

## Data model

- **User** (optional account): email, display name, password hash (null
  for Google-only accounts); can host or join rooms, which then show up
  in that account's room history
- **Room**: join code, host, YouTube playlist + OAuth tokens (once
  connected)
- **Participant**: a user or guest attached to a room
- **QueueItem**: a queued YouTube video, added by a participant, with a
  vote-derived score and (once synced) its YouTube playlist item id
- **Vote**: one participant's +1/-1 on a queue item (unique per
  participant per item)

See [`apps/server/prisma/schema.prisma`](apps/server/prisma/schema.prisma)
for the full schema.

## Roadmap

Not built yet:

- **Production deployment**: hosting for the server/web apps, a
  production Postgres/Redis, and a second set of OAuth redirect URIs for
  the live domain.
