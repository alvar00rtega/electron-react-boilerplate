/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import fs from 'fs';
import { app, BrowserWindow, shell, ipcMain } from 'electron';
import { spawn } from 'child_process';


import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

ipcMain.on('gemini-command', (event, { command, sessionId }) => {
  console.log(`Comando para sesión ${sessionId}: ${command}`);

  const contextPath = path.join(app.getPath('userData'), 'contexts', sessionId);
  if (!fs.existsSync(contextPath)) {
    fs.mkdirSync(contextPath, { recursive: true });
  }

  const executable = 'npx';
  const geminiProcess = spawn(executable, ['gemini', '-c'], { cwd: contextPath });

  geminiProcess.stdout.on('data', (data) => {
    const chunk = data.toString();
    event.sender.send('gemini-response', { type: 'data', content: chunk });
  });

  geminiProcess.stderr.on('data', (data) => {
    const chunk = data.toString();
    event.sender.send('gemini-response', { type: 'error', content: chunk });
  });

  geminiProcess.on('close', (code) => {
    console.log(`Proceso de Gemini finalizado con código: ${code}`);
    event.sender.send('gemini-response', { type: 'close', code });
  });

  geminiProcess.on('error', (err) => {
    console.error('Error al iniciar el proceso de Gemini:', err);
    event.sender.send('gemini-response', {
      type: 'error',
      content: `Error al iniciar el proceso: ${err.message}`,
    });
  });

  geminiProcess.stdin.write(command);
  geminiProcess.stdin.end();
});


if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

// --- SESIONES ---
const sessionsPath = path.join(app.getPath('userData'), 'sessions');
if (!fs.existsSync(sessionsPath)) {
  fs.mkdirSync(sessionsPath, { recursive: true });
}

ipcMain.handle('sessions:create', async () => {
  const sessionId = `session-${Date.now()}`;
  const sessionData = {
    id: sessionId,
    name: `Nueva Sesión - ${new Date().toLocaleString()}`,
    history: [],
  };
  const filePath = path.join(sessionsPath, `${sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
  return sessionData;
});

ipcMain.handle('sessions:load-all', async () => {
  const files = fs.readdirSync(sessionsPath);
  const sessions = files
    .filter((file) => file.endsWith('.json'))
    .map((file) => {
      const filePath = path.join(sessionsPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content);
    });
  return sessions;
});

ipcMain.handle('sessions:load-one', async (event, sessionId) => {
  const filePath = path.join(sessionsPath, `${sessionId}.json`);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content);
  }
  return null;
});

ipcMain.on('sessions:save', (event, sessionData) => {
  const filePath = path.join(sessionsPath, `${sessionData.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2));
});

// --- FIN SESIONES ---


const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
