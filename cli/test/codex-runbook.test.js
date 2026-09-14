import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'subc-codex-test-'));
const fakeCodex = path.join(testDir, 'codex');
const capturedCatalog = path.join(testDir, 'catalog.json');

await fs.writeFile(
  fakeCodex,
  `#!/bin/sh
for arg in "$@"; do
  case "$arg" in
    model_catalog_json=*) cp "\${arg#model_catalog_json=}" "$CAPTURED_CATALOG" ;;
  esac
done
`,
  { mode: 0o755 },
);

after(async () => {
  await fs.rm(testDir, { recursive: true, force: true });
});

test('Codex advertises image input for DeepSeek V4.1 only, selected or in the picker', async () => {
  const visionModel = 'subconscious/deepseek-v4.1-flash-marathon';
  const otherModel = 'subconscious/deepseek-v4-flash-marathon';
  for (const selected of [visionModel, otherModel]) {
    const result = spawnSync('bash', [new URL('../bin/runbook/codex/run.sh', import.meta.url).pathname], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${testDir}:${process.env.PATH}`,
        GATEWAY_URL: 'https://gateway.example', API_KEY: 'sk-test', MODEL: selected,
        SUBCONSCIOUS_MODELS: [otherModel, visionModel, `${visionModel}-other`].join('\n'),
        SUBC_ENV_FILE: os.devNull, CODEX_DIR: path.join(testDir, '.codex'),
        CAPTURED_CATALOG: capturedCatalog,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const catalog = JSON.parse(await fs.readFile(capturedCatalog, 'utf8'));
    assert.equal(catalog.models[0].slug, selected);
    for (const model of catalog.models) {
      assert.deepEqual(model.input_modalities, model.slug === visionModel ? ['text', 'image'] : undefined, model.slug);
    }
  }
});

test('Codex catalog advertises the configured priority service tier', async () => {
  const runbook = new URL('../bin/runbook/codex/run.sh', import.meta.url);
  const result = spawnSync('bash', [runbook.pathname], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${testDir}:${process.env.PATH}`,
      GATEWAY_URL: 'https://gateway.example',
      API_KEY: 'sk-test',
      MODEL: 'subconscious/glm-5.3-marathon',
      SUBC_ENV_FILE: os.devNull,
      CODEX_DIR: path.join(testDir, '.codex'),
      CAPTURED_CATALOG: capturedCatalog,
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const catalog = JSON.parse(await fs.readFile(capturedCatalog, 'utf8'));
  assert.deepEqual(catalog.models[0].service_tiers, [
    {
      id: 'priority',
      name: 'Priority',
      description: 'Route requests through the configured priority service tier',
    },
  ]);
});
