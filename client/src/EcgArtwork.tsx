import { useState } from "react";

const leads = ["I", "aVR", "V1", "V4", "II", "aVL", "V2", "V5", "III", "aVF", "V3", "V6"];
const trace = "0,30 12,30 15,27 18,30 22,30 25,22 29,43 33,8 37,34 42,30 48,30 52,27 58,30 72,30 75,27 78,30 82,30 85,22 89,43 93,8 97,34 102,30 108,30 112,27 118,30 132,30 135,27 138,30 142,30 145,22 149,43 153,8 157,34 162,30 168,30 172,27 178,30 192,30 195,27 198,30 202,30 205,22 209,43 213,8 217,34 222,30 228,30";

export function EcgArtwork() {
  const [zoom, setZoom] = useState(100);
  return <div className="ecg-viewer">
    <label>ECG zoom <input aria-label="ECG zoom" type="range" min="100" max="220" step="20" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /> {zoom}%</label>
    <div className="ecg-scroll">
      <svg role="img" aria-label="12-lead ECG development tracing with calibration and lead labels" viewBox="0 0 1000 430" style={{ width: `${zoom}%` }}>
        <defs><pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="#efb6b6" strokeWidth="0.5" /></pattern><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="url(#smallGrid)" /><path d="M 50 0 L 0 0 0 50" fill="none" stroke="#d77f7f" strokeWidth="1" /></pattern></defs>
        <rect width="1000" height="430" fill="#fff9f3" /><rect width="1000" height="430" fill="url(#grid)" />
        <path d="M18 50 v-20 h20 v20 h20" fill="none" stroke="#2d3032" strokeWidth="2" />
        <text x="70" y="42">10 mm/mV · 25 mm/s · development tracing</text>
        {leads.map((lead, index) => {
          const column = index % 4;
          const row = Math.floor(index / 4);
          return <g key={lead} transform={`translate(${20 + column * 242} ${75 + row * 105})`}>
            <text x="0" y="18" fontWeight="700">{lead}</text>
            <polyline points={trace} transform="translate(0 15)" fill="none" stroke="#202629" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          </g>;
        })}
        <text x="20" y="414">Morgan Lee · 58 years · calibration pulse shown · not clinically reviewed</text>
      </svg>
    </div>
  </div>;
}
