// --- START OF FILE src/module_core.ts ---

/**
 * Core Module for AdditionalSettings Mod
 * File: src/module_core.ts
 * Author: ViP3R_76
 * License: MIT
 *
 * Description:
 * Handles several core gameplay tweaks based on the main configuration file ('config.jsonc'):
 * - Lootability for Armbands and Melee weapons (respecting an internal blacklist).
 * - PMC Chat Response chance modification (using ConfigServer).
 * - Allowing Lega Medals to be placed in Money Cases.
 * - Adjusting the stack size of Lega Medals.
 * - Removing FIR status requirement for Hideout construction/upgrades.
 * - Disabling seasonal events (Christmas, Halloween etc.).
 * This module is instantiated and run by the main 'AdditionalSettings' mod during the postDBLoad phase.
 */

// Required SPT interfaces and utilities
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { DatabaseServer } from "@spt/servers/DatabaseServer";
import type { ConfigServer } from "@spt/servers/ConfigServer";
import type { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import type { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import type { IPmcChatResponse } from "@spt/models/spt/config/IPmcChatResponse";
import type { IHideoutArea, StageRequirement } from "@spt/models/eft/hideout/IHideoutArea";
import type { ISeasonalEventConfig } from "@spt/models/spt/config/ISeasonalEventConfig";

// Import main configuration interface
import type { IAdditionalSettingsConfig } from "./module_configuration";

/**
 * Represents the Core Module, handling essential gameplay tweaks defined in the main config.
 * This class is instantiated by the main mod.
 */
export class CoreModule {
    private logger: ILogger;
    private config: IAdditionalSettingsConfig; // Reference to the main mod's loaded config
    private debugEnabled: boolean; // State of debug logging from main config

    private readonly logPrefix: string = "[ASM Core]";

    // --- Constants for Item IDs and Parent IDs ---
    private static readonly ARMBAND_PARENT_ID: string = "5b3f15d486f77432d0509248";
    private static readonly MELEE_PARENT_ID: string = "5447e1d04bdc2dff2f8b4567";
    private static readonly MONEY_CASE_ID: string = "59fb016586f7746d0d4b423a";
    private static readonly LEGA_MEDAL_ID: string = "6656560053eaaa7a23349c86";

    // Constants for Lega Medal stack size validation
    private static readonly LEGA_DEFAULT_STACK: number = 50; // Default used if clamping needed
    private static readonly LEGA_MIN_STACK: number = 1;   // Minimum allowed stack size
    private static readonly LEGA_MAX_STACK: number = 999; // Maximum allowed stack size

    // --- Internal Blacklist for Lootability ---
    // Set of item TPL IDs that should *never* be made lootable by this mod,
    // regardless of config settings. Using a Set provides efficient lookups.
    private static readonly LOOTABILITY_BLACKLIST: ReadonlySet<string> = new Set([
        "65ca457b4aafb5d7fc0dcb5d" // United Cutlery M48 Tactical Kukri
        // Add other specific IDs here if needed in the future
    ]);

    /**
     * Initializes the Core Module.
     * @param logger Logger instance provided by the main mod.
     * @param config The loaded main configuration object from the main mod.
     * @param debugEnabled Whether debug logging is enabled.
     */
    constructor(logger: ILogger, config: IAdditionalSettingsConfig, debugEnabled: boolean) {
        // Failsafe checks for essential dependencies
        if (!logger) {
            throw new Error(`${this.logPrefix} Critical Error: Logger not provided during initialization.`);
        }
        if (!config) {
            logger.error(`${this.logPrefix} Critical Error: Main Config not provided during initialization.`);
            throw new Error(`${this.logPrefix} Critical Error: Main Config not provided.`);
        }

        this.logger = logger;
        this.config = config;
        this.debugEnabled = debugEnabled;

        if (this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} Initialized.`);
        }
    }

    /**
     * Executes all logic handled by this module during the postDBLoad phase.
     * Modifies item templates, hideout requirements, and server configurations.
     * @param databaseServer The resolved DatabaseServer instance.
     * @param configServer The resolved ConfigServer instance.
     */
    public runPostDbLogic(databaseServer: DatabaseServer, configServer: ConfigServer): void {
        this.logger.info(`${this.logPrefix} Applying core modifications...`);

        // --- Apply Item Template and Hideout Modifications (DatabaseServer required) ---
        if (!databaseServer) {
            this.logger.error(`${this.logPrefix} DatabaseServer unavailable. Skipping item/hideout modifications.`);
        } else {
            const tables = databaseServer.getTables();
            if (!tables) {
                this.logger.error(`${this.logPrefix} Database tables unavailable. Skipping item/hideout modifications.`);
            } else {
                // Apply Item modifications (Lootability, Container Filter, Stack Size)
                if (!tables.templates?.items) {
                    this.logger.error(`${this.logPrefix} Items table not found. Skipping item modifications.`);
                } else {
                    const items = tables.templates.items;
                    this.applyLootabilitySettings(items);
                    this.applyContainerSettings(items);
                    this.applyItemStackSizeSettings(items);
                }

                // Apply Hideout modifications (Remove FIR)
                if (!tables.hideout?.areas) {
                    this.logger.error(`${this.logPrefix} Hideout areas table not found. Skipping FIR modification.`);
                } else {
                    this.applyHideoutSettings(tables.hideout.areas);
                }
            }
        } // End DatabaseServer check

        // --- Apply Server Configuration Modifications (ConfigServer required) ---
        if (!configServer) {
            this.logger.error(`${this.logPrefix} ConfigServer unavailable. Skipping server config modifications.`);
        } else {
            // Apply PMC Chat Response settings
            this.applyPmcChatSettings(configServer);
            // Apply Seasonal Event settings
            this.applySeasonalEventSettings(configServer);
        } // End ConfigServer check

        this.logger.info(`${this.logPrefix} Core modifications applied.`);
    }

    // ===========================================================================================
    // === Private Helper Methods for Applying Settings ===
    // ===========================================================================================

    /**
     * Iterates through item templates and applies lootability changes based on config/blacklist.
     * Sets `_props.Unlootable` to `false` for configured item types if not blacklisted.
     * @param items The database item templates object (`tables.templates.items`).
     */
    private applyLootabilitySettings(items: Record<string, ITemplateItem>): void {
        let armbandsMadeLootable = 0;
        let meleeMadeLootable = 0;

        for (const [itemId, item] of Object.entries(items)) {
            // Basic checks for required properties
            if (!item?._props || !item._parent) continue;

            // Check blacklist efficiently
            const isBlacklisted = CoreModule.LOOTABILITY_BLACKLIST.has(itemId);

            // Process Armbands
            if (item._parent === CoreModule.ARMBAND_PARENT_ID && item._props.Unlootable) {
                // Apply if enabled in config AND not blacklisted
                if (this.config.LootArmbands && !isBlacklisted) {
                    item._props.Unlootable = false;
                    item._props.UnlootableFromSide = []; // Also clear side restriction
                    armbandsMadeLootable++;
                } else if (this.config.LootArmbands && isBlacklisted && this.debugEnabled) {
                    this.logger.debug(`${this.logPrefix} Skipped armband ${itemId} (${item._name || 'N/A'}) due to blacklist.`);
                }
            }

            // Process Melee Weapons
            if (item._parent === CoreModule.MELEE_PARENT_ID && item._props.Unlootable) {
                // Apply if enabled in config AND not blacklisted
                if (this.config.LootMelee && !isBlacklisted) {
                    item._props.Unlootable = false;
                    item._props.UnlootableFromSide = []; // Also clear side restriction
                    meleeMadeLootable++;
                } else if (this.config.LootMelee && isBlacklisted && this.debugEnabled) {
                    this.logger.debug(`${this.logPrefix} Skipped melee ${itemId} (${item._name || 'N/A'}) due to blacklist.`);
                }
            }
        }

        // Log summary results only if changes were made for enabled features
        if (this.config.LootArmbands && armbandsMadeLootable > 0) {
            this.logger.info(`${this.logPrefix} Made ${armbandsMadeLootable} armband types lootable.`);
        }
        if (this.config.LootMelee && meleeMadeLootable > 0) {
            this.logger.info(`${this.logPrefix} Made ${meleeMadeLootable} melee weapon types lootable.`);
        }
    }

    /**
     * Disables or sets a specific percentage for PMC chat responses using ConfigServer.
     * @param configServer The resolved ConfigServer instance.
     */
    private applyPmcChatSettings(configServer: ConfigServer): void {
        const settingValue = this.config.disablePMC_ChatResponse;

        // If false (default behavior), do nothing
        if (settingValue === false) {
            if (this.debugEnabled) {
                this.logger.debug(`${this.logPrefix} PMC chat responses using SPT defaults (config is false).`);
            }
            return;
        }

        // Retrieve the config object via ConfigServer
        const pmcChatResponseConfig = configServer.getConfig<IPmcChatResponse>(ConfigTypes.PMC_CHAT_RESPONSE);

        // Failsafe check for config object structure
        if (!pmcChatResponseConfig?.killer || pmcChatResponseConfig.killer.responseChancePercent === undefined ||
            !pmcChatResponseConfig.victim || pmcChatResponseConfig.victim.responseChancePercent === undefined) {
            this.logger.warning(`${this.logPrefix} PmcChatResponse config structure invalid or missing. Cannot apply PMC Chat settings.`);
            return;
        }

        // Determine the target percentage (config value validated by loader)
        const targetPercent: number = (settingValue === true) ? 0 : settingValue as number;

        let changeMade = false;

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
            const logMessage = (targetPercent === 0)
                ? `Disabled PMC killer and victim chat responses (0% chance).`
                : `Set PMC killer and victim chat response chance to ${targetPercent}%.`;
            this.logger.info(`${this.logPrefix} ${logMessage}`);
        } else if (this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} PMC chat response chance already ${targetPercent}%. No change needed.`);
        }
    }

    /**
     * Applies container modification settings (currently, Lega Medals in Money Cases).
     * @param items The database item templates object (`tables.templates.items`).
     */
    private applyContainerSettings(items: Record<string, ITemplateItem>): void {
        // Check if feature is enabled
        if (this.config.allow_LegaMoneyCase) {
            // Call the reusable helper method
            this.allowItemInContainer(
                items,
                CoreModule.MONEY_CASE_ID,
                CoreModule.LEGA_MEDAL_ID,
                "Money Case", // Friendly name for logging
                "Lega Medal" // Friendly name for logging
            );
        } else if (this.debugEnabled) {
             this.logger.debug(`${this.logPrefix} Allow Lega Medals in Money Case disabled.`);
        }
    }

    /**
     * Applies item stack size changes based on config (currently, Lega Medals).
     * @param items The database item templates object (`tables.templates.items`).
     */
    private applyItemStackSizeSettings(items: Record<string, ITemplateItem>): void {
        // Config value already validated by loader
        this.applyItemStackSize(
            items,
            CoreModule.LEGA_MEDAL_ID,
            this.config.stacksize_lega,
            "Lega Medal", // Friendly name for logging
            CoreModule.LEGA_DEFAULT_STACK,
            CoreModule.LEGA_MIN_STACK,
            CoreModule.LEGA_MAX_STACK
        );
    }

    /**
     * Helper method to add an item's TPL ID to a container's allowed item filter list.
     * Includes safety checks and avoids duplicates.
     * @param items Database item templates object.
     * @param containerId TPL ID of the container.
     * @param itemIdToAdd TPL ID of the item to add.
     * @param containerName Friendly name for logging.
     * @param itemName Friendly name for logging.
     */
    private allowItemInContainer(items: Record<string, ITemplateItem>, containerId: string, itemIdToAdd: string, containerName: string, itemName: string): void {
        const containerItem = items[containerId];

        // Failsafe checks for item existence
        if (!containerItem) { this.logger.warning(`${this.logPrefix} Cannot modify ${containerName} (${containerId}): Template not found.`); return; }
        if (!items[itemIdToAdd]) { this.logger.warning(`${this.logPrefix} Cannot allow ${itemName} (${itemIdToAdd}): Template not found.`); return; }

        // Access the filter array safely using optional chaining, assuming standard grid structure
        const filterArray = containerItem._props?.Grids?.[0]?._props?.filters?.[0]?.Filter;
        if (!Array.isArray(filterArray)) {
            this.logger.warning(`${this.logPrefix} Cannot modify ${containerName} (${containerId}): Filter array not found or invalid.`);
            if (this.debugEnabled) {
                this.logger.debug(`${this.logPrefix} ${containerId} Grids structure: ${JSON.stringify(containerItem._props?.Grids)}`);
            }
            return;
        }

        // Add Item ID to Filter only if not already present
        if (!filterArray.includes(itemIdToAdd)) {
            filterArray.push(itemIdToAdd);
            this.logger.info(`${this.logPrefix} Allowed ${itemName} (${itemIdToAdd}) in ${containerName}s.`);
        } else if (this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} ${itemName} (${itemIdToAdd}) already allowed in ${containerName}s.`);
        }
    }

    /**
     * Generic helper method to apply a stack size change to a specific item template,
     * including validation and clamping.
     * @param items Database item templates object.
     * @param itemId TPL ID of the item to modify.
     * @param configuredStackSize Stack size from validated config.
     * @param itemName User-friendly name for logging.
     * @param defaultStackSize Default value if clamping needed.
     * @param minStackSize Minimum allowed value.
     * @param maxStackSize Maximum allowed value.
     */
    private applyItemStackSize(items: Record<string, ITemplateItem>, itemId: string, configuredStackSize: number, itemName: string, defaultStackSize: number, minStackSize: number, maxStackSize: number): void {
        let finalStackSize = configuredStackSize; // Start with validated number

        // --- Clamping Logic ---
        if (finalStackSize < minStackSize) {
            this.logger.warning(`${this.logPrefix} Stack size ${configuredStackSize} for ${itemName} below min ${minStackSize}. Resetting to default ${defaultStackSize}.`);
            finalStackSize = defaultStackSize;
        } else if (finalStackSize > maxStackSize) {
            this.logger.warning(`${this.logPrefix} Stack size ${configuredStackSize} for ${itemName} exceeds max ${maxStackSize}. Clamping to max.`);
            finalStackSize = maxStackSize;
        }
        // Ensure integer value
        finalStackSize = Math.floor(finalStackSize);

        // --- Apply Change to Item Template ---
        const itemToModify = items[itemId];
        if (!itemToModify?._props) {
            this.logger.warning(`${this.logPrefix} Item template or props missing for ${itemName} (${itemId}). Cannot set stack size.`);
            return;
        }

        // Apply change only if the new value is different from the current one
        if (itemToModify._props.StackMaxSize !== finalStackSize) {
            itemToModify._props.StackMaxSize = finalStackSize;
            this.logger.info(`${this.logPrefix} Set stack size for ${itemName} (${itemId}) to ${finalStackSize}.`);
        } else if (this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} Stack size for ${itemName} (${itemId}) already ${finalStackSize}.`);
        }
    }

    /**
     * Removes the "Found in Raid" (FIR) requirement for hideout area stage requirements if configured.
     * Iterates through hideout areas/stages, setting `isSpawnedInSession` to `false`.
     * @param hideoutAreas The `tables.hideout.areas` object from the database.
     */
    private applyHideoutSettings(hideoutAreas: Record<string, IHideoutArea>): void {
        // Check if feature is enabled
        if (!this.config.removeFirForHideout) {
            if (this.debugEnabled) {
                this.logger.debug(`${this.logPrefix} Remove FIR for Hideout disabled.`);
            }
            return;
        }

        this.logger.info(`${this.logPrefix} Applying Remove FIR for Hideout modifications...`);
        let modifiedCount = 0; // Counter for logging

        // Iterate through each hideout area definition
        for (const areaId in hideoutAreas) {
            const areaData = hideoutAreas[areaId];
            // Failsafe check for area data and stages array
            if (!areaData?.stages || typeof areaData.stages !== 'object') continue;

            // Iterate through each upgrade stage (level) of the current area
            for (const stageId in areaData.stages) {
                const stage = areaData.stages[stageId];
                // Failsafe check for stage requirements array
                if (!stage?.requirements || !Array.isArray(stage.requirements)) continue;

                // Iterate through each requirement for the current stage
                for (const requirement of stage.requirements) {
                    // Failsafe: Check if requirement object is valid
                    if (!requirement) continue;

                    // Check if the requirement has the 'isSpawnedInSession' property (indicating FIR)
                    if (Object.prototype.hasOwnProperty.call(requirement, "isSpawnedInSession")) {
                        // Check if the property needs changing (optimization)
                        if (requirement.isSpawnedInSession === true) {
                            requirement.isSpawnedInSession = false; // Set FIR requirement to false
                            modifiedCount++;
                            if (this.debugEnabled) {
                                // Try to get requirement type for better logging
                                const reqType = (requirement as StageRequirement).type ?? 'Unknown';
                                this.logger.debug(`${this.logPrefix} Removed FIR req for Area ${areaId}, Stage ${stageId}, ReqType: ${reqType}`);
                            }
                        }
                    }
                } // End requirement loop
            } // End stage loop
        } // End area loop

        // Log summary
        if (modifiedCount > 0) {
            this.logger.info(`${this.logPrefix} Removed FIR requirement from ${modifiedCount} hideout stage requirements.`);
        } else {
            this.logger.info(`${this.logPrefix} Remove FIR for Hideout enabled, but no requirements needed modification.`);
        }
    }

    /**
     * Disables seasonal events (Christmas, Halloween, etc.) if configured using ConfigServer.
     * @param configServer The resolved ConfigServer instance.
     */
    private applySeasonalEventSettings(configServer: ConfigServer): void {
        // Check if feature is enabled
        if (!this.config.disableSeasonEvents) {
            if (this.debugEnabled) {
                this.logger.debug(`${this.logPrefix} Seasonal Event disabling skipped.`);
            }
            return;
        }

        // Retrieve the config object via ConfigServer
        const seasonalEventConfig = configServer.getConfig<ISeasonalEventConfig>(ConfigTypes.SEASONAL_EVENT);
        if (!seasonalEventConfig) {
            this.logger.warning(`${this.logPrefix} Failed to retrieve SeasonalEvent config. Cannot disable events.`);
            return;
        }

        let detectionChanged = false; // Track if the main detection flag was changed
        let eventsChanged = 0; // Count how many specific events were disabled

        // Disable the automatic event detection based on system date
        if (seasonalEventConfig.enableSeasonalEventDetection === true) {
            seasonalEventConfig.enableSeasonalEventDetection = false;
            detectionChanged = true;
        }

        // Additionally, explicitly disable all listed events as a failsafe
        if (seasonalEventConfig.events && Array.isArray(seasonalEventConfig.events)) {
            for (const event of seasonalEventConfig.events) {
                // Check if event needs disabling (optimization)
                if (event && event.enabled === true) {
                    event.enabled = false;
                    eventsChanged++;
                }
            }
        } else if (this.debugEnabled) {
             this.logger.debug(`${this.logPrefix} SeasonalEvent config 'events' array missing or invalid.`);
        }

        // Log the outcome based on what changes were made
        if (detectionChanged || eventsChanged > 0) {
            let logMessage = `${this.logPrefix} Disabled seasonal events:`;
            if (detectionChanged) logMessage += " Detection flag set to false.";
            if (eventsChanged > 0) logMessage += ` Explicitly disabled ${eventsChanged} event entries.`;
            this.logger.info(logMessage);
        } else if (this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} Seasonal events already disabled.`);
        }
    }

} // End of CoreModule class
// --- END OF FILE src/module_core.ts ---