import { unzipSync } from 'fflate';
import { spawn } from 'node:child_process';
import { createWriteStream, readFileSync, writeFileSync } from 'node:fs';
import { chmod, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const VERSION = process.env.PB_VERSION || '0.29.3';

function detectTarget() {
  const platform = process.platform; // 'linux' | 'darwin' | 'win32'
  const arch = process.arch; // 'x64' | 'arm64' | ...

  let os: string;
  if (platform === 'linux') os = 'linux';
  else if (platform === 'darwin') os = 'darwin';
  else if (platform === 'win32') os = 'windows';
  else throw new Error(`Unsupported platform: ${platform}`);

  let cpu: string;
  if (arch === 'x64') cpu = 'amd64';
  else if (arch === 'arm64') cpu = 'arm64';
  else throw new Error(`Unsupported arch: ${arch}`);

  const filename = `pocketbase_${VERSION}_${os}_${cpu}.zip`;
  const url = `https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/${filename}`;
  const archivePath = join(process.cwd(), 'pocketbase', 'bin', filename);
  return { url, filename, archivePath, os };
}

async function tryUnzipCmd(src: string, destDir: string) {
  await new Promise<void>((resolve, reject) => {
    const cmd = spawn('unzip', ['-o', src, '-d', destDir], { stdio: 'inherit' });
    cmd.on('error', reject);
    cmd.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`unzip exited with code ${code}`))));
  });
}

function unzipWithJS(src: string, destDir: string) {
  const buf = readFileSync(src);
  const entries = unzipSync(buf);
  for (const name of Object.keys(entries)) {
    const out = join(destDir, name);
    writeFileSync(out, entries[name]);
  }
}

async function main() {
  const baseDir = join(process.cwd(), 'pocketbase');
  const binDir = join(baseDir, 'bin');
  const dataDir = join(baseDir, 'data');
  await mkdir(binDir, { recursive: true });
  await mkdir(dataDir, { recursive: true });

  const { url, filename, archivePath, os } = detectTarget();

  console.log(`⬇️  Downloading PocketBase ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download: ${res.status} ${res.statusText}`);

  await pipeline(res.body as any, createWriteStream(archivePath));

  console.log(`📦 Extracting ${filename}`);
  try {
    await tryUnzipCmd(archivePath, binDir);
  } catch {
    unzipWithJS(archivePath, binDir);
  }

  const binName = os === 'windows' ? 'pocketbase.exe' : 'pocketbase';
  const binPath = join(binDir, binName);
  await chmod(binPath, 0o755);

  console.log(`✅ PocketBase downloaded at ${binPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
