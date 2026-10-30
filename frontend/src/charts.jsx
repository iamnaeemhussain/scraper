import { useMemo, useState } from "react";

const PALETTE = ["#4f46e5", "#0d9488", "#f79009", "#7c3aed", "#0284c7", "#ec4899", "#64748b", "#12b76a"];

function niceMax(value) {
  if (!value || value <= 0) return 5;
  const exponent = Math.floor(Math.log10(value));
  const base = Math.pow(10, exponent);
  const normalised = value / base;
  const step = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10;
  return step * base;
}

/* --------------------------------------------------------------- area chart */
export function AreaChart({ data = [], series = [], height = 210, formatLabel, showGrid = true }) {
  const [hover, setHover] = useState(null);
  const width = 760;
  const padding = { top: 14, right: 12, bottom: 26, left: 34 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;
  const maxValue = niceMax(Math.max(1, ...data.flatMap((row) => series.map((s) => Number(row[s.key]) || 0))));
  const stepX = data.length > 1 ? innerW / (data.length - 1) : innerW;

  const pointFor = (row, index, key) => {
    const value = Number(row[key]) || 0;
    return {
      x: padding.left + index * stepX,
      y: padding.top + innerH - (value / maxValue) * innerH,
      value,
    };
  };

  const paths = series.map((serie) => {
    const points = data.map((row, index) => pointFor(row, index, serie.key));
    if (!points.length) return { ...serie, line: "", area: "" };
    const line = points
      .map((point, index) => (index === 0 ? `M${point.x},${point.y}` : `L${point.x},${point.y}`))
      .join(" ");
    const area = `${line} L${points[points.length - 1].x},${padding.top + innerH} L${points[0].x},${padding.top + innerH} Z`;
    return { ...serie, line, area };
  });

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  if (!data.length) return <div className="empty small">No data for this period.</div>;

  return (
    <div className="chart-shell">
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Collection trend">
        <defs>
          {series.map((serie, index) => (
            <linearGradient key={serie.key} id={`grad-${serie.key}-${index}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={serie.color || PALETTE[index]} stopOpacity="0.26" />
              <stop offset="100%" stopColor={serie.color || PALETTE[index]} stopOpacity="0.02" />
            </linearGradient>
          ))}
        </defs>
        {showGrid && ticks.map((tick) => {
          const y = padding.top + innerH - tick * innerH;
          return (
            <g key={tick}>
              <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="#eef0f7" strokeWidth="1" />
              <text x={padding.left - 8} y={y + 3.5} textAnchor="end" fontSize="9.5" fill="#98a2b3">
                {Math.round(maxValue * tick).toLocaleString()}
              </text>
            </g>
          );
        })}
        {paths.map((path, index) => (
          <g key={path.key}>
            {series.length > 1 || path.key === series[0]?.key ? (
              <path d={path.area} fill={`url(#grad-${path.key}-${index})`} />
            ) : null}
            <path
              d={path.line}
              fill="none"
              stroke={path.color || PALETTE[index]}
              strokeWidth="2.1"
              strokeLinejoin="round"
              strokeLinecap="round"
              strokeDasharray={path.dashed ? "4 3" : undefined}
            />
          </g>
        ))}
        {data.map((row, index) =>
          index % labelEvery === 0 || index === data.length - 1 ? (
            <text
              key={row.date || index}
              x={padding.left + index * stepX}
              y={height - 8}
              textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
              fontSize="9.5"
              fill="#98a2b3"
            >
              {formatLabel ? formatLabel(row) : row.label || row.date}
            </text>
          ) : null,
        )}
        {hover !== null && data[hover] && (
          <line
            x1={padding.left + hover * stepX}
            x2={padding.left + hover * stepX}
            y1={padding.top}
            y2={padding.top + innerH}
            stroke="#c7cdf5"
            strokeDasharray="3 3"
          />
        )}
        {hover !== null && data[hover] &&
          series.map((serie, index) => {
            const point = pointFor(data[hover], hover, serie.key);
            return (
              <circle
                key={serie.key}
                cx={point.x}
                cy={point.y}
                r="3.6"
                fill="#fff"
                stroke={serie.color || PALETTE[index]}
                strokeWidth="2"
              />
            );
          })}
        {data.map((row, index) => (
          <rect
            key={`hit-${index}`}
            x={padding.left + index * stepX - stepX / 2}
            y={padding.top}
            width={stepX}
            height={innerH}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="chart-tooltip"
          style={{ left: `${((padding.left + hover * stepX) / width) * 100}%`, top: 8 }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>
            {formatLabel ? formatLabel(data[hover]) : data[hover].date}
          </div>
          {series.map((serie) => (
            <div key={serie.key} style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              <span>{serie.label}</span>
              <span>{Number(data[hover][serie.key] || 0).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      {series.length > 1 && (
        <div className="chart-legend" style={{ marginTop: 6 }}>
          {series.map((serie, index) => (
            <span className="item" key={serie.key}>
              <span className="tag-dot" style={{ background: serie.color || PALETTE[index] }} />
              {serie.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- bar list */
export function BarList({ items = [], tone = "", max: maxOverride, valueFormatter = (v) => v.toLocaleString() }) {
  const max = maxOverride || Math.max(1, ...items.map((item) => item.value));
  if (!items.length) return <div className="empty small">No data yet.</div>;
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-item" key={item.label}>
          <span className="label truncate" title={item.label}>{item.label}</span>
          <span className="value">{valueFormatter(item.value)}</span>
          <div className="bar-track">
            <div className={`bar-fill ${tone}`} style={{ width: `${Math.max(2, (item.value / max) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ donut */
export function Donut({ items = [], size = 168, thickness = 22, centerLabel, centerValue }) {
  const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  if (!total) {
    return <div className="empty small">No data yet.</div>;
  }

  return (
    <div className="donut-wrap">
      <div style={{ position: "relative", width: size, height: size, flex: "0 0 auto" }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#f2f4f9" strokeWidth={thickness} />
          {items.map((item, index) => {
            const fraction = Number(item.value || 0) / total;
            const dash = fraction * circumference;
            const circle = (
              <circle
                key={item.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={item.color || PALETTE[index % PALETTE.length]}
                strokeWidth={thickness}
                strokeDasharray={`${Math.max(0, dash - 2)} ${circumference - Math.max(0, dash - 2)}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += dash;
            return circle;
          })}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 21, fontWeight: 680, letterSpacing: "-0.02em" }}>
              {centerValue ?? total.toLocaleString()}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {centerLabel || "total"}
            </div>
          </div>
        </div>
      </div>
      <div className="donut-legend">
        {items.map((item, index) => (
          <div className="row-item" key={item.label}>
            <span className="tag-dot" style={{ background: item.color || PALETTE[index % PALETTE.length] }} />
            <span className="truncate">{item.label}</span>
            <span className="val">{Number(item.value).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- sparkline */
export function Sparkline({ data = [], color = "#4f46e5", width = 78, height = 26 }) {
  if (!data.length) return null;
  const values = data.map((point) => Number(point.value ?? point) || 0);
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  const points = values.map((value, index) => `${index * step},${height - ((value - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
    </svg>
  );
}

/* ---------------------------------------------------------- columns chart */
export function ColumnChart({ items = [], height = 168, tone = "#4f46e5", suffix = "" }) {
  const max = niceMax(Math.max(1, ...items.map((item) => item.value)));
  if (!items.length) return <div className="empty small">No data yet.</div>;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height, paddingTop: 8 }}>
      {items.map((item) => (
        <div key={item.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end" }}>
          <span style={{ fontSize: 10.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
            {item.value}{suffix}
          </span>
          <div
            title={`${item.label}: ${item.value}${suffix}`}
            style={{
              width: "100%",
              maxWidth: 46,
              height: `${Math.max(4, (item.value / max) * 100)}%`,
              background: item.color || `linear-gradient(180deg, ${tone}, ${tone}bb)`,
              borderRadius: "7px 7px 3px 3px",
              transition: "height 0.4s ease",
            }}
          />
          <span className="truncate" style={{ fontSize: 10, color: "var(--faint)", maxWidth: "100%" }} title={item.label}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function useChartColors() {
  return useMemo(() => PALETTE, []);
}
