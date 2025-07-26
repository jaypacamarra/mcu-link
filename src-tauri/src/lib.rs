use probe_rs::Permissions;
use probe_rs::probe::list::Lister;
use serde::{Deserialize, Serialize};

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
    let lister = Lister::new();
    let probes = lister.list_all();
    
    if probe_index >= probes.len() {
        return Err("Invalid probe index".to_string());
    }
    
    let probe = probes[probe_index].open().map_err(|e| format!("Failed to open probe: {}", e))?;
    
    // Try to attach to the target
    let session = probe.attach("STM32H735ZGTx", Permissions::default())
        .map_err(|e| format!("Failed to attach to target: {}", e))?;
    
    let target_name = session.target().name.clone();
    
    // Try to get chip info - probe-rs doesn't expose part directly, use target name
    let chip_id = Some(session.target().name.clone());
    
    Ok(SessionInfo {
        target_name,
        connected: true,
        chip_id,
    })
}

#[tauri::command]
async fn discover_variables() -> Result<Vec<VariableInfo>, String> {
    // Hardcoded test struct with button and temperature sensor
    let variables = vec![
        VariableInfo {
            name: "led_button".to_string(),
            address: 0x20000100, // Mock RAM address
            var_type: "UINT8".to_string(),
            access_flags: "RW".to_string(),
            category: Some("Controls".to_string()),
            min_value: Some(0.0),
            max_value: Some(1.0),
        },
        VariableInfo {
            name: "temperature_sensor".to_string(),
            address: 0x20000104, // Mock RAM address
            var_type: "FLOAT".to_string(),
            access_flags: "RO".to_string(),
            category: Some("Sensors".to_string()),
            min_value: Some(-40.0),
            max_value: Some(85.0),
        },
    ];
    
    Ok(variables)
}

#[tauri::command]
async fn read_variable(address: u32, var_type: String) -> Result<f64, String> {
    // Mock read - simulate real values
    match var_type.as_str() {
        "UINT8" => {
            // Simulate button state (0 or 1)
            Ok(if std::ptr::addr_of!(address) as usize % 2 == 0 { 0.0 } else { 1.0 })
        },
        "FLOAT" => {
            // Simulate dynamic temperature reading with multiple frequency components
            let now = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs_f64();
            
            let base_temp = 22.5;
            let slow_drift = (now * 0.1).sin() * 3.0;      // Slow temperature drift ±3°C
            let fast_noise = (now * 5.0).sin() * 0.5;      // Fast fluctuations ±0.5°C  
            let random_noise = (now * 17.3).sin() * 0.2;   // Random-like noise ±0.2°C
            
            Ok(base_temp + slow_drift + fast_noise + random_noise)
        },
        _ => Err(format!("Unsupported variable type: {}", var_type))
    }
}

#[tauri::command]
async fn write_variable(address: u32, var_type: String, value: f64) -> Result<(), String> {
    // Mock write operation
    println!("Writing {} to address 0x{:08X} (type: {})", value, address, var_type);
    
    // In real implementation, this would write to MCU memory via probe-rs
    // For now, just simulate success
    Ok(())
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
            read_variable, 
            write_variable
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
