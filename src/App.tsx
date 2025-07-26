import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ProbeInfo, SessionInfo } from './types';
import ProbeSelector from './components/ProbeSelector';
import McuStatus from './components/McuStatus';
import "./App.css";

function App() {
  const [probes, setProbes] = useState<ProbeInfo[]>([]);
  const [selectedProbe, setSelectedProbe] = useState<number>(0);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState<boolean>(false);
  const [isDetecting, setIsDetecting] = useState<boolean>(false);
  const [isInitialConnection, setIsInitialConnection] = useState<boolean>(true);

  const detectProbes = async () => {
    setIsDetecting(true);
    setError(null);
    try {
      const detectedProbes = await invoke<ProbeInfo[]>("detect_probes");
      setProbes(detectedProbes);
      
      // Auto-connect to first probe if available
      if (detectedProbes.length > 0) {
        setSelectedProbe(0);
        await connectToMcu(0);
      }
    } catch (err) {
      setError(`Failed to detect probes: ${err}`);
    } finally {
      setIsDetecting(false);
    }
  };

  const connectToMcu = async (probeIndex?: number, isManual: boolean = false) => {
    const index = probeIndex ?? selectedProbe;
    setIsConnecting(true);
    setError(null);
    try {
      const sessionInfo = await invoke<SessionInfo>("connect_to_mcu", { 
        probeIndex: index 
      });
      setSession(sessionInfo);
      setError(null); // Clear any previous errors on successful connection
    } catch (err) {
      // Only show error if this is a manual connection attempt or not the initial auto-connection
      if (isManual || !isInitialConnection) {
        setError(`Failed to connect to MCU: ${err}`);
      }
      setSession(null);
    } finally {
      setIsConnecting(false);
      if (isInitialConnection) {
        setIsInitialConnection(false);
      }
    }
  };

  useEffect(() => {
    detectProbes();
  }, []);

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
      </div>
    </main>
  );
}

export default App;
