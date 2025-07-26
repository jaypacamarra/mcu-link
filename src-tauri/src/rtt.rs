use probe_rs::{Session, rtt::Rtt};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RttStatus {
    pub enabled: bool,
    pub channels_found: usize,
    pub control_block_addr: Option<u64>,
    pub up_channel_available: bool,
    pub down_channel_available: bool,
    pub bytes_read: u64,
    pub bytes_written: u64,
    pub last_activity: Option<String>,
}

impl Default for RttStatus {
    fn default() -> Self {
        Self {
            enabled: false,
            channels_found: 0,
            control_block_addr: None,
            up_channel_available: false,
            down_channel_available: false,
            bytes_read: 0,
            bytes_written: 0,
            last_activity: None,
        }
    }
}

// RTT Protocol Commands
const RTT_CMD_READ: u8 = 0x01;
const RTT_CMD_WRITE: u8 = 0x02;
const RTT_CMD_PING: u8 = 0xFF;

// RTT Response Status
const RTT_STATUS_OK: u8 = 0x00;
const RTT_STATUS_ERROR: u8 = 0x01;
const RTT_STATUS_INVALID_CMD: u8 = 0x02;
const RTT_STATUS_INVALID_TYPE: u8 = 0x03;

// RTT Channels
const RTT_CHANNEL_MCULINK: usize = 1; // Channel 0 is typically console
const RTT_BUFFER_SIZE: usize = 1024;

pub struct RttManager {
    rtt: Option<Rtt>,
    status: RttStatus,
    last_ping: Option<Instant>,
}

impl RttManager {
    pub fn new() -> Self {
        Self {
            rtt: None,
            status: RttStatus::default(),
            last_ping: None,
        }
    }

    /// Attempt to initialize RTT on the target
    pub fn initialize(&mut self, session: &mut Session) -> Result<(), String> {
        println!("RTT: Attempting to initialize RTT");

        // Get target memory map for RTT scanning first
        let memory_map = session.target().memory_map.clone();

        // Get core for RTT operations
        let mut core = session.core(0).map_err(|e| format!("Failed to get core: {}", e))?;
        
        match Rtt::attach(&mut core, &memory_map) {
            Ok(mut rtt) => {
                println!("RTT: Successfully attached to RTT control block");
                let channels_found = rtt.up_channels().len() + rtt.down_channels().len();
                
                // Check if we have the required channels
                let up_channel_available = rtt.up_channels().len() > RTT_CHANNEL_MCULINK;
                let down_channel_available = rtt.down_channels().len() > RTT_CHANNEL_MCULINK;

                self.status = RttStatus {
                    enabled: true,
                    channels_found,
                    control_block_addr: Some(rtt.ptr()),
                    up_channel_available,
                    down_channel_available,
                    bytes_read: 0,
                    bytes_written: 0,
                    last_activity: Some("RTT initialized".to_string()),
                };

                self.rtt = Some(rtt);
                println!("RTT: Initialized with {} channels, CB at 0x{:08X}", 
                    channels_found, self.status.control_block_addr.unwrap());
                
                // Drop core to release borrow before calling send_ping
                drop(core);
                
                // Send initial ping to verify communication
                self.send_ping(session)?;
                
                Ok(())
            },
            Err(e) => {
                println!("RTT: Failed to attach: {}", e);
                self.status.enabled = false;
                Err(format!("Failed to initialize RTT: {}", e))
            }
        }
    }

    /// Send a ping command to test RTT communication
    pub fn send_ping(&mut self, session: &mut Session) -> Result<(), String> {
        if let Some(ref mut rtt) = self.rtt {
            let ping_cmd = [RTT_CMD_PING];
            
            // Get core for RTT operations
            let mut core = session.core(0).map_err(|e| format!("Failed to get core: {}", e))?;
            
            // Send ping on down channel (MCU reads from this)
            if let Some(down_channel) = rtt.down_channels().get(RTT_CHANNEL_MCULINK) {
                match down_channel.write(&mut core, &ping_cmd) {
                    Ok(bytes_written) => {
                        self.status.bytes_written += bytes_written as u64;
                        self.status.last_activity = Some("Ping sent".to_string());
                        self.last_ping = Some(Instant::now());
                        println!("RTT: Ping sent ({} bytes)", bytes_written);
                        Ok(())
                    },
                    Err(e) => {
                        println!("RTT: Failed to send ping: {}", e);
                        Err(format!("Failed to send RTT ping: {}", e))
                    }
                }
            } else {
                Err("RTT down channel not available".to_string())
            }
        } else {
            Err("RTT not initialized".to_string())
        }
    }

