// CI-only deterministic version stamping. Never rewrites source commits.
// One source commit -> one semantic release version across every platform.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const count = Number(execFileSync('git', ['rev-list', '--count', 'HEAD'], {
  encoding: 'utf8',
}).trim());
if (!Number.isSafeInteger(count) || count < 1) throw new Error('Missing full Git history');
const version = `0.1.${count}`;
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const writeJson = (path, data) => writeFileSync(path, JSON.stringify(data, null, 2) + '\n');

const pkg = readJson('package.json');
pkg.version = version;
writeJson('package.json', pkg);

const conf = readJson('src-tauri/tauri.conf.json');
conf.version = version;
writeJson('src-tauri/tauri.conf.json', conf);

const cargoPath = 'src-tauri/Cargo.toml';
const cargo = readFileSync(cargoPath, 'utf8');
const updatedCargo = cargo.replace(/(\[package\][\s\S]*?\bversion\s*=\s*)"[^"]+"/, `$1"${version}"`);
if (updatedCargo === cargo) throw new Error('Unable to stamp Cargo.toml');
writeFileSync(cargoPath, updatedCargo);

const checkPath = 'src/updates/updateCheck.ts';
const check = readFileSync(checkPath, 'utf8');
const updatedCheck = check.replace(
  /export const CURRENT_VERSION = '[^']+';/,
  `export const CURRENT_VERSION = '${version}';`,
);
if (updatedCheck === check) throw new Error('Unable to stamp update check module');
writeFileSync(checkPath, updatedCheck);

console.log(`Deltos release version: v${version} (main history count ${count})`);
