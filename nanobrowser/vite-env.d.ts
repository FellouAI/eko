/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_EXAMPLE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
