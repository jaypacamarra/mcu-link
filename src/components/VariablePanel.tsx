import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { VariableInfo } from '../types';
import VariableControl from './VariableControl';

interface VariablePanelProps {
  isConnected: boolean;
  onVariablesDiscovered?: (variables: VariableInfo[]) => void;
}

export default function VariablePanel({ isConnected, onVariablesDiscovered }: VariablePanelProps) {
  const [variables, setVariables] = useState<VariableInfo[]>([]);
  const [values, setValues] = useState<Map<number, number>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const discoverVariables = async () => {
    if (!isConnected) return;
    
    try {
      const discoveredVars = await invoke<VariableInfo[]>("discover_variables");
      setVariables(discoveredVars);
      setError(null);
      
      // Notify parent component about discovered variables
      if (onVariablesDiscovered) {
        onVariablesDiscovered(discoveredVars);
      }
      
      // Initialize values
      const initialValues = new Map();
      for (const variable of discoveredVars) {
        try {
          const value = await invoke<number>("read_variable", {
            address: variable.address,
            varType: variable.var_type
          });
          initialValues.set(variable.address, value);
        } catch (err) {
          console.error(`Failed to read ${variable.name}:`, err);
        }
      }
      setValues(initialValues);
    } catch (err) {
      setError(`Failed to discover variables: ${err}`);
    }
  };

  const handleValueChange = async (address: number, varType: string, value: number) => {
    try {
      await invoke("write_variable", {
        address: address,
        varType: varType,
        value: value
      });
      
      // Update local state
      setValues(prev => new Map(prev.set(address, value)));
    } catch (err) {
      setError(`Failed to write variable: ${err}`);
    }
  };

  // Periodic reading of variables (10Hz for now, will scale to 10kHz later)
  useEffect(() => {
    if (!isConnected || variables.length === 0) return;

    const interval = setInterval(async () => {
      const newValues = new Map(values);
      let hasChanges = false;

      for (const variable of variables) {
        if (variable.access_flags === "RO") { // Only read read-only variables
          try {
            const value = await invoke<number>("read_variable", {
              address: variable.address,
              varType: variable.var_type
            });
            
            if (newValues.get(variable.address) !== value) {
              newValues.set(variable.address, value);
              hasChanges = true;
            }
          } catch (err) {
            console.error(`Failed to read ${variable.name}:`, err);
          }
        }
      }

      if (hasChanges) {
        setValues(newValues);
      }
    }, 100); // 10Hz update rate

    return () => clearInterval(interval);
  }, [isConnected, variables, values]);

  useEffect(() => {
    discoverVariables();
  }, [isConnected]);

  if (!isConnected) {
    return (
      <div className="variable-panel">
        <h3>Variables</h3>
        <p>Connect to MCU to discover variables</p>
      </div>
    );
  }

  // Group variables by category
  const categorizedVars = variables.reduce((acc, variable) => {
    const category = variable.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(variable);
    return acc;
  }, {} as Record<string, VariableInfo[]>);

  return (
    <div className="variable-panel">
      <h3>Variables</h3>
      
      {error && (
        <div className="error">
          <p>{error}</p>
        </div>
      )}

      <button onClick={discoverVariables} disabled={!isConnected}>
        Refresh Variables
      </button>

      {Object.entries(categorizedVars).map(([category, categoryVars]) => (
        <div key={category} className="variable-category">
          <h4>{category}</h4>
          <div className="variables-grid">
            {categoryVars.map((variable) => (
              <VariableControl
                key={variable.address}
                variable={variable}
                value={values.get(variable.address) || 0}
                onValueChange={handleValueChange}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}