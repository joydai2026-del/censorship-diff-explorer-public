// A tiny headless-browser driver using the Chrome DevTools Protocol directly.
// No Playwright or Puppeteer package: Node 22 has WebSocket built in, and the
// browser binary is the one Playwright already cached on this machine.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

export function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const linuxCache = join(homedir(), '.cache', 'ms-playwright');
  for (const base of [cache, linuxCache]) {
    if (!existsSync(base)) continue;
    for (const dir of readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()) {
      for (const sub of readdirSync(join(base, dir))) {
        const bin = join(base, dir, sub, 'chrome-headless-shell');
        if (existsSync(bin)) return bin;
      }
    }
  }
  return null;
}

// Never make sound: stub speech and media playback before any page script runs.
const SILENCE = `
  try { window.speechSynthesis && (window.speechSynthesis.speak = () => {}); } catch (e) {}
  try { HTMLMediaElement.prototype.play = function () { return Promise.resolve(); }; } catch (e) {}
`;

export async function launch() {
  const bin = findChrome();
  if (!bin) return null;
  const profile = mkdtempSync(join(tmpdir(), 'cde-chrome-'));
  const proc = spawn(bin, [
    '--headless', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--mute-audio', '--disable-gpu', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const cleanup = () => { try { proc.kill(); } catch { /* gone */ } rmSync(profile, { recursive: true, force: true }); };
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('browser did not start in 15s')), 15000);
    proc.stderr.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(timer); resolve(m[1]); }
    });
    proc.on('exit', (c) => { clearTimeout(timer); reject(new Error(`browser exited early (${c})`)); });
  }).catch((e) => { cleanup(); throw e; });

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let nextId = 1;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

  async function newPage({ width, height, mobile = false, scale = 1 }) {
    // Each page gets its own fresh context, so saved settings never leak between tests.
    const { browserContextId } = await send('Target.createBrowserContext', { disposeOnDetach: true });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank', browserContextId });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const s = (m, p) => send(m, p, sessionId);
    const errors = [];
    listeners.push((msg) => {
      if (msg.sessionId !== sessionId) return;
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text);
    });
    await s('Page.enable');
    await s('Runtime.enable');
    await s('Log.enable');
    await s('DOM.enable');
    await s('Page.addScriptToEvaluateOnNewDocument', { source: SILENCE });
    await s('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile });
    if (mobile) await s('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    const page = {
      errors,
      async goto(url) {
        const loaded = new Promise((res) => listeners.push((m) => { if (m.sessionId === sessionId && m.method === 'Page.loadEventFired') res(); }));
        await s('Page.navigate', { url });
        await loaded;
      },
      async eval(expression) {
        const r = await s('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(`page error: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
        return r.result.value;
      },
      async click(x, y) {
        for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
          await s('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
        }
      },
      async tap(x, y) {
        await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      },
      async setFiles(selector, files) {
        const { root } = await s('DOM.getDocument', { depth: -1 });
        const { nodeId } = await s('DOM.querySelector', { nodeId: root.nodeId, selector });
        await s('DOM.setFileInputFiles', { nodeId, files });
      },
      async screenshot(path, full = true) {
        const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full });
        writeFileSync(path, Buffer.from(data, 'base64'));
      },
      async close() {
        await send('Target.closeTarget', { targetId });
        try { await send('Target.disposeBrowserContext', { browserContextId }); } catch { /* already gone */ }
      },
    };
    return page;
  }

  async function close() {
    try { await send('Browser.close'); } catch { /* already gone */ }
    try { ws.close(); } catch { /* ignore */ }
    await new Promise((r) => { if (proc.exitCode !== null) r(); else { proc.once('exit', r); setTimeout(() => { try { proc.kill(); } catch { /* ignore */ } r(); }, 3000); } });
    rmSync(profile, { recursive: true, force: true });
  }

  return { newPage, close };
}
