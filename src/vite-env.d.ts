/// <reference types="vite/client" />

/**
 * Build-time environment for the public site.
 *
 * `VITE_SITE_URL` is optional: when it is not set the site uses the origin it is
 * actually served from, and falls back to the permanent domain. It exists so a
 * deployment can pin its canonical origin explicitly (e.g. the testing domain)
 * without a code change. See `src/config/site.ts`.
 */
interface ImportMetaEnv {
  readonly VITE_SITE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
