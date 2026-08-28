// Product analytics + session replay.
//
// Exists because the app had no instrumentation at all: 32 signups, ~5 of whom
// ever returned, and zero portfolio positions ever created — with no way to see
// where people were dropping off. Session replay is the point here more than
// the event stream; at this user count, watching the sessions is the fastest
// route to understanding why activation fails.
//
// Everything no-ops without VITE_POSTHOG_KEY, so the app runs unchanged in dev,
// in CI, and for anyone who hasn't set the key.

import type { PostHog } from 'posthog-js';

const KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
// EU cloud by default — Consilair OÜ is an Estonian company, so keeping
// personal data in the EU avoids a transfer question that US hosting opens.
const HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://eu.i.posthog.com';

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;

export const analyticsEnabled = () => Boolean(KEY);

/**
 * Loads and initialises PostHog. Dynamically imported so the SDK never lands
 * in the main bundle for users who have analytics disabled, and so a blocked
 * or failed CDN fetch can't take the app down.
 */
export const initAnalytics = async (): Promise<PostHog | null> => {
  if (!KEY) return null;
  if (client) return client;
  if (loading) return loading;

  loading = (async () => {
    try {
      const { default: posthog } = await import('posthog-js');
      posthog.init(KEY, {
        api_host: HOST,
        capture_pageview: false, // sent manually on route change — this is an SPA
        capture_pageleave: true,
        persistence: 'localStorage+cookie',
        session_recording: {
          // The app shows portfolios, positions and account details. Record
          // structure and interaction, never the values inside inputs.
          maskAllInputs: true,
          maskTextSelector: '[data-private]',
        },
        // Respect an explicit opt-out without needing a consent banner first.
        opt_out_capturing_by_default: false,
        autocapture: true,
        disable_session_recording: false,
      });
      client = posthog;
      return posthog;
    } catch (err) {
      console.warn('Analytics unavailable', err);
      return null;
    } finally {
      loading = null;
    }
  })();

  return loading;
};

export const trackPageview = (path: string) => {
  if (!KEY) return;
  void initAnalytics().then((ph) => ph?.capture('$pageview', { $current_url: window.location.origin + path }));
};

export const track = (event: string, props?: Record<string, unknown>) => {
  if (!KEY) return;
  void initAnalytics().then((ph) => ph?.capture(event, props));
};

/** Ties events and replays to a real account so a session can be traced back. */
export const identifyUser = (userId: string, traits?: Record<string, unknown>) => {
  if (!KEY) return;
  void initAnalytics().then((ph) => ph?.identify(userId, traits));
};

export const resetAnalytics = () => {
  if (!KEY) return;
  void initAnalytics().then((ph) => ph?.reset());
};
