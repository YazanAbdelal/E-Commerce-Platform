#!/usr/bin/env node
/**
 * Project-wide coverage.
 *
 * Runs the unit, integration and E2E suites separately, then merges their
 * reports so that source files no suite touches are counted as 0%. The merged
 * figure is what the suites add up to, not just the files they import.
 *
 * Usage:
 *   node scripts/coverage.mjs            # unit + integration + E2E
 *   node scripts/coverage.mjs unit       # a single suite
 *   node scripts/coverage.mjs unit e2e   # any combination
 *
 * The integration and E2E suites need the test databases:
 *   npm run db:test:create && npm run db:migrate:test
 */
import { spawnSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { createCoverageMap } = require('istanbul-lib-coverage');

const suites = [
    { name: 'unit', config: 'vitest.config.ts' },
    { name: 'integration', config: 'vitest.config.integration.ts' },
    { name: 'e2e', config: 'vitest.config.e2e.ts' },
];

// Untouched files must show up in the report so they count as uncovered.
const scope = [
    '--coverage.include=apps/**/src/**/*.ts',
    '--coverage.include=libs/**/src/**/*.ts',
    '--coverage.exclude=**/generated/**',
    '--coverage.exclude=**/*.spec.ts',
    '--coverage.exclude=**/*.d.ts',
];

const cacheDir = path.join(root, 'node_modules', '.cache', 'coverage');
const mergedReport = path.join(root, 'coverage', 'coverage-final.json');

const requested = process.argv.slice(2);
const selected = requested.length
    ? suites.filter((suite) => requested.includes(suite.name))
    : suites;

const unknown = requested.filter(
    (name) => !suites.some((suite) => suite.name === name),
);

if (unknown.length > 0) {
    console.error(
        `Unknown suite(s): ${unknown.join(', ')}. Pick from: ${suites.map((s) => s.name).join(', ')}.`,
    );
    process.exit(1);
}

const vitestBin = path.join(
    path.dirname(require.resolve('vitest/package.json')),
    'vitest.mjs',
);

function toPosix(value) {
    return value.split(path.sep).join('/');
}

function runSuite(suite) {
    const reportsDirectory = path.join(cacheDir, suite.name);

    rmSync(reportsDirectory, { recursive: true, force: true });
    mkdirSync(reportsDirectory, { recursive: true });

    const args = [
        vitestBin,
        'run',
        '--config',
        suite.config,
        '--coverage',
        '--coverage.reporter=json',
        `--coverage.reportsDirectory=${toPosix(reportsDirectory)}`,
        ...scope,
    ];

    console.log(`\n=== ${suite.name} suite (${suite.config}) ===`);
    const result = spawnSync(process.execPath, args, {
        cwd: root,
        stdio: 'inherit',
    });

    if (result.status !== 0) {
        console.error(
            `\nThe ${suite.name} suite failed, so no merged figure was produced.`,
        );
        if (suite.name !== 'unit') {
            console.error(
                'Integration and E2E need the test databases: npm run db:test:create && npm run db:migrate:test',
            );
        }
        rmSync(cacheDir, { recursive: true, force: true });
        process.exit(result.status ?? 1);
    }

    return path.join(reportsDirectory, 'coverage-final.json');
}

// Never leave a previous run's number behind if this one fails.
rmSync(mergedReport, { force: true });

const reports = selected.map(runSuite);

const map = createCoverageMap({});
for (const report of reports) {
    if (!existsSync(report)) {
        console.error(`Missing coverage report: ${report}`);
        process.exit(1);
    }
    map.merge(JSON.parse(readFileSync(report, 'utf8')));
}

const files = map.files();
const metrics = ['statements', 'branches', 'functions', 'lines'];
const totals = Object.fromEntries(
    metrics.map((metric) => [metric, { covered: 0, total: 0 }]),
);

for (const file of files) {
    const summary = map.fileCoverageFor(file).toSummary();
    for (const metric of metrics) {
        totals[metric].covered += summary[metric].covered;
        totals[metric].total += summary[metric].total;
    }
}

function percent({ covered, total }) {
    return total === 0 ? 100 : (covered / total) * 100;
}

const label = selected.map((suite) => suite.name).join(' + ');
const rule = '='.repeat(72);

console.log(`\n${rule}`);
console.log(`Project coverage (${label}), untouched files counted as 0%`);
console.log(rule);
for (const metric of metrics) {
    const { covered, total } = totals[metric];
    const name = metric[0].toUpperCase() + metric.slice(1);
    console.log(
        `${name.padEnd(12)}: ${percent(totals[metric]).toFixed(2).padStart(6)}%  ( ${covered}/${total} )`,
    );
}

const groups = new Map();
for (const file of files) {
    const match = file.match(/[\\/](apps|libs)[\\/]([^\\/]+)[\\/]/);
    const name = match ? `${match[1]}/${match[2]}` : 'other';
    const { lines } = map.fileCoverageFor(file).toSummary();
    const group = groups.get(name) ?? { covered: 0, total: 0 };
    group.covered += lines.covered;
    group.total += lines.total;
    groups.set(name, group);
}

console.log('\nBy app (lines)');
for (const [name, group] of [...groups].sort(([a], [b]) =>
    a.localeCompare(b),
)) {
    console.log(
        `  ${name.padEnd(32)} ${percent(group).toFixed(1).padStart(5)}%  (${group.covered}/${group.total})`,
    );
}

const gaps = files
    .map((file) => ({ file, summary: map.fileCoverageFor(file).toSummary() }))
    .filter(({ summary }) => summary.lines.pct < 100)
    .sort((a, b) => a.summary.lines.pct - b.summary.lines.pct);

if (gaps.length > 0) {
    console.log(`\nFiles below 100% lines (${gaps.length})`);
    for (const { file, summary } of gaps.slice(0, 10)) {
        console.log(
            `  ${summary.lines.pct.toFixed(1).padStart(5)}%  ${toPosix(path.relative(root, file))}`,
        );
    }
}

mkdirSync(path.dirname(mergedReport), { recursive: true });
writeFileSync(mergedReport, JSON.stringify(map.toJSON(), null, 2));
console.log(`\nMerged report: ${path.relative(root, mergedReport)}`);

rmSync(cacheDir, { recursive: true, force: true });
