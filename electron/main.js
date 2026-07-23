import electron from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import isDev from 'electron-is-dev';
import { SwiggyImporter } from './swiggyImporter.js';

const { app, BrowserWindow, ipcMain } = electron;

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
const swiggyImporter = new SwiggyImporter();
let swiggyAutoTimer = null;
const defaultCustomerPrinterName = 'POS-58-Series';

// Read VITE_KITCHEN_API_URL and VITE_KITCHEN_API_TOKEN from .env file
let configEnv = {};
try {
  const envContent = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  envContent.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      configEnv[key.trim()] = valueParts.join('=').trim();
    }
  });
} catch (e) {
  console.warn("Could not read .env file:", e);
}

const apiUrl = configEnv.VITE_KITCHEN_API_URL || 'https://ego-foods-bot.vercel.app';
const apiToken = configEnv.VITE_KITCHEN_API_TOKEN || 'sHUfelbnXs8N-zTc7NvkVZgDY5vAN4xKFE4Q7qjsu7Q';

const gotSingleInstanceLock = app.requestSingleInstanceLock();

if (!gotSingleInstanceLock) {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

function scheduleSwiggyImport(settings) {
  if (swiggyAutoTimer) {
    clearInterval(swiggyAutoTimer);
    swiggyAutoTimer = null;
  }
  if (!settings?.autoEnabled) return;
  const minutes = Math.max(1, Number(settings.intervalMinutes || 15));
  swiggyAutoTimer = setInterval(() => {
    swiggyImporter.importNow({ visible: false, reason: 'auto' }).catch(() => {});
  }, minutes * 60 * 1000);
}

function registerSwiggyIpc() {
  ipcMain.handle('swiggy:get-settings', async () => ({
    settings: await swiggyImporter.getSettings(),
    state: await swiggyImporter.getState(),
    importedOrders: await swiggyImporter.getImportedOrders()
  }));

  ipcMain.handle('swiggy:save-settings', async (_event, settings) => {
    const saved = await swiggyImporter.saveSettings(settings || {});
    scheduleSwiggyImport(saved);
    return { settings: saved, state: await swiggyImporter.getState() };
  });

  ipcMain.handle('swiggy:import-now', async (event, options) =>
    swiggyImporter.importNow({
      visible: true,
      ...(options || {}),
      onProgress: (progress) => event.sender.send('swiggy:progress', progress)
    })
  );
  ipcMain.handle('swiggy:test-login', async (event) =>
    swiggyImporter.importNow({
      visible: true,
      reason: 'login-test',
      onProgress: (progress) => event.sender.send('swiggy:progress', progress)
    })
  );
  ipcMain.handle('swiggy:open-export-folder', async () => swiggyImporter.openExportFolder());
}

function money(value = 0) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function receiptCss(fontSize = 11) {
  return `
    @page{size:58mm auto;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#000}
    body{width:48mm;padding:2mm;font-family:Arial,'Courier New',sans-serif;font-size:${fontSize}px;line-height:1.25;overflow:visible}
    h1{font-size:15px;margin:0 0 2mm;text-align:center;letter-spacing:.4px}
    .center{text-align:center}.right{text-align:right}.bold{font-weight:700}
    .line{border-top:1px dashed #000;margin:2mm 0}
    table{width:100%;border-collapse:collapse;table-layout:fixed}
    td{padding:1.5mm 0;vertical-align:top;word-break:break-word}
    td.item{width:32mm;padding-right:1mm}
    td.amount{width:12mm;text-align:right;white-space:nowrap}
    .total{border-top:1px solid #000;border-bottom:1px solid #000;margin:2mm 0;padding:1.5mm 0;font-size:14px;font-weight:800}
    .otp{font-size:22px;font-weight:900;text-align:center;border:1px solid #000;margin:1.5mm 0;padding:1.5mm}
  `;
}

function customerReceiptHtml(order) {
  const items = (order.items || []).map((item) => {
    const qty = Number(item.qty || item.quantity || 1);
    const price = Number(item.price || 0);
    return `<tr><td class="item">${escapeHtml(item.name)} ${escapeHtml(item.variant || '')}<br/>x ${qty}</td><td class="amount">${money(price * qty)}</td></tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    ${receiptCss(11)}
  </style></head><body>
    <h1>EGO FOODS</h1>
    <div class="center">Customer Copy</div>
    <div>Order: ${escapeHtml(order.pickup_code || order.id || '')}</div>
    <div>Name: ${escapeHtml(order.customer_name || 'Customer')}</div>
    <div>Phone: ${escapeHtml(order.customer_phone || '')}</div>
    <div class="line"></div>
    <table>${items}</table>
    <div class="total">Total: ${money(order.total_amount || order.total || 0)}</div>
    <div class="bold">Pickup OTP</div><div class="otp">${escapeHtml(order.pickup_code || '')}</div>
    <div class="center">Share this OTP with the pickup person.</div>
    <div class="center">Thanks and enjoy the food.</div>
  </body></html>`;
}

function kitchenReceiptHtml(order) {
  const items = (order.items || []).map((item) => {
    const qty = Number(item.qty || item.quantity || 1);
    return `<tr><td class="item">${escapeHtml(item.name)} ${escapeHtml(item.variant || '')}</td><td class="amount">x ${qty}</td></tr>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    ${receiptCss(12)}
  </style></head><body>
    <h1>KITCHEN COPY</h1>
    <div>Order: ${escapeHtml(order.pickup_code || order.id || '')}</div>
    <div class="bold">Pickup OTP</div><div class="otp">${escapeHtml(order.pickup_code || '')}</div>
    <div class="line"></div>
    <table>${items}</table>
  </body></html>`;
}

async function printHtml(html, deviceName) {
  const printWindow = new BrowserWindow({ show: false, width: 280, height: 900, webPreferences: { sandbox: true } });
  await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve, reject) => {
    printWindow.webContents.print({ silent: true, printBackground: true, margins: { marginType: 'none' }, deviceName }, (success, failureReason) => {
      printWindow.close();
      success ? resolve() : reject(new Error(failureReason || 'Receipt print failed.'));
    });
  });
}

function registerPrinterIpc() {
  ipcMain.handle('printer:list', async () => mainWindow?.webContents.getPrintersAsync() || []);
  ipcMain.handle('printer:print-order-copies', async (_event, order, options = {}) => {
    const customerPrinter = options.customerPrinterName || defaultCustomerPrinterName;
    const kitchenPrinter = options.kitchenPrinterName || customerPrinter;
    if (options.printCustomer !== false) {
      await printHtml(customerReceiptHtml(order || {}), customerPrinter);
    }
    if (options.printKitchen !== false) {
      await printHtml(kitchenReceiptHtml(order || {}), kitchenPrinter);
    }
    return { ok: true, customerPrinter, kitchenPrinter };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    x: 40,
    y: 30,
    minWidth: 900,
    minHeight: 680,
    title: 'Kitchen OS - Ego Foods',
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const distHtml = path.join(__dirname, '..', 'dist', 'index.html');
  mainWindow.loadFile(distHtml);
  // mainWindow.webContents.openDevTools();
}

async function startPrintJobPolling() {
  const targetUrl = isDev ? 'http://127.0.0.1:3000' : apiUrl;
  
  setInterval(async () => {
    try {
      const res = await fetch(`${targetUrl.replace(/\/$/, '')}/api/kitchen-os/print-jobs`, {
        headers: { 'x-kitchen-token': apiToken }
      });
      if (!res.ok) return;
      const data = await res.json();
      const jobs = data.jobs || [];
      
      for (const job of jobs) {
        const { id, printer_type, content } = job;
        const customerPrinter = defaultCustomerPrinterName;
        
        if (printer_type === 'kitchen') {
          await printHtml(kitchenReceiptHtml(content), customerPrinter);
        } else {
          await printHtml(customerReceiptHtml(content), customerPrinter);
        }
        
        // Mark job as completed
        await fetch(`${targetUrl.replace(/\/$/, '')}/api/kitchen-os/print-jobs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-kitchen-token': apiToken
          },
          body: JSON.stringify({ jobId: id, status: 'completed' })
        });
      }
    } catch (err) {
      // Ignore network errors when dashboard is reloading
    }
  }, 3000);
}

ipcMain.on('log-to-file', (event, msg) => {
  try {
    const logPath = path.join(__dirname, '..', 'client_debug.log');
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`, 'utf8');
  } catch (err) {
    console.error("Failed to write to client_debug.log:", err);
  }
});


app.whenReady().then(async () => {
  registerSwiggyIpc();
  registerPrinterIpc();
  scheduleSwiggyImport(await swiggyImporter.getSettings());
  createWindow();
  startPrintJobPolling();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
