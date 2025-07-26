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
  chip_verification?: ChipVerification;
}

export interface ChipVerification {
  expected_target: string;
  actual_chip_id?: number;
  actual_part_number?: string;
  is_verified: boolean;
  warning_message?: string;
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

export interface ChipFamily {
  name: string;
  variants: string[];
}

export interface AvailableTargets {
  families: ChipFamily[];
  recommended_stm32h7: string[];
}