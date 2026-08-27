'use strict';

// Build-environment adapter only: Gradle's Java process cannot use the sandbox
// egress proxy reliably, while curl can. This localhost proxy preserves normal
// Maven coordinates and caches exact upstream artifacts without modifying them.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const cache = path.join(root, '.maven-proxy-cache');
const gradleHome = path.join(root, '.gradle-user-home');
const androidHome = path.join(root, '.android-user-home');
fs.mkdirSync(cache, { recursive: true });
fs.mkdirSync(gradleHome, { recursive: true });
fs.mkdirSync(androidHome, { recursive: true });
const pending = new Map();
const bases = {
  google: 'https://dl.google.com/dl/android/maven2/',
  maven: 'https://repo.maven.apache.org/maven2/',
  plugins: 'https://plugins.gradle.org/m2/'
};

function download(url, target) {
  if (fs.existsSync(target)) return Promise.resolve();
  if (pending.has(target)) return pending.get(target);
  const job = new Promise((resolve, reject) => {
    const temporary = `${target}.${process.pid}.tmp`;
    // --retry-all-errors also retries TLS handshake failures (curl 35) that
    // occur when Gradle fires a large burst of parallel requests.
    const child = spawn('curl', ['-fL', '--retry', '5', '--retry-all-errors', '--retry-delay', '1', '--connect-timeout', '30', '--max-time', '600', '-o', temporary, url], { stdio: 'ignore' });
    child.on('error', err => { reject(new Error(`spawn ${err.message}: ${url}`)); });
    child.on('exit', code => {
      if (code === 0) { try { fs.renameSync(temporary, target); resolve(); } catch (err) { reject(new Error(`rename ${err.code}: ${url}`)); } }
      else { try { fs.unlinkSync(temporary); } catch {}; console.error(`[proxy] curl exit ${code}: ${url}`); reject(new Error(`curl ${code}: ${url}`)); }
    });
  }).finally(() => pending.delete(target));
  pending.set(target, job); return job;
}

// Limit concurrent upstream downloads so bursts cannot exhaust connections.
const MAX_CONCURRENT = 4;
let activeDownloads = 0;
const downloadQueue = [];
function pumpDownloads() {
  while (activeDownloads < MAX_CONCURRENT && downloadQueue.length) {
    const task = downloadQueue.shift();
    activeDownloads++;
    task().finally(() => { activeDownloads--; pumpDownloads(); });
  }
}
function throttledDownload(url, target) {
  if (fs.existsSync(target)) return Promise.resolve();
  if (pending.has(target)) return pending.get(target);
  return new Promise((resolve, reject) => {
    downloadQueue.push(() => download(url, target).then(resolve, reject));
    pumpDownloads();
  });
}

const server = http.createServer(async (request, response) => {
  const rawPath = request.url.split('?')[0];
  const match = /^\/(google|maven|plugins)\/(.+)$/.exec(decodeURIComponent(rawPath));
  if (!match || match[2].includes('..')) { console.error(`[proxy] BAD PATH: ${rawPath}`); response.writeHead(404); return response.end(); }
  const url = bases[match[1]] + match[2];
  const target = path.join(cache, crypto.createHash('sha256').update(url).digest('hex'));
  try {
    if (!fs.existsSync(target)) console.error(`[proxy] FETCH: ${url}`);
    await throttledDownload(url, target);
    const stat = fs.statSync(target);
    response.writeHead(200, { 'Content-Length': stat.size, 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public,max-age=31536000' });
    if (request.method === 'HEAD') response.end(); else fs.createReadStream(target).pipe(response);
  } catch (error) { console.error(`[proxy] FAIL: ${url} -> ${error.message}`); response.writeHead(404); response.end(String(error.message)); }
});

server.listen(31999, '127.0.0.1', () => {
  const port = 31999;
  const gradle = path.resolve(root, `../android-toolchain/gradle-8.9/bin/${process.platform === 'win32' ? 'gradle.bat' : 'gradle'}`);
  const args = process.argv.length > 2 ? process.argv.slice(2) : ['assembleDebug', '--no-daemon'];
  const env = { ...process.env, GRADLE_USER_HOME: gradleHome, ANDROID_USER_HOME: androidHome, LOCAL_MAVEN_PROXY: `http://127.0.0.1:${port}` };
  delete env.ANDROID_PREFS_ROOT;
  // On Windows, .bat files cannot be spawned directly; go through cmd.exe.
  const child = process.platform === 'win32'
    ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', gradle, ...args], { cwd: root, stdio: 'inherit', env })
    : spawn(gradle, args, { cwd: root, stdio: 'inherit', env });
  child.on('exit', code => server.close(() => process.exit(code == null ? 1 : code)));
});