    /// Read variable via RTT protocol
    pub fn read_variable(&mut self, session: &mut Session, address: u32, var_type: &str) -> Result<f64, String> {
        if self.rtt.is_none() {
            return Err("RTT not initialized".to_string());
        }

        // Create read command: [CMD][ADDRESS][TYPE]
        let type_code = self.var_type_to_code(var_type)?;
        let mut cmd = Vec::new();
        cmd.push(RTT_CMD_READ);
        cmd.extend_from_slice(&address.to_le_bytes());
        cmd.push(type_code);

        // Get core for RTT operations
        let mut core = session.core(0).map_err(|e| format!("Failed to get core: {}", e))?;
        
        // Send command on down channel
        if let Some(ref mut rtt) = self.rtt {
            if let Some(down_channel) = rtt.down_channels().get(RTT_CHANNEL_MCULINK) {
                match down_channel.write(&mut core, &cmd) {
                    Ok(bytes_written) => {
                        self.status.bytes_written += bytes_written as u64;
                        println!("RTT: Read command sent for 0x{:08X} ({} bytes)", address, bytes_written);
                    },
                    Err(e) => {
                        return Err(format!("Failed to send RTT read command: {}", e));
                    }
                }
            } else {
                return Err("RTT down channel not available".to_string());
            }
        }

        // Drop core to avoid borrowing conflicts
        drop(core);

        // Wait for response on up channel
        let response = self.wait_for_response(session, Duration::from_millis(100))?;
        self.parse_read_response(&response, var_type)
    }

    /// Write variable via RTT protocol  
    pub fn write_variable(&mut self, session: &mut Session, address: u32, var_type: &str, value: f64) -> Result<(), String> {
        if self.rtt.is_none() {
            return Err("RTT not initialized".to_string());
        }

        // Create write command: [CMD][ADDRESS][TYPE][VALUE]
        let type_code = self.var_type_to_code(var_type)?;
        let mut cmd = Vec::new();
        cmd.push(RTT_CMD_WRITE);
        cmd.extend_from_slice(&address.to_le_bytes());
        cmd.push(type_code);
        
        // Add value bytes based on type
        match var_type {
            "UINT8" => cmd.push(value as u8),
            "INT8" => cmd.push(value as i8 as u8),
            "UINT16" => cmd.extend_from_slice(&(value as u16).to_le_bytes()),
            "INT16" => cmd.extend_from_slice(&(value as i16).to_le_bytes()),
            "UINT32" => cmd.extend_from_slice(&(value as u32).to_le_bytes()),
            "INT32" => cmd.extend_from_slice(&(value as i32).to_le_bytes()),
            "FLOAT" => cmd.extend_from_slice(&(value as f32).to_le_bytes()),
            _ => return Err(format!("Unsupported variable type: {}", var_type))
        }

        // Get core for RTT operations
        let mut core = session.core(0).map_err(|e| format!("Failed to get core: {}", e))?;

        // Send command on down channel
        if let Some(ref mut rtt) = self.rtt {
            if let Some(down_channel) = rtt.down_channels().get(RTT_CHANNEL_MCULINK) {
                match down_channel.write(&mut core, &cmd) {
                    Ok(bytes_written) => {
                        self.status.bytes_written += bytes_written as u64;
                        println!("RTT: Write command sent for 0x{:08X} = {} ({} bytes)", address, value, bytes_written);
                    },
                    Err(e) => {
                        return Err(format!("Failed to send RTT write command: {}", e));
                    }
                }
            } else {
                return Err("RTT down channel not available".to_string());
            }
        }

        // Drop core to avoid borrowing conflicts
        drop(core);

        // Wait for acknowledgment
        let response = self.wait_for_response(session, Duration::from_millis(100))?;
        self.parse_write_response(&response)
    }

