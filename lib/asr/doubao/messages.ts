import type { DoubaoIds } from "./protocol";

/** offscreen/背景 → doubao.com 页面里的桥接 content script */
export type ToBridge =
  | { target: "doubao-bridge"; type: "open"; language: string }
  | { target: "doubao-bridge"; type: "frame"; data: string }
  | { target: "doubao-bridge"; type: "close" };

/** 桥接 → offscreen */
export type FromBridge =
  | { target: "doubao-client"; type: "open-ok"; ids: DoubaoIds }
  | { target: "doubao-client"; type: "frame"; data: string }
  | { target: "doubao-client"; type: "closed"; code?: number }
  | { target: "doubao-client"; type: "error"; message: string };

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function fromBase64(data: string): Uint8Array {
  const binary = atob(data);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}
