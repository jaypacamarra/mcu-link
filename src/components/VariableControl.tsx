import { useState } from 'react';
import { VariableInfo } from '../types';

interface VariableControlProps {
  variable: VariableInfo;
  value: number;
  onValueChange: (address: number, varType: string, value: number) => void;
}

export default function VariableControl({ variable, value, onValueChange }: VariableControlProps) {
  const [localValue, setLocalValue] = useState(value);

  const handleChange = async (newValue: number) => {
    setLocalValue(newValue);
    try {
      await onValueChange(variable.address, variable.var_type, newValue);
    } catch (err) {
      console.warn(`Write not supported with current probe: ${err}`);
      // Reset to previous value since write failed
      setLocalValue(value);
    }
  };

  const renderControl = () => {
    const isReadOnly = variable.access_flags === "RO";
    
    if (variable.var_type === "UINT8" && variable.max_value === 1) {
      // Button/Toggle control
      if (isReadOnly) {
        // Read-only binary indicator
        return (
          <div className="control-display">
            <label>{variable.name}:</label>
            <span className={`binary-indicator ${value === 1 ? 'active' : 'inactive'}`}>
              {value === 1 ? 'ON' : 'OFF'}
            </span>
          </div>
        );
      } else {
        // Read-write toggle button
        return (
          <div className="control-button">
            <button
              onClick={() => handleChange(localValue === 0 ? 1 : 0)}
              disabled={isReadOnly}
              className={`toggle-btn ${localValue === 1 ? 'active' : ''}`}
            >
              {variable.name}: {localValue === 1 ? 'ON' : 'OFF'}
            </button>
          </div>
        );
      }
    } else if (variable.var_type === "FLOAT" || variable.var_type === "UINT8") {
      // Slider or number display
      if (isReadOnly) {
        return (
          <div className="control-display">
            <label>{variable.name}:</label>
            <span className="value-display">{value.toFixed(2)}</span>
            {variable.var_type === "FLOAT" && <span className="unit">°C</span>}
          </div>
        );
      } else {
        return (
          <div className="control-slider">
            <label>{variable.name}:</label>
            <input
              type="range"
              min={variable.min_value || 0}
              max={variable.max_value || 100}
              step={variable.var_type === "FLOAT" ? 0.1 : 1}
              value={localValue}
              onChange={(e) => handleChange(parseFloat(e.target.value))}
            />
            <span className="value-display">{localValue.toFixed(2)}</span>
          </div>
        );
      }
    }

    return <div>Unsupported type: {variable.var_type}</div>;
  };

  return (
    <div className="variable-control">
      {renderControl()}
    </div>
  );
}