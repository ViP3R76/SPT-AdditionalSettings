/**
 * Lost On Death Module for AdditionalSettings Mod
 * File: src/module_lostondeath.ts
 * Author: ViP3R_76
 * Version: 1.0.2
 * License: MIT
 *
 * Modifies the server's LostOnDeath configuration to prevent loss of
 * equipped Armbands and/or Melee weapons upon death, based on settings
 * in the main configuration file ('config.jsonc').
 * This module is activated and configured by the main 'AdditionalSettings' mod.
 * It utilizes SPT's ConfigServer for safe and reliable modification of server settings,
 * ensuring better compatibility with other mods that might also adjust these values.
 */

// Required SPT interfaces and utilities
import type { ILogger } from "@spt/models/spt/utils/ILogger"; // Interface for logging messages
import type { ConfigServer } from "@spt/servers/ConfigServer"; // Interface for accessing server configurations
import { ConfigTypes } from "@spt/models/enums/ConfigTypes"; // Enum specifying config types for ConfigServer
import type { ILostOnDeathConfig } from "@spt/models/spt/config/ILostOnDeathConfig"; // Type definition for LostOnDeath config

// Import main configuration interface (needed to read settings relevant to this module)
import type { IAdditionalSettingsConfig } from "./module_configuration";

/**
 * Represents the Lost On Death Module, handling the logic to prevent specific gear loss on death.
 * This class is instantiated by the main mod if its corresponding features are potentially enabled.
 */
export class LostOnDeathModule {
    // SPT services and configuration references passed from the main mod
    private logger: ILogger;
    private config: IAdditionalSettingsConfig; // Stores a reference to the main mod's loaded config
    private debugEnabled: boolean; // Stores the debug logging state from the main mod's config

    // Consistent log prefix for messages originating from this module
    private readonly logPrefix: string = "[ASM LoD]"; // LoD for Lost on Death

    /**
     * Initializes the Lost On Death Module.
     * Stores references to the logger, main config, and debug state.
     * Throws an error if essential dependencies are missing.
     * @param logger Logger instance provided by the main mod.
     * @param config The loaded main configuration object from the main mod.
     * @param debugEnabled Whether debug logging is enabled (from the main config).
     */
    constructor(logger: ILogger, config: IAdditionalSettingsConfig, debugEnabled: boolean) {
        // Failsafe checks for essential dependencies passed from the main mod
        if (!logger) {
            // Cannot log failure here, throw error
            throw new Error(`${this.logPrefix} Critical Error: Logger not provided during initialization.`);
        }
        if (!config) {
            // Log error if possible, then throw
            logger.error(`${this.logPrefix} Critical Error: Main Config not provided during initialization.`);
            throw new Error(`${this.logPrefix} Critical Error: Main Config not provided.`);
        }

        this.logger = logger;
        this.config = config; // Store the reference to the main config
        this.debugEnabled = debugEnabled;

        // Log initialization only if debug is enabled
        if (this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} Initialized.`);
        }
    }

    /**
     * Applies the Lost On Death modifications using SPT's ConfigServer.
     * This method retrieves the current LostOnDeath configuration object and modifies
     * the `ArmBand` and `Scabbard` properties within the `equipment` section
     * based on the `SaveArmbandOnDeath` and `SaveMeleeOnDeath` settings
     * from the main configuration file. It only applies changes if the corresponding
     * setting is enabled AND the current value needs to be changed (from true to false).
     * Should be called during the postDBLoad phase or when ConfigServer is ready.
     * @param configServer The resolved ConfigServer instance, used to get/modify server configs.
     */
    public applyLostOnDeathChanges(configServer: ConfigServer): void {
        // Failsafe: Ensure ConfigServer is valid
        if (!configServer) {
             this.logger.error(`${this.logPrefix} Cannot apply changes: ConfigServer not provided.`);
             return;
        }

        // Retrieve the specific configuration object for LostOnDeath settings from ConfigServer
        // Using ConfigServer is preferred over directly modifying database tables for server settings.
        const lostOnDeathConfig = configServer.getConfig<ILostOnDeathConfig>(ConfigTypes.LOST_ON_DEATH);

        // Failsafe: Check if the config object was successfully retrieved and has the expected 'equipment' property
        // Use optional chaining (?.) for safer access to nested properties.
        if (!lostOnDeathConfig?.equipment) {
            this.logger.warning(`${this.logPrefix} Failed to retrieve valid LostOnDeath config or 'equipment' property missing via ConfigServer. Cannot apply SaveOnDeath settings.`);
            return; // Cannot proceed without the config structure
        }

        // Check if any relevant options are enabled in the main config. If not, skip modifications.
        if (!this.config.SaveArmbandOnDeath && !this.config.SaveMeleeOnDeath) {
            // Log skip message only if debug enabled
            if (this.debugEnabled) {
                this.logger.debug(`${this.logPrefix} SaveArmbandOnDeath and SaveMeleeOnDeath disabled in config. Skipping modifications.`);
            }
            return; // No changes needed
        }

        // Log intent to modify if relevant options are enabled
        this.logger.info(`${this.logPrefix} Applying SaveOnDeath modifications...`);

        let changedArmband = false; // Flag to track if ArmBand setting was actually changed
        let changedMelee = false; // Flag to track if Scabbard setting was actually changed

        // Handle Armbands Save on Death
        // Apply change only if:
        // 1. The feature is enabled in the main config (`this.config.SaveArmbandOnDeath`).
        // 2. The current value in the LostOnDeath config is `true` (meaning it *is* lost by default/currently).
        if (this.config.SaveArmbandOnDeath && lostOnDeathConfig.equipment.ArmBand === true) {
            // Modify the retrieved config object directly. SPT's ConfigServer holds this object in memory,
            // and changes made here will persist for the server session.
            lostOnDeathConfig.equipment.ArmBand = false; // Set to false (meaning NOT lost on death)
            changedArmband = true; // Mark that a change occurred
        }

        // Handle Melee Save on Death (which corresponds to the 'Scabbard' slot in the config)
        // Apply change only if enabled in config AND current value is true
        if (this.config.SaveMeleeOnDeath && lostOnDeathConfig.equipment.Scabbard === true) {
            lostOnDeathConfig.equipment.Scabbard = false; // Set to false (meaning NOT lost on death)
            changedMelee = true; // Mark that a change occurred
        }

        // --- Log Summary ---
        // Log informational messages for each setting that was successfully changed.
        if (changedArmband) {
            this.logger.info(`${this.logPrefix} Configured armbands (ArmBand slot) to be saved on death.`);
        }
        if (changedMelee) {
            this.logger.info(`${this.logPrefix} Configured melee weapons (Scabbard slot) to be saved on death.`);
        }

        // Log if relevant options were enabled but no changes were needed (e.g., already false)
        // This provides feedback that the setting was checked but didn't require action.
        // Only log these messages if debug logging is enabled to avoid console spam.
        if (!changedArmband && this.config.SaveArmbandOnDeath && this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} SaveArmbandOnDeath enabled, but ArmBand slot was already configured not to be lost.`);
        }
        if (!changedMelee && this.config.SaveMeleeOnDeath && this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} SaveMeleeOnDeath enabled, but Scabbard slot was already configured not to be lost.`);
        }
    }

    // No postSptLoad logic needed for this module currently
    // public runPostSptLogic(): void { ... }

} // End of LostOnDeathModule class