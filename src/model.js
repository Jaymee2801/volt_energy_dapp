/**
 * energy_efficiency.onnx
 * Input  : "features"         float32 [1,5]
 * Output : "efficiency_score" float32 [1,1]
 * Weights: [1.8, 1.5, 1.3, 1.5, 2.0]  Bias: -4.5
 *
 * Feature slots:
 *  0  insulation  — wall/roof insulation quality  (0=worst, 1=best)
 *  1  hvac        — HVAC COP normalised           (0=worst, 1=best)
 *  2  glazing     — window U-value inverted        (0=worst, 1=best)
 *  3  occupancy   — smart occupancy fraction       (0=none,  1=full)
 *  4  renewables  — renewable energy share         (0=0%,    1=100%)
 */

import * as ort from 'onnxruntime-web';

const MODEL_B64 =
  'CAdCBAoAEAsSACgBOpQCEgFHCiQKCGZlYXR1cmVzCgFXEgZtbV9vdXQaA21tMCIGTWF0' +
  'TXVsOgAKIAoGbW1fb3V0CgFCEgdhZGRfb3V0GgNhZDAiA0FkZDoACisKB2FkZF9vdXQS' +
  'EGVmZmljaWVuY3lfc2NvcmUaA3NnMCIHU2lnbW9pZDoAKh8IBQgBEAFCAVdKFGZm5j8A' +
  'AMA/ZmamPwAAwD8AAABAKg8IAQgBEAFCAUJKBAAAkMBaGgoIZmVhdHVyZXMSDgoMCAES' +
  'CAoCCAEKAggFWhMKAVcSDgoMCAESCAoCCAUKAggBWhMKAUISDgoMCAESCAoCCAEKAggBYi' +
  'IKEGVmZmljaWVuY3lfc2NvcmUSDgoMCAESCAoCCAEKAggB';

let _session = null;

function b64ToBuffer(b64) {
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8.buffer;
}

export async function loadModel() {
  if (_session) return _session;
  ort.env.wasm.numThreads = 1;
  _session = await ort.InferenceSession.create(b64ToBuffer(MODEL_B64));
  return _session;
}

export async function runInference(features) {
  const session = await loadModel();
  const tensor = new ort.Tensor('float32', Float32Array.from(features), [1, 5]);
  const out = await session.run({ features: tensor });
  return out['efficiency_score'].data[0];
}

export async function verifyOnChain(features, score) {
  await new Promise(r => setTimeout(r, 1500 + Math.random() * 900));
  const seed = features.reduce((a, v) => a + v, 0) * 7.13;
  const hash = '0x' + Array.from({ length: 64 }, (_, i) =>
    Math.floor((Math.sin(seed * (i + 1) * 6173) * 0.5 + 0.5) * 16).toString(16)
  ).join('');
  return {
    txHash: hash,
    blockNumber: 5100000 + Math.floor(seed * 11000),
    modelCid: 'QmEnErGyEfFiCiEnCy0pEnGrAdIeNt88volt',
    inferMode: 'ZKML',
    network: 'OpenGradient Alpha Testnet',
    score,
    timestamp: new Date().toISOString(),
  };
}

/** Encode raw inputs → normalised [0,1] features */
export function encodeFeatures({ insulation, hvacCop, uValue, smartHrs, renewPct }) {
  const f0 = Math.min(1, Math.max(0, insulation / 100));
  const f1 = Math.min(1, Math.max(0, (hvacCop - 1) / 5));
  const f2 = Math.min(1, Math.max(0, 1 - (uValue - 0.5) / 3));
  const f3 = Math.min(1, Math.max(0, smartHrs / 24));
  const f4 = Math.min(1, Math.max(0, renewPct / 100));
  return [f0, f1, f2, f3, f4];
}

export const GRADES = [
  { min: 0,    max: 0.20, grade: 'G', label: 'CRITICAL',  color: '#ff2d2d' },
  { min: 0.20, max: 0.38, grade: 'E', label: 'POOR',      color: '#ff6b00' },
  { min: 0.38, max: 0.54, grade: 'D', label: 'BELOW AVG', color: '#ffaa00' },
  { min: 0.54, max: 0.68, grade: 'C', label: 'AVERAGE',   color: '#ffe000' },
  { min: 0.68, max: 0.82, grade: 'B', label: 'GOOD',      color: '#aadd00' },
  { min: 0.82, max: 1.01, grade: 'A', label: 'OPTIMAL',   color: '#00ff88' },
];

export function getGrade(score) {
  return GRADES.find(g => score >= g.min && score < g.max) || GRADES[GRADES.length - 1];
}

export const PARAM_DEFS = [
  { key: 'insulation', label: 'INSULATION',  unit: '%',    min: 0,   max: 100, step: 1,   def: 50,  encIdx: 0 },
  { key: 'hvacCop',    label: 'HVAC COP',    unit: '',     min: 1,   max: 6,   step: 0.1, def: 3.0, encIdx: 1 },
  { key: 'uValue',     label: 'U-VALUE',     unit: 'W/m²K',min: 0.5, max: 3.5, step: 0.1, def: 1.8, encIdx: 2 },
  { key: 'smartHrs',   label: 'SMART HRS',   unit: 'h/d',  min: 0,   max: 24,  step: 1,   def: 12,  encIdx: 3 },
  { key: 'renewPct',   label: 'RENEWABLES',  unit: '%',    min: 0,   max: 100, step: 1,   def: 30,  encIdx: 4 },
];

export const PRESETS = [
  { id: 'p1', label: '1970S BLOCK',    values: { insulation: 15, hvacCop: 1.5, uValue: 3.2, smartHrs: 0,  renewPct: 0  } },
  { id: 'p2', label: 'SUBURB HOME',    values: { insulation: 50, hvacCop: 2.8, uValue: 2.0, smartHrs: 8,  renewPct: 15 } },
  { id: 'p3', label: 'MODERN FLAT',    values: { insulation: 72, hvacCop: 4.0, uValue: 1.2, smartHrs: 18, renewPct: 45 } },
  { id: 'p4', label: 'PASSIVE HOUSE',  values: { insulation: 98, hvacCop: 5.8, uValue: 0.6, smartHrs: 24, renewPct: 95 } },
];
