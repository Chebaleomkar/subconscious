import { modelSupportsVision } from './model-capabilities.js';

export const OPENCODE_PROVIDER_ID = 'subconscious';
export const OPENCODE_PROVIDER_NAME = 'Subconscious Gateway';

const DISPLAY_NAMES = {
  'subconscious/glm-5.3-marathon': 'GLM 5.3 Marathon',
  'subconscious/glm-5.2': 'GLM 5.2',
  'subconscious/tim-qwen3.6-27b': 'TIM Qwen 3.6 27B',
  'subconscious/deepseek-v4-flash-marathon': 'DeepSeek V4 Flash Marathon',
  'subconscious/deepseek-v4.1-flash-marathon': 'DeepSeek V4.1 Flash Marathon',
};

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function opencodeModelDisplayName(modelId) {
  if (DISPLAY_NAMES[modelId]) return DISPLAY_NAMES[modelId];
  const slug = modelId.startsWith('subconscious/') ? modelId.slice('subconscious/'.length) : modelId;
  return titleCase(slug.replace(/-/g, ' '));
}

export function buildOpenCodeModels(modelIds, { context, output }) {
  return Object.fromEntries(
    modelIds.map((id) => [
      id,
      {
        name: opencodeModelDisplayName(id),
        tools: true,
        limit: { context, output },
        ...(modelSupportsVision(id)
          ? { attachment: true, modalities: { input: ['text', 'image'], output: ['text'] } }
          : {}),
      },
    ]),
  );
}

export function buildOpenCodeConfig({ baseUrl, model, modelIds, context, output }) {
  return {
    $schema: 'https://opencode.ai/config.json',
    disabled_providers: ['subconscious-cli'],
    provider: {
      [OPENCODE_PROVIDER_ID]: {
        npm: '@ai-sdk/openai-compatible',
        name: OPENCODE_PROVIDER_NAME,
        whitelist: [...modelIds],
        options: {
          baseURL: `${baseUrl}/v1`,
          apiKey: '{env:SUBCONSCIOUS_API_KEY}',
          headers: { 'x-subconscious-client': 'opencode' },
          modelsDiscovery: { enabled: false },
        },
        models: buildOpenCodeModels(modelIds, { context, output }),
      },
    },
    model: `${OPENCODE_PROVIDER_ID}/${model}`,
  };
}
