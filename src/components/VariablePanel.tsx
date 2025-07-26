import { useEffect, useState, useRef } from 'react';
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
  const [isDiscovering, setIsDiscovering] = useState<boolean>(false);
  const isDiscoveringRef = useRef(false);
  const [mculinkAddress, setMculinkAddress] = useState<string>("0x080F0000");
  const [testResults, setTestResults] = useState<string | null>(null);

  const discoverVariables = async () => {
    console.log("VariablePanel - discoverVariables called, isConnected:", isConnected, "isDiscovering:", isDiscovering, "ref:", isDiscoveringRef.current);
    if (!isConnected) {
      console.log("VariablePanel - Not connected, skipping discovery");
      return;
    }
    
    if (isDiscoveringRef.current) {
      console.log("VariablePanel - Already discovering (ref check), skipping");
      return;
    }
    
    isDiscoveringRef.current = true;
    setIsDiscovering(true);
    console.log("VariablePanel - Starting variable discovery...");
    try {
      // Parse the hex address
      const addressNumber = parseInt(mculinkAddress, 16);
      console.log("VariablePanel - Calling invoke('discover_variables_at_address') with address:", mculinkAddress, "->", addressNumber);
      const discoveredVars = await invoke<VariableInfo[]>("discover_variables_at_address", { address: addressNumber });
      console.log("VariablePanel - invoke completed, result:", discoveredVars);
      
      console.log("VariablePanel - Raw invoke result:", discoveredVars);
      setVariables(discoveredVars);
      setError(null);
      
      console.log("VariablePanel - Discovered variables:", discoveredVars);
      
      // Notify parent component about discovered variables
      if (onVariablesDiscovered) {
        console.log("VariablePanel - Calling onVariablesDiscovered with:", discoveredVars);
        onVariablesDiscovered(discoveredVars);
      } else {
        console.log("VariablePanel - No onVariablesDiscovered callback provided");
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
      console.log("VariablePanel - Discovery failed:", err);
      setError(`Failed to discover variables: ${err}`);
    } finally {
      setIsDiscovering(false);
      isDiscoveringRef.current = false;
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

  const runRamTests = async () => {
    if (!isConnected) return;
    
    try {
      console.log("Running RAM write tests...");
      const results = await invoke<string>("test_ram_writes");
      setTestResults(results);
      console.log("Test results:", results);
    } catch (err) {
      setTestResults(`Test failed: ${err}`);
      console.error("RAM test failed:", err);
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
    console.log("VariablePanel - useEffect triggered, isConnected:", isConnected);
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

      <div className="discovery-controls">
        <label>
          MCU Link Section Address:
          <input 
            type="text" 
            value={mculinkAddress}
            onChange={(e) => setMculinkAddress(e.target.value)}
            placeholder="0x080F0000"
            disabled={!isConnected}
            style={{ marginLeft: '8px', fontFamily: 'monospace' }}
          />
        </label>
        <button onClick={discoverVariables} disabled={!isConnected || isDiscovering}>
          {isDiscovering ? 'Discovering...' : 'Discover Variables'}
        </button>
        <button onClick={runRamTests} disabled={!isConnected} style={{ marginLeft: '8px' }}>
          Test RAM Writes
        </button>
      </div>

      {testResults && (
        <div className="test-results" style={{ 
          marginTop: '10px', 
          padding: '10px', 
          backgroundColor: '#f5f5f5', 
          border: '1px solid #ddd',
          fontFamily: 'monospace',
          whiteSpace: 'pre-line',
          fontSize: '12px'
        }}>
          <h4>RAM Write Test Results:</h4>
          {testResults}
        </div>
      )}

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