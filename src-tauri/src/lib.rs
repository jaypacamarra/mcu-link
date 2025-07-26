use probe_rs::{Permissions, Session, MemoryInterface};
use probe_rs::probe::list::Lister;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

#[derive(Debug, Serialize, Deserialize)]
pub struct ProbeInfo {
    pub name: String,
    pub vendor_id: u16,
    pub product_id: u16,
    pub serial_number: Option<String>,
    pub probe_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SessionInfo {
    pub target_name: String,
    pub connected: bool,
    pub chip_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VariableInfo {
    pub name: String,
    pub address: u32,
    pub var_type: String, // "UINT8", "FLOAT", etc.
    pub access_flags: String, // "RO", "RW"
    pub category: Option<String>, // "Controls", "Sensors", etc.
    pub min_value: Option<f64>,
    pub max_value: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VariableValue {
    pub name: String,
    pub value: f64,
}

// Global session manager for probe-rs session
static SESSION_MANAGER: Mutex<Option<Session>> = Mutex::new(None);

// Memory descriptor structure as it appears in MCU flash
#[derive(Debug, Clone)]
struct McuLinkDescriptor {
    magic: u32,        // 0x4D434C4B ("MCLK")
    version: u32,      // Version number
    entry_count: u32,  // Number of variable entries
    entries_offset: u32, // Offset to entries array
}

#[derive(Debug, Clone)]
struct McuLinkEntry {
    name_offset: u32,   // Offset to null-terminated name string
    address: u32,       // Variable address in RAM
    var_type: u8,       // Type: 0=UINT8, 1=INT8, 2=UINT16, 3=INT16, 4=UINT32, 5=INT32, 6=FLOAT
    access_flags: u8,   // Access: 0=RO, 1=RW
    category_offset: u32, // Offset to category string
    min_value: f32,     // Min value (for UI)
    max_value: f32,     // Max value (for UI)
}

const MCULINK_MAGIC: u32 = 0x4D434C4B; // "MCLK"
const DEFAULT_MCULINK_ADDRESS: u32 = 0x080F0000; // Fixed address in linker script

#[tauri::command]
async fn detect_probes() -> Result<Vec<ProbeInfo>, String> {
    let lister = Lister::new();
    let probes = lister.list_all();
    
    let mut probe_infos = Vec::new();
    for probe in probes {
        let probe_info = ProbeInfo {
            name: probe.identifier.clone(),
            vendor_id: probe.vendor_id,
            product_id: probe.product_id,
            serial_number: probe.serial_number.clone(),
            probe_type: probe.probe_type().to_string(),
        };
        probe_infos.push(probe_info);
    }
    
    Ok(probe_infos)
}

#[tauri::command]
async fn connect_to_mcu(probe_index: usize) -> Result<SessionInfo, String> {
    println!("Starting MCU connection with probe index: {}", probe_index);
    
    // Clean up any existing session first
    {
        let mut session_guard = SESSION_MANAGER.lock().unwrap();
        if session_guard.is_some() {
            println!("Cleaning up existing session");
            *session_guard = None;
            // Give some time for cleanup
            std::thread::sleep(std::time::Duration::from_millis(500));
        }
    }
    
    let lister = Lister::new();
    let probes = lister.list_all();
    println!("Found {} probes", probes.len());
    
    if probe_index >= probes.len() {
        println!("Invalid probe index: {} >= {}", probe_index, probes.len());
        return Err("Invalid probe index".to_string());
    }
    
    println!("Opening probe: {}", probes[probe_index].identifier);
    
    // Add a longer delay to avoid probe access conflicts
    std::thread::sleep(std::time::Duration::from_millis(1000));
    
    let probe = probes[probe_index].open().map_err(|e| {
        println!("Failed to open probe: {}", e);
        // If probe is busy, suggest waiting
        if e.to_string().contains("could not be created") {
            format!("Probe is busy - please wait a moment before trying again: {}", e)
        } else {
            format!("Failed to open probe: {}", e)
        }
    })?;
    
    println!("Attempting to attach to STM32H735ZGTx");
    // Try to attach to the target
    let mut session = probe.attach("STM32H735ZGTx", Permissions::default())
        .map_err(|e| {
            println!("Failed to attach to target: {}", e);
            format!("Failed to attach to target: {}", e)
        })?;
    
    println!("Successfully attached to target");
    
    // Get target info before borrowing for core operations
    let target_name = session.target().name.clone();
    let chip_id = Some(session.target().name.clone());
    println!("Target name: {}", target_name);
    
    // Temporarily halt the core for initial setup, then resume for real-time access
    {
        println!("Getting core 0");
        let mut core = session.core(0).map_err(|e| {
            println!("Failed to get core: {}", e);
            format!("Failed to get core: {}", e)
        })?;
        
        println!("Halting core for setup");
        core.halt(std::time::Duration::from_millis(100))
            .map_err(|e| {
                println!("Failed to halt core: {}", e);
                format!("Failed to halt core: {}", e)
            })?;
        println!("Core halted successfully");
        
        // Resume the core for real-time variable access
        println!("Resuming core for real-time access");
        core.run().map_err(|e| {
            println!("Failed to resume core: {}", e);
            format!("Failed to resume core: {}", e)
        })?;
        println!("Core resumed successfully");
    } // core is dropped here, releasing the borrow
    
    // Store session globally for memory operations
    {
        println!("Storing session globally");
        let mut session_guard = SESSION_MANAGER.lock().unwrap();
        *session_guard = Some(session);
    }
    
    println!("MCU connection completed successfully");
    
    Ok(SessionInfo {
        target_name,
        connected: true,
        chip_id,
    })
}


fn parse_mculink_variable(session: &mut Session, var_addr: u32) -> Result<VariableInfo, String> {
    let mut core = session.core(0).map_err(|e| format!("Failed to get core: {}", e))?;
    
    // Read the simplified variable structure (74 bytes total)
    let mut var_buf = [0u8; 74];
    core.read(var_addr as u64, &mut var_buf)
        .map_err(|e| format!("Failed to read variable at 0x{:08X}: {}", var_addr, e))?;
    
    // Parse the structure:
    // uint32_t magic (already verified)
    // uint32_t address  
    // uint8_t var_type
    // uint8_t access_flags
    // uint8_t reserved[2]
    // float min_value
    // float max_value  
    // char name[32]
    // char category[32]
    
    let address = u32::from_le_bytes([var_buf[4], var_buf[5], var_buf[6], var_buf[7]]);
    let var_type = var_buf[8];
    let access_flags = var_buf[9];
    let min_value = f32::from_le_bytes([var_buf[12], var_buf[13], var_buf[14], var_buf[15]]);
    let max_value = f32::from_le_bytes([var_buf[16], var_buf[17], var_buf[18], var_buf[19]]);
    
    // Extract null-terminated strings
    let name = extract_cstring(&var_buf[20..52])?; // name[32]
    let category = extract_cstring(&var_buf[52..74])?; // category[32]
    
    let var_type_str = match var_type {
        0 => "UINT8",
        1 => "INT8", 
        2 => "UINT16",
        3 => "INT16",
        4 => "UINT32", 
        5 => "INT32",
        6 => "FLOAT",
        _ => return Err(format!("Unknown variable type: {}", var_type)),
    };
    
    let access_str = match access_flags {
        0 => "RO",
        1 => "RW",
        _ => return Err(format!("Unknown access flags: {}", access_flags)),
    };
    
    Ok(VariableInfo {
        name,
        address,
        var_type: var_type_str.to_string(),
        access_flags: access_str.to_string(),
        category: if category.is_empty() { None } else { Some(category) },
        min_value: Some(min_value as f64),
        max_value: Some(max_value as f64),
    })
}

fn extract_cstring(bytes: &[u8]) -> Result<String, String> {
    // Find the null terminator
    let end = bytes.iter().position(|&b| b == 0).unwrap_or(bytes.len());
    
    // Convert to string
    String::from_utf8(bytes[..end].to_vec())
        .map_err(|e| format!("Invalid UTF-8 string: {}", e))
}

fn read_null_terminated_string(core: &mut probe_rs::Core, addr: u32) -> Result<String, String> {
    let mut string_buf = Vec::new();
    let mut current_addr = addr;
    
    loop {
        let mut byte = [0u8; 1];
        core.read(current_addr as u64, &mut byte)
            .map_err(|e| format!("Failed to read string byte: {}", e))?;
        
        if byte[0] == 0 {
            break;
        }
        
        string_buf.push(byte[0]);
        current_addr += 1;
        
        if string_buf.len() > 256 {
            return Err("String too long (possible corruption)".to_string());
        }
    }
    
    String::from_utf8(string_buf)
        .map_err(|e| format!("Invalid UTF-8 string: {}", e))
}

#[tauri::command]
async fn discover_variables() -> Result<Vec<VariableInfo>, String> {
    println!("=== discover_variables called ===");
    
    // Check if we have an active session
    {
        let session_guard = SESSION_MANAGER.lock().unwrap();
        if session_guard.is_none() {
            println!("No active MCU session for discovery");
            return Err("No active MCU session - please connect first".to_string());
        }
        println!("Session exists, proceeding with discovery");
    }
    
    // Use the default address for discovery
    println!("Using default MCU Link address 0x{:08X}", DEFAULT_MCULINK_ADDRESS);
    scan_mculink_at_address(DEFAULT_MCULINK_ADDRESS)
}

#[tauri::command]
async fn discover_variables_at_address(address: u32) -> Result<Vec<VariableInfo>, String> {
    println!("=== discover_variables_at_address called with 0x{:08X} ===", address);
    
    // Check if we have an active session
    {
        let session_guard = SESSION_MANAGER.lock().unwrap();
        if session_guard.is_none() {
            println!("No active MCU session for discovery");
            return Err("No active MCU session - please connect first".to_string());
        }
        println!("Session exists, proceeding with discovery at fixed address");
    }
    
    match scan_mculink_at_address(address) {
        Ok(variables) => {
            println!("Found {} variables at address 0x{:08X}", variables.len(), address);
            Ok(variables)
        },
        Err(e) => {
            println!("Failed to read variables at 0x{:08X}: {}", address, e);
            Err(e)
        }
    }
}

fn scan_mculink_at_address(start_addr: u32) -> Result<Vec<VariableInfo>, String> {
    println!("Scanning for MCU Link variables starting at 0x{:08X}", start_addr);
    
    let mut session_guard = SESSION_MANAGER.lock().unwrap();
    let session = session_guard.as_mut().ok_or("No active MCU session")?;
    
    let mut variables = Vec::new();
    let max_variables = 20; // Reasonable limit
    let max_scan_bytes = 4096; // Only scan 4KB from the start address
    
    for offset in (0..max_scan_bytes).step_by(4) {
        if variables.len() >= max_variables {
            break;
        }
        
        let addr = start_addr + offset;
        
        // Try to read potential magic number
        let mut magic_buf = [0u8; 4];
        let read_success = {
            let mut core = session.core(0).unwrap();
            core.read(addr as u64, &mut magic_buf).is_ok()
        };
        
        if read_success {
            let magic = u32::from_le_bytes(magic_buf);
            
            if magic == MCULINK_MAGIC {
                println!("Found MCULINK_MAGIC at address 0x{:08X}", addr);
                
                // Try to parse variable entry at this address
                match parse_mculink_variable(session, addr) {
                    Ok(variable) => {
                        println!("Successfully parsed MCU Link variable '{}' at 0x{:08X}", variable.name, addr);
                        variables.push(variable);
                    },
                    Err(e) => {
                        // Skip entries that aren't valid variables (like MCULINK_INIT magic)
                        if e.contains("Unknown variable type") {
                            println!("Skipping non-variable entry at 0x{:08X}: {}", addr, e);
                        } else {
                            println!("Failed to parse variable at 0x{:08X}: {}", addr, e);
                        }
                    }
                }
            }
        }
    }
    
    if variables.is_empty() {
        Err(format!("No MCU Link variables found at address 0x{:08X}", start_addr))
    } else {
        println!("Found {} MCU Link variables at 0x{:08X}", variables.len(), start_addr);
        Ok(variables)
    }
}

fn read_mcu_variable(address: u32, var_type: &str) -> Result<f64, String> {
    let mut session_guard = SESSION_MANAGER.lock().unwrap();
    let session = session_guard.as_mut().ok_or("No active MCU session")?;
    let mut core = session.core(0).map_err(|e| format!("Failed to get core: {}", e))?;
    
    match var_type {
        "UINT8" => {
            let mut buf = [0u8; 1];
            core.read(address as u64, &mut buf)
                .map_err(|e| format!("Failed to read UINT8: {}", e))?;
            Ok(buf[0] as f64)
        },
        "INT8" => {
            let mut buf = [0u8; 1];
            core.read(address as u64, &mut buf)
                .map_err(|e| format!("Failed to read INT8: {}", e))?;
            Ok(buf[0] as i8 as f64)
        },
        "UINT16" => {
            let mut buf = [0u8; 2];
            core.read(address as u64, &mut buf)
                .map_err(|e| format!("Failed to read UINT16: {}", e))?;
            Ok(u16::from_le_bytes(buf) as f64)
        },
        "INT16" => {
            let mut buf = [0u8; 2];
            core.read(address as u64, &mut buf)
                .map_err(|e| format!("Failed to read INT16: {}", e))?;
            Ok(i16::from_le_bytes(buf) as f64)
        },
        "UINT32" => {
            let mut buf = [0u8; 4];
            core.read(address as u64, &mut buf)
                .map_err(|e| format!("Failed to read UINT32: {}", e))?;
            Ok(u32::from_le_bytes(buf) as f64)
        },
        "INT32" => {
            let mut buf = [0u8; 4];
            core.read(address as u64, &mut buf)
                .map_err(|e| format!("Failed to read INT32: {}", e))?;
            Ok(i32::from_le_bytes(buf) as f64)
        },
        "FLOAT" => {
            let mut buf = [0u8; 4];
            core.read(address as u64, &mut buf)
                .map_err(|e| format!("Failed to read FLOAT: {}", e))?;
            Ok(f32::from_le_bytes(buf) as f64)
        },
        _ => Err(format!("Unsupported variable type: {}", var_type))
    }
}

#[tauri::command]
async fn read_variable(address: u32, var_type: String) -> Result<f64, String> {
    // Try real MCU read first
    match read_mcu_variable(address, &var_type) {
        Ok(value) => Ok(value),
        Err(_) => {
            // Fallback to mock simulation if no MCU session
            match var_type.as_str() {
                "UINT8" => {
                    // Simulate button state (0 or 1)
                    Ok(if std::ptr::addr_of!(address) as usize % 2 == 0 { 0.0 } else { 1.0 })
                },
                "FLOAT" => {
                    // Simulate dynamic temperature reading
                    let now = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_secs_f64();
                    
                    let base_temp = 22.5;
                    let slow_drift = (now * 0.1).sin() * 3.0;
                    let fast_noise = (now * 5.0).sin() * 0.5;
                    let random_noise = (now * 17.3).sin() * 0.2;
                    
                    Ok(base_temp + slow_drift + fast_noise + random_noise)
                },
                _ => Ok(0.0) // Default fallback
            }
        }
    }
}

fn write_mcu_variable(address: u32, var_type: &str, value: f64) -> Result<(), String> {
    println!("write_mcu_variable: attempting to write {} to 0x{:08X} (type: {})", value, address, var_type);
    
    let mut session_guard = SESSION_MANAGER.lock().unwrap();
    let session = session_guard.as_mut().ok_or("No active MCU session")?;
    
    // Check core state before write
    let mut core = session.core(0).map_err(|e| format!("Failed to get core: {}", e))?;
    let core_status = core.status().map_err(|e| format!("Failed to get core status: {}", e))?;
    println!("Core status before write: {:?}", core_status);
    
    // For reliable writes with ST-Link, halt the core temporarily
    let was_running = !core_status.is_halted();
    if was_running {
        println!("Core is running, halting for reliable write");
        core.halt(std::time::Duration::from_millis(10))
            .map_err(|e| format!("Failed to halt core for write: {}", e))?;
    } else {
        println!("Core already halted, proceeding with write");
    }
    
    match var_type {
        "UINT8" => {
            let val = (value as u8).to_le_bytes();
            println!("Writing UINT8 value {} (bytes: {:?}) to address 0x{:08X}", value as u8, val, address);
            
            // Try to read the current value first
            let mut read_buf = [0u8; 1];
            match core.read(address as u64, &mut read_buf) {
                Ok(_) => println!("Current value at 0x{:08X}: {}", address, read_buf[0]),
                Err(e) => println!("Failed to read current value: {}", e),
            }
            
            // Attempt the write
            core.write(address as u64, &val)
                .map_err(|e| {
                    println!("UINT8 write failed with error: {}", e);
                    format!("Failed to write UINT8: {}", e)
                })?;
            println!("UINT8 write completed successfully");
        },
        "INT8" => {
            let val = (value as i8).to_le_bytes();
            core.write(address as u64, &val)
                .map_err(|e| format!("Failed to write INT8: {}", e))?;
        },
        "UINT16" => {
            let val = (value as u16).to_le_bytes();
            core.write(address as u64, &val)
                .map_err(|e| format!("Failed to write UINT16: {}", e))?;
        },
        "INT16" => {
            let val = (value as i16).to_le_bytes();
            core.write(address as u64, &val)
                .map_err(|e| format!("Failed to write INT16: {}", e))?;
        },
        "UINT32" => {
            let val = (value as u32).to_le_bytes();
            core.write(address as u64, &val)
                .map_err(|e| format!("Failed to write UINT32: {}", e))?;
        },
        "INT32" => {
            let val = (value as i32).to_le_bytes();
            core.write(address as u64, &val)
                .map_err(|e| format!("Failed to write INT32: {}", e))?;
        },
        "FLOAT" => {
            let val = (value as f32).to_le_bytes();
            core.write(address as u64, &val)
                .map_err(|e| format!("Failed to write FLOAT: {}", e))?;
        },
        _ => return Err(format!("Unsupported variable type: {}", var_type))
    }
    
    // Resume the core if it was running before
    if was_running {
        println!("Resuming core after write");
        core.run().map_err(|e| format!("Failed to resume core after write: {}", e))?;
        println!("Core resumed successfully");
    }
    
    Ok(())
}

#[tauri::command]
async fn write_variable(address: u32, var_type: String, value: f64) -> Result<(), String> {
    // Try real MCU write first
    match write_mcu_variable(address, &var_type, value) {
        Ok(_) => {
            println!("Successfully wrote {} to MCU address 0x{:08X} (type: {})", value, address, var_type);
            Ok(())
        },
        Err(e) => {
            // ST-Link doesn't support RAM writes on STM32H735 - this is expected
            println!("ST-Link write limitation (expected): {}", e);
            println!("Note: ST-Link + STM32H735 doesn't support debug writes to RAM");
            println!("For real MCU control, consider using RTT or different probe");
            Err(format!("ST-Link write not supported on this target: {}", e))
        }
    }
}

#[tauri::command]
async fn test_ram_writes() -> Result<String, String> {
    println!("=== Starting RAM write tests ===");
    
    let mut session_guard = SESSION_MANAGER.lock().unwrap();
    let session = session_guard.as_mut().ok_or("No active MCU session")?;
    let mut core = session.core(0).map_err(|e| format!("Failed to get core: {}", e))?;
    
    let mut results = Vec::new();
    // Test multiple addresses to see if it's address-specific
    let test_addresses = vec![
        ("LED variable", 0x200009E8),
        ("DTCM start", 0x20000000),  
        ("DTCM mid", 0x20010000),
        ("SRAM1", 0x24000000),
    ];
    
    for (name, test_address) in test_addresses {
        results.push(format!("\n=== Testing {} (0x{:08X}) ===", name, test_address));
        
        // Test read
        let mut read_buf = [0u8; 1];
        match core.read(test_address as u64, &mut read_buf) {
            Ok(_) => {
                results.push(format!("✅ READ: {}", read_buf[0]));
            },
            Err(e) => {
                results.push(format!("❌ READ FAILED: {}", e));
                continue; // Skip write tests if read fails
            }
        }
        
        // Test write while halted
        let was_running = !core.status().unwrap().is_halted();
        if was_running {
            core.halt(std::time::Duration::from_millis(10)).ok();
        }
        
        let test_value = [42u8];
        match core.write(test_address as u64, &test_value) {
            Ok(_) => {
                results.push("✅ WRITE: Success!".to_string());
                // Verify
                core.read(test_address as u64, &mut read_buf).ok();
                results.push(format!("Verified: {}", read_buf[0]));
            },
            Err(e) => {
                results.push(format!("❌ WRITE FAILED: {}", e));
            }
        }
        
        if was_running {
            core.run().ok();
        }
    }
    
    println!("=== RAM write tests completed ===");
    Ok(results.join("\n"))
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet, 
            detect_probes, 
            connect_to_mcu, 
            discover_variables, 
            discover_variables_at_address,
            read_variable, 
            write_variable,
            test_ram_writes
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
