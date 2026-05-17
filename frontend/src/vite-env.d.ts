/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_DEBUG_BODIES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
