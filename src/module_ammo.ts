// --- START OF FILE src/module_ammo.ts ---

/**
 * Ammo Weight Module for AdditionalSettings Mod
 * File: src/module_ammo.ts
 * Author: ViP3R_76
 * License: MIT
 *
 * Description:
 * Modifies ammo, ammo box, and grenade weights based on the main configuration ('config.jsonc').
 * Activated and configured by the main 'AdditionalSettings' mod ('mod.ts').
 * Requires DatabaseServer (passed to `applyAllChanges`) during postDBLoad.
 * Note: Ammo stat display feature was removed in v1.0.4.
 */

// Required SPT interfaces and utilities
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { DatabaseServer } from "@spt/servers/DatabaseServer";
import type { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import type { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";

// Main configuration interface
import type { IAdditionalSettingsConfig } from "./module_configuration";

/**
 * Handles ammo weight modifications based on configuration.
 * Instantiated by the main mod if 'use_ammo_module' is enabled.
 */
export class AmmoModule {
    private logger: ILogger;
    private config: IAdditionalSettingsConfig;
    private debugEnabled: boolean;

    private readonly logPrefix: string = "[ASM Ammo]";

    // EFT Item Parent IDs used to identify relevant item types
    private static readonly AMMO_PARENT_ID: string = "5485a8684bdc2da71d8b4567"; // Base type: Ammo
    private static readonly GRENADE_PARENT_ID: string = "543be6564bdc2df4348b4568"; // Base type: ThrowWeap
    private static readonly AMMOBOX_PARENT_ID: string = "543be5cb4bdc2deb348b4568"; // Base type: AmmoBox

    /**
     * Initializes the Ammo Module. Stores references from the main mod.
     * @param logger Logger instance.
     * @param config Main configuration object.
     * @param debugEnabled Debug logging state.
     */
    constructor(logger: ILogger, config: IAdditionalSettingsConfig, debugEnabled: boolean) {
        // Validate dependencies provided by the main mod
        if (!logger) throw new Error(`${this.logPrefix} Critical Error: Logger not provided.`);
        if (!config) {
            logger.error(`${this.logPrefix} Critical Error: Main Config not provided.`);
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
     * Applies weight modifications based on configuration.
     * Should be called during postDBLoad.
     * @param databaseServer The DatabaseServer instance (needed for accessing items).
     */
    public applyAllChanges(databaseServer: DatabaseServer): void {
        const startTime = process.hrtime.bigint(); // For performance measurement
        let weightChangesApplied = false;

        // Apply Weight Changes if any relevant config option is enabled
        if (this.config.weightless_ammo || this.config.weightless_ammoboxes || this.config.weightless_grenades) {
            this.applyAmmoWeightChanges(databaseServer);
            weightChangesApplied = true;
        } else if (this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} Weight modifications disabled in config.`);
        }

        // Log Execution Time if changes were made or debug is on
        const endTime = process.hrtime.bigint();
        const executionTimeMs = Number(endTime - startTime) / 1_000_000;
        const executionTimeSec = (executionTimeMs / 1000).toFixed(3);

        if (weightChangesApplied) {
            this.logger.info(`${this.logPrefix} Finished applying ammo weight modifications. Time: ${executionTimeSec}s`);
        } else if (this.debugEnabled) {
             this.logger.debug(`${this.logPrefix} No ammo weight modifications enabled or applied. Time: ${executionTimeSec}s`);
        }
    }

    // ===========================================================================================
    // === Private Modification Methods ===
    // ===========================================================================================

    /**
     * Iterates through item templates and sets the weight of specified item types to zero based on config.
     * @param databaseServer The DatabaseServer instance.
     */
    private applyAmmoWeightChanges(databaseServer: DatabaseServer): void {
        this.logger.info(`${this.logPrefix} Applying weight modifications...`);
        const tables = databaseServer.getTables();
        if (!tables?.templates?.items) {
            this.logger.error(`${this.logPrefix} Items table not found. Cannot apply weight changes.`);
            return;
        }
        const items = tables.templates.items;

        let ammoModified = 0, boxModified = 0, grenadeModified = 0;

        // Iterate through all items in the database templates
        for (const itemId in items) {
            const item = items[itemId];
            // Basic checks: ensure item has props, a parent, and a numeric weight > 0
            if (!item?._props || !item._parent || typeof item._props.Weight !== 'number' || item._props.Weight === 0) {
                continue;
            }

            let modified = false;
            // Check parent ID against configured flags and update weight if necessary
            if (this.config.weightless_ammo && item._parent === AmmoModule.AMMO_PARENT_ID) {
                item._props.Weight = 0; ammoModified++; modified = true;
            } else if (this.config.weightless_ammoboxes && item._parent === AmmoModule.AMMOBOX_PARENT_ID) {
                item._props.Weight = 0; boxModified++; modified = true;
            } else if (this.config.weightless_grenades && item._parent === AmmoModule.GRENADE_PARENT_ID) {
                item._props.Weight = 0; grenadeModified++; modified = true;
            }

            // Log specific item modification only if debugging is enabled
            if (modified && this.debugEnabled) {
                this.logger.debug(`${this.logPrefix} Set weight of ${itemId} (${item._name || 'N/A'}) to 0.`);
            }
        }

        // Build a summary log message listing counts of modified item types
        const logParts = [
            ammoModified > 0 ? `Ammo (${ammoModified})` : null,
            boxModified > 0 ? `Ammoboxes (${boxModified})` : null,
            grenadeModified > 0 ? `Grenades (${grenadeModified})` : null
        ].filter(Boolean); // Remove null entries (where count was 0)

        if (logParts.length > 0) {
            this.logger.info(`${this.logPrefix} Modified weight for: ${logParts.join(', ')}.`);
        } else if (this.debugEnabled) {
            // Log only if debug enabled and nothing was modified
            this.logger.debug(`${this.logPrefix} No items needed weight modification based on config.`);
        }
    }

}
// --- END OF FILE src/module_ammo.ts ---