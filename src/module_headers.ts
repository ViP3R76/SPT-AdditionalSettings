// --- START OF FILE src/module_headers.ts ---

/**
 * Default Configuration Content for AdditionalSettings Mod
 * File: src/module_headers.ts
 * Author: ViP3R_76
 * License: MIT
 *
 * Description:
 * This file centralizes the default configuration content (JSONC format with comments)
 * for the main 'config.jsonc' and the 'config_weather.jsonc' files.
 * The 'module_configuration.ts' loader imports these constants to create the default
 * configuration files on first run or when auto-update rebuilds them.
 */

// --- Default Config File Content ---

/**
 * Default content for config.jsonc.
 * Used by module_configuration.ts to create the file if it doesn't exist.
 * Reflects structure as of mod version 1.0.5+.
 */
export const DEFAULT_MAIN_CONFIG_JSONC: string = `// Default Configuration for AdditionalSettings Mod
// File Format: JSON with Comments (JSONC). Comments are ignored by the loader.
// Edit values below and restart the server for changes to take effect.
{
    // --- Module Activation ---
    // Toggle the integrated sub-modules on or off. Requires server restart.

    // Enable the weather randomization module (uses config_weather.jsonc).
    // Default: false
    "use_weather_module": false,

    // Enable modification of quest plant/placement times using multipliers below.
    // Default: false
    "use_plant_time_module": false,

    // Enable ammo/grenade weight modification (settings below).
    // Default: false
    "use_ammo_module": false,

    // Enable weapon modification module (settings below).
    // Default: false
    "use_weapon_module": false,


    // --- Core Gameplay Tweaks ---

    // Allow looting armbands (Parent ID: 5b3f15d486f77432d0509248) from bodies.
    // Note: Some specific items might be internally blacklisted.
    // Default: true
    "LootArmbands": true,

    // Prevent losing your equipped armband (ArmBand slot) upon death.
    // Default: false
    "SaveArmbandOnDeath": false,

    // Allow looting melee weapons (Parent ID: 5447e1d04bdc2dff2f8b4567) from bodies.
    // Note: Some specific items (e.g., Kukri) might be internally blacklisted.
    // Default: true
    "LootMelee": true,

    // Prevent losing your equipped melee weapon (Scabbard slot) upon death.
    // Default: false
    "SaveMeleeOnDeath": false,

    // Control PMC voice line chance after kill/death.
    // true: Disable entirely (0% chance).
    // false: Use SPT default behavior.
    // number (1-100): Set specific percentage chance.
    // Default: false
    "disablePMC_ChatResponse": false,

    // Allow 'Lega Medals' (ID: 6656560053eaaa7a23349c86) in Money Cases (ID: 59fb016586f7746d0d4b423a).
    // Default: false
    "allow_LegaMoneyCase": false,

    // Max stack size for 'Lega Medals'. Clamped between 1 and 999.
    // Default: 50
    "stacksize_lega": 50,

    // Remove "Found in Raid" requirement for items used in Hideout construction/upgrades.
    // Default: false
    "removeFirForHideout": false,

    // Disable SPT's seasonal events (e.g., Christmas trees, Halloween pumpkins).
    // Modifies server config to prevent activation based on system date.
    // Default: false
    "disableSeasonEvents": false,


    // --- Plant Time Module Settings (Only used if use_plant_time_module is true) ---
    // Adjust time multipliers. 1.0 = no change, < 1.0 = faster, > 1.0 = slower. Minimum effective time is 1s.
    // Values must be non-negative numbers. Invalid values reset to 1.0.

    // Multiplier for 'LeaveItemAtLocation' quest conditions (e.g., placing Markers, USBs).
    // Default: 1.00
    "leaveItemAtLocationModifier": 1.00,

    // Multiplier for 'PlaceBeacon' quest conditions (e.g., placing WI-FI Camera, MS2000).
    // Default: 1.00
    "placeBeaconModifier": 1.00,


    // --- Ammo Module Settings (Only used if use_ammo_module is true) ---

    // Set weight of individual ammo rounds (Parent ID: 5485a8684bdc2da71d8b4567) to 0.
    // Default: false
    "weightless_ammo": false,

    // Set weight of ammo boxes (Parent ID: 543be5cb4bdc2deb348b4568) to 0.
    // Default: false
    "weightless_ammoboxes": false,

    // Set weight of grenades (Parent ID: 543be6564bdc2df4348b4568) to 0.
    // Default: false
    "weightless_grenades": false,


    // --- Weapon Module Settings (Only used if use_weapon_module is true) ---

    // Adjust specific item 'ExtraSize' properties to potentially shrink their thumbnail view.
    // IMPORTANT: This is a visual tweak ONLY and does not change the item's actual grid size.
    // For the visual change to apply, Cache-/Temp-Files need to be deleted in SPT-Launcher!
    // Default: false
    "weapon_inv_shrink": false,


    // --- Debugging & Maintenance ---

    // Allow the mod to automatically overwrite config files on startup if settings
    // are missing or invalid. Useful for adding new default settings automatically.
    // WARNING: This will REMOVE all comments and custom formatting from the file!
    // Default: false
    "allow_autoupdate_configs": false,

    // Enable detailed debug messages in the server console for troubleshooting.
    // Can be very verbose. Keep false unless diagnosing issues.
    // Default: false
    "enableDebugLogs": false
}
`;

