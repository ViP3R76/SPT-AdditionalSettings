/**
 * Configuration Loader for AdditionalSettings Mod
 * File: src/configCreation.ts
 * Author: ViP3R_76
 * Version: 1.0.1
 * License: MIT
 *
 * Handles loading the mod's configuration from 'config.jsonc',
 * creating a default file with comments if needed, and validating settings.
 * Uses Node.js 'fs' for file operations. Includes manual comment stripping
 * before JSON parsing as a workaround for potential JsonUtil issues.
 */

import { ILogger } from "@spt/models/spt/utils/ILogger";
import { JsonUtil } from "@spt/utils/JsonUtil";
import * as fs from "fs"; // Node.js File System module
import * as path from "path"; // Node.js Path module

// --- Interface and Defaults remain the same ---
export interface IAdditionalSettingsConfig {
    LootArmbands: boolean;
    SaveArmbandOnDeath: boolean;
    LootMelee: boolean;
    SaveMeleeOnDeath: boolean;
    disablePMC_ChatResponse: boolean | number;
    allow_LegaMoneyCase: boolean;
    stacksize_lega: number;
}

const defaultConfigValues: IAdditionalSettingsConfig = {
    LootArmbands: true,
    SaveArmbandOnDeath: false,
    LootMelee: true,
    SaveMeleeOnDeath: false,
    disablePMC_ChatResponse: false,
    allow_LegaMoneyCase: false,
    stacksize_lega: 50
};

// --- RESTORED Detailed Default Config String ---
/**
 * The detailed content written to the default config.jsonc file if it doesn't exist.
 * Includes comments explaining each setting. Referenced version: 1.0.1
 */
const defaultConfigJsonc: string = `// Default Configuration for AdditionalSettings Mod v1.0.1+
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
    // Note: Other mods might override this setting.
    // Default: false
    "SaveArmbandOnDeath": false,

    // Prevent losing your equipped melee weapon upon death.
    // If true, the weapon in your 'Scabbard' slot will remain after dying in a raid.
    // Note: Other mods might override this setting.
    // Default: false
    "SaveMeleeOnDeath": false,


    // --- Gameplay Tweak Settings ---

    // Adjust PMC voice lines triggered after getting a kill or being killed.
    // Accepts:
    //   - true:  Disable responses entirely (set chance to 0%).
    //   - false: Use default SPT values (this mod applies no changes).
    //   - number (1-100): Set response chance to this specific percentage for both killer and victim.
    // Values outside the 1-100 range (if a number is used) will be reset to 'false' (default behavior).
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

    // --- Add future settings below this line ---
}
`;


/**
 * Removes // and /* comments from a JSON string.
 * @param jsonString The JSON string potentially containing comments.
 * @returns The JSON string with comments removed.
 */
function stripJsonComments(jsonString: string): string {
    // This regex aims to remove block comments /* ... */ including nested ones (less common but possible)
    // It also handles comments within strings carefully, although perfect string handling with regex is complex.
    let uncommented = jsonString.replace(/\/\*[\s\S]*?\*\/|(?<!\\)\/\/.*$/gm, '');
    // A simpler regex if the above causes issues (doesn't handle block comments or comments in strings perfectly):
    // uncommented = jsonString.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    return uncommented;
}


/**
 * Loads the configuration file using Node.js 'fs' module or creates a default one if it doesn't exist.
 * Validates settings and includes manual comment stripping before parsing.
 *
 * @param logger Logger instance.
 * @param jsonUtil JSON utility.
 * @param configPath Full path to the config file.
 * @param modName Name of the mod for logging.
 * @returns The loaded and validated configuration object.
 */
export function loadOrCreateConfig(
    logger: ILogger,
    jsonUtil: JsonUtil,
    configPath: string,
    modName: string
): IAdditionalSettingsConfig {
    // Check if the config file exists (create default if not)
    if (!fs.existsSync(configPath)) {
        logger.info(`[${modName}] Config file not found at '${configPath}'. Creating default config...`);
        try {
            const dirPath = path.dirname(configPath);
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
                logger.debug(`[${modName}] Created config directory: ${dirPath}`);
            }
            // Write the FULL default configuration string (with comments)
            fs.writeFileSync(configPath, defaultConfigJsonc, "utf8");
            logger.info(`[${modName}] Default config file created successfully at '${configPath}'.`);
            return { ...defaultConfigValues };
        } catch (writeError) {
            logger.error(`[${modName}] Failed to create default config file at '${configPath}'. Error: ${writeError.message}`);
            logger.debug(writeError.stack);
            logger.error(`[${modName}] Using internal default settings as fallback.`);
            return { ...defaultConfigValues };
        }
    }

    // If the file exists, proceed to read, STRIP COMMENTS, parse, and validate
    try {
        const configContentWithComments = fs.readFileSync(configPath, "utf8");

        // Manually strip comments before parsing
        const configContentStripped = stripJsonComments(configContentWithComments);

        // Deserialize the *stripped* content
        const loadedConfig = jsonUtil.deserialize<Partial<IAdditionalSettingsConfig>>(configContentStripped, configPath);

        logger.debug(`[${modName}] Config file loaded and parsed successfully from '${configPath}'.`);

        // Merge with defaults
        const mergedConfig = { ...defaultConfigValues, ...loadedConfig };

        // --- Validation for Specific Settings (remains the same) ---
        const pmcChatValue = mergedConfig.disablePMC_ChatResponse;
        if (typeof pmcChatValue === 'number') {
             if (isNaN(pmcChatValue) || pmcChatValue < 1 || pmcChatValue > 100) {
                 logger.warning(`[${modName}] Invalid value (${pmcChatValue}) for 'disablePMC_ChatResponse'. Expected true, false, or 1-100. Resetting to default (${defaultConfigValues.disablePMC_ChatResponse}).`);
                 mergedConfig.disablePMC_ChatResponse = defaultConfigValues.disablePMC_ChatResponse;
             } else {
                 mergedConfig.disablePMC_ChatResponse = Math.floor(pmcChatValue);
             }
        } else if (typeof pmcChatValue !== 'boolean') {
             logger.warning(`[${modName}] Invalid type ('${typeof pmcChatValue}') for 'disablePMC_ChatResponse'. Expected true, false, or 1-100. Resetting to default (${defaultConfigValues.disablePMC_ChatResponse}).`);
             mergedConfig.disablePMC_ChatResponse = defaultConfigValues.disablePMC_ChatResponse;
        }

        if (typeof mergedConfig.stacksize_lega !== 'number' || isNaN(mergedConfig.stacksize_lega)) {
             logger.warning(`[${modName}] Invalid or missing non-numeric value for 'stacksize_lega'. Using default: ${defaultConfigValues.stacksize_lega}`);
             mergedConfig.stacksize_lega = defaultConfigValues.stacksize_lega;
        }
        // --- End Validation ---

        return mergedConfig as IAdditionalSettingsConfig;

    } catch (error) {
        // Log parsing/reading errors
        logger.error(`[${modName}] Failed to load or parse config file at '${configPath}'. Error: ${error.message}`);
        if (error instanceof SyntaxError) {
             logger.error(`[${modName}] The error occurred after removing comments. Please check '${configPath}' for JSON syntax errors (e.g., missing/extra commas, incorrect quotes).`);
        }
        logger.debug(error.stack);
        logger.error(`[${modName}] Using internal default settings as fallback.`);
        return { ...defaultConfigValues };
    }
}