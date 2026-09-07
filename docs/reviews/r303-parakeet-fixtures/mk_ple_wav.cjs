// Round 303: write the deterministic "Ple" first-word repro (s01j, 300 ms digital-zero lead, 4 s zero tail) and confirm int16 roundtrip.
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
for (const [src, ms] of [["s01j", 300], ["s01j", 500], ["en", 200]]) {
  const raw = loadWav(`${W}/${src === "en" ? "en_raw.wav" : `r303/${src}_raw.wav`}`);
  const lead = Math.round((ms / 1000) * SR);
  const x = new Float32Array(lead + raw.length + 4 * SR); x.set(raw, lead);
  const file = `${W}/r303/ple_${src}_${ms}_zero.wav`;
  writeWav(file, x);
  console.log(file, "->", JSON.stringify(decode(loadWav(file))));
}
