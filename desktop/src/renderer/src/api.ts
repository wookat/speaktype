import type { SpeakTypeApi } from "../../preload/index";

declare global {
  interface Window {
    speaktype: SpeakTypeApi;
  }
}

export const api = window.speaktype;
export type { InitPayload, MicDevice } from "../../preload/index";
