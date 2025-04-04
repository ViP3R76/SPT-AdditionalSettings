// --- START OF FILE src/module_weapon.ts ---

/**
 * Weapon Module for AdditionalSettings Mod
 * File: src/module_weapon.ts
 * Author: ViP3R_76
 * License: MIT
 *
 * Description:
 * Handles weapon-related tweaks based on settings in 'config.jsonc'.
 * Currently includes an option to adjust the 'ExtraSize' properties of specific
 * magazines and mounts to potentially reduce their perceived size in thumbnail views.
 *
 * IMPORTANT NOTE for 'weapon_inv_shrink' setting in config.jsonc:
 * Changes to ExtraSize properties might not reflect visually in the client's item
 * thumbnails. Cache-/Temp-Files need to be deleted in SPT-Launcher if using this setting!
 * This ensures the visual changes take effect in stash/inventory views. This does not affect
 * the actual grid size of the item.
 *
 * Activated and configured by the main 'AdditionalSettings' mod ('mod.ts').
 * Requires DatabaseServer (passed to `applyWeaponChanges`) during postDBLoad.
 */

// Required SPT interfaces and utilities
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { DatabaseServer } from "@spt/servers/DatabaseServer";
import type { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import type { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { BaseClasses } from "@spt/models/enums/BaseClasses"; // Enum for base item classes

// Main configuration interface
import type { IAdditionalSettingsConfig } from "./module_configuration";

/**
 * Handles weapon-related modifications based on configuration.
 * Instantiated by the main mod if 'use_weapon_module' is enabled.
 */
export class WeaponModule {
    private logger: ILogger;
    private config: IAdditionalSettingsConfig;
    private debugEnabled: boolean;

    private readonly logPrefix: string = "[ASM Weapon]";

    // Specific Item IDs targeted by the weapon_inv_shrink feature.
    // Modifying ExtraSizeDown/Up can visually shrink the item's thumbnail in inventory,
    // BUT requires clearing client-side cache files (via SPT-Launcher) to see the effect.
    // It does NOT change the actual grid size the item occupies.
    private static readonly MAGAZINE_IDS_TO_SHRINK: Record<string, number> = {
        "6513f0a194c72326990a3868": 0, // 5.56x45 SureFire MAG5-60 60-round magazine -> ExtraSizeDown = 0
        "646372518610c40fc20204e8": 1  // 5.45x39 AK-12 6L31 30-round magazine (Plum) -> ExtraSizeDown = 1
    };
    private static readonly MOUNT_IDS_TO_SHRINK: Record<string, number> = {
        "5a37ca54c4a282000d72296a": 0, // LaRue Tactical LT-101 QD Riser Mount -> ExtraSizeUp = 0
        "5aa66c72e5b5b00016327c93": 0, // Geissele Super Precision 30mm scope mount -> ExtraSizeUp = 0
        "61713cc4d8e3106d9806c109": 0, // Recknagel Era-Tac 34mm ring scope mount -> ExtraSizeUp = 0
        "6171407e50224f204c1da3c5": 0  // Recknagel Era-Tac 30mm ring scope mount -> ExtraSizeUp = 0
    };

    /**
     * Initializes the Weapon Module. Stores references from the main mod.
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
     * Applies weapon-related modifications based on configuration.
     * Should be called during postDBLoad.
     * @param databaseServer The DatabaseServer instance (needed for accessing items).
     */
    public applyWeaponChanges(databaseServer: DatabaseServer): void {
        // Check if the specific shrink feature is enabled in config
        if (this.config.weapon_inv_shrink) {
            this.applyInventoryShrink(databaseServer);
        } else if (this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} Weapon inventory shrink feature disabled in config.`);
        }
        // Future: Add calls to other weapon-related features here if implemented
    }

    /**
     * Applies the 'weapon_inv_shrink' changes to specific item templates.
     * Modifies ExtraSizeUp/Down properties.
     * @param databaseServer The DatabaseServer instance.
     */
    private applyInventoryShrink(databaseServer: DatabaseServer): void {
        this.logger.info(`${this.logPrefix} Applying weapon inventory shrink modifications...`);
        // Removed the warning log about clearing cache as requested. The note remains in the header.

        const tables = databaseServer.getTables();
        if (!tables?.templates?.items) {
            this.logger.error(`${this.logPrefix} Items table not found. Cannot apply weapon shrink changes.`);
            return;
        }
        const dbItems = tables.templates.items;
        let modifiedCount = 0;

        // Iterate through all item templates in the database
        for (const itemId in dbItems) {
            const item = dbItems[itemId];
            // Ensure item and properties exist, and it has a parent type
            if (!item?._props || !item._parent) {
                continue;
            }

            const itemProps = item._props; // Shortcut for property access

            // Check if the item is a Magazine and is in our target list
            if (item._parent === BaseClasses.MAGAZINE && WeaponModule.MAGAZINE_IDS_TO_SHRINK[itemId] !== undefined) {
                const targetValue = WeaponModule.MAGAZINE_IDS_TO_SHRINK[itemId];
                // Only modify if the current value is different from the target
                if (itemProps.ExtraSizeDown !== targetValue) {
                    if (this.debugEnabled) {
                        this.logger.debug(`${this.logPrefix} Modifying Magazine ${itemId} (${item._name || 'N/A'}): ExtraSizeDown ${itemProps.ExtraSizeDown} -> ${targetValue}`);
                    }
                    itemProps.ExtraSizeDown = targetValue;
                    modifiedCount++;
                }
            }

            // Check if the item is a Mount and is in our target list
            if (item._parent === BaseClasses.MOUNT && WeaponModule.MOUNT_IDS_TO_SHRINK[itemId] !== undefined) {
                const targetValue = WeaponModule.MOUNT_IDS_TO_SHRINK[itemId];
                // Only modify if the current value is different from the target
                 if (itemProps.ExtraSizeUp !== targetValue) {
                    if (this.debugEnabled) {
                        this.logger.debug(`${this.logPrefix} Modifying Mount ${itemId} (${item._name || 'N/A'}): ExtraSizeUp ${itemProps.ExtraSizeUp} -> ${targetValue}`);
                    }
                    itemProps.ExtraSizeUp = targetValue;
                    modifiedCount++;
                }
            }
        } // End of item loop

        // Log summary of changes
        if (modifiedCount > 0) {
            this.logger.info(`${this.logPrefix} Applied inventory shrink modifications to ${modifiedCount} items.`);
        } else if (this.debugEnabled){
            // Log if the feature was enabled but no items matched or needed changes
            this.logger.debug(`${this.logPrefix} No items required inventory shrink modification.`);
        }
    }

}
// --- END OF FILE src/module_weapon.ts ---