/**
 * Default content for config_weather.jsonc.
 * Used by module_configuration.ts to create the file if it doesn't exist.
 */
export const DEFAULT_WEATHER_CONFIG_JSONC: string = `// Default Configuration for AdditionalSettings Weather Module
// Controls in-game season selection. Only ONE mode is active at a time.
// Used only if "use_weather_module" is true in the main config.jsonc file.
// Mode Precedence: Fixed Season > Weighted System > Random System.
{
    // --- Mode 1: Fixed Season ---
    // If true, forces the season specified by 'fixed_season_index'. Overrides all other modes.
    // Default: false
    "use_fixed_season": false,

    // Season index to use if 'use_fixed_season' is true. (1-7)
    // 1=Summer, 2=Autumn, 3=Winter, 4=Spring, 5=LateAutumn, 6=EarlySpring, 7=Storm
    // Invalid numbers default to 1 (Summer).
    // Default: 1
    "fixed_season_index": 1,


    // --- Mode 2: Weighted Random System ---
    // If 'use_fixed_season' is false AND this is true, seasons are chosen randomly based on weights below.
    // Excludes seasons listed in 'exclude_seasons'. Overrides Mode 3.
    // Default: false
    "use_weight_system": false,

    // Season weights (used only if Mode 2 is active). Higher number = higher chance.
    // Must be non-negative numbers. 0 weight effectively disables the season for this mode.
    // Invalid values reset to defaults.
    // Default: 10 (Summer, Autumn, Winter, Spring, LateAutumn, EarlySpring), 5 (Storm)
    "Summer": 10,
    "Autumn": 10,
    "Winter": 10,
    "Spring": 10,
    "LateAutumn": 10,
    "EarlySpring": 10,
    "Storm": 5,


    // --- Mode 3: Auto Random System ---
    // If fixed and weighted modes are false AND this is true, randomizes based on 'random_system_mode'.
    // Acts as fallback (with mode 0) if all mode flags are false.
    // Default: true
    "use_random_system": true,

    // Pool for Auto Random system (used only if Mode 3 is active). (0 or 1)
    // 0 = Auto All: Randomize equally among ALL seasons (ignores 'exclude_seasons').
    // 1 = Auto Available: Randomize equally among seasons NOT in 'exclude_seasons'.
    // Invalid numbers default to 0.
    // Default: 0
    "random_system_mode": 0,


    // --- Season Exclusion ---
    // List of season indices (0-6) to exclude from Weighted mode and Random Mode 1.
    // Use internal index: 0=Summer, 1=Autumn, 2=Winter, 3=Spring, 4=LateAutumn, 5=EarlySpring, 6=Storm.
    // Invalid numbers (outside 0-6) are ignored. Does NOT affect Fixed Season or Random Mode 0.
    // Safety: If all valid seasons (0-6) are excluded, Storm (6) is automatically kept available.
    // Example: [2, 6] // Exclude Winter and Storm
    // Default: [] (no exclusions)
    "exclude_seasons": []

    // --- FIKA Integration --- Note: No config setting required anymore.
    // If FIKA is detected, weather determination is automatically hooked into raid creation.
}
`;
// --- END OF FILE src/module_headers.ts ---