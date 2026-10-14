import { ipcMain, dialog, BrowserWindow } from 'electron'

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'm4v', 'mkv', 'avi', 'webm', 'mpg', 'mpeg']

export function registerDialogHandlers(): void {
  ipcMain.handle('dialog:pickMediaFiles', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: 'Import Media',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Video files', extensions: VIDEO_EXTENSIONS },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
    if (result.canceled) return []
    return result.filePaths
  })
}
