import { SessionInfo, ChipVerification } from '../types';

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
          
          {/* Chip Verification Status */}
          {session.chip_verification && (
            <div className="chip-verification">
              <h4>Chip Verification</h4>
              <div className={`verification-status ${session.chip_verification.is_verified ? 'verified' : 'warning'}`}>
                {session.chip_verification.actual_part_number && (
                  <p><strong>Detected:</strong> {session.chip_verification.actual_part_number}</p>
                )}
                {session.chip_verification.actual_chip_id && (
                  <p><strong>Chip ID:</strong> 0x{session.chip_verification.actual_chip_id.toString(16).toUpperCase()}</p>
                )}
                <p><strong>Expected:</strong> {session.chip_verification.expected_target}</p>
                {session.chip_verification.warning_message && (
                  <div className={`verification-message ${session.chip_verification.is_verified ? 'success' : 'warning'}`}>
                    {session.chip_verification.warning_message}
                  </div>
                )}
              </div>
            </div>
          )}
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