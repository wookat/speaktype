// Round 303: int8 (app) vs fp32 Parakeet encoder on the same probes.
//  (1) EMPTY rate: s08g/s09g, -60 dBFS floor, lead {300,700,1500}, 30 seeds
//  (2) "Ple" rate: en/s01j/s01g x lead {200,300,500} x (zero + 10 noise seeds)
//  (3) clean regression: 24 fixtures x lead/nolead, word errors; decode latency per utterance
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");
const nm = "C:/Users/Administrator/repos/speaktype/desktop/node_modules";
const mod = require(path.join(nm, "sherpa-onnx-node"));
const SR = 16000;
const W = "C:/Users/Administrator/r302/wav";
const models = {
  int8: { dir: path.join(process.env.APPDATA, "SpeakType/models/parakeet-tdt-0.6b-v3"), enc: "encoder.int8.onnx", dec: "decoder.int8.onnx", joi: "joiner.int8.onnx" },
  fp32: { dir: "C:/Users/Administrator/r302/models/parakeet-fp32", enc: "encoder.onnx", dec: "decoder.onnx", joi: "joiner.onnx" },
};
function mk(m) {
  return new mod.OfflineRecognizer({
    modelConfig: {
      transducer: { encoder: path.join(m.dir, m.enc), decoder: path.join(m.dir, m.dec), joiner: path.join(m.dir, m.joi) },
      modelType: "nemo_transducer", tokens: path.join(m.dir, "tokens.txt"), numThreads: 2, provider: "cpu", debug: 0,
    },
    decodingMethod: "greedy_search", blankPenalty: 0,
  });
}
function loadWav(file) {
  const buf = readFileSync(file); let off = 12;
  while (off < buf.length) {
    const id = buf.toString("ascii", off, off + 4); const size = buf.readUInt32LE(off + 4);
    if (id === "data") { const n = size / 2; const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(off + 8 + i * 2) / 32768; return out; }
    off += 8 + size;
  }
  throw new Error("no data chunk");
}
function decode(rec, samples) { const s = rec.createStream(); s.acceptWaveform({ sampleRate: SR, samples }); rec.decode(s); return rec.getResult(s).text.trim(); }
function build(raw, leadMs, amp, seed) {
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const lead = Math.round((leadMs / 1000) * SR); const buf = new Float32Array(lead + raw.length + 4 * SR);
  if (amp) for (let i = 0; i < lead; i++) buf[i] = (rnd() - 0.5) * 2 * amp; buf.set(raw, lead);
  if (amp) for (let i = lead + raw.length; i < buf.length; i++) buf[i] = (rnd() - 0.5) * 2 * amp; return buf;
}
const norm = (t) => t.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").trim().split(/\s+/).filter(Boolean);
function wer(ref, hyp) {
  const r = norm(ref), h = norm(hyp);
  const d = Array.from({ length: r.length + 1 }, () => new Array(h.length + 1).fill(0));
  for (let i = 0; i <= r.length; i++) d[i][0] = i; for (let j = 0; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) for (let j = 1; j <= h.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
  return d[r.length][h.length];
}
const amp60 = Math.pow(10, -60 / 20);
const emptySrc = { s08g: loadWav(`${W}/r303/s08g_raw.wav`), s09g: loadWav(`${W}/r303/s09g_raw.wav`) };
const pleSrc = { en: loadWav(`${W}/en_raw.wav`), s01j: loadWav(`${W}/r303/s01j_raw.wav`), s01g: loadWav(`${W}/r303/s01g_raw.wav`) };
const manifest = JSON.parse(readFileSync(`${W}/r303/manifest.json`, "utf8").replace(/^\uFEFF/, ""));
const fixtures = manifest.flatMap((m) => ["lead", "nolead"].map((v) => ({ key: `${m.name}/${v}`, text: m.text, wav: loadWav(`${W}/r303/${m.name}_${v}.wav`) })));
const which = process.argv[2] || "fp32";
const m = models[which];
const t0 = Date.now();
const rec = mk(m);
const loadSec = (Date.now() - t0) / 1000;
const rss0 = process.memoryUsage().rss;
let emptyN = 0; const emptyBy = {};
for (const [n, raw] of Object.entries(emptySrc)) for (const ms of [300, 700, 1500]) { let e = 0; for (let k = 0; k < 30; k++) if (!decode(rec, build(raw, ms, amp60, 1000 + k))) e++; emptyBy[`${n}@${ms}`] = e; emptyN += e; }
let pleN = 0; const pleBy = {}; const pleEx = [];
for (const [n, raw] of Object.entries(pleSrc)) for (const ms of [200, 300, 500]) {
  let bad = 0; const t = decode(rec, build(raw, ms, 0, 0)); if (!t.startsWith("Please")) { bad++; pleEx.push(`${n}@${ms}/zero: ${t.split(" ")[0]}`); }
  for (let k = 0; k < 10; k++) { const u = decode(rec, build(raw, ms, amp60, 3000 + k)); if (!u.startsWith("Please")) { bad++; pleEx.push(`${n}@${ms}#${k}: ${u.split(" ")[0]}`); } }
  pleBy[`${n}@${ms}`] = bad; pleN += bad;
}
let err = 0, words = 0; const hyps = {}; const lat = [];
for (const f of fixtures) { const a = Date.now(); const h = decode(rec, f.wav); lat.push(Date.now() - a); hyps[f.key] = h; err += wer(f.text, h); words += norm(f.text).length; }
lat.sort((a, b) => a - b);
const out = { model: which, loadSec, rssMiB: Math.round(process.memoryUsage().rss / 1048576), empty: `${emptyN}/180`, emptyBy, ple: `${pleN}/99`, pleBy, pleEx: pleEx.slice(0, 20), cleanWordErr: `${err}/${words}`, latencyMsMedian: lat[Math.floor(lat.length / 2)], latencyMsP90: lat[Math.floor(lat.length * 0.9)], hyps };
console.log(JSON.stringify({ ...out, hyps: undefined }));
writeFileSync(`C:/Users/Administrator/r302/evidence/r303_parakeet_${which}_ab.json`, JSON.stringify(out, null, 2));
