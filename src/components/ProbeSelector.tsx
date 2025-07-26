import { ProbeInfo } from '../types';

interface ProbeSelectorProps {
  probes: ProbeInfo[];
  selectedProbe: number;
  onProbeSelect: (index: number) => void;
  onConnect: () => void;
  isConnecting: boolean;
}

export default function ProbeSelector({ 
  probes, 
  selectedProbe, 
  onProbeSelect, 
  onConnect, 
  isConnecting 
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
            disabled={isConnecting}
          >
            {probes.map((probe, index) => (
              <option key={index} value={index}>
                {probe.name} ({probe.probe_type})
                {probe.serial_number && ` - ${probe.serial_number}`}
              </option>
            ))}
          </select>
          <button 
            onClick={onConnect}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      )}
    </div>
  );
}