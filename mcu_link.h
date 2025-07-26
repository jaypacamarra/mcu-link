/**
 * @file mcu_link.h
 * @brief MCU Link - Real-time MCU variable exposure for debugging and visualization
 * 
 * This header-only library provides macros to expose MCU variables for real-time 
 * monitoring and control via debug probes. Variables are automatically discovered
 * by the MCU Link desktop application through flash memory scanning.
 * 
 * @author MCU Link Project
 * @version 1.0.0
 */

#ifndef MCU_LINK_H
#define MCU_LINK_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

/* MCU Link magic number "MCLK" */
#define MCULINK_MAGIC           0x4D434C4B

/* MCU Link version */
#define MCULINK_VERSION         0x00010000

/* Variable types */
#define MCULINK_TYPE_UINT8      0
#define MCULINK_TYPE_INT8       1
#define MCULINK_TYPE_UINT16     2
#define MCULINK_TYPE_INT16      3
#define MCULINK_TYPE_UINT32     4
#define MCULINK_TYPE_INT32      5
#define MCULINK_TYPE_FLOAT      6

/* Access flags */
#define MCULINK_ACCESS_RO       0   /* Read-only */
#define MCULINK_ACCESS_RW       1   /* Read-write */

/**
 * @brief MCU Link variable entry structure
 * 
 * This structure describes a single variable that can be monitored/controlled.
 * All entries are stored in flash memory (.rodata section) for discovery.
 */
typedef struct {
    uint32_t name_offset;       /**< Offset to variable name string (from descriptor start) */
    uint32_t address;           /**< RAM address of the actual variable */ 
    uint8_t  var_type;          /**< Variable type (MCULINK_TYPE_*) */
    uint8_t  access_flags;      /**< Access permissions (MCULINK_ACCESS_*) */
    uint8_t  reserved[2];       /**< Reserved for alignment */
    uint32_t category_offset;   /**< Offset to category string (0 if none) */
    float    min_value;         /**< Minimum value (for UI sliders) */
    float    max_value;         /**< Maximum value (for UI sliders) */
} mculink_entry_t;

/**
 * @brief MCU Link descriptor header
 * 
 * This structure appears at the start of the .mculink section in flash.
 * The MCU Link application scans flash memory looking for the magic number.
 */
typedef struct {
    uint32_t magic;             /**< Magic number (MCULINK_MAGIC) */
    uint32_t version;           /**< Version number */
    uint32_t entry_count;       /**< Number of variable entries */
    uint32_t entries_offset;    /**< Offset to entries array */
} mculink_descriptor_t;

/* Internal counters for macro system */
extern uint32_t _mculink_entry_count;
extern uint32_t _mculink_string_offset;

/* Section attribute for GCC */
#define MCULINK_SECTION __attribute__((section(".mculink"), used))

/* Helper macros for string management */
#define _MCULINK_STR_HELPER(x) #x
#define _MCULINK_STR(x) _MCULINK_STR_HELPER(x)

/**
 * @brief Initialize MCU Link descriptor
 * 
 * This macro must be called once before any MCULINK_EXPOSE_* macros.
 * It creates the descriptor header in flash memory.
 * 
 * @note Place this macro in a .c file, not in a header.
 */
#define MCULINK_INIT() \
    MCULINK_SECTION const uint32_t _mculink_magic = MCULINK_MAGIC;

/**
 * @brief Expose a read-only variable
 * 
 * Makes a variable visible to MCU Link for real-time monitoring.
 * The variable will appear as a sensor/display in the UI.
 * 
 * @param var_name      Name of the C variable to expose
 * @param type          Variable type (UINT8, INT8, UINT16, INT16, UINT32, INT32, FLOAT)
 * @param category      UI category string (e.g., "Sensors", "Status")
 * @param min_val       Minimum value for UI scaling
 * @param max_val       Maximum value for UI scaling
 * 
 * @example
 * float temperature = 25.0f;
 * MCULINK_EXPOSE_RO(temperature, FLOAT, "Sensors", -40.0f, 85.0f);
 */
#define MCULINK_EXPOSE_RO(var_name, type, category, min_val, max_val) \
    MCULINK_SECTION static const struct { \
        uint32_t magic; \
        uint32_t address; \
        uint8_t var_type; \
        uint8_t access_flags; \
        uint8_t reserved[2]; \
        float min_value; \
        float max_value; \
        char name[32]; \
        char cat[32]; \
    } _mculink_var_##var_name = { \
        .magic = MCULINK_MAGIC, \
        .address = (uint32_t)&var_name, \
        .var_type = MCULINK_TYPE_##type, \
        .access_flags = MCULINK_ACCESS_RO, \
        .reserved = {0, 0}, \
        .min_value = min_val, \
        .max_value = max_val, \
        .name = #var_name, \
        .cat = category \
    };

