import { contextBridge, ipcRenderer } from 'electron'

// Data access goes over the embedded HTTP/Socket.io server (see src/main/server),
// not IPC — the renderer talks to it like a normal web client via fetch/socket.io-client.
// This bridge is reserved for things only the OS can provide: right now, the
// native multi-file picker used by Media Library import.
const api = {
  platform: process.platform,
  pickMediaFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:pickMediaFiles')
}

contextBridge.exposeInMainWorld('communitycast', api)

export type CommunityCastBridge = typeof api
