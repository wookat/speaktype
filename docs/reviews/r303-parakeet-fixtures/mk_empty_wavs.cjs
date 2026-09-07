// Round 303: write int16 WAVs of the EMPTY-result cases and confirm (after int16 quantization) they still decode empty offline.
const { readFileSync, writeFileSync } = require("fs");
const path = require("path");
const nm = "C:/Users/Administrator/repos/speaktype/desktop/node_modules";
const mod = require(path.join(nm, "sherpa-onnx-node"));
const dir = path.join(process.env.APPDATA, "SpeakType/models/parakeet-tdt-0.6b-v3");
const SR = 16000;
const W = "C:/Users/Administrator/r302/wav";
const rec = new mod.OfflineRecognizer({
  modelConfig: {
    transducer: { encoder: path.join(dir, "encoder.int8.onnx"), decoder: path.join(dir, "decoder.int8.onnx"), joiner: path.join(dir, "joiner.int8.onnx") },
    modelType: "nemo_transducer", tokens: path.join(dir, "tokens.txt"), numThreads: 2, provider: "cpu", debug: 0,
  },
});
function loadWav(file) {
  const buf = readFileSync(file); let off = 12;
  while (off < buf.length) {
    const id = buf.toString("ascii", off, off + 4); const size = buf.readUInt32LE(off + 4);
    if (id === "data") { const n = size / 2; const out = new Float32Array(n); for (let i = 0; i < n; i++) out[i] = buf.readInt16LE(off + 8 + i * 2) / 32768; return out; }
    off += 8 + size;
  }
  throw new Error("no data chunk");
}
function writeWav(file, x) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(x[i] * 32768))), 44 + i * 2);
  writeFileSync(file, b);
}
function decode(samples) { const s = rec.createStream(); s.acceptWaveform({ sampleRate: SR, samples }); rec.decode(s); return rec.getResult(s).text.trim(); }
function build(raw, leadMs, amp, seed) {
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const lead = Math.round((leadMs / 1000) * SR); const buf = new Float32Array(lead + raw.length + 4 * SR);
  for (let i = 0; i < lead; i++) buf[i] = (rnd() - 0.5) * 2 * amp; buf.set(raw, lead);
  for (let i = lead + raw.length; i < buf.length; i++) buf[i] = (rnd() - 0.5) * 2 * amp; return buf;
}
const amp60 = Math.pow(10, -60 / 20);
let made = 0;
for (const [n, f] of [["s09g", "r303/s09g_raw.wav"], ["s08g", "r303/s08g_raw.wav"]]) {
  const raw = loadWav(`${W}/${f}`);
  for (let k = 0; k < 30 && made < 4; k++) {
    const x = build(raw, 700, amp60, 1000 + k);
    if (decode(x)) continue;
    const file = `${W}/r303/empty_${n}_700_${1000 + k}.wav`;
    writeWav(file, x);
    const back = decode(loadWav(file));
    console.log(file, "float->empty; int16 roundtrip ->", JSON.stringify(back));
    if (!back) made++;
  }
}
// control: same sentence, digital-zero lead (always decodes)
const raw = loadWav(`${W}/r303/s09g_raw.wav`);
const ctl = new Float32Array(Math.round(0.7 * SR) + raw.length + 4 * SR); ctl.set(raw, Math.round(0.7 * SR));
writeWav(`${W}/r303/ctl_s09g_700_zero.wav`, ctl);
console.log("control ->", JSON.stringify(decode(loadWav(`${W}/r303/ctl_s09g_700_zero.wav`))));
