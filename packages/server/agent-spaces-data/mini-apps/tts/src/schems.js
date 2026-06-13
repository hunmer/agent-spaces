import { PROVIDERS } from './utils/providers';

const VALID_MODES = new Set(['single', 'signal', 'multi']);

function normalizeMode(mode) {
  const value = String(mode || '').trim().toLowerCase();
  if (!VALID_MODES.has(value)) return '';
  return value === 'signal' ? 'single' : value;
}

function normalizeProvider(provider) {
  const value = String(provider || '').trim().toLowerCase();
  return PROVIDERS[value] ? value : '';
}

function normalizeLaunchParams(input) {
  if (!input || typeof input !== 'object') return null;

  const mode = normalizeMode(input.mode);
  const provider = normalizeProvider(input.provider);
  const text = String(input.text || '').trim();

  if (!text) return null;

  return {
    mode: mode || 'single',
    provider: provider || 'minimax',
    text,
  };
}

function parseUrlLaunchParams(search) {
  const params = new URLSearchParams(search || '');
  return normalizeLaunchParams({
    mode: params.get('mode'),
    provider: params.get('provider'),
    text: params.get('text'),
  });
}

export { parseUrlLaunchParams, normalizeLaunchParams };
