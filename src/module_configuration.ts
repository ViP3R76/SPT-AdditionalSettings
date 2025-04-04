// --- START OF FILE src/module_configuration.ts ---

/**
 * Configuration Loader for AdditionalSettings Mod and its Modules
 * File: src/module_configuration.ts
 * Author: ViP3R_76
 * License: MIT
 *
 * Description:
 * Handles loading, validation, and default generation for the main mod configuration
 * (`config.jsonc`) and associated module configurations (e.g., `config_weather.jsonc`).
 * - Creates default configuration files with comments if they don't exist, using templates
 *   imported from `module_headers.ts`.
 * - Validates loaded settings against expected types/ranges, resetting invalid entries
 *   to defaults and logging warnings.
 * - Merges loaded settings with defaults, auto-populating missing entries from older
 *   configs while preserving valid user values.
 * - Includes utilities to strip comments and fix trailing commas from JSONC files before
 *   parsing, improving robustness against common editing errors.
 * - Optionally overwrites config files with the merged/validated data if enabled via
 *   'allow_autoupdate_configs' (WARNING: Removes comments and formatting).
 */

// Required SPT interfaces and utilities
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { JsonUtil } from "@spt/utils/JsonUtil";

// Node.js built-in modules
import * as fs from "node:fs";
import * as path from "node:path";

// Import default configuration file content (JSONC strings with comments)
import { DEFAULT_MAIN_CONFIG_JSONC, DEFAULT_WEATHER_CONFIG_JSONC } from "./module_headers";

// ===========================================================================================
// === Type Definitions ===
// ===========================================================================================

/**
 * Structure of the main configuration (`config.jsonc`).
 * Controls core features and module activation.
 * Reflects structure as of mod version 1.0.5+.
 */
export interface IAdditionalSettingsConfig {
    // Module Activation
    use_weather_module: boolean;
    use_plant_time_module: boolean;
    use_ammo_module: boolean;
    use_weapon_module: boolean; // Added v1.0.5

    // Core Gameplay Tweaks
    LootArmbands: boolean;
    SaveArmbandOnDeath: boolean;
    LootMelee: boolean;
    SaveMeleeOnDeath: boolean;
    disablePMC_ChatResponse: boolean | number; // true=0%, false=default, 1-100=%
    allow_LegaMoneyCase: boolean;
    stacksize_lega: number; // 1-999
    removeFirForHideout: boolean;
    disableSeasonEvents: boolean;

    // Plant Time Module Settings (Requires use_plant_time_module: true)
    leaveItemAtLocationModifier: number; // >= 0
    placeBeaconModifier: number; // >= 0

    // Ammo Module Settings (Requires use_ammo_module: true)
    weightless_ammo: boolean;
    weightless_ammoboxes: boolean;
    weightless_grenades: boolean;

    // Weapon Module Settings (Requires use_weapon_module: true)
    weapon_inv_shrink: boolean; // Added v1.0.5

    // Debugging & Maintenance
    allow_autoupdate_configs: boolean; // WARNING: Overwrites user file, removes comments/formatting
    enableDebugLogs: boolean;
}

/**
 * Structure of the Weather Module's configuration (`config_weather.jsonc`).
 * Controls season selection logic.
 */
export interface IWeatherModuleConfig {
    // Mode Selection
    use_fixed_season: boolean;
    fixed_season_index: number; // 1-7 (Summer to Storm)
    use_weight_system: boolean; // Requires use_fixed_season: false
    use_random_system: boolean; // Requires fixed & weighted false
    random_system_mode: number; // 0=All (Ignore Excludes), 1=Available (Respect Excludes)

    // Exclusion List (for Weighted & Random Mode 1)
    exclude_seasons: number[]; // 0-6 (Summer to Storm)

    // Weight System Values (Requires use_weight_system: true)
    // Non-negative numbers, higher means more likely
    Summer: number; Autumn: number; Winter: number; Spring: number;
    LateAutumn: number; EarlySpring: number; Storm: number;
}

// ===========================================================================================
// === Default Configuration Values ===
// ===========================================================================================

/**
 * Default values for `config.jsonc`. Used for creation and fallback.
 * Reflects defaults as of mod version 1.0.5+.
 */
