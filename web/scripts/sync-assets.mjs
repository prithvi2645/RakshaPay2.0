// Copies the two trained models and the ONNX Runtime WASM binaries into
// public/ before a dev run or build.
//
// The models are NOT duplicated in the repo: `web/public/models` is gitignored
// and filled from `app/assets/models`, which is the single source of truth
// written by the training pipeline in `ml/`. Two copies of a model file is two
// copies that can silently drift apart, and the whole point of the parity test
// is that the web and Android clients score identically.
//
// The ORT `.wasm`/`.mjs` files are served from `/ort/` rather than bundled, so
// `ort.env.wasm.wasmPaths` can point at a stable URL that works the same in dev,
// in a production build, and on Vercel.

import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const repoRoot = join(webRoot, '..');

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

let copied = 0;

// --- Models -----------------------------------------------------------------
const modelSrc = join(repoRoot, 'app', 'assets', 'models');
const modelDest = join(webRoot, 'public', 'models');

if (!existsSync(modelSrc)) {
  console.error(`[sync-assets] missing ${modelSrc} — run the ml/ training pipeline first`);
  process.exit(1);
}

ensureDir(modelDest);
for (const name of ['scam_text_model.json', 'qr_risk_model.onnx', 'url_risk_model.onnx']) {
  const from = join(modelSrc, name);
  if (!existsSync(from)) {
    console.error(`[sync-assets] missing model ${from}`);
    process.exit(1);
  }
  copyFileSync(from, join(modelDest, name));
  copied++;
}

// --- Parity fixtures (used by the web parity test) ---------------------------
for (const name of ['text_model_parity.json', 'url_feature_parity.json']) {
  const from = join(repoRoot, 'app', 'test', 'fixtures', name);
  if (existsSync(from)) {
    copyFileSync(from, join(modelDest, name));
    copied++;
  }
}

// --- ONNX Runtime WASM ------------------------------------------------------
const ortSrc = join(webRoot, 'node_modules', 'onnxruntime-web', 'dist');
const ortDest = join(webRoot, 'public', 'ort');

if (existsSync(ortSrc)) {
  ensureDir(ortDest);
  for (const name of readdirSync(ortSrc)) {
    // The non-threaded, non-SIMD-gated build is enough here: the model is a
    // 7-feature RandomForest, so inference is sub-millisecond either way, and
    // threading would require cross-origin isolation headers on every page.
    if (name.endsWith('.wasm') || name.endsWith('.mjs')) {
      copyFileSync(join(ortSrc, name), join(ortDest, name));
      copied++;
    }
  }
} else {
  console.warn('[sync-assets] onnxruntime-web not installed yet — skipping ORT runtime files');
}

console.log(`[sync-assets] copied ${copied} file(s) into web/public`);
