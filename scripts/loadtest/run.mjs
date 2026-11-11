#!/usr/bin/env node
/**
 * Load test runner.
 *
 * k6 runs in a container attached to the compose network, so requests go
 * through nginx exactly like real traffic instead of looping back over the
 * host.
 *
 * Usage:
 *   npm run test:load                       # the scenario defined in load.js
 *   npm run test:load -- --smoke            # seconds-long sanity run
 *   npm run test:load -- --vus 10 --duration 30s
 *   npm run test:load -- --help             # anything reaches `k6 run`
 *
 * Environment:
 *   BASE_URL      entry point k6 calls (default http://nginx)
 *   K6_IMAGE      k6 image (default grafana/k6:2.3.0)
 *   PRODUCT_IDS   product ids the checkout flow adds to the cart
 *   THINK_TIME    max seconds a virtual user waits between requests (default 1,
 *                 set 0 for a closed-loop saturation run)
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
);
const scriptDir = path.join(root, 'scripts', 'loadtest');
const image = process.env.K6_IMAGE || 'grafana/k6:2.3.0';
const baseUrl = process.env.BASE_URL || 'http://nginx';

function docker(args, options = {}) {
    return spawnSync('docker', args, {
        cwd: root,
        encoding: 'utf8',
        ...options,
    });
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

if (!existsSync(path.join(scriptDir, 'load.js'))) {
    fail(`Missing load script: ${path.join(scriptDir, 'load.js')}`);
}

if (docker(['info']).status !== 0) {
    fail(
        'Docker is not running. Start Docker Desktop, then bring the stack up.',
    );
}

// Find the network the stack is on instead of hardcoding a project name.
const nginx = docker([
    'ps',
    '--filter',
    'name=nginx-1',
    '--format',
    '{{.Names}}',
])
    .stdout.trim()
    .split('\n')[0];

let network = 'infrastructure_ecommerce';

if (nginx) {
    const networks = docker([
        'inspect',
        nginx,
        '--format',
        '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}',
    ]).stdout.trim();

    if (networks) {
        network = networks.split(/\s+/)[0];
    }
}

if (docker(['image', 'inspect', image]).status !== 0) {
    console.log(`Pulling ${image}...`);
    if (docker(['pull', image], { stdio: 'inherit' }).status !== 0) {
        fail(`Could not pull ${image}.`);
    }
}

const mount = `type=bind,source=${scriptDir.split(path.sep).join('/')},target=/scripts,readonly`;
const extra = process.argv.slice(2);
const k6Args = extra.includes('--smoke')
    ? [...extra.filter((argument) => argument !== '--smoke'), '-e', 'SMOKE=1']
    : extra;

const args = [
    'run',
    '--rm',
    '--init',
    '--network',
    network,
    '--mount',
    mount,
    '-e',
    `BASE_URL=${baseUrl}`,
    image,
    'run',
    ...k6Args,
    '/scripts/load.js',
];

console.log(`Running k6 against ${baseUrl} on network ${network}\n`);

const result = spawnSync('docker', args, { cwd: root, stdio: 'inherit' });

process.exit(result.status ?? 1);
