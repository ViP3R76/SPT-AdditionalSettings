// --- START OF FILE mod.ts ---

/**
 * Additional Settings Mod for SPT ~3.11+ (Using Node FS & ConfigServer)
 * File: src/mod.ts
 * Author: ViP3R_76
 * Version: 1.0.5
 * License: MIT
 *
 * Description:
 * This is the main entry point for the Additional Settings mod. It serves as the orchestrator,
 * loading the main configuration, initializing various optional sub-modules based on that config,
 * and applying a few core tweaks directly. It leverages SPT's dependency injection and
 * mod loading lifecycle hooks (preSptLoad, postDBLoad, postSptLoad) to ensure modifications
 * are applied at appropriate times during server startup. The configuration loader (`module_configuration.ts`)
 * ensures default config files (including for modules) are created on first run, sourcing default content
 * with comments from `module_headers.ts`.
 *
 * Features (as of v1.0.5):
 * - Core Gameplay Tweaks (Handled by CoreModule):
 *   - Lootable Armbands & Melee (with blacklist).
 *   - PMC Chat Response Control.
 *   - Allow Lega Medals in Money Case.
 *   - Configurable Lega Medal Stack Size.
 *   - Remove FIR requirement for Hideout construction/upgrades.
 *   - Disable seasonal events (Christmas, Halloween etc.).
 * - Save Gear on Death Settings (Handled by LostOnDeathModule):
 *   - Prevent loss of Armbands.
 *   - Prevent loss of Melee Weapons.
 * - Optional Weather Module: Randomizes in-game season based on configured modes/weights/exclusions.
 *   - Includes compatibility hooks for FIKA (ServerMod), defaulting to hook raid creation.
 * - Optional Plant Time Module: Adjusts quest planting/placement times based on configured multipliers.
 * - Optional Ammo Module: Makes ammo/grenades/boxes weightless based on config.
 * - Optional Weapon Module: Modifies specific weapon attachment properties (e.g., ExtraSize for thumbnail shrink).
 * - Debug Logging: Global option to enable detailed console logs for troubleshooting all parts of the mod.
 * - Modular Design: Separates distinct functionalities into their own files/classes for better organization.
 * - Robust Configuration: Auto-creates default configs with comments (sourced from module_headers.ts), validates settings,
 *   handles basic syntax errors, and optionally auto-updates config files while preserving default comments/structure.
 */

// Required SPT interfaces and utilities
import { DependencyContainer } from "tsyringe";
import { IPreSptLoadMod } from "@spt/models/external/IPreSptLoadMod";
import { IPostDBLoadMod } from "@spt/models/external/IPostDBLoadMod";
import { IPostSptLoadMod } from "@spt/models/external/IPostSptLoadMod";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { JsonUtil } from "@spt/utils/JsonUtil";
import { ConfigServer } from "@spt/servers/ConfigServer";

// Configuration Loading
import { IAdditionalSettingsConfig, loadMainConfig } from "./module_configuration";

// Feature Modules
import { CoreModule } from "./module_core";
import { WeatherModule } from "./module_weather";
import { PlantTimeModule } from "./module_ptime";
import { AmmoModule } from "./module_ammo";
import { LostOnDeathModule } from "./module_lostondeath";
import { WeaponModule } from "./module_weapon";

// Node.js modules
import * as path from "node:path";

/**
 * Main mod class implementing SPT's lifecycle hooks.
 * Orchestrates the loading and execution of all sub-modules.
 */
class AdditionalSettingsMod implements IPreSptLoadMod, IPostDBLoadMod, IPostSptLoadMod
{
    private logger: ILogger | null = null;
    private config: IAdditionalSettingsConfig | null = null;

    // Module Instances (initialized conditionally based on config)
    private coreModuleInstance: CoreModule | null = null;
    private weatherModuleInstance: WeatherModule | null = null;
    private plantTimeModuleInstance: PlantTimeModule | null = null;
    private ammoModuleInstance: AmmoModule | null = null;
    private lostOnDeathModuleInstance: LostOnDeathModule | null = null;
    private weaponModuleInstance: WeaponModule | null = null;

    // Mod Info
    private readonly logPrefix: string = "[ASM]";
    private readonly modName: string = "AdditionalSettings";
    private readonly modVersion: string = "1.0.5";
    private readonly configPath: string = path.join(__dirname, "../config/config.jsonc");

    // ===========================================================================================
    // === SPT Lifecycle Hooks ===
    // ===========================================================================================

