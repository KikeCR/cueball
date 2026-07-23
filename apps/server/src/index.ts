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

const PORT = Number(process.env.PORT ?? 4000)
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? "http://localhost:3000"

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

httpServer.listen(PORT, () => {
  console.log(`server listening on :${PORT}`)
})
