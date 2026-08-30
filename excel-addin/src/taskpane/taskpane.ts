/**
 * Task pane: API key entry and a formula reference.
 *
 * Deliberately does nothing else — the value of this add-in is the formulas,
 * and a task pane that tries to be a second UI would just be a worse version
 * of the web app.
 */
import { storeKey, clearKey, hasKey, clearCache, API_BASE } from '../shared/api';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el as T;
};

function setStatus(message: string, kind: 'ok' | 'error' | 'muted' = 'muted') {
  const el = $('status');
  el.textContent = message;
  el.className = `status ${kind}`;
}

/**
 * Verifies a key against the live API before saving it, so a typo surfaces
 * here rather than as #N/A in fifty cells. Uses `sentiment` — it's the
 * cheapest resource available on every tier, so the check works for a free
 * key and doesn't imply a subscription the user may not have.
 */
async function testKey(key: string): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch(`${API_BASE}?resource=sentiment`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (res.ok) return { ok: true, message: 'Key works.' };
    const body = await res.json().catch(() => ({}));
    const code = (body as { error?: string }).error;
    if (code === 'invalid_api_key' || code === 'api_key_required') {
      return { ok: false, message: 'Key rejected — check you copied all of it.' };
    }
    if (code === 'trial_daily_limit_exceeded') {
      // The key is valid; it's just out of quota today.
      return { ok: true, message: 'Key works, but today\'s free-tier quota is used up.' };
    }
    return { ok: false, message: `Unexpected response (${res.status}${code ? `: ${code}` : ''}).` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Network error.' };
  }
}

function wire() {
  const keyInput = $<HTMLInputElement>('key');

  void hasKey().then((present) => {
    if (present) setStatus('A key is saved on this device.', 'ok');
    else setStatus('No key saved yet.', 'muted');
  });

  $('save').addEventListener('click', async () => {
    const value = keyInput.value.trim();
    if (!value) return setStatus('Paste a key first.', 'error');
    if (!value.startsWith('ch_live_')) {
      return setStatus('Keys start with "ch_live_". That looks like something else.', 'error');
    }
    setStatus('Checking…');
    const result = await testKey(value);
    if (!result.ok) return setStatus(result.message, 'error');
    await storeKey(value);
    clearCache();
    keyInput.value = '';
    setStatus(`Saved. ${result.message}`, 'ok');
  });

  $('test').addEventListener('click', async () => {
    const typed = keyInput.value.trim();
    if (typed) {
      setStatus('Checking typed key…');
      const r = await testKey(typed);
      return setStatus(r.message, r.ok ? 'ok' : 'error');
    }
    if (!(await hasKey())) return setStatus('No key saved and nothing typed.', 'error');
    // Round-trip the stored key through a real call.
    setStatus('Checking saved key…');
    try {
      const { apiGet } = await import('../shared/api');
      await apiGet('sentiment');
      setStatus('Saved key works.', 'ok');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Saved key failed.', 'error');
    }
  });

  $('clear').addEventListener('click', async () => {
    await clearKey();
    clearCache();
    setStatus('Key removed from this device.', 'muted');
  });
}

// Office.onReady resolves inside Excel; the fallback lets the pane be opened
// in a plain browser during development.
if (typeof Office !== 'undefined' && Office.onReady) {
  void Office.onReady(() => wire());
} else {
  document.addEventListener('DOMContentLoaded', wire);
}
