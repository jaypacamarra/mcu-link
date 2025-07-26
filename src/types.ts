export interface ProbeInfo {
  name: string;
  vendor_id: number;
  product_id: number;
  serial_number?: string;
  probe_type: string;
}

export interface SessionInfo {
  target_name: string;
  connected: boolean;
  chip_id?: string;
  rtt_enabled: boolean;
  transport_type: string; // "RTT", "Memory", or "Hybrid"
}

export interface VariableInfo {
  name: string;
  address: number;
  var_type: string; // "UINT8", "FLOAT", etc.
  access_flags: string; // "RO", "RW"
  category?: string; // "Controls", "Sensors", etc.
  min_value?: number;
  max_value?: number;
}

export interface VariableValue {
  name: string;
  value: number;
}

export interface RttStatus {
  enabled: boolean;
  channels_found: number;
  control_block_addr?: number;
  up_channel_available: boolean;
  down_channel_available: boolean;
  bytes_read: number;
  bytes_written: number;
  last_activity?: string;
}