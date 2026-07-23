import "dotenv/config"
import { createServer } from "node:http"
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express"
import cors from "cors"
import { Server } from "socket.io"
import { createAdapter } from "@socket.io/redis-adapter"
import { redis } from "./redis/client.js"
import { roomsRouter } from "./routes/rooms.js"
import { youtubeRouter } from "./routes/youtube.js"
import { registerRoomHandlers } from "./sockets/room.js"
import { registerQueueHandlers } from "./sockets/queue.js"
import { setIo } from "./realtime.js"
import { sweepExpiredRooms } from "./services/roomService.js"

const PORT = Number(process.env.PORT ?? 4000)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000"
const ROOM_SWEEP_INTERVAL_MS =
  Number(process.env.ROOM_SWEEP_INTERVAL_MINUTES ?? 30) * 60 * 1000

// Socket handlers run as fire-and-forget async IIFEs (`void (async () => {...})()`)
// so a socket event's ack/broadcast isn't blocked on the caller. That means an
// unexpected error inside one has nowhere to be caught by the caller. Left
// alone, Node terminates the whole process on any unhandled rejection, taking
// down every other room's connections over a single bad event. Log instead.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection in a socket/route handler:", reason)
})

const app = express()
app.use(cors({ origin: CLIENT_ORIGIN }))
app.use(express.json())

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

app.use("/api/rooms", roomsRouter)
app.use("/api", youtubeRouter)

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err)
  res.status(500).json({ error: "Internal server error" })
})

const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN },
})
setIo(io)

const pubClient = redis.duplicate()
const subClient = redis.duplicate()
io.adapter(createAdapter(pubClient, subClient))

registerRoomHandlers(io)
registerQueueHandlers(io)

function runRoomSweep(): void {
  sweepExpiredRooms()
    .then((count) => {
      if (count > 0) console.log(`Room sweep: deleted ${count} expired room(s)`)
    })
    .catch((err: unknown) => {
      console.error("Room sweep failed:", err)
    })
}

runRoomSweep()
setInterval(runRoomSweep, ROOM_SWEEP_INTERVAL_MS)

httpServer.listen(PORT, () => {
  console.log(`server listening on :${PORT}`)
})