    /**
     * preSptLoad: Executes before SPT services and database are fully initialized.
     * Ideal for: Loading configurations, resolving essential early services (Logger, JsonUtil),
     * and initializing module classes.
     * @param container The SPT dependency injection container.
     */
    public preSptLoad(container: DependencyContainer): void {
        // Resolve essential services available early
        this.logger = container.resolve<ILogger>("WinstonLogger");
        const jsonUtil = container.resolve<JsonUtil>("JsonUtil");

        // Critical check for core dependencies
        if (!this.logger || !jsonUtil) {
            const missing = !this.logger ? "Logger" : "JsonUtil";
            // Use console.error as logger might be the missing dependency
            console.error(`${this.logPrefix} Critical Error: Failed to resolve core dependency (${missing}). Mod cannot initialize.`);
            this.logger?.error(`${this.logPrefix} Critical Error: Failed to resolve core dependency (${missing}).`);
            return;
        }

        this.logger.info(`${this.logPrefix} Running preSptLoad phase...`);

        // Load main configuration (creates default files if needed)
        this.config = loadMainConfig(this.logger, jsonUtil, this.configPath, this.modName);

        // Failsafe: Abort if configuration loading failed critically
        if (!this.config) {
            this.logger.error(`${this.logPrefix} Cannot initialize modules: Main config failed to load.`);
            this.logger.info(`${this.logPrefix} preSptLoad phase aborted.`);
            return;
        }

        // Initialize all modules based on the loaded configuration
        // Modules handle their own logging internally based on debug settings.
        this.initializeCoreModule();
        this.initializeWeatherModule(container); // Requires container for service resolution
        this.initializePlantTimeModule();
        this.initializeAmmoModule();
        this.initializeLostOnDeathModule();
        this.initializeWeaponModule();

        this.logger.info(`${this.logPrefix} preSptLoad phase complete.`);
    }

    /**
     * postDBLoad: Executes after the database is loaded but before the server fully starts.
     * Ideal for: Modifying database entries, applying server configurations,
     * and resolving services dependent on the database.
     * @param container The SPT dependency injection container.
     */
    public postDBLoad(container: DependencyContainer): void {
        // Failsafe: Ensure logger and config were successfully initialized in preSptLoad
        if (!this.logger || !this.config) {
            this.logger?.error(`${this.logPrefix} Logger or Config not available in postDBLoad. Skipping modifications.`);
            console.error(`${this.logPrefix} Logger or Config not available in postDBLoad.`); // Also log to console
            return;
        }

        this.logger.info(`${this.logPrefix} Running postDBLoad phase...`);

        // Resolve services needed for modifications in this phase
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const configServer = container.resolve<ConfigServer>("ConfigServer");

        // Failsafe check for resolved services
        if (!databaseServer || !configServer) {
             this.logger.error(`${this.logPrefix} Failed to resolve DatabaseServer or ConfigServer in postDBLoad. Skipping modifications.`);
             return;
        }

        // Delegate modification tasks to the initialized module instances
        // Modules should handle checks internally if they are enabled or not.
        this.applyCoreModuleChanges(databaseServer, configServer);
        this.applyPlantTimeModuleChanges(databaseServer);
        this.applyAmmoModuleChanges(databaseServer);
        this.applyLostOnDeathModuleChanges(configServer);
        this.applyWeaponModuleChanges(databaseServer);

        this.logger.info(`${this.logPrefix} postDBLoad phase complete.`);
    }

    /**
     * postSptLoad: Executes after SPT services are fully ready and other mods have run postDBLoad.
     * Ideal for: Final setup, inter-mod communication, or cleanup tasks.
     * @param container The SPT dependency injection container.
     */
    public postSptLoad(container: DependencyContainer): void {
        // Failsafe: Ensure logger and config are still available
         if (!this.logger || !this.config) {
             this.logger?.error(`${this.logPrefix} Logger or Config not available in postSptLoad.`);
             console.error(`${this.logPrefix} Logger or Config not available in postSptLoad.`);
             return;
         }

         this.logger.info(`${this.logPrefix} Running postSptLoad phase...`);

         // Execute any module logic that needs to run after all mods have loaded
         this.runWeatherModulePostLoad();
         // Add other module postSptLoad calls here if needed

         this.logger.success(`${this.logPrefix} Mod initialization fully complete.`);
    }

    // ===========================================================================================
    // === Private Initialization Helpers (Called in preSptLoad) ===
    // ===========================================================================================

    /** Initializes the CoreModule instance. */
    private initializeCoreModule(): void {
        if (!this.logger || !this.config) return; // Guard against missing dependencies
        this.logger.info(`${this.logPrefix} Initializing Core Module...`);
        try {
            // Pass necessary dependencies to the module constructor
            this.coreModuleInstance = new CoreModule(this.logger, this.config, this.config.enableDebugLogs);
        } catch (error) {
            this.logger.error(`${this.logPrefix} Failed to initialize Core Module: ${error.message}`);
            if (this.config.enableDebugLogs) this.logger.debug(error.stack); // Log stack trace if debug enabled
        }
    }

