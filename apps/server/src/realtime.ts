import type { Server } from "socket.io"

let ioInstance: Server | undefined

export function setIo(io: Server): void {
  ioInstance = io
}

export function getIo(): Server | undefined {
  return ioInstance
}
