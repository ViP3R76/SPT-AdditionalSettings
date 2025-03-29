/**
 * Additional Settings Mod for SPT ~3.11+ (Using Node FS & ConfigServer)
 * File: src/mod.ts
 * Author: ViP3R_76
 * Version: 1.0.1 // Initial Public Release
 * License: MIT
 *
 * Description:
 * This server mod provides several configurable tweaks to the gameplay experience in SPT.
 * It modifies the SPT database (items) and server configurations (globals, bots) after they load,
 * based on settings defined in the 'user/mods/vip3r76-AdditionalSettings/config/config.jsonc' file.
 * A default configuration file is created automatically using Node 'fs'.
 * Uses SPT's ConfigServer for modifying server settings like LostOnDeath and PmcChatResponse for better compatibility.
 * Includes failsafe checks for database availability and configuration validity.
 *
 * Features (as of v1.0.1):
 * - Lootable Armbands: Makes armbands lootable (except blacklisted items).
 * - Save Armbands on Death: Prevents armbands from being lost on death.
 * - Lootable Knives: Makes melee weapons lootable (except blacklisted items).
 * - Save Melee on Death: Prevents melee weapons in the scabbard slot from being lost on death.
 * - PMC Chat Response Control: Disables (0%) or sets specific % (1-100) for PMC chat responses.
 * - Allow Lega Medals in Money Case: Allows 'Lega Medals' to be placed in Money Cases.
 * - Configurable Lega Medal Stack Size: Adjusts the stack size for Lega Medals (within 1-999 limits).
 */

