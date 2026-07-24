// Electron main process. Kept as CommonJS (.cjs) regardless of the root
// package.json's "type": "module" so this file always loads as CJS.
const { app, BrowserWindow, protocol, net, ipcMain, shell, Menu, Tray, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// Same custom scheme already used for the Capacitor mobile OAuth deep link
// (see src/hooks/useCapacitorAuthDeepLink.ts) — already whitelisted as a
// Supabase Auth redirect URL, so no extra dashboard config is needed here.
const AUTH_DEEP_LINK_SCHEME = 'commodityhub';

// Bundled alongside main.cjs (not build/icon.*, which electron-builder reads
// separately for the installer/exe icon) so it's always resolvable at
// runtime, packaged or not.
const APP_ICON_PATH = path.join(__dirname, 'icon.png');

// Set via the "electron:dev" script to point at the Vite dev server instead
// of the packaged build.
const devServerUrl = process.env.ELECTRON_START_URL;
const isDev = Boolean(devServerUrl);

const distDir = path.join(__dirname, '..', 'dist');

// Custom "app://" scheme instead of file://. This keeps the SPA on a
// stable app://app/ origin so React Router's BrowserRouter (pushState)
// works the same way it does on the web — file:// breaks nested-route
// reloads because each path segment resolves against a different disk
// location.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

function registerAppProtocol() {
  protocol.handle('app', (request) => {
    const requestUrl = new URL(request.url);
    let pathname = requestUrl.pathname;

    // SPA fallback: any route without a file extension (e.g. /watchlist)
    // resolves to index.html so client-side routing can take over.
    if (!path.extname(pathname)) {
      pathname = '/index.html';
    }

    const resolved = path.normalize(path.join(distDir, pathname));

    // Guard against the resolved path escaping dist/ (path traversal).
    if (!resolved.startsWith(distDir)) {
      return new Response('Forbidden', { status: 403 });
    }

    return net.fetch(pathToFileURL(resolved).toString());
  });
}

let mainWindow = null;
let tray = null;

function buildAppMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [isMac ? { role: 'close' } : { role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      role: 'help',
      submenu: [
        ...(isDev
          ? []
          : [
              {
                label: 'Check for Updates…',
                click: () => checkForUpdates({ manual: true }),
              },
              { type: 'separator' },
            ]),
        {
          label: 'Report an Issue',
          click: () => shell.openExternal('https://github.com/Toscirium/commodity-hub/issues'),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createTray() {
  tray = new Tray(APP_ICON_PATH);
  tray.setToolTip('Commodity Hub');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Show Commodity Hub',
        click: () => {
          if (!mainWindow) return;
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.show();
          mainWindow.focus();
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() },
    ])
  );
  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
    }
  });
}

// Tracks whether the in-flight check was user-initiated (Help menu) so only
// that path surfaces "no update"/error dialogs — the silent startup check
// should stay silent unless there's actually something to install.
let manualUpdateCheck = false;

autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-downloaded', (info) => {
  dialog
    .showMessageBox(mainWindow, {
      type: 'info',
      buttons: ['Restart Now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      title: 'Update Ready',
      message: `Commodity Hub ${info.version} has been downloaded.`,
      detail: 'Restart the app to apply the update.',
    })
    .then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
});

autoUpdater.on('update-not-available', () => {
  if (manualUpdateCheck && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'No Updates',
      message: "You're running the latest version of Commodity Hub.",
    });
  }
  manualUpdateCheck = false;
});

autoUpdater.on('error', (err) => {
  console.error('[autoUpdater] error:', err);
  if (manualUpdateCheck && mainWindow) {
    dialog.showMessageBox(mainWindow, {
      type: 'error',
      title: 'Update Check Failed',
      message: err instanceof Error ? err.message : 'Could not check for updates.',
    });
  }
  manualUpdateCheck = false;
});

function checkForUpdates({ manual = false } = {}) {
  // Only packaged builds carry the app-update.yml electron-updater reads;
  // running from source has no update feed to check.
  if (isDev) return;
  manualUpdateCheck = manual;
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[autoUpdater] checkForUpdates failed:', err);
  });
}

function extractDeepLinkUrl(argv) {
  return argv.find((arg) => arg.toLowerCase().startsWith(`${AUTH_DEEP_LINK_SCHEME}://`));
}

function sendDeepLinkToRenderer(url) {
  if (!url || !mainWindow) return;
  mainWindow.webContents.send('auth-deep-link', url);
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#1e3a5f',
    show: false,
    icon: APP_ICON_PATH,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => win.show());

  if (isDev) {
    win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    // Load the root path, not /index.html directly — React Router needs
    // the pathname to be "/" on first load, and the protocol handler's
    // extension-less fallback already serves index.html's content for it.
    win.loadURL('app://app/');
  }

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  return win;
}

// Single instance lock: on Windows, a second launch via the commodityhub://
// protocol spawns a *new* process rather than firing an event in the
// existing one, so we forward its argv to the primary instance and quit.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    sendDeepLinkToRenderer(extractDeepLinkUrl(argv));
  });

  app.whenReady().then(() => {
    app.setAsDefaultProtocolClient(AUTH_DEEP_LINK_SCHEME);

    if (!isDev) {
      registerAppProtocol();
    }

    buildAppMenu();
    createTray();
    createWindow();
    checkForUpdates();

    // Cold start on Windows/Linux: the deep link arrives as a CLI arg.
    const launchUrl = extractDeepLinkUrl(process.argv);
    if (launchUrl) {
      mainWindow.webContents.once('did-finish-load', () => sendDeepLinkToRenderer(launchUrl));
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  // macOS-style deep link event; also fires on some Linux desktop environments.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    sendDeepLinkToRenderer(url);
  });

  ipcMain.handle('open-external', (_event, url) => {
    if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
      throw new Error('open-external only allows https:// URLs');
    }
    return shell.openExternal(url);
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
