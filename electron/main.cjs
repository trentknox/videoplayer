const { app, BrowserWindow, ipcMain, shell } = require('electron')
const path = require('node:path')
const fs = require('node:fs')
const { hasPublisher } = require('./update-config.cjs')
const { pathToFileURL } = require('node:url')

let mainWindow
let updateTimer

function configureUpdates() {
  if (!app.isPackaged || process.platform !== 'win32') return
  // Refuse unattended updates until the build embeds an Authenticode publisher.
  // A checksum alone does not authenticate the publisher of an update manifest.
  let updateConfig
  try { updateConfig = fs.readFileSync(path.join(process.resourcesPath, 'app-update.yml'), 'utf8') } catch { return }
  if (!hasPublisher(updateConfig)) {
    console.warn('Automatic updates disabled: this build has no verified Windows publisher.')
    return
  }
  const { autoUpdater } = require('electron-updater')
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.allowPrerelease = false
  autoUpdater.on('error', (error) => console.error('Update check failed:', error.message))
  const check = () => { void autoUpdater.checkForUpdates().catch((error) => console.error('Update check failed:', error.message)) }
  check()
  updateTimer = setInterval(check, 6 * 60 * 60 * 1000)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    frame: false,
    autoHideMenuBar: true,
    backgroundColor: '#06070d',
    title: 'Vivid Media Player',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
  } else {
    mainWindow.loadURL(pathToFileURL(path.join(__dirname, '..', 'web-dist', 'index.html')).toString())
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      if (['http:', 'https:'].includes(new URL(url).protocol)) void shell.openExternal(url)
    } catch { /* Ignore invalid URLs. */ }
    return { action: 'deny' }
  })
}

ipcMain.on('vivid-window', (event, action) => {
  if (!mainWindow || event.sender !== mainWindow.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) return
  if (action === 'minimize') mainWindow.minimize()
  if (action === 'toggle-maximize') mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize()
  if (action === 'close') mainWindow.close()
})

app.whenReady().then(() => {
  createWindow()
  configureUpdates()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (updateTimer) clearInterval(updateTimer)
  if (process.platform !== 'darwin') app.quit()
})
