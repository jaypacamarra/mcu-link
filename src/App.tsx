import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ProbeInfo, SessionInfo, VariableInfo } from './types';
import ProbeSelector from './components/ProbeSelector';
import McuStatus from './components/McuStatus';
import VariablePanel from './components/VariablePanel';
import PlotPanel from './components/PlotPanel';
import "./App.css";

function App() {
  const [probes, setProbes] = useState<ProbeInfo[]>([]);
  const [selectedProbe, setSelectedProbe] = useState<number>(0);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const isConnectingRef = useRef(false);
  const isDetectingRef = useRef(false);
  const [isInitialConnection, setIsInitialConnection] = useState<boolean>(true);
  const [variables, setVariables] = useState<VariableInfo[]>([]);
  const [hasAttemptedAutoConnect, setHasAttemptedAutoConnect] = useState<boolean>(false);

  const handleVariablesDiscovered = (discoveredVariables: VariableInfo[]) => {
    console.log("App - Variables discovered:", discoveredVariables);
    setVariables(discoveredVariables);
  };

  const detectProbes = async () => {
    console.log("detectProbes called, isDetecting:", isDetecting, "ref:", isDetectingRef.current);
    if (isDetectingRef.current) {
      console.log("Already detecting probes (ref check), skipping");
      return;
    }
    
    isDetectingRef.current = true;
    setIsDetecting(true);
    setError(null);
    try {
      console.log("Starting probe detection");
      const detectedProbes = await invoke<ProbeInfo[]>("detect_probes");
      setProbes(detectedProbes);
      
      // Auto-connect to first probe if available (only once)
      if (detectedProbes.length > 0 && !hasAttemptedAutoConnect) {
        console.log("Auto-connecting to first probe");
        setSelectedProbe(0);
        setHasAttemptedAutoConnect(true);
        await connectToMcu(0);
      } else {
        console.log("Skipping auto-connect: probes =", detectedProbes.length, "hasAttempted =", hasAttemptedAutoConnect);
      }
    } catch (err) {
      setError(`Failed to detect probes: ${err}`);
    } finally {
      setIsDetecting(false);
      isDetectingRef.current = false;
    }
  };

  const connectToMcu = async (probeIndex?: number, isManual: boolean = false, retryCount: number = 3) => {
    const index = probeIndex ?? selectedProbe;
    console.log("connectToMcu called, isConnecting:", isConnecting, "ref:", isConnectingRef.current, "probe:", index, "manual:", isManual);
    
    if (isConnectingRef.current) {
      console.log("Already connecting (ref check), skipping");
      return;
    }
    
    isConnectingRef.current = true;
    setIsConnecting(true);
    setError(null);
    
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        console.log(`Connection attempt ${attempt}/${retryCount} for probe ${index}`);
        const sessionInfo = await invoke<SessionInfo>("connect_to_mcu", { 
          probeIndex: index 
        });
        setSession(sessionInfo);
        setError(null); // Clear any previous errors on successful connection
        console.log(`Connection successful on attempt ${attempt}`);
        setIsConnecting(false); // Clear connecting state immediately on success
        isConnectingRef.current = false;
        if (isInitialConnection) {
          setIsInitialConnection(false);
        }
        return; // Success, exit retry loop
      } catch (err) {
        console.log(`Connection attempt ${attempt} failed:`, err);
        
        // If this is not the last attempt, wait a bit before retrying
        if (attempt < retryCount) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
        } else {
          // Only show error if this is a manual connection attempt or not the initial auto-connection
          if (isManual || !isInitialConnection) {
            setError(`Failed to connect to MCU after ${retryCount} attempts: ${err}`);
          }
          setSession(null);
        }
      }
    }
    
    setIsConnecting(false);
    isConnectingRef.current = false;
    if (isInitialConnection) {
      setIsInitialConnection(false);
    }
  };

  useEffect(() => {
    detectProbes();
  }, []);

  useEffect(() => {
    console.log("App - Variables state updated:", variables);
  }, [variables]);

  return (
    <main className="container">
      <h1>MCU Link</h1>
      
      <div className="status-section">
        <button 
          onClick={detectProbes} 
          disabled={isDetecting}
        >
          {isDetecting ? 'Detecting...' : 'Refresh Probes'}
        </button>
        
        <ProbeSelector 
          probes={probes}
          selectedProbe={selectedProbe}
          onProbeSelect={setSelectedProbe}
          onConnect={() => connectToMcu(undefined, true)}
          isConnecting={isConnecting}
        />
        
        <McuStatus 
          session={session}
          error={error}
        />
        
        <VariablePanel 
          isConnected={session?.connected || false}
          onVariablesDiscovered={handleVariablesDiscovered}
        />
        
        <PlotPanel 
          isConnected={session?.connected || false}
          variables={variables}
        />
      </div>
    </main>
  );
}

export default App;
