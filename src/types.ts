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