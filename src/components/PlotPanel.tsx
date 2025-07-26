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
  const [isPaused, setIsPaused] = useState(false);
  const [dataRate, setDataRate] = useState<number>(0); // 0 = LUDICROUS MODE
  const [timeWindow, setTimeWindow] = useState<number>(1000); // points to show

  // Filter variables that should be plotted (read-only numeric types)
  const plottableVars = variables.filter(v => 
    v.access_flags === "RO" && (v.var_type === "FLOAT" || v.var_type === "UINT8" || v.var_type === "INT16")
  );

  // Only log once when variables are first discovered
  useEffect(() => {
    if (variables.length > 0) {
      console.log("PlotPanel - Variables discovered:", variables.length, "plottable:", plottableVars.length);
    }
  }, [variables.length]);

  // High-frequency data collection (with pause capability)
  useEffect(() => {
    if (!isConnected || plottableVars.length === 0 || isPaused) {
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

    // High-frequency reading loop - TRUE 10kHz!
    const interval = setInterval(async () => {
      const newData: PlotData = {};
      
      for (const variable of plottableVars) {
        try {
          const value = await invoke<number>("read_variable", {
            address: variable.address,
            varType: variable.var_type
          });
          
          // Keep last 10000 points (1 second at 10kHz, 10 seconds at 1kHz)
          const currentData = plotData[variable.name] || [];
          const updatedData = [...currentData, value];
          if (updatedData.length > 10000) {
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
    }, dataRate); // User-configurable data rate!

    return () => {
      clearInterval(interval);
      setIsCollecting(false);
    };
  }, [isConnected, plottableVars.length, dataRate, isPaused]);

  const clearAllPlots = () => {
    const clearedData: PlotData = {};
    plottableVars.forEach(variable => {
      clearedData[variable.name] = [];
    });
    setPlotData(clearedData);
  };

  const dataRateOptions = [
    { value: 0, label: "🚀 MAX Hz", description: "Maximum sampling rate (no limit)" },
    { value: 1, label: "⚡ 1000 Hz", description: "1000 samples per second" },
    { value: 2, label: "🔥 500 Hz", description: "500 samples per second" },
    { value: 8, label: "⭐ 125 Hz", description: "125 samples per second" },
    { value: 16, label: "📊 62.5 Hz", description: "62.5 samples per second" },
    { value: 33, label: "🎯 30 Hz", description: "30 samples per second" },
    { value: 100, label: "🔋 10 Hz", description: "10 samples per second" },
    { value: 500, label: "🐌 2 Hz", description: "2 samples per second" },
  ];

  const handleDataRateChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newRate = parseInt(event.target.value);
    setDataRate(newRate);
    
    // Clear all plots when sampling rate changes
    clearAllPlots();
    
    console.log(`📊 Sampling rate changed to: ${newRate === 0 ? 'MAX Hz' : `${1000/newRate} Hz`}`);
  };

  const timeWindowOptions = [
    { value: 100, label: "100 pts" },
    { value: 250, label: "250 pts" },
    { value: 500, label: "500 pts" },
    { value: 1000, label: "1K pts" },
    { value: 2000, label: "2K pts" },
    { value: 5000, label: "5K pts" },
  ];

  const handleTimeWindowChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const newWindow = parseInt(event.target.value);
    setTimeWindow(newWindow);
    clearAllPlots();
    console.log(`📊 Time window changed to: ${newWindow} points`);
  };

  const handlePauseToggle = () => {
    setIsPaused(!isPaused);
    console.log(`📊 Data collection ${!isPaused ? 'paused' : 'resumed'}`);
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
        <div className="plot-controls" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <div className="control-group" style={{ display: 'flex', alignItems: 'center' }}>
            <label htmlFor="dataRate" style={{ marginRight: '6px', fontWeight: 'bold', fontSize: '14px' }}>Rate:</label>
            <select 
              id="dataRate"
              value={dataRate} 
              onChange={handleDataRateChange}
              disabled={!isConnected}
              style={{ 
                fontFamily: 'monospace', 
                padding: '3px 6px',
                borderRadius: '3px',
                border: '1px solid #ccc',
                backgroundColor: isConnected ? 'white' : '#f5f5f5',
                fontSize: '12px'
              }}
            >
              {dataRateOptions.map(option => (
                <option key={option.value} value={option.value} title={option.description}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group" style={{ display: 'flex', alignItems: 'center' }}>
            <label htmlFor="timeWindow" style={{ marginRight: '6px', fontWeight: 'bold', fontSize: '14px' }}>Window:</label>
            <select 
              id="timeWindow"
              value={timeWindow} 
              onChange={handleTimeWindowChange}
              disabled={!isConnected}
              style={{ 
                fontFamily: 'monospace', 
                padding: '3px 6px',
                borderRadius: '3px',
                border: '1px solid #ccc',
                backgroundColor: isConnected ? 'white' : '#f5f5f5',
                fontSize: '12px'
              }}
            >
              {timeWindowOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>


          <button 
            onClick={handlePauseToggle}
            disabled={!isConnected}
            style={{
              padding: '4px 12px',
              borderRadius: '3px',
              border: '1px solid #ccc',
              backgroundColor: isPaused ? '#ffc107' : '#28a745',
              color: 'white',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              fontSize: '12px',
              fontWeight: 'bold'
            }}
          >
            {isPaused ? '▶️ Resume' : '⏸️ Pause'}
          </button>

          <span className={`status-indicator ${isCollecting ? 'collecting' : 'stopped'}`} style={{ fontWeight: 'bold', fontSize: '14px' }}>
            {isPaused ? '⏸️ Paused' : (isCollecting ? '🔴 Recording' : '⏹️ Stopped')}
          </span>
          
          <button 
            onClick={clearAllPlots} 
            disabled={!isConnected}
            style={{
              padding: '4px 8px',
              borderRadius: '3px',
              border: '1px solid #ccc',
              backgroundColor: isConnected ? '#f8f9fa' : '#e9ecef',
              cursor: isConnected ? 'pointer' : 'not-allowed',
              fontSize: '12px'
            }}
          >
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
            windowSize={timeWindow}
            bufferSize={10000}
          />
        ))}
      </div>
    </div>
  );
}