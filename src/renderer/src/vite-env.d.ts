/// <reference types="vite/client" />

interface Window {
  communitycast: {
    platform: NodeJS.Platform
    pickMediaFiles: () => Promise<string[]>
  }
}
