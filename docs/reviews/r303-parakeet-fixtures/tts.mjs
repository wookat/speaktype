// usage: node tts.mjs <voice> <text> <out.mp3>
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { writeFileSync } from "node:fs";
const [voice, text, out] = process.argv.slice(2);
const tts = new MsEdgeTTS();
await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
const { audioStream } = tts.toStream(text);
const chunks = [];
for await (const c of audioStream) chunks.push(c);
writeFileSync(out, Buffer.concat(chunks));
console.log("ok", out, Buffer.concat(chunks).length);
tts.close();
