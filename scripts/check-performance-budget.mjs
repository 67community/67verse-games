import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { PERFORMANCE_BUDGET } from '../performance-budget.config.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');

export function collectInitialManifestKeys(manifest) {
  const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);
  if (!entryKey) throw new Error('Vite manifest has no entry chunk.');
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    const item = manifest[key];
    if (!item) throw new Error(`Manifest import is missing: ${key}`);
    seen.add(key);
    for (const imported of item.imports || []) visit(imported);
  };
  visit(entryKey);
  return [...seen];
}

export async function analyzeManifest(manifest, {
  readAsset = (file) => readFile(join(projectRoot, 'dist', file)),
} = {}) {
  const initialKeys = collectInitialManifestKeys(manifest);
  const initialKeySet = new Set(initialKeys);
  const items = [];

  for (const [source, item] of Object.entries(manifest)) {
    if (!item.file?.endsWith('.js')) continue;
    const bytes = await readAsset(item.file);
    items.push({
      source,
      file: item.file,
      rawBytes: bytes.byteLength,
      gzipBytes: gzipSync(bytes).byteLength,
      initial: initialKeySet.has(source),
      dynamic: Boolean(item.isDynamicEntry),
    });
  }

  const initial = items.filter((item) => item.initial);
  const asyncEntries = items
    .filter((item) => item.dynamic)
    .sort((a, b) => b.rawBytes - a.rawBytes);
  const deferredChunks = items
    .filter((item) => !item.initial)
    .sort((a, b) => b.rawBytes - a.rawBytes);
  return {
    generatedAt: new Date().toISOString(),
    initial: {
      files: initial,
      rawBytes: initial.reduce((sum, item) => sum + item.rawBytes, 0),
      gzipBytes: initial.reduce((sum, item) => sum + item.gzipBytes, 0),
    },
    asyncEntries,
    deferredChunks,
    allJs: items,
  };
}

export function evaluateBudget(report, budget = PERFORMANCE_BUDGET) {
  const failures = [];
  if (report.initial.rawBytes > budget.initialJsRawBytes) {
    failures.push(`initial JS raw ${report.initial.rawBytes} > ${budget.initialJsRawBytes}`);
  }
  if (report.initial.gzipBytes > budget.initialJsGzipBytes) {
    failures.push(`initial JS gzip ${report.initial.gzipBytes} > ${budget.initialJsGzipBytes}`);
  }
  for (const item of report.deferredChunks) {
    if (item.rawBytes > budget.maxAsyncJsRawBytes) {
      failures.push(`deferred chunk ${item.file} ${item.rawBytes} > ${budget.maxAsyncJsRawBytes}`);
    }
  }
  for (const source of budget.requiredDeferredSources || []) {
    if (!report.allJs.some((item) => item.source === source && !item.initial)) {
      failures.push(`required deferred source is missing or initial: ${source}`);
    }
  }
  for (const fragment of budget.requiredDeferredSourceFragments || []) {
    if (!report.allJs.some((item) => item.source.includes(fragment) && !item.initial)) {
      failures.push(`required deferred source fragment is missing or initial: ${fragment}`);
    }
  }
  return failures;
}

const kb = (bytes) => `${(bytes / 1000).toFixed(1)} kB`;

export function formatReport(report, budget = PERFORMANCE_BUDGET) {
  const largest = report.asyncEntries.slice(0, 6);
  const lines = [
    '',
    '67VERSE performance budget',
    `  initial JS   ${kb(report.initial.rawBytes)} / ${kb(report.initial.gzipBytes)} gzip`,
    `  budget       ${kb(budget.initialJsRawBytes)} / ${kb(budget.initialJsGzipBytes)} gzip`,
    `  deferred JS ${report.deferredChunks.length} chunks / ${report.asyncEntries.length} entry routes`,
    `  chunk budget  ${kb(budget.maxAsyncJsRawBytes)} raw each`,
  ];
  for (const item of largest) {
    lines.push(`    ${item.source.padEnd(30)} ${kb(item.rawBytes)} / ${kb(item.gzipBytes)} gzip`);
  }
  return lines.join('\n');
}

async function run() {
  const manifestPath = join(projectRoot, 'dist', '.vite', 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const report = await analyzeManifest(manifest);
  const failures = evaluateBudget(report);
  await writeFile(
    join(projectRoot, 'dist', 'performance-report.json'),
    `${JSON.stringify({ budget: PERFORMANCE_BUDGET, ...report }, null, 2)}\n`,
  );
  console.log(formatReport(report));
  if (failures.length) {
    console.error('\nPerformance budget failed:');
    failures.forEach((failure) => console.error(`  - ${failure}`));
    process.exitCode = 1;
  } else {
    console.log('  status       PASS');
  }
}

if (resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  await run();
}
