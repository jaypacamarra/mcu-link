import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { VariableInfo } from '../types';
import RealTimePlot from './RealTimePlot';

interface PlotPanelProps {
  isConnected: boolean;
  variables: VariableInfo[];
}

interface PlotData {
  [variableName: string]: number[];
}

export default function PlotPanel({ isConnected, variables }: PlotPanelProps) {
  const [plotData, setPlotData] = useState<PlotData>({});
  const [isCollecting, setIsCollecting] = useState(false);

  // Filter variables that should be plotted (read-only numeric types)
  const plottableVars = variables.filter(v => 
    v.access_flags === "RO" && (v.var_type === "FLOAT" || v.var_type === "UINT8" || v.var_type === "INT16")
  );

  // High-frequency data collection (10kHz simulation - actually ~100Hz for demo)
  useEffect(() => {
    if (!isConnected || plottableVars.length === 0) {
      setIsCollecting(false);
      return;
    }

    setIsCollecting(true);
    
    // Initialize plot data arrays
    const initialData: PlotData = {};
    plottableVars.forEach(variable => {
      if (!plotData[variable.name]) {
        initialData[variable.name] = [];
      }
    });
    
    if (Object.keys(initialData).length > 0) {
      setPlotData(prev => ({ ...prev, ...initialData }));
    }

    // High-frequency reading loop
    const interval = setInterval(async () => {
      const newData: PlotData = {};
      
      for (const variable of plottableVars) {
        try {
          const value = await invoke<number>("read_variable", {
            address: variable.address,
            varType: variable.var_type
          });
          
          // Keep last 1000 points (10 seconds at 100Hz, 1 second at 10kHz)
          const currentData = plotData[variable.name] || [];
          const updatedData = [...currentData, value];
          if (updatedData.length > 1000) {
            updatedData.shift(); // Remove oldest point
          }
          
          newData[variable.name] = updatedData;
        } catch (err) {
          console.error(`Failed to read ${variable.name} for plotting:`, err);
        }
      }
      
      if (Object.keys(newData).length > 0) {
        setPlotData(prev => ({ ...prev, ...newData }));
      }
    }, 10); // 100Hz (10ms interval) - can be reduced to 0.1ms for 10kHz

    return () => {
      clearInterval(interval);
      setIsCollecting(false);
    };
  }, [isConnected, plottableVars.length]);

  const clearAllPlots = () => {
    const clearedData: PlotData = {};
    plottableVars.forEach(variable => {
      clearedData[variable.name] = [];
    });
    setPlotData(clearedData);
  };

  if (!isConnected) {
    return (
      <div className="plot-panel">
        <h3>Real-Time Plots</h3>
        <p>Connect to MCU to view real-time data</p>
      </div>
    );
  }

  if (plottableVars.length === 0) {
    return (
      <div className="plot-panel">
        <h3>Real-Time Plots</h3>
        <p>No plottable variables found (need read-only numeric types)</p>
      </div>
    );
  }

  return (
    <div className="plot-panel">
      <div className="plot-header">
        <h3>Real-Time Plots</h3>
        <div className="plot-controls">
          <span className={`status-indicator ${isCollecting ? 'collecting' : 'stopped'}`}>
            {isCollecting ? '🔴 Recording' : '⏹️ Stopped'}
          </span>
          <button onClick={clearAllPlots} disabled={!isConnected}>
            Clear All
          </button>
        </div>
      </div>
      
      <div className="plots-grid">
        {plottableVars.map((variable) => (
          <RealTimePlot
            key={variable.name}
            data={plotData[variable.name] || []}
            title={variable.name}
            color={variable.name.includes('temperature') ? '#ff6b6b' : '#4ecdc4'}
            unit={variable.var_type === 'FLOAT' && variable.name.includes('temperature') ? '°C' : ''}
            timeWindow={10} // 10 second window
            bufferSize={1000}
          />
        ))}
      </div>
    </div>
  );
}