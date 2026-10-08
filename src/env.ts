import fs from 'fs';
import path from 'path';

/**
 * Load remotion-render/.env into process.env (variables already set by the
 * shell, pm2 or systemd win). Imported FIRST by server.ts so every module
 * sees the values at load time.
 *
 * Nothing read a .env file before: HOST_STORAGE_PREFIX written there was
 * silently ignored, the cwd-relative fallback kicked in, and on the VPS the
 * MCP preview stills landed in a brand-new ../viralforgebackend folder the
 * app never sees (every preview link 404'd).
 */
const file = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(file)) {
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const m = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, '');
    }
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}
