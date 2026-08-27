'use strict';

// Mechanically embeds the current first-party text source into the AI-agent
// handoff document. Runtime data, secrets, binaries, dependencies and vendored
// third-party files are intentionally excluded.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const serverRoot = path.resolve(__dirname, '..');
const workspace = path.resolve(serverRoot, '..');
const androidRoot = path.join(workspace, 'bsc-android-native');
const documentPath = path.join(serverRoot, 'docs', 'DEVELOPMENT_SPEC_V1.md');
const appendixPath = path.join(serverRoot, 'docs', 'APPENDIX_L_SOURCE_SNAPSHOT.md');
const begin = '<!-- BEGIN GENERATED SOURCE SNAPSHOT -->';
const end = '<!-- END GENERATED SOURCE SNAPSHOT -->';

const explicit = [
  ['android', androidRoot, 'README.md'],
  ['android', androidRoot, 'settings.gradle'],
  ['android', androidRoot, 'build.gradle'],
  ['android', androidRoot, 'gradle.properties'],
  ['android', androidRoot, 'app/build.gradle'],
  ['android', androidRoot, 'app/src/main/AndroidManifest.xml'],
  ['android', androidRoot, 'tools/gradle-with-proxy.js'],
  ['android', androidRoot, 'tools/setup-toolchain.ps1'],
  ['server', serverRoot, 'README.md'],
  ['server', serverRoot, 'package.json'],
  ['server', serverRoot, 'public/index.html'],
  ['server', serverRoot, 'public/app.js'],
  ['server', serverRoot, 'public/styles.css'],
  ['server', serverRoot, 'public/favicon.svg'],
  ['server', serverRoot, 'public/sample-reference.svg'],
  ['server', serverRoot, 'tools/embed-source-doc.js'],
  ['server', serverRoot, 'tools/restore-from-appendix.js'],
  ['server', serverRoot, 'tools/backup.js'],
  ['server', serverRoot, 'tools/restore.js'],
  ['server', serverRoot, 'deploy/nginx-bsc.conf'],
  ['server', serverRoot, 'deploy/install-service.bat'],
  ['server', serverRoot, 'deploy/uninstall-service.bat'],
  ['server', serverRoot, 'deploy/schedule-backup.ps1'],
  ['server', serverRoot, 'deploy/make-package.ps1'],
  ['server', serverRoot, 'deploy/health-alert.ps1'],
  ['server', serverRoot, 'deploy/config.example.json'],
  ['server', serverRoot, 'deploy/DEPLOYMENT_GUIDE.md'],
  ['server', serverRoot, 'deploy/PROMPTS_FOR_SERVER_AI.md']
];

function walk(root, relative, group, extensions) {
  const directory = path.join(root, relative);
  if (!fs.existsSync(directory)) return [];
  const out = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) out.push(...walk(root, child, group, extensions));
    else if (extensions.has(path.extname(entry.name).toLowerCase())) out.push([group, root, child]);
  }
  return out;
}

const files = [
  ...explicit,
  // src 目录整体遍历：新增源文件（如 track.js/exif.js）自动纳入，避免显式清单漏项。
  ...walk(serverRoot, 'src', 'server', new Set(['.js'])),
  ...walk(androidRoot, 'app/src/main/java', 'android', new Set(['.java'])),
  ...walk(androidRoot, 'app/src/main/res', 'android', new Set(['.xml'])),
  ...walk(androidRoot, 'app/src/test', 'android', new Set(['.java'])),
  ...walk(serverRoot, 'test', 'server', new Set(['.js']))
];

const unique = new Map();
for (const item of files) unique.set(`${item[0]}:${item[2]}`, item);
const ordered = [...unique.values()].sort((a, b) => `${a[0]}:${a[2]}`.localeCompare(`${b[0]}:${b[2]}`));

const language = file => ({
  '.java': 'java', '.js': 'javascript', '.json': 'json', '.xml': 'xml',
  '.html': 'html', '.css': 'css', '.gradle': 'groovy', '.md': 'markdown',
  '.svg': 'xml', '.properties': 'properties', '.ps1': 'powershell',
  '.bat': 'batch', '.conf': 'nginx'
}[path.extname(file).toLowerCase()] || 'text');

