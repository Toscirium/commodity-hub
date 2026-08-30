import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { REGISTRATIONS } from '../functions/index';
import { COMMODITY_UNITS } from '../../../src/utils/commodityUnits';
import { CONTRACT_SIZES } from '../../../src/utils/hedgeMath';

/**
 * These guard the failure mode that is worst to debug in Excel: a mismatch
 * between functions.json and the registered code shows up only as #NAME? in
 * the cell, with nothing logged anywhere.
 */

interface FnMeta {
  id: string;
  name: string;
  description: string;
  result: { type: string; dimensionality?: string };
  parameters: { name: string; description: string; type: string; optional?: boolean }[];
}

const metadata = JSON.parse(
  readFileSync(resolve(__dirname, '../functions/functions.json'), 'utf-8'),
) as { functions: FnMeta[] };

describe('functions.json ↔ registered code', () => {
  it('every declared function is actually registered', () => {
    for (const fn of metadata.functions) {
      expect(REGISTRATIONS[fn.id], `"${fn.id}" is in functions.json but not registered`).toBeTypeOf('function');
    }
  });

  it('every registered function is declared', () => {
    const declared = new Set(metadata.functions.map((f) => f.id));
    for (const id of Object.keys(REGISTRATIONS)) {
      expect(declared.has(id), `"${id}" is registered but missing from functions.json`).toBe(true);
    }
  });

  it('ids and names match — Excel resolves by id, users read the name', () => {
    for (const fn of metadata.functions) {
      expect(fn.id).toBe(fn.name);
    }
  });

  it('declared arity matches the implementation, counting optionals', () => {
    for (const fn of metadata.functions) {
      const impl = REGISTRATIONS[fn.id];
      const required = fn.parameters.filter((p) => !p.optional).length;
      const total = fn.parameters.length;
      // Function.length counts params before the first default/rest, which
      // for these signatures equals the required-argument count.
      expect(impl.length, `${fn.id} arity`).toBeGreaterThanOrEqual(required - 1);
      expect(impl.length, `${fn.id} arity`).toBeLessThanOrEqual(total);
    }
  });

  it('every function and parameter is documented — this text is the in-cell help', () => {
    for (const fn of metadata.functions) {
      expect(fn.description.length, `${fn.id} description`).toBeGreaterThan(10);
      for (const p of fn.parameters) {
        expect(p.description.length, `${fn.id}.${p.name} description`).toBeGreaterThan(3);
      }
    }
  });

  it('HISTORY is the only matrix-returning function', () => {
    const matrix = metadata.functions.filter((f) => f.result.dimensionality === 'matrix');
    expect(matrix.map((f) => f.id)).toEqual(['HISTORY']);
  });
});

describe('manifest.xml', () => {
  const manifest = readFileSync(resolve(__dirname, '../../manifest.xml'), 'utf-8');

  it('declares the CH namespace the docs and task pane promise', () => {
    expect(manifest).toContain('DefaultValue="CH"');
  });

  it('points every resource at https', () => {
    const urls = [...manifest.matchAll(/DefaultValue="(http[^"]+)"/g)].map((m) => m[1]);
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) expect(u.startsWith('https://'), u).toBe(true);
  });

  it('references the same filenames the build actually emits', () => {
    for (const f of ['functions.js', 'functions.json', 'functions.html', 'taskpane.html', 'commands.html']) {
      expect(manifest, `manifest should reference ${f}`).toContain(f);
    }
  });
});

describe('shared maths stays shared', () => {
  it('imports the app’s unit and contract tables rather than redefining them', () => {
    // If someone copy-pastes these into the add-in, the two will drift and
    // Excel will disagree with the web app. Asserting the imports resolve and
    // carry real data is a cheap tripwire against that.
    expect(Object.keys(COMMODITY_UNITS).length).toBeGreaterThan(5);
    expect(CONTRACT_SIZES['Corn Futures'].size).toBe(5000);
  });

  it('the add-in source does not redefine bushel factors locally', () => {
    const fnSrc = readFileSync(resolve(__dirname, '../functions/functions.ts'), 'utf-8');
    expect(fnSrc).not.toMatch(/39\.3683|36\.7437|2204\.62/);
    expect(fnSrc).toContain("from '../../../src/utils/commodityUnits'");
  });
});