    /** Initializes the WeatherModule instance if enabled in config. */
    private initializeWeatherModule(container: DependencyContainer): void {
        if (!this.logger || !this.config || !this.config.use_weather_module) {
            // Log skip only if module is explicitly disabled, not if logger/config are missing
            if (this.logger && this.config && !this.config.use_weather_module) {
                this.logger.info(`${this.logPrefix} Weather module disabled in config.`);
            }
            return; // Guard or disabled
        }
        this.logger.info(`${this.logPrefix} Weather module enabled, initializing...`);
        try {
            // Weather module requires the container to resolve its own dependencies
            this.weatherModuleInstance = new WeatherModule(container, this.config.enableDebugLogs, this.config.allow_autoupdate_configs);
            // Weather module needs pre-load setup (e.g., route registration)
            this.weatherModuleInstance.runPreSptLogic();
        } catch (error) {
             this.logger.error(`${this.logPrefix} Failed to initialize Weather Module: ${error.message}`);
             if (this.config.enableDebugLogs) this.logger.debug(error.stack);
        }
    }

    /** Initializes the PlantTimeModule instance if enabled in config. */
    private initializePlantTimeModule(): void {
        if (!this.logger || !this.config || !this.config.use_plant_time_module) {
            if (this.logger && this.config && !this.config.use_plant_time_module) {
                this.logger.info(`${this.logPrefix} Plant Time module disabled in config.`);
            }
            return; // Guard or disabled
        }
        this.logger.info(`${this.logPrefix} Plant Time module enabled, initializing...`);
        try {
            this.plantTimeModuleInstance = new PlantTimeModule(this.logger, this.config, this.config.enableDebugLogs);
        } catch (error) {
            this.logger.error(`${this.logPrefix} Failed to initialize Plant Time Module: ${error.message}`);
            if (this.config.enableDebugLogs) this.logger.debug(error.stack);
        }
    }

    /** Initializes the AmmoModule instance if enabled in config. */
    private initializeAmmoModule(): void {
        if (!this.logger || !this.config || !this.config.use_ammo_module) {
             if (this.logger && this.config && !this.config.use_ammo_module) {
                 this.logger.info(`${this.logPrefix} Ammo module disabled in config.`);
             }
            return; // Guard or disabled
        }
        this.logger.info(`${this.logPrefix} Ammo module enabled, initializing...`);
        try {
            this.ammoModuleInstance = new AmmoModule(this.logger, this.config, this.config.enableDebugLogs);
        } catch (error) {
            this.logger.error(`${this.logPrefix} Failed to initialize Ammo Module: ${error.message}`);
            if (this.config.enableDebugLogs) this.logger.debug(error.stack);
        }
    }

    /** Initializes the LostOnDeathModule instance. */
    private initializeLostOnDeathModule(): void {
        if (!this.logger || !this.config) return; // Guard
        this.logger.info(`${this.logPrefix} Initializing Lost On Death Module...`);
        try {
            this.lostOnDeathModuleInstance = new LostOnDeathModule(this.logger, this.config, this.config.enableDebugLogs);
        } catch (error) {
            this.logger.error(`${this.logPrefix} Failed to initialize Lost On Death Module: ${error.message}`);
            if (this.config.enableDebugLogs) this.logger.debug(error.stack);
        }
    }

    /** Initializes the WeaponModule instance if enabled in config. */
    private initializeWeaponModule(): void {
        if (!this.logger || !this.config || !this.config.use_weapon_module) {
             if (this.logger && this.config && !this.config.use_weapon_module) {
                 this.logger.info(`${this.logPrefix} Weapon module disabled in config.`);
             }
            return; // Guard or disabled
        }
        this.logger.info(`${this.logPrefix} Weapon module enabled, initializing...`);
        try {
            this.weaponModuleInstance = new WeaponModule(this.logger, this.config, this.config.enableDebugLogs);
        } catch (error) {
            this.logger.error(`${this.logPrefix} Failed to initialize Weapon Module: ${error.message}`);
            if (this.config.enableDebugLogs) this.logger.debug(error.stack);
        }
    }

    // ===========================================================================================
    // === Private Application Helpers (Called in postDBLoad) ===
    // ===========================================================================================

