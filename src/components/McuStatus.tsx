import { SessionInfo } from '../types';

interface McuStatusProps {
  session: SessionInfo | null;
  error: string | null;
}

export default function McuStatus({ session, error }: McuStatusProps) {
  return (
    <div className="mcu-status">
      <h3>MCU Status</h3>
      {session ? (
        <div className="connected">
          <p>✅ Connected to {session.target_name}</p>
          {session.chip_id && <p>Chip ID: {session.chip_id}</p>}
          <div className="transport-info">
            <span className={`transport-badge ${session.rtt_enabled ? 'rtt' : 'memory'}`}>
              {session.transport_type}
            </span>
            {session.rtt_enabled && (
              <span className="rtt-indicator">⚡ High-Speed</span>
            )}
          </div>
        </div>
      ) : error ? (
        <div className="error">
          <p>Error: {error}</p>
        </div>
      ) : (
        <div className="disconnected">
          <p>❌ No MCU connected</p>
        </div>
      )}
    </div>
  );
}