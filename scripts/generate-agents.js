#!/usr/bin/env node
/**
 * Generate all derived agent data from the single source of truth
 * (`agents/registry.json`):
 *
 *   1. cli/bin/registry.generated.json   — verbatim copy the CLI ships + reads
 *   2. examples/<dir>/package.json        — subconscious.agent + setup blocks
 *   3. examples/manifest.json             — via scripts/generate-manifest.js
 *   4. cli/bin/runbook/model-capabilities.generated.sh — Unix capability lookup
 *
 * Do not hand-edit any of those outputs. Edit registry.json and re-run.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { loadRegistry, substitute } = require('./lib/registry.js');

const ROOT = path.join(__dirname, '..');
const CLI_BIN_DIR = path.join(ROOT, 'cli', 'bin');
const EXAMPLES_DIR = path.join(ROOT, 'examples');

const registry = loadRegistry();
const { defaults } = registry;

// --- 1. CLI data: verbatim copy of the whole registry (CLI substitutes at runtime).
function writeCliData() {
  const out = {
    _generated: 'Source of truth: agents/registry.json. Do not edit by hand.',
    ...registry,
    agents: registry.agents.filter((agent) => agent.cli !== false),
  };
  const dest = path.join(CLI_BIN_DIR, 'registry.generated.json');
  fs.writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
  console.log(`Wrote ${path.relative(ROOT, dest)}`);
}

// Display context: how tokens resolve in the static examples.
const displayCtx = {
  apiKey: defaults.keyPlaceholder,
  model: defaults.model,
  baseUrl: defaults.baseUrl,
  baseUrlV1: defaults.baseUrlV1,
};

/**
 * Build the display-substituted `subconscious.agent` block written to an
 * example's package.json. Preserves `configEnv` only when present.
 */
function buildAgentBlock(agent) {
  const block = {
    id: agent.id,
    name: agent.name,
    protocol: agent.protocol,
    // The templates page expects a string. Flatten the per-OS install object
    // to the representative posix command (linux == darwin for our agents).
    // The fallback / full object are intentionally omitted here.
    install: agent.install.linux,
    launch: substitute(agent.launch, displayCtx),
  };
  if (agent.configEnv) block.configEnv = agent.configEnv;
  block.env = substitute(agent.env, displayCtx);
  return block;
}

/** Does a shell value need single-quoting for a safe `export NAME=VALUE`? */
function needsQuoting(value) {
  return /[^A-Za-z0-9_./:+-]/.test(value);
}

/**
 * Build the `setup` array: one `export NAME=VALUE` per env var (display
 * substituted; quoted when needed), followed by the launch line.
 */
function buildSetup(agent) {
  const env = substitute(agent.env, displayCtx);
  const lines = [];
  for (const [name, value] of Object.entries(env)) {
    const v = needsQuoting(value) ? `'${value}'` : value;
    lines.push(`export ${name}=${v}`);
  }
  lines.push(substitute(agent.launch, displayCtx));
  return lines;
}

// --- 2. Examples: rewrite the generated portions of each package.json.
function writeExamples() {
  for (const agent of registry.agents) {
    if (!agent.exampleDir) continue;
    const pkgPath = path.join(EXAMPLES_DIR, agent.exampleDir, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    pkg.displayName = agent.displayName;
    pkg.description = agent.description;
    pkg.subconscious = {
      language: agent.language,
      framework: agent.framework,
      category: agent.category,
      tags: agent.tags,
      envVars: {
        SUBCONSCIOUS_API_KEY: { required: true, url: defaults.platformUrl },
      },
      agent: buildAgentBlock(agent),
    };
    pkg.setup = buildSetup(agent);

    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log(`Wrote ${path.relative(ROOT, pkgPath)}`);
  }
}

// --- 3. Regenerate the manifest using the existing logic.
function writeManifest() {
  execFileSync('node', [path.join(__dirname, 'generate-manifest.js')], {
    stdio: 'inherit',
  });
}

function writeModelCapabilities() {
  const visionModels = Object.entries(registry.modelCapabilities || {})
    .filter(([, capabilities]) => capabilities.vision === true)
    .map(([id]) => {
      if (!/^[-A-Za-z0-9._:/+]+$/.test(id)) throw new Error(`Invalid model id: ${id}`);
      return `    '${id}') return 0 ;;`;
    });
  const source = [
    '#!/usr/bin/env bash',
    '# Generated from agents/registry.json. Do not edit by hand.',
    '# Exact IDs only: similarly named models do not inherit capabilities.',
    'subc_model_supports_vision() {',
    '  case "${1:-}" in',
    ...visionModels,
    '    *) return 1 ;;',
    '  esac',
    '}',
    '',
  ].join('\n');
  const dest = path.join(CLI_BIN_DIR, 'runbook', 'model-capabilities.generated.sh');
  fs.writeFileSync(dest, source);
  console.log(`Wrote ${path.relative(ROOT, dest)}`);
}

writeCliData();
writeModelCapabilities();
writeExamples();
writeManifest();
