import { mkdir, copyFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

function run(command) {
  execSync(command, { cwd: root, stdio: 'inherit' });
}

async function main() {
  run('npm run build:frontend');

  await rm(publicDir, { recursive: true, force: true });
  await mkdir(publicDir, { recursive: true });

  const filesToCopy = ['index.html', 'styles.css', 'dashboard.js', 'chart.js'];

  for (const file of filesToCopy) {
    await copyFile(path.join(root, file), path.join(publicDir, file));
  }

  console.log('✅ Vercel output generated in ./public');
}

main().catch((error) => {
  console.error('❌ Vercel build failed:', error);
  process.exit(1);
});
