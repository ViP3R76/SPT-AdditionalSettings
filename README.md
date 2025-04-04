# Additional Settings Mod for SPT (Single Player Tarkov)

<p align="center">
  <img src="./logo.png" alt="Additional Settings Logo" width="150"/>
</p>

[![SPT Version](https://img.shields.io/badge/SPT%20Version-3.11.x-brightgreen.svg)](https://www.sp-tarkov.com/)
[![Mod Version](https://img.shields.io/badge/Mod%20Version-1.0.5-blue.svg)]([https://github.com/YourGitHubUsername/YourRepoName](https://github.com/ViP3R76/SPT-AdditionalSettings/releases))
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Description

**Additional Settings Mod (ASM)** provides a collection of configurable gameplay tweaks and optional features for Single Player Tarkov (SPT) versions 3.11.x and likely later versions. It aims to offer quality-of-life improvements and customization options through a modular design and robust configuration handling.

The mod uses SPT's dependency injection and lifecycle hooks (`preSptLoad`, `postDBLoad`, `postSptLoad`) to apply changes safely and at the appropriate times during server startup. Configuration files (`config.jsonc`, `config_weather.jsonc`) are automatically generated with detailed comments on first run if they don't exist.

## Features (v1.0.5)

This mod is modular, allowing you to enable or disable specific groups of features via the main `config.jsonc` file.

### Core Gameplay Tweaks (Settings in `config.jsonc`)

Handled by `CoreModule`.

*   **Lootable Armbands & Melee:** Makes equipped armbands and melee weapons lootable from bodies (`LootArmbands`, `LootMelee`). Includes an internal blacklist for specific items (e.g., quest items, specific high-value melee).
*   **PMC Chat Response Control:** Adjust the chance (0-100%) or disable entirely the voice lines PMCs make after getting a kill or being killed (`disablePMC_ChatResponse`).
*   **Lega Medals in Money Case:** Allows storing the 'Lega' series of collectible medals/coins in Money Cases (`allow_LegaMoneyCase`).
*   **Configurable Lega Medal Stack Size:** Adjust the maximum stack size for Lega medals (`stacksize_lega`). Clamped between 1-999.
*   **Remove FIR for Hideout:** Removes the "Found in Raid" requirement for items needed in Hideout module construction and upgrades (`removeFirForHideout`).
*   **Disable Seasonal Events:** Prevents SPT's built-in seasonal events (e.g., Christmas trees, Halloween pumpkins) from activating based on system date (`disableSeasonEvents`).

### Save Gear on Death (Settings in `config.jsonc`)

Handled by `LostOnDeathModule`.

*   **Save Armbands on Death:** Prevents losing your equipped armband upon death (`SaveArmbandOnDeath`).
*   **Save Melee on Death:** Prevents losing your equipped melee weapon upon death (`SaveMeleeOnDeath`).

### Optional Weather Module (`use_weather_module: true` in `config.jsonc`)

Handled by `WeatherModule`, configured via `config_weather.jsonc`.

*   **Randomized In-Game Season:** Overrides the default weather/season system.
*   **Multiple Modes:**
    *   **Fixed:** Force a specific season (Summer, Autumn, Winter, etc.).
    *   **Weighted Random:** Choose seasons randomly based on configurable weights.
    *   **Auto Random:** Choose randomly with equal chance from all seasons or only non-excluded seasons.
*   **Season Exclusion:** Prevent specific seasons from being selected in random modes.
*   **FIKA Compatibility:** Automatically hooks into FIKA's raid creation process (`/fika/raid/create`) if FIKA is detected, ensuring season changes apply correctly in multiplayer scenarios.

### Optional Plant Time Module (`use_plant_time_module: true` in `config.jsonc`)

Handled by `PlantTimeModule`.

*   **Adjust Quest Interaction Times:** Modify the time required for "planting" or "placing" quest items (e.g., Markers, Beacons, USBs) using multipliers (`leaveItemAtLocationModifier`, `placeBeaconModifier`). Values < 1.0 speed up, > 1.0 slow down. Minimum time is 1 second.

### Optional Ammo Module (`use_ammo_module: true` in `config.jsonc`)

Handled by `AmmoModule`.

*   **Weightless Ammo/Boxes/Grenades:** Optionally set the weight of individual ammo rounds, ammo boxes, and/or grenades to zero (`weightless_ammo`, `weightless_ammoboxes`, `weightless_grenades`).

### Optional Weapon Module (`use_weapon_module: true` in `config.jsonc`)

Handled by `WeaponModule`.

*   **Inventory Thumbnail Shrink:** Adjusts internal `ExtraSizeUp`/`ExtraSizeDown` properties for a *pre-defined list* of specific magazines and weapon mounts (`weapon_inv_shrink`).
    *   **IMPORTANT:** This is a visual-only tweak for item thumbnails. It **does not** change the actual grid space the item occupies.
    *   **You MUST clear the SPT Cache/Temp files via the SPT-Launcher** after enabling this setting for the visual changes to appear in your inventory/stash.

### General Features

*   **Debug Logging:** Global option (`enableDebugLogs`) to enable detailed console logs for troubleshooting all parts of the mod. Can be very verbose.
*   **Modular Design:** Separates distinct functionalities into their own files/classes for better organization and maintainability.
*   **Robust Configuration:** Auto-creates default configs with comments, validates settings on load (resetting invalid values to defaults and logging warnings), handles basic syntax errors (like trailing commas), and optionally auto-updates config files if settings are missing/invalid (`allow_autoupdate_configs` - **Warning:** This removes comments/formatting!).

## Installation

1.  Download the latest release `.zip` file from the [Releases Page](https://github.com/YourGitHubUsername/YourRepoName/releases). <!-- Update link -->
2.  Extract the contents of the `.zip` file.
3.  Copy the `vip3r76-AdditionalSettings` folder into your SPT `user/mods/` directory.
4.  Your directory structure should look like this:
    ```
    SPT_Directory/
    └── user/
        └── mods/
            └── vip3r76-AdditionalSettings/
                ├── config/
                ├── src/
                ├── package.json
                ├── LICENSE
                └── README.md
    ```

## Configuration

Upon first starting the SPT Server after installing the mod, configuration files will be automatically generated in the `user/mods/vip3r76-AdditionalSettings/config/` directory:

*   `config.jsonc`: Controls core features and enables/disables optional modules.
*   `config_weather.jsonc`: Configures the Weather module (only used if `use_weather_module` is `true`).

These files use the `.jsonc` format (JSON with Comments). Open them with a text editor that supports this format (like VS Code, Notepad++, etc.).

*   Read the comments within the files carefully to understand each setting.
*   Modify the values as desired (e.g., change `true` to `false`, adjust numbers).
*   **Restart the SPT Server** for any configuration changes to take effect.

**Note on `allow_autoupdate_configs`:**

*   If set to `true` in `config.jsonc`, the mod will attempt to automatically add missing settings (from mod updates) or reset invalid values to their defaults *and overwrite your config file*.
*   **WARNING:** Enabling this will **REMOVE ALL COMMENTS** and custom formatting from your config file(s) when an update occurs. It is generally recommended to keep this `false` and manually update your config if needed, using the default config as a reference.

**Note on `weapon_inv_shrink`:**

*   If you enable `weapon_inv_shrink: true` in `config.jsonc`, remember to use the SPT-Launcher to **"Clear Cache Files" / "Clear Temp Files"** before launching the game to see the visual thumbnail changes.

## Uninstallation

1.  Delete the `vip3r76-AdditionalSettings` folder from your SPT `user/mods/` directory.
2.  If you used the `weapon_inv_shrink` feature, clear the SPT Cache/Temp files via the launcher one last time to potentially revert thumbnail visuals (though this might not always fully revert).

## Compatibility

*   **SPT Version:** Developed and tested primarily for SPT 3.11.x. May work on adjacent versions but compatibility is not guaranteed.
*   **Other Mods:** Designed to be generally compatible.
    *   Uses `ConfigServer` for modifying server settings (like Lost on Death, PMC Chat) where possible, reducing conflicts.
    *   Direct database modifications (items, quests, hideout) are performed in `postDBLoad` and *could* conflict if another mod modifies the exact same properties *after* this mod runs. Order of mod loading can matter in such cases.
    *   Includes specific compatibility handling for **FIKA (ServerMod)** in the Weather module.

## Known Issues

*   The `weapon_inv_shrink` feature requires manual cache clearing for visual changes. This is a limitation of how the client handles item icons.
*   The `allow_autoupdate_configs` feature removes comments and formatting from config files when triggered.

## Contributing / Development

*   Bug reports and feature suggestions are welcome via the GitHub Issues page.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgements

*   The SPT Team for creating and maintaining the framework.
*   The SPT Modding Community.