const defaultMainConfigValues: IAdditionalSettingsConfig = {
    use_weather_module: false,
    use_plant_time_module: false,
    use_ammo_module: false,
    use_weapon_module: false,

    LootArmbands: true,
    SaveArmbandOnDeath: false,
    LootMelee: true,
    SaveMeleeOnDeath: false,
    disablePMC_ChatResponse: false,
    allow_LegaMoneyCase: false,
    stacksize_lega: 50,
    removeFirForHideout: false,
    disableSeasonEvents: false,

    leaveItemAtLocationModifier: 1.0,
    placeBeaconModifier: 1.0,

    weightless_ammo: false,
    weightless_ammoboxes: false,
    weightless_grenades: false,

    weapon_inv_shrink: false,

    allow_autoupdate_configs: false,
    enableDebugLogs: false
};

/**
 * Default values for `config_weather.jsonc`. Used for creation and fallback.
 */
const defaultWeatherConfigValues: IWeatherModuleConfig = {
    use_fixed_season: false,
    fixed_season_index: 1, // Default to Summer if fixed mode is enabled
    use_weight_system: false,
    use_random_system: true, // Default to random mode if fixed/weighted are off
    random_system_mode: 0, // Default to 'Auto All' (ignore excludes)
    exclude_seasons: [],
    Summer: 10, Autumn: 10, Winter: 10, Spring: 10,
    LateAutumn: 10, EarlySpring: 10, Storm: 5 // Storm slightly less common by default
};

// ===========================================================================================
// === Utility Functions ===
// ===========================================================================================

/**
 * Removes // and /* comments from a JSON string. Basic implementation.
 * @param jsonString JSON string potentially containing comments.
 * @returns JSON string with comments removed, or empty string on invalid input.
 */
