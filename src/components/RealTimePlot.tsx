import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { CircularBuffer, DataPoint } from '../utils/CircularBuffer';

interface RealTimePlotProps {
  data: number[];
  title: string;
  color?: string;
  unit?: string;
  bufferSize?: number;
  timeWindow?: number; // seconds
}

export default function RealTimePlot({ 
  data, 
  title, 
  color = "#8884d8", 
  unit = "", 
  bufferSize = 1000,
  timeWindow = 10 
}: RealTimePlotProps) {
  const [buffer] = useState(() => new CircularBuffer(bufferSize));
  const [plotData, setPlotData] = useState<DataPoint[]>([]);

  useEffect(() => {
    if (data.length > 0) {
      const latestValue = data[data.length - 1];
      buffer.push(latestValue);
      
      // Get data within time window
      const now = Date.now();
      const windowStart = now - (timeWindow * 1000);
      const allData = buffer.getAll();
      const windowData = allData.filter(point => point.timestamp >= windowStart);
      
      // Format data for Recharts (relative timestamps)
      const formattedData = windowData.map(point => ({
        timestamp: point.timestamp,
        value: point.value,
        relativeTime: (point.timestamp - now) / 1000 // seconds ago (negative)
      }));
      
      setPlotData(formattedData);
    }
  }, [data, buffer, timeWindow]);

  const formatXAxisLabel = (tickItem: number) => {
    return `${tickItem.toFixed(1)}s`;
  };

  const formatTooltipLabel = (value: number) => {
    return `${Math.abs(value).toFixed(2)}s ago`;
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
              dataKey="relativeTime"
              type="number"
              scale="time"
              domain={[-timeWindow, 0]}
              tickFormatter={formatXAxisLabel}
              stroke="#666"
            />
            <YAxis 
              stroke="#666"
              tickFormatter={(value) => `${value.toFixed(1)}${unit}`}
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