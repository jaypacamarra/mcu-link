import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { RttStatus as RttStatusType } from '../types';

interface RttStatusProps {
  isConnected: boolean;
}

export default function RttStatus({ isConnected }: RttStatusProps) {
  const [rttStatus, setRttStatus] = useState<RttStatusType | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchRttStatus = async () => {
    if (!isConnected) {
      setRttStatus(null);
      return;
    }

    setIsLoading(true);
    try {
      const status = await invoke<RttStatusType>('get_rtt_status');
      setRttStatus(status);
    } catch (error) {
      console.error('Failed to fetch RTT status:', error);
      setRttStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRttStatus();
    
    // Refresh RTT status every 2 seconds when connected
    const interval = setInterval(() => {
      if (isConnected) {
        fetchRttStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [isConnected]);

  if (!isConnected || isLoading) {
    return null;
  }

  if (!rttStatus || !rttStatus.enabled) {
    return null;
  }

  return (
    <div className="rtt-status">
      <h4>RTT Status</h4>
      <div className="rtt-details">
        <div className="rtt-detail-item">
          <span className="label">Channels:</span>
          <span className="value">{rttStatus.channels_found}</span>
        </div>
        
        {rttStatus.control_block_addr && (
          <div className="rtt-detail-item">
            <span className="label">Control Block:</span>
            <span className="value mono">0x{rttStatus.control_block_addr.toString(16).toUpperCase().padStart(8, '0')}</span>
          </div>
        )}
        
        <div className="rtt-detail-item">
          <span className="label">Up Channel:</span>
          <span className={`status-indicator ${rttStatus.up_channel_available ? 'available' : 'unavailable'}`}>
            {rttStatus.up_channel_available ? '✅ Available' : '❌ Unavailable'}
          </span>
        </div>
        
        <div className="rtt-detail-item">
          <span className="label">Down Channel:</span>
          <span className={`status-indicator ${rttStatus.down_channel_available ? 'available' : 'unavailable'}`}>
            {rttStatus.down_channel_available ? '✅ Available' : '❌ Unavailable'}
          </span>
        </div>
        
        <div className="rtt-detail-item">
          <span className="label">Bytes Read:</span>
          <span className="value mono">{rttStatus.bytes_read.toLocaleString()}</span>
        </div>
        
        <div className="rtt-detail-item">
          <span className="label">Bytes Written:</span>
          <span className="value mono">{rttStatus.bytes_written.toLocaleString()}</span>
        </div>
        
        {rttStatus.last_activity && (
          <div className="rtt-detail-item">
            <span className="label">Last Activity:</span>
            <span className="value">{rttStatus.last_activity}</span>
          </div>
        )}
      </div>
    </div>
  );
}