const digest = content => crypto.createHash('sha256').update(content).digest('hex');
const now = new Date().toISOString();
let appendix = `${begin}\n\n---\n\n## \u9644\u5f55 L\uff1a\u5f53\u524d\u6e90\u7801\u5feb\u7167\n\n`;
appendix += `> \u751f\u6210\u65f6\u95f4\uff1a${now}  \n`;
appendix += `> \u6587\u4ef6\u6570\uff1a${ordered.length}  \n`;
appendix += '> \u672c\u9644\u5f55\u662f\u4ea4\u7ed9 AI Agent \u7684\u4e00\u4f53\u5316\u6e90\u7801\u5feb\u7167\uff0c\u4e0d\u4ee3\u66ff\u4ed3\u5e93\u4e2d\u7684\u771f\u5b9e\u6587\u4ef6\u3002\u4fee\u6539\u65f6\u5e94\u7f16\u8f91\u4ed3\u5e93\u6e90\u6587\u4ef6\uff0c\u518d\u91cd\u65b0\u751f\u6210\u672c\u9644\u5f55\u3002\n\n';
appendix += '### L.1 \u6536\u5f55\u8303\u56f4\n\n';
appendix += '- \u6536\u5f55\uff1a\u539f\u751f Android \u914d\u7f6e\u3001Manifest\u3001Java\u3001XML \u8d44\u6e90\u3001\u6d4b\u8bd5\uff1bV1 Node.js API\u3001\u7ba1\u7406\u7ad9\u81ea\u6709\u6e90\u7801\u548c\u5fc5\u8981\u6784\u5efa\u5de5\u5177\u3002\n';
appendix += '- \u4e0d\u6536\u5f55\uff1aSQLite/WAL\u3001config.json\u3001\u7167\u7247\u3001APK\u3001Gradle/Maven/npm \u7f13\u5b58\u3001SDK\u3001keystore\u3001\u5bc6\u7801\u3001token\u3001\u4e8c\u8fdb\u5236 Excel \u548c\u7b2c\u4e09\u65b9 vendor \u538b\u7f29\u6e90\u7801\u3002\n';
appendix += '- `public/mobile*` \u548c\u9876\u5c42\u65e7 `server.js` \u5c5e\u4e8e WebView/\u65e7 API \u539f\u578b\uff0c\u4e0d\u662f V1 \u7ee7\u7eed\u5f00\u53d1\u57fa\u7840\uff0c\u56e0\u6b64\u4e0d\u5d4c\u5165\u3002\n\n';
appendix += '### L.2 \u6e90\u7801\u6587\u4ef6\n\n';

for (const [group, root, relative] of ordered) {
  const absolute = path.join(root, relative);
  const content = fs.readFileSync(absolute, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/u, '');
  const shown = `${group === 'android' ? 'bsc-android-native' : 'bsc-sampling-v1'}/${relative.replaceAll('\\', '/')}`;
  appendix += `#### \`${shown}\`\n\n`;
  appendix += `SHA-256: \`${digest(content)}\`\n\n`;
  appendix += `~~~~${language(relative)}\n${content}\n~~~~\n\n`;
}
appendix += `${end}\n`;

let document = fs.readFileSync(documentPath, 'utf8');
const start = document.indexOf(begin);
if (start >= 0) {
  const finish = document.lastIndexOf(end);
  if (finish < 0) throw new Error('Generated source snapshot has no end marker');
  document = document.slice(0, start).trimEnd() + '\n\n' + document.slice(finish + end.length).trimStart();
}
document = document.trimEnd() + '\n\n' + appendix;
fs.writeFileSync(documentPath, document, 'utf8');
fs.writeFileSync(appendixPath, appendix.replace(`${begin}\n\n---\n\n`, ''), 'utf8');
console.log(`Embedded ${ordered.length} source files into ${documentPath}`);
console.log(`Wrote standalone Appendix L to ${appendixPath}`);