// Required SPT interfaces and utilities
import { DependencyContainer } from "tsyringe"; // SPT's dependency injection container
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod"; // Interface for mods interacting after DB load
import { ILogger } from "@spt/models/spt/utils/ILogger"; // Interface for logging messages to the server console
import { DatabaseServer } from "@spt/servers/DatabaseServer"; // Service for accessing SPT database tables
import { JsonUtil } from "@spt/utils/JsonUtil"; // Utility for parsing JSON and JSONC
import { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables"; // Type definition for the main database tables object
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem"; // Type definition for individual item templates
import { ConfigServer } from "@spt/servers/ConfigServer"; // Service for accessing server configurations (like globals, bot settings)
import { ConfigTypes } from "@spt/models/enums/ConfigTypes"; // Enum specifying config types for ConfigServer
import { ILostOnDeathConfig } from "@spt/models/spt/config/ILostOnDeathConfig"; // Type definition for LostOnDeath config
import { IPmcChatResponse } from "@spt/models/spt/config/IPmcChatResponse"; // Type definition for PmcChatResponse config

// Import configuration loading logic (uses Node FS internally) and the config interface
import { IAdditionalSettingsConfig, loadOrCreateConfig } from "./configCreation";

// Node.js modules
import * as path from "path"; // Standard Node.js module for working with file paths

class AdditionalSettingsMod implements IPostDBLoadMod
{
    // Instance of the logger provided by SPT container
    private logger: ILogger;

    // Holds the configuration settings loaded from the config file
    private config: IAdditionalSettingsConfig;

    // Static name of the mod, used for consistent logging prefixes
    private readonly modName: string = "AdditionalSettings";

    // Current version of the mod, used for logging
    private readonly modVersion: string = "1.0.1";

    // Absolute path to the configuration file, relative to this mod's installation directory
    private readonly configPath: string = path.join(__dirname, "../config/config.jsonc");

    // --- Constants for Item IDs and Parent IDs ---
    // Using constants makes the code more readable and easier to update if IDs change.
    private static readonly ARMBAND_PARENT_ID: string = "5b3f15d486f77432d0509248";
    private static readonly MELEE_PARENT_ID: string = "5447e1d04bdc2dff2f8b4567";
    private static readonly MONEY_CASE_ID: string = "59fb016586f7746d0d4b423a";
    private static readonly LEGA_MEDAL_ID: string = "6656560053eaaa7a23349c86";

    // Constants for Lega Medal stack size validation/defaults
    private static readonly LEGA_DEFAULT_STACK: number = 50; // Default used if config is invalid/missing
    private static readonly LEGA_MIN_STACK: number = 1;   // Minimum allowed stack size
    private static readonly LEGA_MAX_STACK: number = 999; // Maximum allowed stack size

    // --- Internal Blacklist ---
    // A hardcoded list of item TPL IDs that should *never* be made lootable by this mod,
    // regardless of the configuration settings. Acts as a failsafe override.
    private static readonly LOOTABILITY_BLACKLIST: string[] = [
        "65ca457b4aafb5d7fc0dcb5d" // United Cutlery M48 Tactical Kukri - Keep this specific knife unlootable
    ];

    /**
     * SPT calls this method after the database is loaded but before the server fully starts.
     * This is the primary entry point for mods that modify database items or server configurations.
     * @param container The SPT dependency injection container.
     */
    public postDBLoad(container: DependencyContainer): void
    {
        // --- Resolve Core Dependencies ---
        this.logger = container.resolve<ILogger>("WinstonLogger");
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const jsonUtil = container.resolve<JsonUtil>("JsonUtil");
        const configServer = container.resolve<ConfigServer>("ConfigServer");

        this.logger.info(`[${this.modName} v${this.modVersion}] Initializing...`);

        // --- Load Mod Configuration ---
        // Calls the function which loads/creates/validates config using Node FS
        this.config = loadOrCreateConfig(this.logger, jsonUtil, this.configPath, this.modName);
        this.logger.debug(`[${this.modName}] Loaded configuration: ${JSON.stringify(this.config)}`);

        // --- Get Database Tables (needed for item modifications) ---
        const tables: IDatabaseTables | undefined = databaseServer.getTables();

        // Failsafe: Check if core database tables are accessible
        if (!tables) {
            this.logger.error(`[${this.modName}] Critical Error: Database tables could not be retrieved from DatabaseServer. Aborting item modifications.`);
            // Attempt to apply ConfigServer changes anyway, as they might not depend on `tables`
            this.applyServerConfigSettings(configServer);
            return; // Exit after attempting config changes
        }

        // Failsafe: Check specifically for item templates table
        const items: Record<string, ITemplateItem> | undefined = tables.templates?.items;
        if (!items) {
            this.logger.error(`[${this.modName}] Error: Item templates table (tables.templates.items) not found. Cannot apply item modifications.`);
        } else {
            // Apply modifications that require the item templates table
            this.applyItemSettings(items);
        }

        // Apply modifications that use the ConfigServer (LostOnDeath, PmcChatResponse)
        this.applyServerConfigSettings(configServer);

        // --- Final Success Message ---
        this.logger.success(`[${this.modName} v${this.modVersion}] Initialization complete. Settings applied.`);
    }

    /**
     * Applies all settings that modify item properties in the database.
     * @param items The database item templates object.
     */
    private applyItemSettings(items: Record<string, ITemplateItem>): void {
        this.logger.debug(`[${this.modName}] Applying item template modifications...`);
        this.applyLootabilitySettings(items);
        this.applyContainerSettings(items);
        this.applyItemStackSizeSettings(items);
    }

    /**
     * Applies all settings that modify server configurations via ConfigServer.
     * @param configServer The resolved ConfigServer instance.
     */
    private applyServerConfigSettings(configServer: ConfigServer): void {
        this.logger.debug(`[${this.modName}] Applying server configuration modifications...`);
        this.applySaveOnDeathSettings(configServer);
        this.applyPmcChatSettings(configServer);
    }


    /**
     * Iterates through item templates and applies lootability changes based on config/blacklist.
     * @param items The database item templates object (Record<string, ITemplateItem>).
     */
    private applyLootabilitySettings(items: Record<string, ITemplateItem>): void
    {
        let armbandsMadeLootable = 0;
        let meleeMadeLootable = 0;

        for (const itemId in items) {
            const item = items[itemId];

            // Failsafe: Skip if essential item properties are missing
            if (!item?._props || !item._parent) {
                continue;
            }

            const isBlacklisted = AdditionalSettingsMod.LOOTABILITY_BLACKLIST.includes(itemId);

            // Process Armbands
            if (item._parent === AdditionalSettingsMod.ARMBAND_PARENT_ID && item._props.Unlootable) {
                if (this.config.LootArmbands && !isBlacklisted) {
                    item._props.Unlootable = false;
                    item._props.UnlootableFromSide = []; // Ensure no side restriction remains
                    armbandsMadeLootable++;
                } else if (this.config.LootArmbands && isBlacklisted) {
                    this.logger.debug(`[${this.modName}] Skipped making armband ${itemId} (${item._name || 'N/A'}) lootable due to internal blacklist.`);
                }
            }

            // Process Melee Weapons
            if (item._parent === AdditionalSettingsMod.MELEE_PARENT_ID && item._props.Unlootable) {
                if (this.config.LootMelee && !isBlacklisted) {
                    item._props.Unlootable = false;
                    item._props.UnlootableFromSide = []; // Ensure no side restriction remains
                    meleeMadeLootable++;
                } else if (this.config.LootMelee && isBlacklisted) {
                    this.logger.debug(`[${this.modName}] Skipped making melee weapon ${itemId} (${item._name || 'N/A'}) lootable due to internal blacklist.`);
                }
            }
        }

        // Log results only if the corresponding config option was enabled
        if (this.config.LootArmbands && armbandsMadeLootable > 0) {
            this.logger.info(`[${this.modName}] Made ${armbandsMadeLootable} armband types lootable (excluding blacklisted).`);
        }
        if (this.config.LootMelee && meleeMadeLootable > 0) {
            this.logger.info(`[${this.modName}] Made ${meleeMadeLootable} melee weapon types lootable (excluding blacklisted).`);
        }
    }

    /**
     * Modifies the LostOnDeath server configuration using ConfigServer based on settings.
     * @param configServer The resolved ConfigServer instance.
     */
    private applySaveOnDeathSettings(configServer: ConfigServer): void
    {
        // Retrieve the configuration object from ConfigServer
        const lostOnDeathConfig = configServer.getConfig<ILostOnDeathConfig>(ConfigTypes.LOST_ON_DEATH);

        // Failsafe: Check if the config object was successfully retrieved
        if (!lostOnDeathConfig) {
            this.logger.warning(`[${this.modName}] Failed to retrieve LostOnDeath config via ConfigServer. Cannot apply SaveOnDeath settings.`);
            return;
        }
        // Failsafe: Check if the essential 'equipment' property exists
        if (!lostOnDeathConfig.equipment) {
            this.logger.warning(`[${this.modName}] LostOnDeath config retrieved, but 'equipment' property is missing. Cannot apply SaveOnDeath settings.`);
            return;
        }

        let changed = false;

        // Handle Armbands Save on Death
        if (this.config.SaveArmbandOnDeath && lostOnDeathConfig.equipment.ArmBand === true) {
            lostOnDeathConfig.equipment.ArmBand = false; // Set to not lost
            changed = true;
            this.logger.info(`[${this.modName}] Configured armbands (ArmBand slot) to be saved on death.`);
        }

        // Handle Melee Save on Death
        if (this.config.SaveMeleeOnDeath && lostOnDeathConfig.equipment.Scabbard === true) {
            lostOnDeathConfig.equipment.Scabbard = false; // Set to not lost
            changed = true;
            this.logger.info(`[${this.modName}] Configured melee weapons (Scabbard slot) to be saved on death.`);
        }

        if (!changed) {
            this.logger.debug(`[${this.modName}] SaveOnDeath settings already configured or disabled. No changes needed.`);
        }
    }

    /**
     * Disables or sets a specific percentage for PMC chat responses using ConfigServer based on config.
     * @param configServer The resolved ConfigServer instance.
     */
    private applyPmcChatSettings(configServer: ConfigServer): void
    {
        const settingValue = this.config.disablePMC_ChatResponse;

        // If false, do nothing (use SPT defaults)
        if (settingValue === false) {
            this.logger.debug(`[${this.modName}] PMC chat responses set to use SPT defaults (config is false).`);
            return;
        }

        // Retrieve the configuration object from ConfigServer
        const pmcChatResponseConfig = configServer.getConfig<IPmcChatResponse>(ConfigTypes.PMC_CHAT_RESPONSE);

        // Failsafe: Check if the config object was retrieved
        if (!pmcChatResponseConfig) {
            this.logger.warning(`[${this.modName}] Failed to retrieve PmcChatResponse config via ConfigServer. Cannot apply PMC Chat settings.`);
            return;
        }
        // Failsafe: Check crucial internal structure exists before accessing properties
        if (!pmcChatResponseConfig.killer || pmcChatResponseConfig.killer.responseChancePercent === undefined ||
            !pmcChatResponseConfig.victim || pmcChatResponseConfig.victim.responseChancePercent === undefined) {
            this.logger.warning(`[${this.modName}] PmcChatResponse config retrieved, but 'killer' or 'victim' structure/properties are missing. Cannot apply changes.`);
            return;
        }

        // Determine the target percentage based on validated config value
        let targetPercent: number;
        if (settingValue === true) { // Disable -> 0%
            targetPercent = 0;
        } else { // settingValue is a validated number (1-100)
            targetPercent = settingValue;
        }

        let changeMade = false;
        let logMessage = ""; // Build log message based on what changed

        // Apply to killer response chance only if different
        if (pmcChatResponseConfig.killer.responseChancePercent !== targetPercent) {
            pmcChatResponseConfig.killer.responseChancePercent = targetPercent;
            changeMade = true;
        }
        // Apply to victim response chance only if different
        if (pmcChatResponseConfig.victim.responseChancePercent !== targetPercent) {
            pmcChatResponseConfig.victim.responseChancePercent = targetPercent;
            changeMade = true;
        }

        // Log appropriately only if a change occurred
        if (changeMade) {
            if (targetPercent === 0) {
                logMessage = `[${this.modName}] Disabled PMC killer and victim chat responses (set chance to 0%) via ConfigServer.`;
            } else {
                logMessage = `[${this.modName}] Set PMC killer and victim chat response chance to ${targetPercent}% via ConfigServer.`;
            }
            this.logger.info(logMessage);
        } else {
            this.logger.debug(`[${this.modName}] PMC chat response chance already set to ${targetPercent}%. No change needed.`);
        }
    }

    /**
     * Applies container modification settings (currently, Lega Medals in Money Cases).
     * @param items The database item templates object.
     */
    private applyContainerSettings(items: Record<string, ITemplateItem>): void
    {
        if (this.config.allow_LegaMoneyCase) {
            // Call helper, which includes its own safety checks
            this.allowItemInContainer(
                items,
                AdditionalSettingsMod.MONEY_CASE_ID,
                AdditionalSettingsMod.LEGA_MEDAL_ID,
                "Money Case",
                "Lega Medal"
            );
        } else {
             this.logger.debug(`[${this.modName}] Allowing Lega Medals in Money Case disabled in config.`);
        }
    }

    /**
     * Applies item stack size changes based on configuration settings (currently, Lega Medals).
     * @param items The database item templates object.
     */
    private applyItemStackSizeSettings(items: Record<string, ITemplateItem>): void
    {
        // Call helper, which includes its own validation and safety checks
        this.applyItemStackSize(
            items,
            AdditionalSettingsMod.LEGA_MEDAL_ID,
            this.config.stacksize_lega, // Value already type-checked in config loader
            "Lega Medal",
            AdditionalSettingsMod.LEGA_DEFAULT_STACK,
            AdditionalSettingsMod.LEGA_MIN_STACK,
            AdditionalSettingsMod.LEGA_MAX_STACK
        );
    }

    /**
     * Helper method to add an item's TPL ID to the allowed item filter list of a container's primary grid.
     * Includes safety checks and avoids duplicates.
     * @param items Database item templates object.
     * @param containerId TPL ID of the container.
     * @param itemIdToAdd TPL ID of the item to add.
     * @param containerName Friendly name for logging.
     * @param itemName Friendly name for logging.
     */
    private allowItemInContainer(items: Record<string, ITemplateItem>, containerId: string, itemIdToAdd: string, containerName: string, itemName: string): void
    {
        const containerItem = items[containerId];

        // Failsafe: Check existence of container and item to add
        if (!containerItem) {
            this.logger.warning(`[${this.modName}] Cannot modify ${containerName} (${containerId}): Item template not found.`);
            return;
        }
        if (!items[itemIdToAdd]) {
            this.logger.warning(`[${this.modName}] Cannot allow ${itemName} (${itemIdToAdd}) in ${containerName}: Item template not found.`);
            return;
        }

        // Failsafe: Check container's internal structure using optional chaining and Array.isArray
        const filterArray = containerItem._props?.Grids?.[0]?._props?.filters?.[0]?.Filter;
        if (!Array.isArray(filterArray)) { // Check if it exists and is an array
            this.logger.warning(`[${this.modName}] Cannot modify ${containerName} (${containerId}): Expected filter array not found at '_props.Grids[0]._props.filters[0].Filter'.`);
            this.logger.debug(`[${this.modName}] Container ${containerId} structure dump: _props.Grids: ${JSON.stringify(containerItem._props?.Grids)}`);
            return;
        }

        // Add Item ID to Filter only if not already present
        if (!filterArray.includes(itemIdToAdd)) {
            filterArray.push(itemIdToAdd);
            this.logger.info(`[${this.modName}] Allowed ${itemName} (${itemIdToAdd}) to be placed in ${containerName}s (${containerId}).`);
        } else {
            this.logger.debug(`[${this.modName}] ${itemName} (${itemIdToAdd}) is already allowed in ${containerName}s (${containerId}).`);
        }
    }

    /**
     * Generic helper method to apply a stack size change to a specific item template,
     * including validation (type checking done in config loader) and clamping.
     * @param items Database item templates object.
     * @param itemId TPL ID of the item to modify.
     * @param configuredStackSize Stack size from validated config.
     * @param itemName User-friendly name for logging.
     * @param defaultStackSize Default value if clamping needed due to < min.
     * @param minStackSize Minimum allowed value.
     * @param maxStackSize Maximum allowed value.
     */
    private applyItemStackSize(items: Record<string, ITemplateItem>, itemId: string, configuredStackSize: number, itemName: string, defaultStackSize: number, minStackSize: number, maxStackSize: number): void
    {
        let finalStackSize = configuredStackSize; // Start with validated number from config

        // --- Clamping Logic ---
        // Check if value is below minimum
        if (finalStackSize < minStackSize) {
            this.logger.warning(`[${this.modName}] Configured stack size (${configuredStackSize}) for ${itemName} is below minimum (${minStackSize}). Resetting to default: ${defaultStackSize}.`);
            finalStackSize = defaultStackSize; // Use default if below minimum
        }
        // Check if value exceeds maximum
        else if (finalStackSize > maxStackSize) {
            this.logger.warning(`[${this.modName}] Configured stack size (${configuredStackSize}) for ${itemName} exceeds maximum (${maxStackSize}). Clamping to maximum: ${maxStackSize}.`);
            finalStackSize = maxStackSize; // Clamp to maximum
        }

        // Ensure integer value
        finalStackSize = Math.floor(finalStackSize);

        // --- Apply Change to Item Template ---
        const itemToModify = items[itemId];

        // Failsafe: Check existence of item and its properties
        if (!itemToModify?._props) { // Combined check using optional chaining
            this.logger.warning(`[${this.modName}] Item template or properties missing for ${itemName} (ID: ${itemId}). Cannot set stack size.`);
            return;
        }

        // Apply change only if the new value is different from the current one
        if (itemToModify._props.StackMaxSize !== finalStackSize) {
            itemToModify._props.StackMaxSize = finalStackSize;
            this.logger.info(`[${this.modName}] Set stack size for ${itemName} (ID: ${itemId}) to ${finalStackSize}.`);
        } else {
            this.logger.debug(`[${this.modName}] Stack size for ${itemName} (ID: ${itemId}) is already ${finalStackSize}. No change needed.`);
        }
    }

} // End of AdditionalSettingsMod class definition

// Export the mod instance for SPT loader
export const mod = new AdditionalSettingsMod();
