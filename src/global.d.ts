import type { QuiroLiveApi } from '../electron/preload';

declare global {
  interface Window {
    quirolive: QuiroLiveApi;
  }
}
export {};
