# CueBall

A shared watch-party queue for YouTube. Multiple people join a room, queue
up videos, vote to reorder the queue, and watch in sync — play, pause, and
seek are mirrored across everyone in the room in real time.

Built as a portfolio piece focused on real-time systems, WebSocket
architecture, and a two-tier auth model (guest-first, optional accounts).

> Status: early scaffolding — monorepo structure, Docker Compose, and the
> initial Prisma schema are in place. Room/queue/playback logic is next.

## How it works

- A host creates a room and gets a shareable join code/link.
- Guests join with just a nickname — no account required. People who want
  to persist room history or host recurring rooms can create a real
  account (JWT-based) instead.
- Anyone in the room can paste a YouTube URL to add it to the queue.
- Participants upvote/downvote queued items; the queue reorders by score.
- One participant is the "controller" at a time (starts as the host, can
  hand off to anyone else in the room). Only the controller's
  play/pause/seek actions drive playback for the room.
- If the controller disconnects, control reassigns to the next connected
  participant after a short grace period, so brief network blips don't
  trigger a handoff.
- The server broadcasts a playback heartbeat every ~2-3s
  (`{ trackId, position, isPlaying }`); clients only reconcile/seek when
  drift exceeds ~1.5s, to keep playback smooth instead of jittery.

## Tech stack

- **Server**: Node.js, Express, Socket.io
- **Database**: PostgreSQL via Prisma
- **Cache / pub-sub**: Redis — caches live room state (current track,
  playback position, controller) for instant reconnects, and backs the
  Socket.io Redis adapter for multi-instance scaling
- **Web**: React via Next.js (App Router)
- **Video**: YouTube only, via the YouTube IFrame Player API
- **Auth**: guests join with a nickname only; optional JWT-based accounts
  for persistence
- **Local dev**: Docker Compose (Postgres, Redis, server, web)

## Project structure

```
apps/
  server/            Express + Socket.io backend
    src/
      sockets/        room, queue, and playback event handlers
      routes/         REST endpoints (auth, room creation, history)
      services/        roomService, queueService, youtubeService
      redis/           Redis client + Socket.io adapter setup
    prisma/            schema.prisma, migrations
  web/               Next.js (App Router) frontend
    app/
    components/
    lib/               socket client, api client
packages/
  shared/            TS types and socket event contracts shared between
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

## Data model

- **User** (optional account): email, password hash, display name
- **Room**: join code, host, current controller, current track, playback
  state/position
- **Participant**: a user or guest attached to a room
- **QueueItem**: a queued YouTube video, added by a participant, with a
  vote-derived score
- **Vote**: one participant's +1/-1 on a queue item (unique per
  participant per item)

See [`apps/server/prisma/schema.prisma`](apps/server/prisma/schema.prisma)
for the full schema.
