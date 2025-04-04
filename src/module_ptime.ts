// --- START OF FILE src/module_ptime.ts ---

/**
 * Plant Time Module for AdditionalSettings Mod
 * File: src/module_ptime.ts
 * Author: ViP3R_76
 * License: MIT
 *
 * Description:
 * Modifies the 'plantTime' for specific quest conditions ('LeaveItemAtLocation', 'PlaceBeacon')
 * based on multipliers defined in the main 'config.jsonc' file.
 * This module is activated and configured by the main 'AdditionalSettings' mod.
 * It directly accesses the quest database during the postDBLoad phase to apply changes.
 */

// Required SPT interfaces and utilities
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { DatabaseServer } from "@spt/servers/DatabaseServer";
import type { IDatabaseTables } from "@spt/models/spt/server/IDatabaseTables";
import type { IQuest, QuestCondition } from "@spt/models/eft/common/tables/IQuest";

// Main configuration interface
import type { IAdditionalSettingsConfig } from "./module_configuration";

/**
 * Represents the Plant Time Module, handling the logic to modify quest interaction times.
 * Instantiated by the main mod if 'use_plant_time_module' is enabled.
 */
export class PlantTimeModule {
    private logger: ILogger;
    private config: IAdditionalSettingsConfig; // Reference to the main mod's loaded config
    private debugEnabled: boolean; // State of debug logging from main config

    private readonly logPrefix: string = "[ASM PTime]";

    /**
     * Initializes the Plant Time Module.
     * @param logger Logger instance provided by the main mod.
     * @param config The loaded main configuration object from the main mod.
     * @param debugEnabled Whether debug logging is enabled.
     */
    constructor(logger: ILogger, config: IAdditionalSettingsConfig, debugEnabled: boolean) {
        // Failsafe checks for essential dependencies
        if (!logger) {
            throw new Error(`${this.logPrefix} Critical Error: Logger not provided.`);
        }
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
     * Applies the plant time modifications to the quest database.
     * Iterates through quests and conditions, applying configured multipliers.
     * Ensures the resulting time is at least 1 second.
     * Should be called during postDBLoad *only if* the module is enabled.
     * @param databaseServer The resolved DatabaseServer instance.
     */
    public applyPlantTimeChanges(databaseServer: DatabaseServer): void {
        // Failsafe checks
        if (!this.logger) { console.error("Logger missing in PlantTimeModule.applyPlantTimeChanges"); return; }
        if (!databaseServer) { this.logger.error(`${this.logPrefix} Cannot apply changes: DatabaseServer not provided.`); return; }

        // Get modifiers from the validated main config
        const leaveModifier = this.config.leaveItemAtLocationModifier;
        const beaconModifier = this.config.placeBeaconModifier;

        // Optimization: Skip if both modifiers are default (1.0)
        if (leaveModifier === 1.0 && beaconModifier === 1.0) {
            if (this.debugEnabled) {
                this.logger.debug(`${this.logPrefix} Plant time modifiers are default (1.0). Skipping modifications.`);
            }
            return;
        }

        this.logger.info(`${this.logPrefix} Applying plant time modifications (LeaveItem: ${leaveModifier.toFixed(2)}x, PlaceBeacon: ${beaconModifier.toFixed(2)}x)...`);

        // Get quest data
        const tables: IDatabaseTables | undefined = databaseServer.getTables();
        if (!tables?.templates?.quests) {
            this.logger.error(`${this.logPrefix} Quests table not found. Cannot apply plant time changes.`);
            return;
        }
        // Cast is sometimes necessary depending on exact SPT type definitions
        const quests = tables.templates.quests as Record<string, IQuest>;

        let modifiedCount = 0; // Counter for logging

        // Iterate through all quests
        for (const questId in quests) {
            const currentQuest = quests[questId];

            // Check if the quest has 'AvailableForFinish' conditions and it's an array
            if (!currentQuest?.conditions?.AvailableForFinish || !Array.isArray(currentQuest.conditions.AvailableForFinish)) {
                continue; // Skip quests without relevant conditions
            }

            // Iterate through 'AvailableForFinish' conditions for the current quest
            currentQuest.conditions.AvailableForFinish.forEach((condition: QuestCondition, index: number) => {
                // Check if the condition has a valid 'plantTime' property
                if (!condition || typeof condition.plantTime !== 'number' || !Number.isFinite(condition.plantTime)) {
                    if (this.debugEnabled && condition) {
                         this.logger.debug(`${this.logPrefix} Quest ${questId}: Skipping condition index ${index} due to missing/invalid plantTime.`);
                    }
                    return; // Skip invalid conditions
                }

                const originalTime = condition.plantTime;
                let newTime = originalTime;
                let modifier = 1.0;
                let modified = false;

                // Apply modifier based on the condition type
                switch (condition.conditionType) {
                    case "LeaveItemAtLocation":
                        if (leaveModifier !== 1.0) {
                            modifier = leaveModifier;
                            // Calculate new time, ensure >= 1s, round to nearest integer
                            newTime = Math.max(1, Math.round(originalTime * modifier));
                            modified = true;
                        }
                        break;
                    case "PlaceBeacon":
                        if (beaconModifier !== 1.0) {
                            modifier = beaconModifier;
                            newTime = Math.max(1, Math.round(originalTime * modifier));
                            modified = true;
                        }
                        break;
                    // No action for other condition types
                    default:
                        break;
                }

                // If the calculated time is different, update the condition object
                if (modified && newTime !== originalTime) {
                    condition.plantTime = newTime; // Directly modify the object in the array
                    modifiedCount++;
                    if (this.debugEnabled) {
                        const questName = currentQuest.QuestName || 'N/A';
                        const conditionId = condition._props?.id || `Index ${index}`;
                        this.logger.debug(`${this.logPrefix} Quest ${questId} (${questName}): Condition ${conditionId} (${condition.conditionType}) plantTime ${originalTime}s -> ${newTime}s (${modifier.toFixed(2)}x)`);
                    }
                }
            }); // End condition loop
        } // End quest loop

        // Log summary
        if (modifiedCount > 0) {
            this.logger.info(`${this.logPrefix} Modified plant time for ${modifiedCount} quest conditions.`);
        } else if (leaveModifier !== 1.0 || beaconModifier !== 1.0) {
            // Log if enabled but nothing was changed
            this.logger.info(`${this.logPrefix} Plant time modifiers non-default, but no conditions needed modification.`);
        }
    }

} // End of PlantTimeModule class
// --- END OF FILE src/module_ptime.ts ---