    /// Wait for response from MCU via RTT up channel
    fn wait_for_response(&mut self, session: &mut Session, timeout: Duration) -> Result<Vec<u8>, String> {
        if let Some(ref mut rtt) = self.rtt {
            let start_time = Instant::now();
            let mut response = Vec::new();
            
            while start_time.elapsed() < timeout {
                // Get core for RTT operations
                let mut core = session.core(0).map_err(|e| format!("Failed to get core: {}", e))?;
                
                if let Some(up_channel) = rtt.up_channels().get(RTT_CHANNEL_MCULINK) {
                    let mut buffer = [0u8; 256];
                    match up_channel.read(&mut core, &mut buffer) {
                        Ok(bytes_read) if bytes_read > 0 => {
                            response.extend_from_slice(&buffer[..bytes_read]);
                            self.status.bytes_read += bytes_read as u64;
                            self.status.last_activity = Some(format!("Read {} bytes", bytes_read));
                            println!("RTT: Received {} bytes", bytes_read);
                            return Ok(response);
                        },
                        Ok(_) => {
                            // No data available, continue waiting
                            std::thread::sleep(Duration::from_millis(1));
                        },
                        Err(e) => {
                            return Err(format!("Failed to read RTT response: {}", e));
                        }
                    }
                } else {
                    return Err("RTT up channel not available".to_string());
                }
            }
            
            Err("RTT response timeout".to_string())
        } else {
            Err("RTT not initialized".to_string())
        }
    }

    /// Parse read response from MCU
    fn parse_read_response(&self, response: &[u8], var_type: &str) -> Result<f64, String> {
        if response.is_empty() {
            return Err("Empty RTT response".to_string());
        }

        let status = response[0];
        if status != RTT_STATUS_OK {
            return Err(format!("RTT read failed with status: {}", status));
        }

        if response.len() < 2 {
            return Err("RTT response too short".to_string());
        }

        let data = &response[1..];
        match var_type {
            "UINT8" => {
                if data.len() >= 1 {
                    Ok(data[0] as f64)
                } else {
                    Err("Insufficient data for UINT8".to_string())
                }
            },
            "INT8" => {
                if data.len() >= 1 {
                    Ok(data[0] as i8 as f64)
                } else {
                    Err("Insufficient data for INT8".to_string())
                }
            },
            "UINT16" => {
                if data.len() >= 2 {
                    Ok(u16::from_le_bytes([data[0], data[1]]) as f64)
                } else {
                    Err("Insufficient data for UINT16".to_string())
                }
            },
            "INT16" => {
                if data.len() >= 2 {
                    Ok(i16::from_le_bytes([data[0], data[1]]) as f64)
                } else {
                    Err("Insufficient data for INT16".to_string())
                }
            },
            "UINT32" => {
                if data.len() >= 4 {
                    Ok(u32::from_le_bytes([data[0], data[1], data[2], data[3]]) as f64)
                } else {
                    Err("Insufficient data for UINT32".to_string())
                }
            },
            "INT32" => {
                if data.len() >= 4 {
                    Ok(i32::from_le_bytes([data[0], data[1], data[2], data[3]]) as f64)
                } else {
                    Err("Insufficient data for INT32".to_string())
                }
            },
            "FLOAT" => {
                if data.len() >= 4 {
                    Ok(f32::from_le_bytes([data[0], data[1], data[2], data[3]]) as f64)
                } else {
                    Err("Insufficient data for FLOAT".to_string())
                }
            },
            _ => Err(format!("Unsupported variable type: {}", var_type))
        }
    }

    /// Parse write response from MCU
    fn parse_write_response(&self, response: &[u8]) -> Result<(), String> {
        if response.is_empty() {
            return Err("Empty RTT response".to_string());
        }

        let status = response[0];
        if status == RTT_STATUS_OK {
            Ok(())
        } else {
            Err(format!("RTT write failed with status: {}", status))
        }
    }

    /// Convert variable type string to type code
    fn var_type_to_code(&self, var_type: &str) -> Result<u8, String> {
        match var_type {
            "UINT8" => Ok(0),
            "INT8" => Ok(1),
            "UINT16" => Ok(2),
            "INT16" => Ok(3),
            "UINT32" => Ok(4),
            "INT32" => Ok(5),
            "FLOAT" => Ok(6),
            _ => Err(format!("Unknown variable type: {}", var_type))
        }
    }

    /// Get current RTT status
    pub fn get_status(&self) -> &RttStatus {
        &self.status
    }

    /// Check if RTT is available and working
    pub fn is_available(&self) -> bool {
        self.status.enabled && self.status.up_channel_available && self.status.down_channel_available
    }

    /// Cleanup RTT resources
    pub fn cleanup(&mut self) {
        self.rtt = None;
        self.status = RttStatus::default();
        self.last_ping = None;
        println!("RTT: Cleaned up RTT resources");
    }
}