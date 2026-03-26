import Svg, { Path, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';

export default function SparkLine({ data, width = 120, height = 40, color = '#3b82f6', showGradient = true }) {
  if (!data || data.length < 2) return null;

  const values = data.map(d => (typeof d === 'number' ? d : d.value));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const padding = 2;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const points = values.map((v, i) => ({
    x: padding + (i / (values.length - 1)) * chartW,
    y: padding + chartH - ((v - min) / range) * chartH,
  }));

  const lineD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaD = `${lineD} L${points[points.length - 1].x.toFixed(1)},${height} L${points[0].x.toFixed(1)},${height} Z`;

  const isPositive = values[values.length - 1] >= values[0];
  const lineColor = color || (isPositive ? '#22c55e' : '#ef4444');

  return (
    <Svg width={width} height={height}>
      {showGradient && (
        <Defs>
          <LinearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity="0.2" />
            <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
          </LinearGradient>
        </Defs>
      )}
      {showGradient && <Path d={areaD} fill="url(#sparkGrad)" />}
      <Path d={lineD} fill="none" stroke={lineColor} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
