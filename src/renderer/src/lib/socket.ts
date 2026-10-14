import { io, type Socket } from 'socket.io-client'
import { API_BASE } from './apiClient'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, { autoConnect: true })
  }
  return socket
}