function stripJsonComments(jsonString: string): string {
    if (typeof jsonString !== 'string') return '';
    try {
        // Remove /* ... */ block comments first
        let uncommented = jsonString.replace(/\/\*[\s\S]*?\*\//g, '');
        // Remove // line comments, carefully avoiding those inside strings or URLs
        uncommented = uncommented.replace(/(?<![:"'\\])\/\/.*$/gm, '');
        return uncommented.trim();
    } catch (e) {
        console.error("Error stripping comments:", e);
        // Fallback: less precise
        let uncommented = jsonString.replace(/\/\*[\s\S]*?\*\//g, '');
        uncommented = uncommented.replace(/\/\/.*$/gm, '');
        return uncommented.trim();
    }
}

/**
 * Attempts to fix trailing commas (e.g., `,"key": value }` or `,"value" ]`) in a JSON-like string.
 * @param jsonString Potentially invalid JSON string.
 * @returns JSON string with trailing commas removed, or original string on error/invalid input.
 */
function fixTrailingCommas(jsonString: string): string {
    if (typeof jsonString !== 'string') return jsonString;
    try {
        // Regex: Find a comma, followed by optional whitespace, then a closing brace or bracket.
        const regex = /,\s*([}\]])/g;
        // Replace the matched sequence with just the closer ($1).
        return jsonString.replace(regex, "$1");
    } catch (e) {
        console.error("Error fixing trailing commas:", e);
        return jsonString; // Return original on failure
    }
}


// ===========================================================================================
// === Core Config Loading and Validation Logic ===
// ===========================================================================================

/**
 * Ensures a file exists at the specified path, creating it from default content if not.
 * @param configPath Path to the target config file.
 * @param defaultConfigJsonc Default content string (with comments) to write if file is missing.
 * @param logger Logger instance.
 * @param logPrefix Log prefix string for messages.
 * @returns True if the file exists or was created successfully, false otherwise.
 */
function ensureFileExists(configPath: string, defaultConfigJsonc: string, logger: ILogger, logPrefix: string): boolean {
    if (!fs.existsSync(configPath)) {
        logger.debug(`${logPrefix} Config file not found at '${path.basename(configPath)}'. Creating default...`);
        try {
            const dirPath = path.dirname(configPath);
            // Ensure the directory exists before writing the file
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            fs.writeFileSync(configPath, defaultConfigJsonc, { encoding: "utf8" });
            logger.debug(`${logPrefix} Default config file created successfully at '${path.basename(configPath)}'.`);
            return true;
        } catch (writeError) {
            logger.error(`${logPrefix} Failed to create default config file at '${path.basename(configPath)}'. Error: ${writeError.message}`);
            return false;
        }
    }
    return true; // File already exists
}

/**
 * Generic function to load, parse, merge, validate, and optionally write back a config file.
 * Handles JSONC parsing, default merging, validation, and optional auto-update.
 *
 * @template TConfigType The expected type/interface of the configuration object.
 * @param logger Logger instance.
 * @param jsonUtil JSON utility for parsing and cloning.
 * @param configPath Full path to the configuration file.
 * @param defaultConfigJsonc Default content string (with comments), used ONLY for rebuilding if `allowWriteBack` is true.
 * @param defaultConfigValues Default values object for merging and fallback.
 * @param validationFunction Function to validate the specific config type `TConfigType`. Returns keys reset to default.
 * @param logPrefix Log prefix string for context.
 * @param debugEnabled Whether detailed debug logging is enabled.
 * @param allowWriteBack Whether to allow overwriting the config file with merged/validated data (removes comments!).
 * @returns The loaded, merged, and validated configuration object (`TConfigType`). Returns defaults on critical failure.
 */
function loadAndValidateConfigFile<TConfigType extends object>(
    logger: ILogger,
    jsonUtil: JsonUtil,
    configPath: string,
    defaultConfigJsonc: string, // Template with comments, used for rebuild only
    defaultConfigValues: TConfigType,
    validationFunction: (config: TConfigType, logger: ILogger, logPrefix: string) => string[], // Validator function signature
    logPrefix: string,
    debugEnabled: boolean,
    allowWriteBack: boolean
): TConfigType {
    const configFilename = path.basename(configPath); // For logging clarity

    // 1. Read and Pre-process File
    let loadedConfig: Partial<TConfigType> | null = null;
    try {
        if (debugEnabled) logger.debug(`${logPrefix} Loading config file '${configFilename}'...`);
        const rawContent = fs.readFileSync(configPath, "utf8");
        // Clean comments and potential trailing commas before parsing
        const processedContent = fixTrailingCommas(stripJsonComments(rawContent));

        if (!processedContent || processedContent.trim() === "") {
            logger.warning(`${logPrefix} Config file '${configFilename}' is empty or invalid. Using defaults.`);
            return jsonUtil.clone(defaultConfigValues); // Return deep copy of defaults
        }

        // 2. Parse JSON
        loadedConfig = jsonUtil.deserialize<Partial<TConfigType>>(processedContent, configFilename);
        if (debugEnabled) logger.debug(`${logPrefix} Config file '${configFilename}' parsed.`);

    } catch (error) {
        logger.error(`${logPrefix} Failed to load/parse config '${configFilename}'. Error: ${error.message}`);
        if (error instanceof SyntaxError) logger.error(`${logPrefix} Check '${configFilename}' for JSON syntax errors.`);
        logger.error(`${logPrefix} Using default settings for '${configFilename}'.`);
        return jsonUtil.clone(defaultConfigValues); // Return deep copy of defaults
    }

    // 3. Merge with Defaults
    // Start with defaults, overwrite with loaded values, handle missing/unknown keys
    const mergedConfig: TConfigType = jsonUtil.clone(defaultConfigValues);
    let fileNeedsUpdate = false; // Tracks if merging/validation requires potential write-back

    if (loadedConfig) {
        const defaultKeys = new Set(Object.keys(defaultConfigValues));
        for (const key in loadedConfig) {
            // Only merge known keys defined in defaults
            if (defaultKeys.has(key) && Object.prototype.hasOwnProperty.call(loadedConfig, key)) {
                mergedConfig[key as keyof TConfigType] = loadedConfig[key as keyof TConfigType] as TConfigType[keyof TConfigType];
            } else if (debugEnabled) {
                logger.debug(`${logPrefix} Ignored unknown key '${key}' in '${configFilename}'.`);
            }
        }
        // Check for keys present in defaults but missing in loaded file (new settings added in mod update)
        for (const defaultKey of defaultKeys) {
            if (!Object.prototype.hasOwnProperty.call(loadedConfig, defaultKey)) {
                fileNeedsUpdate = true;
                if (debugEnabled) logger.debug(`${logPrefix} Added missing default key '${defaultKey}' for '${configFilename}'.`);
            }
        }
    } else {
        fileNeedsUpdate = true; // Loading failed, needs update if allowed
    }
    if (debugEnabled) logger.debug(`${logPrefix} Merged loaded config with defaults for '${configFilename}'.`);

    // 4. Validate Merged Configuration using the provided validation function
    const resetKeys = validationFunction(mergedConfig, logger, logPrefix);
    if (resetKeys.length > 0) {
        fileNeedsUpdate = true; // Mark for update if validation reset keys
        logger.warning(`${logPrefix} Reset invalid entries in ${configFilename} to default: [${resetKeys.join(", ")}]`);
    } else if (debugEnabled) {
        logger.debug(`${logPrefix} Config validation passed for '${configFilename}'.`);
    }

    // 5. Optional: Write Back Updated Config (if enabled and needed)
    // This attempts to preserve comments by rebuilding from the template string.
    if (allowWriteBack && fileNeedsUpdate) {
        logger.info(`${logPrefix} Auto-updating config file '${configFilename}' (Comments/formatting may be lost)...`);
        try {
            const updatedJsoncString = rebuildConfigStringWithComments(
                defaultConfigJsonc, mergedConfig, logger, logPrefix
            );
            if (updatedJsoncString) {
                fs.writeFileSync(configPath, updatedJsoncString, { encoding: "utf8" });
                if (debugEnabled) logger.debug(`${logPrefix} Successfully updated config file '${configFilename}'.`);
            } else {
                 logger.error(`${logPrefix} Failed to rebuild config string for '${configFilename}'. File not updated.`);
            }
        } catch (writeError) {
            logger.error(`${logPrefix} Failed to write updated config to '${configFilename}'. Error: ${writeError.message}`);
        }
    } else if (allowWriteBack && !fileNeedsUpdate && debugEnabled) {
         logger.debug(`${logPrefix} Auto-update enabled, but '${configFilename}' is valid and up-to-date. No write needed.`);
    }

    // 6. Return Final Config object used by the mod
    return mergedConfig;
}

/**
 * Attempts to rebuild a JSONC string using a template and inserting validated data.
 * Uses regex to replace values while trying to preserve comments and structure.
 * NOTE: This is fragile and may fail with complex JSON or unusual comment placement.
 *
 * @param templateString The original default config string (JSONC) with comments.
 * @param data The validated configuration data object.
 * @param logger Logger instance for reporting issues.
 * @param logPrefix Log prefix string.
 * @returns The rebuilt JSONC string, or null on failure.
 */
function rebuildConfigStringWithComments<TConfigType extends object>(
    templateString: string,
    data: TConfigType,
    logger: ILogger,
    logPrefix: string
): string | null {
    try {
        let rebuiltString = templateString;
        for (const key in data) {
            if (Object.prototype.hasOwnProperty.call(data, key)) {
                const value = data[key as keyof TConfigType];
                // Regex to find the line defining this key in the template.
                const keyPattern = new RegExp(
                    // Group 1: Start of line, whitespace, quote, key, quote, colon, whitespace
                    `^(\\s*"${key}"\\s*:\\s*)` +
                    // Non-capturing group for the old value (string, bool, null, number, simple array/obj)
                    `(?:${
                        `(?:"(?:[^"\\\\]|\\\\.)*"|true|false|null|-?\\d+(?:\\.\\d+)?(?:[eE][+-]?\\d+)?|\\[[^\\]]*\\]|\\{[^\\}]*\\})`
                    })` +
                    // Group 2: Optional comma, whitespace, optional line comment, end of line
                    `(\\s*,?\\s*(?:\\/\\/.*)?)$`,
                    "m" // Multiline flag
                );

                const match = rebuiltString.match(keyPattern);

                if (match) {
                    const beforeValue = match[1];
                    const afterValueAndComment = match[2];
                    const newValueString = JSON.stringify(value); // Format new value correctly
                    // Replace the matched line with the reconstructed line
                    rebuiltString = rebuiltString.replace(keyPattern, `${beforeValue}${newValueString}${afterValueAndComment}`);
                } else {
                    // Log warning if a key from current data couldn't be found in the template
                    // (might happen if template is older or regex fails)
                    logger?.warning(`${logPrefix} Could not find/update key "${key}" in template during rebuild.`);
                }
            }
        }
        return rebuiltString;
    } catch (error) {
        logger?.error(`${logPrefix} Error rebuilding config string: ${error.message}`);
        console.error("Error rebuilding config string:", error); // Log raw error for stack trace
        return null; // Indicate failure
    }
}


// ===========================================================================================
// === Specific Configuration Validation Functions ===
// ===========================================================================================

/**
 * Validates the main configuration object (`IAdditionalSettingsConfig`).
 * Checks types and value ranges, resetting invalid properties to defaults.
 * Modifies the passed `config` object directly.
 * @param config The merged config object to validate.
 * @param logger Logger instance.
 * @param logPrefix Log prefix.
 * @returns Array of keys that were reset to their default values.
 */
function validateMainConfig(config: IAdditionalSettingsConfig, logger: ILogger, logPrefix: string): string[] {
    const resetKeys: string[] = [];
    const defaults = defaultMainConfigValues;

    // Helper to check boolean values
    const checkBoolean = (key: keyof IAdditionalSettingsConfig) => {
        if (typeof config[key] !== 'boolean') {
            if (!resetKeys.includes(key)) resetKeys.push(key);
            config[key] = defaults[key];
        }
    };

    // Helper to check non-negative finite numbers
    const checkNonNegativeFinite = (key: keyof IAdditionalSettingsConfig) => {
         if (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || config[key] < 0) {
            if (!resetKeys.includes(key)) resetKeys.push(key);
            config[key] = defaults[key];
        }
    };

    // --- Validate Individual Settings ---

    // Booleans
    checkBoolean("use_weather_module");
    checkBoolean("use_plant_time_module");
    checkBoolean("use_ammo_module");
    checkBoolean("use_weapon_module"); // Added v1.0.5
    checkBoolean("LootArmbands");
    checkBoolean("SaveArmbandOnDeath");
    checkBoolean("LootMelee");
    checkBoolean("SaveMeleeOnDeath");
    checkBoolean("allow_LegaMoneyCase");
    checkBoolean("removeFirForHideout");
    checkBoolean("disableSeasonEvents");
    checkBoolean("weightless_ammo");
    checkBoolean("weightless_ammoboxes");
    checkBoolean("weightless_grenades");
    checkBoolean("weapon_inv_shrink"); // Added v1.0.5
    checkBoolean("allow_autoupdate_configs");
    checkBoolean("enableDebugLogs");

    // disablePMC_ChatResponse (boolean or integer 1-100)
    const pmcChatValue = config.disablePMC_ChatResponse;
    if (typeof pmcChatValue === 'number') {
        if (!Number.isInteger(pmcChatValue) || pmcChatValue < 1 || pmcChatValue > 100) {
            if (!resetKeys.includes("disablePMC_ChatResponse")) resetKeys.push("disablePMC_ChatResponse");
            config.disablePMC_ChatResponse = defaults.disablePMC_ChatResponse;
        }
    } else if (typeof pmcChatValue !== 'boolean') {
        if (!resetKeys.includes("disablePMC_ChatResponse")) resetKeys.push("disablePMC_ChatResponse");
        config.disablePMC_ChatResponse = defaults.disablePMC_ChatResponse;
    }

    // stacksize_lega (integer 1-999)
    if (typeof config.stacksize_lega !== 'number' || !Number.isInteger(config.stacksize_lega) || config.stacksize_lega < 1 || config.stacksize_lega > 999) {
        if (!resetKeys.includes("stacksize_lega")) resetKeys.push("stacksize_lega");
        config.stacksize_lega = defaults.stacksize_lega;
    }

    // Plant Time Modifiers (non-negative finite numbers)
    checkNonNegativeFinite("leaveItemAtLocationModifier");
    checkNonNegativeFinite("placeBeaconModifier");

    return resetKeys;
}

/**
 * Validates the weather module configuration object (`IWeatherModuleConfig`).
 * Checks types and value ranges, resetting invalid properties to defaults.
 * Modifies the passed `config` object directly.
 * @param config The merged config object to validate.
 * @param logger Logger instance.
 * @param logPrefix Log prefix for weather module context.
 * @returns Array of keys that were reset to their default values.
 */
function validateWeatherConfig(config: IWeatherModuleConfig, logger: ILogger, logPrefix: string): string[] {
    const resetKeys: string[] = [];
    const defaults = defaultWeatherConfigValues;
    const seasonsArrayLength = 7; // Max valid index is 6 (0-6)

    // Helper to check boolean values
    const checkBoolean = (key: keyof IWeatherModuleConfig) => {
        if (typeof config[key] !== 'boolean') {
            if (!resetKeys.includes(key)) resetKeys.push(key); config[key] = defaults[key];
        }
    };
    // Helper to check non-negative finite numbers
    const checkNonNegativeFinite = (key: keyof IWeatherModuleConfig) => {
         if (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || config[key] < 0) {
            if (!resetKeys.includes(key)) resetKeys.push(key); config[key] = defaults[key];
        }
    };

    // --- Validate Individual Settings ---
    checkBoolean("use_fixed_season");
    checkBoolean("use_weight_system");
    checkBoolean("use_random_system");

    // Fixed Season Index (integer 1-7)
    if (typeof config.fixed_season_index !== 'number' || !Number.isInteger(config.fixed_season_index) || config.fixed_season_index < 1 || config.fixed_season_index > 7) {
        if (!resetKeys.includes("fixed_season_index")) resetKeys.push("fixed_season_index");
        config.fixed_season_index = defaults.fixed_season_index;
    }

    // Random System Mode (integer 0-1)
    if (typeof config.random_system_mode !== 'number' || !Number.isInteger(config.random_system_mode) || config.random_system_mode < 0 || config.random_system_mode > 1) {
        if (!resetKeys.includes("random_system_mode")) resetKeys.push("random_system_mode");
        config.random_system_mode = defaults.random_system_mode;
    }

    // Exclude Seasons Array (array of integers 0-6)
    if (!Array.isArray(config.exclude_seasons)) {
        if (!resetKeys.includes("exclude_seasons")) resetKeys.push("exclude_seasons");
        config.exclude_seasons = [...defaults.exclude_seasons]; // Reset to default empty array
    } else {
        // Filter out invalid entries
        const originalLength = config.exclude_seasons.length;
        config.exclude_seasons = config.exclude_seasons.filter(idx =>
            Number.isInteger(idx) && idx >= 0 && idx < seasonsArrayLength
        );
        // Mark as reset if filtering changed the array
        if (config.exclude_seasons.length !== originalLength && !resetKeys.includes("exclude_seasons")) {
             resetKeys.push("exclude_seasons");
        }
        // Safety check: Prevent excluding ALL seasons
        if (config.exclude_seasons.length >= seasonsArrayLength) {
             logger.warning(`${logPrefix} 'exclude_seasons' included all possible seasons (0-6). Keeping Storm (6) available.`);
             config.exclude_seasons = config.exclude_seasons.filter(idx => idx !== 6); // Keep Storm (index 6)
             if (!resetKeys.includes("exclude_seasons")) resetKeys.push("exclude_seasons");
        }
    }

    // Season Weights (non-negative finite numbers)
    const weightKeys: (keyof IWeatherModuleConfig)[] = ["Summer", "Autumn", "Winter", "Spring", "LateAutumn", "EarlySpring", "Storm"];
    let totalWeight = 0;
    for (const key of weightKeys) {
        checkNonNegativeFinite(key); // Validate individual weight
        if (typeof config[key] === 'number') totalWeight += config[key]; // Sum valid weights
    }
    // Warn if weighted mode is enabled but total weight is zero
    if (config.use_weight_system && totalWeight <= 0) {
        logger.warning(`${logPrefix} Total weight for seasons is zero or negative. Weighted mode may not function correctly.`);
    }

    return resetKeys;
}


// ===========================================================================================
// === Exported Loader Functions ===
// ===========================================================================================

/**
 * Loads and validates the main configuration file (`config.jsonc`).
 * Called by the main mod (`mod.ts`). Ensures default config files exist.
 * Determines initial debug/autoupdate flags before full load.
 * @param logger Logger instance.
 * @param jsonUtil JSON utility instance.
 * @param configPath Full path to `config.jsonc`.
 * @param modName Name of the main mod for logging context.
 * @returns The loaded and validated main configuration object (`IAdditionalSettingsConfig`). Returns defaults on critical failure.
 */
export function loadMainConfig(
    logger: ILogger,
    jsonUtil: JsonUtil,
    configPath: string,
    modName: string
): IAdditionalSettingsConfig {
    const logPrefix = `[${modName}]`;
    const configFilename = path.basename(configPath);

    // --- Step 1: Ensure all necessary config files exist ---
    const configDir = path.dirname(configPath);
    const weatherConfigPath = path.join(configDir, "config_weather.jsonc");
    // Add other module config paths here if needed

    // Use imported default content strings from module_headers.ts
    ensureFileExists(configPath, DEFAULT_MAIN_CONFIG_JSONC, logger, logPrefix);
    ensureFileExists(weatherConfigPath, DEFAULT_WEATHER_CONFIG_JSONC, logger, "[ASM Weather]");

    // --- Step 2: Preliminary read for debug/autoupdate flags ---
    // Allows the main loader to use the user's intended flags during the loading process itself.
    let allowWriteBack = defaultMainConfigValues.allow_autoupdate_configs;
    let debugEnabled = defaultMainConfigValues.enableDebugLogs;
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, "utf8");
            const fixedContent = fixTrailingCommas(stripJsonComments(content));
            if (fixedContent) {
                // Use a temporary parse just to read flags - errors ignored here
                const preliminaryParsed = jsonUtil.deserialize<Partial<IAdditionalSettingsConfig>>(fixedContent, configFilename);
                if (typeof preliminaryParsed.allow_autoupdate_configs === 'boolean') {
                    allowWriteBack = preliminaryParsed.allow_autoupdate_configs;
                }
                if (typeof preliminaryParsed.enableDebugLogs === 'boolean') {
                    debugEnabled = preliminaryParsed.enableDebugLogs;
                }
            }
        }
    } catch (e) {
        logger.warning(`${logPrefix} Could not perform preliminary read of config flags from '${configFilename}'. Using defaults.`);
    }

    // --- Step 3: Load, Merge, Validate the Main Config ---
    const config = loadAndValidateConfigFile<IAdditionalSettingsConfig>(
        logger, jsonUtil, configPath,
        DEFAULT_MAIN_CONFIG_JSONC,
        defaultMainConfigValues,
        validateMainConfig,
        logPrefix,
        debugEnabled,
        allowWriteBack
    );

    // --- Step 4: Log Final Config (if debug enabled) ---
    if (config.enableDebugLogs) {
        logger.debug(`${logPrefix} Final Main configuration loaded: ${JSON.stringify(config)}`);
    }
    return config;
}

/**
 * Loads and validates the weather module's configuration file (`config_weather.jsonc`).
 * Called by the weather module (`module_weather.ts`). Assumes file exists.
 * @param logger Logger instance.
 * @param jsonUtil JSON utility instance.
 * @param configPath Full path to `config_weather.jsonc`.
 * @param logPrefix Log prefix for weather module context.
 * @param debugEnabled Whether debug logging is enabled (passed from main config).
 * @param allowWriteBack Whether auto-updating is enabled (passed from main config).
 * @returns The loaded and validated weather configuration object (`IWeatherModuleConfig`). Returns defaults on critical failure.
 */
export function loadWeatherConfig(
    logger: ILogger,
    jsonUtil: JsonUtil,
    configPath: string,
    logPrefix: string,
    debugEnabled: boolean,
    allowWriteBack: boolean
): IWeatherModuleConfig {
    // Call the generic loader/validator for the weather config
    const config = loadAndValidateConfigFile<IWeatherModuleConfig>(
        logger, jsonUtil, configPath,
        DEFAULT_WEATHER_CONFIG_JSONC, // Pass weather template
        defaultWeatherConfigValues,
        validateWeatherConfig, // Pass weather validation function
        logPrefix,
        debugEnabled,
        allowWriteBack
    );

    // Log final config if debug is enabled
    if (debugEnabled) {
        logger.debug(`${logPrefix} Final Weather configuration loaded: ${JSON.stringify(config)}`);
    }
    return config;
}

// --- END OF FILE src/module_configuration.ts ---