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