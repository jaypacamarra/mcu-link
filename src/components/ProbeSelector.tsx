import { ProbeInfo } from '../types';

interface ProbeSelectorProps {
  probes: ProbeInfo[];
  selectedProbe: number;
  onProbeSelect: (index: number) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  isConnecting: boolean;
  isConnected: boolean;
}

export default function ProbeSelector({ 
  probes, 
  selectedProbe, 
  onProbeSelect, 
  onConnect,
  onDisconnect,
  isConnecting,
  isConnected
}: ProbeSelectorProps) {
  return (
    <div className="probe-selector">
      <h3>Debug Probes</h3>
      {probes.length === 0 ? (
        <p>No probes detected</p>
      ) : (
        <div>
          <select 
            value={selectedProbe} 
            onChange={(e) => onProbeSelect(parseInt(e.target.value))}
            disabled={isConnecting || isConnected}
          >
            {probes.map((probe, index) => (
              <option key={index} value={index}>
                {probe.name} ({probe.probe_type})
                {probe.serial_number && ` - ${probe.serial_number}`}
              </option>
            ))}
          </select>
          <div className="probe-actions">
            {!isConnected ? (
              <button 
                onClick={onConnect}
                disabled={isConnecting}
                className="connect-button"
              >
                {isConnecting ? 'Connecting... (Please wait)' : 'Connect'}
              </button>
            ) : (
              <button 
                onClick={onDisconnect}
                className="disconnect-button"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}