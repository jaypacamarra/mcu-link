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
  const [activeTab, setActiveTab] = useState<string>('connection');
  const [mculinkAddress, setMculinkAddress] = useState<string>('0x080F0000');
  const [hasDiscoveredVariables, setHasDiscoveredVariables] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);

  const handleVariablesDiscovered = (discoveredVariables: VariableInfo[]) => {
    console.log("App - Variables discovered:", discoveredVariables);
    setVariables(discoveredVariables);
    setHasDiscoveredVariables(true);
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

  const disconnectFromMcu = async () => {
    try {
      await invoke("disconnect_probe");
      setSession(null);
      setVariables([]);
      setHasDiscoveredVariables(false);
      setError(null);
      console.log("Successfully disconnected from MCU");
    } catch (err) {
      setError(`Failed to disconnect: ${err}`);
      console.error("Disconnect error:", err);
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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'connection':
        return (
          <div className="tab-content">
            <div className="connection-grid">
              <div className="probe-section">
                <h3>Probe Detection</h3>
                <button 
                  onClick={detectProbes} 
                  disabled={isDetecting}
                  className="refresh-btn"
                >
                  {isDetecting ? 'Detecting...' : 'Refresh Probes'}
                </button>
                
                <ProbeSelector 
                  probes={probes}
                  selectedProbe={selectedProbe}
                  onProbeSelect={setSelectedProbe}
                  onConnect={() => connectToMcu(undefined, true)}
                  onDisconnect={disconnectFromMcu}
                  isConnecting={isConnecting}
                  isConnected={session?.connected || false}
                />
              </div>
              
              <div className="status-section">
                <h3>MCU Status</h3>
                <McuStatus 
                  session={session}
                  error={error}
                />
              </div>
            </div>
          </div>
        );
      
      case 'variables':
        return (
          <div className="tab-content">
            <VariablePanel 
              isConnected={session?.connected || false}
              onVariablesDiscovered={handleVariablesDiscovered}
              mculinkAddress={mculinkAddress}
              shouldAutoDiscover={!hasDiscoveredVariables}
              variables={variables}
            />
          </div>
        );
      
      case 'plots':
        return (
          <div className="tab-content">
            <PlotPanel 
              isConnected={session?.connected || false}
              variables={variables}
            />
          </div>
        );
      
      case 'config':
        return (
          <div className="tab-content">
            <div className="config-panel">
              <h3>⚙️ MCU Link Configuration</h3>
              
              <div className="config-section">
                <h4>Memory Layout</h4>
                <div className="config-group">
                  <label htmlFor="mculink-address">
                    MCU Link Section Address:
                    <span className="help-text">Flash memory address where MCU Link variables are stored</span>
                  </label>
                  <div className="address-input-group">
                    <input
                      id="mculink-address"
                      type="text"
                      value={mculinkAddress}
                      onChange={(e) => setMculinkAddress(e.target.value)}
                      placeholder="0x080F0000"
                      className="address-input"
                    />
                    <button 
                      onClick={() => setMculinkAddress('0x080F0000')}
                      className="reset-btn"
                    >
                      Reset Default
                    </button>
                  </div>
                  <div className="address-examples">
                    <span className="example-label">Common addresses:</span>
                    <button 
                      className="example-btn"
                      onClick={() => setMculinkAddress('0x080E0000')}
                    >
                      0x080E0000
                    </button>
                    <button 
                      className="example-btn"
                      onClick={() => setMculinkAddress('0x080F0000')}
                    >
                      0x080F0000 (Default)
                    </button>
                    <button 
                      className="example-btn"
                      onClick={() => setMculinkAddress('0x08100000')}
                    >
                      0x08100000
                    </button>
                  </div>
                </div>
              </div>

              <div className="config-section">
                <h4>Linker Script Configuration</h4>
                <div className="code-block">
                  <div className="code-header">
                    <span>Add to your linker script (.ld file):</span>
                    <button 
                      onClick={() => navigator.clipboard?.writeText(`.mculink ${mculinkAddress} :
{
  . = ALIGN(4);
  KEEP(*(.mculink))        /* MCU Link variable descriptors */
  . = ALIGN(4);
} >FLASH`)}
                      className="copy-btn"
                    >
                      📋 Copy
                    </button>
                  </div>
                  <pre className="code-content">
{`.mculink ${mculinkAddress} :
{
  . = ALIGN(4);
  KEEP(*(.mculink))        /* MCU Link variable descriptors */
  . = ALIGN(4);
} >FLASH`}
                  </pre>
                </div>
              </div>

              <div className="config-section">
                <h4>About MCU Link</h4>
                <div className="info-grid">
                  <div className="info-item">
                    <span className="info-icon">🔍</span>
                    <div>
                      <strong>Auto-Discovery</strong>
                      <p>Scans flash memory for magic number 0x4D434C4B ("MCLK")</p>
                    </div>
                  </div>
                  <div className="info-item">
                    <span className="info-icon">⚡</span>
                    <div>
                      <strong>Real-Time</strong>
                      <p>Updates at configurable rates up to maximum MCU speed</p>
                    </div>
                  </div>
                  <div className="info-item">
                    <span className="info-icon">🎛️</span>
                    <div>
                      <strong>Interactive</strong>
                      <p>Read-only sensors and read-write control variables</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="app-container">
      <div className="app-layout">
        {/* Sidebar */}
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <div className="sidebar-header">
            <button 
              className="hamburger-btn"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
            {sidebarOpen && (
              <div className="sidebar-title">
                <span className="title-icon">⚡</span>
                MCU Link
              </div>
            )}
          </div>
          
          <nav className="sidebar-nav">
            <button 
              className={`nav-item ${activeTab === 'connection' ? 'active' : ''}`}
              onClick={() => setActiveTab('connection')}
              title="Connection"
            >
              <span className="nav-icon">🔌</span>
              {sidebarOpen && <span className="nav-label">Connection</span>}
            </button>
            <button 
              className={`nav-item ${activeTab === 'variables' ? 'active' : ''}`}
              onClick={() => setActiveTab('variables')}
              disabled={!session?.connected}
              title="Variables"
            >
              <span className="nav-icon">📊</span>
              {sidebarOpen && <span className="nav-label">Variables</span>}
            </button>
            <button 
              className={`nav-item ${activeTab === 'plots' ? 'active' : ''}`}
              onClick={() => setActiveTab('plots')}
              disabled={!session?.connected || variables.length === 0}
              title="Real-Time Plots"
            >
              <span className="nav-icon">📈</span>
              {sidebarOpen && <span className="nav-label">Real-Time Plots</span>}
            </button>
            <button 
              className={`nav-item ${activeTab === 'config' ? 'active' : ''}`}
              onClick={() => setActiveTab('config')}
              title="Configuration"
            >
              <span className="nav-icon">⚙️</span>
              {sidebarOpen && <span className="nav-label">Configuration</span>}
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <div className="main-area">
          <header className="app-header">
            <div className="header-content">
              <div className="connection-indicator">
                {session?.connected ? (
                  <span className="status-badge connected">Connected</span>
                ) : (
                  <span className="status-badge disconnected">Disconnected</span>
                )}
              </div>
            </div>
          </header>
          
          <main className="main-content">
            {renderTabContent()}
          </main>
        </div>
      </div>
    </div>
  );
}

export default App;
