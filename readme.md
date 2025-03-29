# Additional Settings for SPT-AKI

<p align="center">
  <img src="./logo.png" alt="Additional Settings Logo" width="150"/>
</p>

![version](https://img.shields.io/badge/version-1.0.1-blue)
![spt_version](https://img.shields.io/badge/SPT-~3.11.x-orange)
![license](https://img.shields.io/badge/license-MIT-green)

A server-side modification for SPT-AKI that provides several configurable gameplay tweaks. Created by ViP3R_76.

## Description

This mod allows users to customize various aspects of their SPT experience via a configuration file (`config/config.jsonc`). It modifies the game's database settings (like item properties) and server configurations (like LostOnDeath rules or Bot settings) after they are loaded by the server.

If the configuration file does not exist upon first starting the server with the mod, it will automatically create one with default values and detailed comments explaining each option. This mod uses the standard Node.js file system (`fs`) for config file operations and SPT's `ConfigServer` for modifying server-level configurations, ensuring better compatibility.

## Key Features

*   **Lootable Armbands:** Makes armbands lootable from bodies (respects an internal blacklist for specific items).
*   **Save Armband on Death:** Prevents the armband in your ArmBand slot from being lost upon death (uses `ConfigServer`).
*   **Lootable Melee Weapons:** Makes melee weapons lootable from bodies (respects an internal blacklist for specific items like the M48 Kukri).
*   **Save Melee on Death:** Prevents the melee weapon in your Scabbard slot from being lost upon death (uses `ConfigServer`).
*   **PMC Chat Response Control:**
    *   Disable PMC killer/victim voice lines entirely (set chance to 0%).
    *   Set a specific % chance (1-100) for PMC responses.
    *   Leave SPT default behavior unchanged. (Uses `ConfigServer`).
*   **Allow Lega Medals in Money Case:** Modifies the Money Case item filter to allow "LegaMedal" (ID: `6656560053eaaa7a23349c86`) to be placed inside.
*   **Configurable Lega Medal Stack Size:** Adjust the maximum stack size for "LegaMedal". Defaults to 50, configurable from 1 to 999 (values outside this range are clamped or reset to default).
*   **Auto-Creating Config:** Automatically generates a commented `config.jsonc` file on first run if one is not found.
*   **Robustness:** Includes checks for database availability, configuration validity, and includes manual comment stripping during config loading to work around potential environment issues.

## Prerequisites

*   **SPT-AKI:** Version **3.11.0** or later patch versions (e.g., 3.11.1). Compatibility with future major versions (e.g., 3.12.0) is not guaranteed without updates.

## Installation

1.  **Download:** Download the latest release `.zip` file from the [Releases](https://github.com/YOUR_USERNAME/YOUR_REPO_NAME/releases) page.
2.  **Extract:** Extract the contents of the `.zip` file. You should have a folder named `user`.
3.  **Copy to Mods:** Copy the *entire* `user` folder into your SPT `root` directory.
4.  **Verify:** The final structure should look like this:
    ```
    <SPT_Install_Directory>/
    ├── user/
    │   ├── mods/
    │   │   ├── vip3r76-AdditionalSettings/   <-- Mod folder
    │   │   │   ├── config/
    │   │   │   │   └── config.jsonc          (Will be created on first run)
    │   │   │   ├── src/
    │   │   │   │   ├── mod.ts
    │   │   │   │   └── configCreation.ts
    │   │   │   ├── package.json
    │   │   └── ... (other mods)
    │   └── ... (other user folders)
    └── ... (other SPT folders)
    ```
5.  **Start Server:** Start the SPT server. The mod will load, and if necessary, create the default `config/config.jsonc` file. Check the server console for messages from `[AdditionalSettings v1.0.1]`.

## Configuration

The mod's behavior is controlled by the `config.jsonc` file located at:
`<SPT_Install_Directory>/user/mods/vip3r76-AdditionalSettings/config/config.jsonc`

*   This file uses **JSONC** format, which allows comments (lines starting with `//`).
*   If the file or the `config` directory doesn't exist when you start the server, the mod will create them with the default settings and comments below.
*   Edit the values (e.g., change `true` to `false`, or adjust numbers) to customize the mod. **Save the file and restart the SPT server** for changes to take effect.

```jsonc
// Default Configuration for AdditionalSettings Mod v1.0.1+
// This file uses JSONC format (JSON with Comments). Comments are ignored by the loader.
// Edit the values below to customize the mod's behavior. Restart server for changes to apply.
{
    // --- Lootability Settings ---

    // Enable/disable making armbands lootable from bodies.
    // If true, armbands (Parent ID: 5b3f15d486f77432d0509248) found on AI/players can be looted.
    // Note: Specific items might be internally blacklisted by the mod and remain unlootable.
    // Default: true
    "LootArmbands": true,

    // Enable/disable making melee weapons lootable from bodies.
    // If true, melee weapons (Parent ID: 5447e1d04bdc2dff2f8b4567) found on AI/players can be looted.
    // Note: Does not affect your *own* equipped melee if 'SaveMeleeOnDeath' is true.
    // Note: Specific items (e.g., M48 Kukri) might be internally blacklisted and remain unlootable.
    // Default: true
    "LootMelee": true,


    // --- Save Gear on Death Settings ---

    // Prevent losing your equipped armband upon death.
    // If true, the armband in your 'ArmBand' slot will remain after dying in a raid.
    // Note: Other mods might override this setting. Uses ConfigServer.
    // Default: false
    "SaveArmbandOnDeath": false,

    // Prevent losing your equipped melee weapon upon death.
    // If true, the weapon in your 'Scabbard' slot will remain after dying in a raid.
    // Note: Other mods might override this setting. Uses ConfigServer.
    // Default: false
    "SaveMeleeOnDeath": false,


    // --- Gameplay Tweak Settings ---

    // Adjust PMC voice lines triggered after getting a kill or being killed.
    // Accepts:
    //   - true:  Disable responses entirely (set chance to 0%).
    //   - false: Use default SPT values (this mod applies no changes).
    //   - number (1-100): Set response chance to this specific percentage for both killer and victim.
    // Values outside the 1-100 range (if a number is used) will be reset to 'false' (default behavior).
    // Uses ConfigServer.
    // Default: false
    "disablePMC_ChatResponse": false,

    // Allow 'Lega Medals' to be placed in Money Cases.
    // If true, modifies the Money Case filter (ID: 59fb016586f7746d0d4b423a)
    // to accept 'MedalMilitaryLega' (ID: 6656560053eaaa7a23349c86).
    // Default: false
    "allow_LegaMoneyCase": false,

    // Adjust the stack size for 'LegaMedal' (ID: 6656560053eaaa7a23349c86).
    // Sets the maximum number of medals that can stack in a single inventory slot.
    // Range: 1 to 999. Values outside this range will be clamped or reset to the default (50).
    // Default: 50
    "stacksize_lega": 50
}