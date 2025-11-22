import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const pocketbaseBinPath = join(process.cwd(), 'pocketbase', 'bin', 'pocketbase');
const pocketbaseDataPath = join(process.cwd(), 'pocketbase', 'pb_data');

async function ensurePocketbaseBinary() {
  if (!existsSync(pocketbaseBinPath)) {
    console.log('📦 PocketBase binary not found, downloading...');
    const { spawn } = await import('node:child_process');
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('bun', ['run', './scripts/download.ts'], { stdio: 'inherit' });
      proc.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`Download failed: ${code}`))));
    });
  }
}

async function checkPocketbasePortInUse() {
  try {
    const res = await fetch('http://localhost:8090/api/health');
    return res.ok;
  } catch {
    return false;
  }
}

async function checkMailpitPortInUse() {
  try {
    const res = await fetch('http://localhost:8025');
    return res.ok;
  } catch {
    return false;
  }
}

async function createSuperUserr(binPath: string, dataPath: string) {
  try {
    console.log('🔄 Waiting for PocketBase to be ready...');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('👤 Creating dev superuser account...');
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(binPath, ['superuser', 'create', 'admin@example.com', 'changeme123', '--dir', dataPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';

      proc.stdout?.on('data', (data) => {
        output += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        output += data.toString();
      });

      proc.on('exit', (code) => {
        if (code === 0) {
          console.log(`✅ Superuser created: admin@example.com`);
          resolve();
        } else if (output.includes('already exists') || output.includes('A user with the provided email already exists')) {
          console.log('👤 Superuser account already exists');
          resolve();
        } else {
          console.error('❌ Superuser creation output:', output);
          reject(new Error(`Failed to create superuser (exit code ${code}): ${output}`));
        }
      });

      proc.on('error', (error) => {
        reject(new Error(`Failed to spawn superuser creation process: ${error.message}`));
      });
    });

    return true;
  } catch (error: any) {
    if (error.message?.includes('already exists')) {
      console.log('👤 Superuser account already exists');
      return true;
    }
    console.error('❌ Error creating superuser:', error.message);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting dev environment (PocketBase + Mailpit)');

  await ensurePocketbaseBinary();

  const portInUse = await checkPocketbasePortInUse();
  let server: any = null;

  if (portInUse) {
    console.log('📊 PocketBase already running on port 8090');
  } else {
    console.log('📊 Starting PocketBase...');
    server = spawn(pocketbaseBinPath, ['serve', '--http', '0.0.0.0:8090', '--dir', pocketbaseDataPath], { stdio: 'inherit', env: process.env });
  }

  await createSuperUserr(pocketbaseBinPath, pocketbaseDataPath);

  // Start Mailpit
  const mailpitPortInUse = await checkMailpitPortInUse();
  let mailpitServer: any = null;

  if (mailpitPortInUse) {
    console.log('📧 Mailpit already running on port 8025');
  } else {
    console.log('📧 Starting Mailpit...');
    mailpitServer = spawn('mailpit', [], { stdio: 'inherit', env: process.env });
  }

  console.log('🎉 Dev environment ready!');
  console.log(`📊 PocketBase Admin UI: http://localhost:8090/_/`);
  console.log(`🔌 PocketBase API: http://localhost:8090`);
  console.log(`👤 Superuser: admin@example.com / changeme123`);
  console.log(`📧 Mailpit UI: http://localhost:8025`);
  console.log(`📬 SMTP Server: smtp://localhost:1025`);

  // Keep the process alive
  process.on('SIGINT', () => {
    console.log('\n🛑 Stopping services...');
    if (server) {
      server.kill();
    }
    if (mailpitServer) {
      mailpitServer.kill();
    }
    process.exit(0);
  });

  // Keep alive indefinitely using setInterval
  setInterval(() => {}, 1000);
}

main().catch((err) => {
  console.error('❌ Dev environment failed:', err);
  process.exit(1);
});
