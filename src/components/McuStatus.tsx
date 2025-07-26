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