/**
 * @brief Expose a read-write variable
 * 
 * Makes a variable visible to MCU Link for real-time monitoring AND control.
 * The variable will appear as a control (button, slider) in the UI.
 * 
 * @param var_name      Name of the C variable to expose
 * @param type          Variable type (UINT8, INT8, UINT16, INT16, UINT32, INT32, FLOAT)
 * @param category      UI category string (e.g., "Controls", "Settings")
 * @param min_val       Minimum value for UI scaling
 * @param max_val       Maximum value for UI scaling
 * 
 * @example
 * uint8_t led_brightness = 128;
 * MCULINK_EXPOSE_RW(led_brightness, UINT8, "Controls", 0.0f, 255.0f);
 */
#define MCULINK_EXPOSE_RW(var_name, type, category, min_val, max_val) \
    MCULINK_SECTION static const struct { \
        uint32_t magic; \
        uint32_t address; \
        uint8_t var_type; \
        uint8_t access_flags; \
        uint8_t reserved[2]; \
        float min_value; \
        float max_value; \
        char name[32]; \
        char cat[32]; \
    } _mculink_var_##var_name = { \
        .magic = MCULINK_MAGIC, \
        .address = (uint32_t)&var_name, \
        .var_type = MCULINK_TYPE_##type, \
        .access_flags = MCULINK_ACCESS_RW, \
        .reserved = {0, 0}, \
        .min_value = min_val, \
        .max_value = max_val, \
        .name = #var_name, \
        .cat = category \
    };

/**
 * @brief Expose a boolean toggle variable
 * 
 * Convenience macro for boolean/toggle variables (0 or 1).
 * Creates a button toggle in the MCU Link UI.
 * 
 * @param var_name      Name of the C variable to expose (should be uint8_t)
 * @param category      UI category string (e.g., "Controls")
 * 
 * @example
 * uint8_t enable_motor = 0;
 * MCULINK_EXPOSE_TOGGLE(enable_motor, "Controls");
 */
#define MCULINK_EXPOSE_TOGGLE(var_name, category) \
    MCULINK_EXPOSE_RW(var_name, UINT8, category, 0.0f, 1.0f)

/**
 * @brief Expose a read-only sensor variable
 * 
 * Convenience macro for sensor readings that should only be monitored.
 * 
 * @param var_name      Name of the C variable to expose
 * @param type          Variable type (typically FLOAT)
 * @param unit          Unit string for display (e.g., "°C", "V", "A") - currently unused
 * @param min_val       Expected minimum value
 * @param max_val       Expected maximum value
 * 
 * @example
 * float cpu_temperature = 0.0f;
 * MCULINK_EXPOSE_SENSOR(cpu_temperature, FLOAT, "°C", -40.0f, 85.0f);
 */
#define MCULINK_EXPOSE_SENSOR(var_name, type, unit, min_val, max_val) \
    MCULINK_EXPOSE_RO(var_name, type, "Sensors", min_val, max_val)

/* 
 * Example usage in firmware:
 * 
 * // In main.c:
 * #include "mcu_link.h"
 * 
 * // Initialize MCU Link (call once)
 * MCULINK_INIT();
 * 
 * // Declare your variables
 * float temperature = 22.5f;
 * uint8_t led_state = 0;
 * uint16_t motor_speed = 1000;
 * 
 * // Expose variables to MCU Link
 * MCULINK_EXPOSE_SENSOR(temperature, FLOAT, "Temperature", -40.0f, 85.0f);
 * MCULINK_EXPOSE_TOGGLE(led_state, "Controls");
 * MCULINK_EXPOSE_RW(motor_speed, UINT16, "Controls", 0.0f, 3000.0f);
 * 
 * int main(void) {
 *     // Your main application code
 *     while(1) {
 *         // Update sensor readings
 *         temperature = read_temperature_sensor();
 *         
 *         // Use control variables
 *         set_led(led_state);
 *         set_motor_speed(motor_speed);
 *     }
 * }
 */

#ifdef __cplusplus
}
#endif

#endif /* MCU_LINK_H */