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

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![greet, detect_probes, connect_to_mcu])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
