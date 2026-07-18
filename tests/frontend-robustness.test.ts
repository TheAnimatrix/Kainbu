import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { FLUENT_ICON_COLLECTION } from '../src/lib/icons/fluent-icons';
import { FLUENT_ICON_MAP } from '../src/lib/icons/fluent-map';

const root = resolve(import.meta.dirname, '..');

function largestClientChunk() {
  const clientDir = resolve(root, '.svelte-kit/output/client/_app/immutable');
  const files = readdirSync(clientDir, { recursive: true })
    .filter((entry): entry is string => typeof entry === 'string' && entry.endsWith('.js'))
    .map((entry) => resolve(clientDir, entry));
  return Math.max(...files.map((file) => statSync(file).size));
}

describe('frontend robustness guardrails', () => {
  it('includes every mapped Fluent icon without importing the full collection', () => {
    for (const iconId of Object.values(FLUENT_ICON_MAP)) {
      expect(FLUENT_ICON_COLLECTION.icons[iconId]).toBeDefined();
    }

    const registerSource = readFileSync(resolve(root, 'src/lib/icons/register.ts'), 'utf8');
    const svgSource = readFileSync(resolve(root, 'src/lib/icons/fluent-svg.ts'), 'utf8');
    expect(`${registerSource}\n${svgSource}`).not.toContain("@iconify-json/fluent");
    expect(Object.keys(FLUENT_ICON_COLLECTION.icons).length).toBeLessThan(100);
  });

  it('keeps the largest built client chunk below the confirmed regression threshold', () => {
    expect(largestClientChunk()).toBeLessThan(2_000_000);
  });

  it('uses event-driven overlay measurement instead of a perpetual RAF loop', () => {
    const source = readFileSync(resolve(root, 'src/lib/components/TaskLinkOverlay.svelte'), 'utf8');
    expect(source).toContain('const scheduleMeasure');
    expect(source).not.toContain('startMeasureLoop');
    expect(source).not.toContain('measureLoopId');
  });
});
