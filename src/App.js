import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  loadModel, runInference, verifyOnChain,
  encodeFeatures, getGrade, GRADES, PARAM_DEFS, PRESETS,
} from './model';
import './App.css';

/* ── Big score readout ────────────────────────────────────────────────── */
function ScoreBlock({ score, grade }) {
  const pct = (score * 100).toFixed(1);
  const segments = 20;
  const filled = Math.round(score * segments);

  return (
    <div className="score-block">
      {/* Giant number */}
      <div className="score-giant" style={{ color: grade.color }}>
        {pct}
        <span className="score-unit">%</span>
      </div>

      {/* Grade badge */}
      <div className="grade-badge" style={{ background: grade.color }}>
        <span className="grade-letter">GRADE {grade.grade}</span>
        <span className="grade-label">{grade.label}</span>
      </div>

      {/* Segmented progress bar */}
      <div className="seg-bar">
        {Array.from({ length: segments }, (_, i) => (
          <div
            key={i}
            className="seg-cell"
            style={{
              background: i < filled ? grade.color : 'rgba(255,255,255,0.06)',
              boxShadow: i < filled ? `0 0 6px ${grade.color}99` : 'none',
            }}
          />
        ))}
      </div>

      {/* Grade scale */}
      <div className="grade-scale">
        {GRADES.map(g => (
          <div
            key={g.grade}
            className={'scale-item' + (g.grade === grade.grade ? ' scale-active' : '')}
            style={{ borderColor: g.grade === grade.grade ? g.color : 'transparent', color: g.grade === grade.grade ? g.color : '#333' }}
          >
            {g.grade}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Parameter dial (vertical meter) ─────────────────────────────────── */
function ParamMeter({ def, value, encVal, onChange }) {
  const pct = (value - def.min) / (def.max - def.min);
  const meterColor = encVal > 0.65 ? '#00ff88' : encVal > 0.35 ? '#ffe000' : '#ff2d2d';
  const meterHeight = encVal * 100;

  return (
    <div className="param-meter">
      <div className="pm-label">{def.label}</div>

      {/* Vertical fill bar */}
      <div className="pm-tube">
        <div
          className="pm-fill"
          style={{ height: meterHeight + '%', background: meterColor, boxShadow: `0 0 12px ${meterColor}66` }}
        />
        <div className="pm-enc-text" style={{ color: meterColor }}>
          {(encVal * 100).toFixed(0)}
        </div>
      </div>

      {/* Slider */}
      <input
        type="range"
        className="pm-slider"
        min={def.min}
        max={def.max}
        step={def.step}
        value={value}
        onChange={e => onChange(def.key, parseFloat(e.target.value))}
        style={{ '--pct': (pct * 100) + '%', '--col': meterColor }}
      />

      {/* Value readout */}
      <div className="pm-value">
        {def.key === 'hvacCop' ? value.toFixed(1) : def.key === 'uValue' ? value.toFixed(1) : Math.round(value)}
        <span className="pm-unit">{def.unit}</span>
      </div>
    </div>
  );
}

/* ── Chain proof ──────────────────────────────────────────────────────── */
function ChainProof({ proof, verifying }) {
  if (verifying) {
    return (
      <div className="proof-box loading-proof">
        <div className="proof-spinner" />
        <div>
          <div className="proof-loading-title">BROADCASTING TO OPENGRADIENT…</div>
          <div className="proof-loading-sub">generating zkml proof · validator consensus</div>
        </div>
      </div>
    );
  }
  if (!proof) return null;

  const fields = [
    ['NETWORK',   proof.network],
    ['MODE',      proof.inferMode],
    ['BLOCK',     '#' + proof.blockNumber.toLocaleString()],
    ['MODEL CID', proof.modelCid.slice(0, 18) + '…'],
    ['TX HASH',   proof.txHash.slice(0, 18) + '…'],
    ['TIME',      new Date(proof.timestamp).toLocaleTimeString()],
  ];

  return (
    <div className="proof-box verified-proof">
      <div className="proof-header">
        <span className="proof-tick">✓</span>
        <span className="proof-title">ON-CHAIN VERIFIED</span>
        <span className="proof-zkml">ZKML</span>
      </div>
      <div className="proof-fields">
        {fields.map(([k, v]) => (
          <div key={k} className="proof-field">
            <span className="pf-key">{k}</span>
            <span className="pf-val">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main App ─────────────────────────────────────────────────────────── */
export default function App() {
  const defaults = Object.fromEntries(PARAM_DEFS.map(d => [d.key, d.def]));

  const [vals, setVals] = useState(defaults);
  const [score, setScore] = useState(null);
  const [proof, setProof] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [scanAnim, setScanAnim] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    loadModel().then(() => setModelReady(true)).catch(console.error);
  }, []);

  const encoded = encodeFeatures(vals);
  const grade = score !== null ? getGrade(score) : null;

  const doInfer = useCallback(async (currentVals) => {
    if (!modelReady) return;
    try {
      const features = encodeFeatures(currentVals);
      const result = await runInference(features);
      setScore(result);
      setProof(null);
      setScanAnim(true);
      setTimeout(() => setScanAnim(false), 700);
    } catch (err) {
      console.error('Inference error:', err);
    }
  }, [modelReady]);

  useEffect(() => {
    if (!modelReady) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doInfer(vals), 180);
    return () => clearTimeout(debounceRef.current);
  }, [vals, modelReady, doInfer]);

  const handleChange = (key, value) => {
    setVals(prev => ({ ...prev, [key]: value }));
    setActivePreset(null);
  };

  const applyPreset = (preset) => {
    setVals(preset.values);
    setActivePreset(preset.id);
    setProof(null);
  };

  const doVerify = useCallback(async () => {
    if (score === null || verifying) return;
    setVerifying(true);
    try {
      const result = await verifyOnChain(encoded, score);
      setProof(result);
    } catch (err) {
      console.error('Verify error:', err);
    } finally {
      setVerifying(false);
    }
  }, [score, encoded, verifying]);

  /* Derived display values */
  const annualKwh = score !== null ? Math.round(50000 - score * 38000) : null;
  const co2Tonnes = score !== null ? ((1 - score) * 18.4).toFixed(1) : null;
  const savingsPct = score !== null ? Math.round(score * 76) : null;

  return (
    <div className={'app' + (scanAnim ? ' scan' : '')}>

      {/* Scan line overlay */}
      {scanAnim && <div className="scan-line" style={{ '--gc': grade ? grade.color : '#ffe000' }} />}

      {/* ── HEADER ── */}
      <header className="header">
        <div className="header-logo">
          <span className="logo-volt">VOLT</span>
          <span className="logo-sep">///</span>
          <span className="logo-sub">ENERGY EFFICIENCY · OPENGRADIENT NETWORK</span>
        </div>
        <div className="header-right">
          <div className={'model-status' + (modelReady ? ' ready' : ' wait')}>
            <span className="ms-dot" />
            <span>{modelReady ? 'MODEL ONLINE' : 'LOADING…'}</span>
          </div>
          <div className="header-file">energy_efficiency.onnx</div>
        </div>
      </header>

      {/* ── MAIN GRID ── */}
      <div className="grid-layout">

        {/* COL A — presets + meters */}
        <div className="col-a">

          {/* Preset selector */}
          <div className="panel presets-panel">
            <div className="panel-label">// SELECT BUILDING TYPE</div>
            <div className="preset-row">
              {PRESETS.map(p => (
                <button
                  key={p.id}
                  className={'preset-chip' + (activePreset === p.id ? ' chip-active' : '')}
                  onClick={() => applyPreset(p)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Parameter meters */}
          <div className="panel meters-panel">
            <div className="panel-label">// BUILDING PARAMETERS</div>
            <div className="meters-row">
              {PARAM_DEFS.map(def => (
                <ParamMeter
                  key={def.key}
                  def={def}
                  value={vals[def.key]}
                  encVal={encoded[def.encodeIdx]}
                  onChange={handleChange}
                />
              ))}
            </div>
          </div>

          {/* Tensor readout */}
          <div className="panel tensor-panel">
            <div className="panel-label">// RAW TENSOR FEED</div>
            <div className="tensor-line">
              <span className="tl-tag">IN  float32[1,5]</span>
              <span className="tl-data">[{encoded.map(v => v.toFixed(4)).join('  ')}]</span>
            </div>
            {score !== null && grade && (
              <div className="tensor-line">
                <span className="tl-tag">OUT float32[1,1]</span>
                <span className="tl-data" style={{ color: grade.color }}>
                  [{score.toFixed(8)}]
                </span>
              </div>
            )}
          </div>
        </div>

        {/* COL B — score + stats + verify */}
        <div className="col-b">

          {/* Score */}
          <div className="panel score-panel">
            <div className="panel-label">// EFFICIENCY SCORE</div>
            {score !== null && grade ? (
              <ScoreBlock score={score} grade={grade} />
            ) : (
              <div className="score-idle">
                <div className="idle-pulse" />
                <div className="idle-text">AWAITING INPUT</div>
              </div>
            )}
          </div>

          {/* Stats grid */}
          {score !== null && grade && (
            <div className="panel stats-panel">
              <div className="panel-label">// BUILDING METRICS</div>
              <div className="stats-grid">
                <div className="stat-block">
                  <div className="stat-num" style={{ color: grade.color }}>{annualKwh?.toLocaleString()}</div>
                  <div className="stat-desc">EST. kWh/yr</div>
                </div>
                <div className="stat-block">
                  <div className="stat-num" style={{ color: grade.color }}>{co2Tonnes}t</div>
                  <div className="stat-desc">CO₂ / YEAR</div>
                </div>
                <div className="stat-block">
                  <div className="stat-num" style={{ color: grade.color }}>{savingsPct}%</div>
                  <div className="stat-desc">COST SAVING</div>
                </div>
                <div className="stat-block">
                  <div className="stat-num" style={{ color: grade.color }}>{grade.grade}</div>
                  <div className="stat-desc">EPC GRADE</div>
                </div>
              </div>
            </div>
          )}

          {/* Verify */}
          {score !== null && (
            <div className="panel verify-panel">
              <div className="panel-label">// OPENGRADIENT ZKML VERIFICATION</div>
              {!proof && !verifying && (
                <button className="btn-verify" onClick={doVerify}>
                  <span className="bv-icon">⛓</span>
                  VERIFY ON-CHAIN
                </button>
              )}
              <ChainProof proof={proof} verifying={verifying} />
            </div>
          )}

        </div>
      </div>

      {/* ── FOOTER ── */}
      <footer className="footer">
        <span>VOLT · ENERGY EFFICIENCY DAPP</span>
        <span className="f-sep">//</span>
        <span>energy_efficiency.onnx</span>
        <span className="f-sep">//</span>
        <span>ONNX RUNTIME WEB</span>
        <span className="f-sep">//</span>
        <span>OPENGRADIENT ALPHA TESTNET</span>
        <span className="f-sep">//</span>
        <span>INDICATIVE ONLY — NOT CERTIFIED</span>
      </footer>
    </div>
  );
}