    /** Executes the postDBLoad logic for the CoreModule. */
    private applyCoreModuleChanges(databaseServer: DatabaseServer, configServer: ConfigServer): void {
        // Use non-null assertion (!) as logger/config are checked in the calling method (postDBLoad)
        if (!this.coreModuleInstance) {
             this.logger!.error(`${this.logPrefix} Core module instance not available. Skipping core modifications.`);
             return;
        }
        if (this.config!.enableDebugLogs) this.logger!.debug(`${this.logPrefix} Running Core module changes...`);
        try {
            // Delegate the actual logic to the module instance
            this.coreModuleInstance.runPostDbLogic(databaseServer, configServer);
        } catch (error) {
            this.logger!.error(`${this.logPrefix} Error applying Core module changes: ${error.message}`);
            if (this.config!.enableDebugLogs) this.logger!.debug(error.stack);
        }
    }

    /** Executes the postDBLoad logic for the PlantTimeModule. */
    private applyPlantTimeModuleChanges(databaseServer: DatabaseServer): void {
        if (!this.plantTimeModuleInstance) return; // Guard: module disabled or failed init
        if (this.config!.enableDebugLogs) this.logger!.debug(`${this.logPrefix} Running Plant Time module changes...`);
        try {
            this.plantTimeModuleInstance.applyPlantTimeChanges(databaseServer);
        } catch (error) {
            this.logger!.error(`${this.logPrefix} Error applying Plant Time module changes: ${error.message}`);
            if (this.config!.enableDebugLogs) this.logger!.debug(error.stack);
        }
    }

    /** Executes the postDBLoad logic for the AmmoModule. */
    private applyAmmoModuleChanges(databaseServer: DatabaseServer): void {
        if (!this.ammoModuleInstance) return; // Guard: module disabled or failed init
        if (this.config!.enableDebugLogs) this.logger!.debug(`${this.logPrefix} Running Ammo module changes...`);
        try {
            this.ammoModuleInstance.applyAllChanges(databaseServer);
        } catch (error) {
            this.logger!.error(`${this.logPrefix} Error applying Ammo module changes: ${error.message}`);
            if (this.config!.enableDebugLogs) this.logger!.debug(error.stack);
        }
    }

    /** Executes the postDBLoad logic for the LostOnDeathModule. */
    private applyLostOnDeathModuleChanges(configServer: ConfigServer): void {
        if (!this.lostOnDeathModuleInstance) {
             // Log a warning only if the related settings were enabled but the module failed initialization
             if (this.config?.SaveArmbandOnDeath || this.config?.SaveMeleeOnDeath) {
                 this.logger?.warning(`${this.logPrefix} SaveOnDeath settings enabled, but LostOnDeath module failed initialization.`);
             }
            return; // Guard: module failed init (always initialized otherwise)
        }
        if (this.config!.enableDebugLogs) this.logger!.debug(`${this.logPrefix} Running Lost On Death module changes...`);
        try {
            this.lostOnDeathModuleInstance.applyLostOnDeathChanges(configServer);
        } catch (error) {
            this.logger!.error(`${this.logPrefix} Error applying Lost On Death module changes: ${error.message}`);
            if (this.config!.enableDebugLogs) this.logger!.debug(error.stack);
        }
    }

    /** Executes the postDBLoad logic for the WeaponModule. */
    private applyWeaponModuleChanges(databaseServer: DatabaseServer): void {
        if (!this.weaponModuleInstance) return; // Guard: module disabled or failed init
        if (this.config!.enableDebugLogs) this.logger!.debug(`${this.logPrefix} Running Weapon module changes...`);
        try {
            this.weaponModuleInstance.applyWeaponChanges(databaseServer);
        } catch (error) {
            this.logger!.error(`${this.logPrefix} Error applying Weapon module changes: ${error.message}`);
            if (this.config!.enableDebugLogs) this.logger!.debug(error.stack);
        }
    }

    // ===========================================================================================
    // === Private Post-Load Helpers (Called in postSptLoad) ===
    // ===========================================================================================

    /** Executes the postSptLoad logic for the WeatherModule. */
    private runWeatherModulePostLoad(): void {
        if (!this.weatherModuleInstance) return; // Guard: module disabled or failed init
        if (this.config!.enableDebugLogs) this.logger!.debug(`${this.logPrefix} Running Weather Module post-load logic...`);
        try {
            // Delegate to the weather module's post-load method
            this.weatherModuleInstance.runPostSptLogic();
        } catch (error) {
            this.logger!.error(`${this.logPrefix} Error during Weather Module post-load logic: ${error.message}`);
            if (this.config!.enableDebugLogs) this.logger!.debug(error.stack);
        }
    }

} // End of AdditionalSettingsMod class

// Export the mod instance for the SPT mod loader
export const mod = new AdditionalSettingsMod();
// --- END OF FILE mod.ts ---
