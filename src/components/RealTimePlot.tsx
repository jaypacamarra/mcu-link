import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CircularBuffer, DataPoint } from '../utils/CircularBuffer';

interface RealTimePlotProps {
  data: number[];
  title: string;
  color?: string;
  unit?: string;
  bufferSize?: number;
  windowSize?: number; // number of points to display
}

export default function RealTimePlot({ 
  data, 
  title, 
  color = "#8884d8", 
  unit = "", 
  bufferSize = 10000,
  windowSize = 1000
}: RealTimePlotProps) {
  const [buffer] = useState(() => new CircularBuffer(bufferSize));
  const [plotData, setPlotData] = useState<DataPoint[]>([]);
  const [lastUpdateTime, setLastUpdateTime] = useState(0);

  useEffect(() => {
    if (data.length > 0) {
      const latestValue = data[data.length - 1];
      buffer.push(latestValue);
      
      // LUDICROUS SPEED - ZERO THROTTLING! 🚀
      // REMOVED ALL LIMITS - MAXIMUM CHAOS MODE!
      
      // Use sample index instead of timestamps for stable x-axis
      const allData = buffer.getAll();
      const maxPoints = Math.min(300, allData.length); // Limit to 300 points for performance
      const step = Math.max(1, Math.floor(allData.length / maxPoints));
      
      // Use configurable window size
      const recentData = allData.slice(-windowSize);
      
      // Pad with empty slots if needed to maintain consistent array size
      const paddedData = new Array(windowSize).fill(null);
      recentData.forEach((point, index) => {
        paddedData[windowSize - recentData.length + index] = point;
      });
      
      // Convert to chart data with categorical x-axis
      const chartData = paddedData.map((point, index) => ({
        timestamp: point?.timestamp || Date.now(),
        value: point?.value || null,
        x: index.toString() // String index for categorical axis
      }));
      
      setPlotData(chartData);
    }
  }, [data, buffer, windowSize, lastUpdateTime]);

  const formatTooltipLabel = (value: string) => {
    const index = parseInt(value);
    const pointsAgo = (windowSize - index);
    return `${pointsAgo} samples ago`;
  };

  return (
    <div className="real-time-plot">
      <h4>{title}</h4>
      <div className="plot-container">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart
            data={plotData}
            margin={{
              top: 5,
              right: 30,
              left: 20,
              bottom: 5,
            }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
            <XAxis 
              dataKey="x"
              type="category"
              tick={false}
              axisLine={false}
              hide={true}
              tickLine={false}
            />
            <YAxis 
              stroke="#666"
              tickFormatter={(value) => `${value.toFixed(1)}${unit}`}
              domain={['auto', 'auto']}
              allowDataOverflow={false}
            />
            <Tooltip 
              labelFormatter={formatTooltipLabel}
              formatter={(value: number) => [`${value.toFixed(2)}${unit}`, title]}
              contentStyle={{
                backgroundColor: '#f8f9fa',
                border: '1px solid #dee2e6',
                borderRadius: '4px'
              }}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={color} 
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      <div className="plot-stats">
        <span className="data-points">Points: {plotData.length}</span>
        <span className="latest-value">
          Latest: {plotData.length > 0 ? `${plotData[plotData.length - 1].value.toFixed(2)}${unit}` : 'No data'}
        </span>
      </div>
    </div>
  );
}