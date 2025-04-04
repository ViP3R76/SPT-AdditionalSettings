// --- START OF FILE src/module_weather.ts ---

/**
 * Weather Module for AdditionalSettings Mod
 * File: src/module_weather.ts
 * Author: ViP3R_76
 * License: MIT
 *
 * Description:
 * Handles randomization of the in-game season based on various modes and settings
 * defined in its dedicated configuration file ('config/config_weather.jsonc').
 * This module is activated by the main 'AdditionalSettings' mod based on its config.
 * Randomization occurs by intercepting the standard '/client/weather' route.
 * Includes compatibility hooks for FIKA (ServerMod): When FIKA is detected, the initial
 * weather is set by the first '/client/weather' request, and subsequent changes
 * are driven exclusively by the '/fika/raid/create' hook to ensure weather selection
 * occurs before the raid starts in a multiplayer context.
 */

// Required SPT interfaces and utilities
import type { DependencyContainer } from "tsyringe";
import type { ILogger } from "@spt/models/spt/utils/ILogger";
import type { ConfigServer } from "@spt/servers/ConfigServer";
import type { IWeatherConfig } from "@spt/models/spt/config/IWeatherConfig";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import type { StaticRouterModService } from "@spt/services/mod/staticRouter/StaticRouterModService";
import type { WeatherCallbacks } from "@spt/callbacks/WeatherCallbacks";
import type { JsonUtil } from "@spt/utils/JsonUtil";

// Import FIKA detection utility
import { ModuleDetection } from "./module_detection";
// Import Weather Module config loading/validation logic and interface
import { IWeatherModuleConfig, loadWeatherConfig } from "./module_configuration";

// Node.js built-in modules
import * as path from "node:path";

/**
 * Represents the Weather Module, encapsulating its configuration loading,
 * season selection logic, and route interception for weather randomization.
 * Instantiated by the main mod if 'use_weather_module' is enabled.
 */
export class WeatherModule {
    // Resolved SPT services
    private logger: ILogger;
    private configServer: ConfigServer;
    private router: StaticRouterModService;
    private weatherCallbacks: WeatherCallbacks;
    private jsonUtil: JsonUtil;
    private container: DependencyContainer;

    // Module state variables
    private debugEnabled: boolean;
    private allowConfigWriteBack: boolean;
    private readonly logPrefix: string = "[ASM Weather]";
    private baseWeatherConfig: IWeatherConfig | null = null; // SPT's base weather config object
    private moduleConfig: IWeatherModuleConfig | null = null; // This module's specific config
    private isFikaDetected: boolean = false;
    // Flag to track if initial weather has been set via /client/weather when FIKA is active
    private hasInitialSptWeatherBeenSet: boolean = false;
    private readonly moduleConfigPath: string = path.join(__dirname, "../config/config_weather.jsonc");

    // Season definitions and constants
    private readonly seasonsArray: readonly string[] = [ "Summer", "Autumn", "Winter", "Spring", "Late Autumn", "Early Spring", "Storm" ];
    private readonly ALL_SEASON_INDICES: readonly number[] = [0, 1, 2, 3, 4, 5, 6];
    private readonly STORM_INDEX: number = 6;

    /**
     * Initializes the Weather Module. Resolves required SPT services and stores state.
     * @param container The SPT dependency injection container.
     * @param debugEnabled Whether debug logging is enabled.
     * @param allowConfigWriteBack Whether overwriting the config file is allowed.
     */
    constructor(container: DependencyContainer, debugEnabled: boolean, allowConfigWriteBack: boolean) {
        if (!container) {
            console.error(`${this.logPrefix} Critical Error: DependencyContainer was not provided.`);
            throw new Error("WeatherModule requires a valid DependencyContainer.");
        }
        this.container = container;
        this.debugEnabled = debugEnabled;
        this.allowConfigWriteBack = allowConfigWriteBack;

        // Resolve necessary dependencies
        try {
            this.logger = container.resolve<ILogger>("WinstonLogger");
            this.configServer = container.resolve<ConfigServer>("ConfigServer");
            this.router = container.resolve<StaticRouterModService>("StaticRouterModService");
            this.weatherCallbacks = container.resolve<WeatherCallbacks>("WeatherCallbacks");
            this.jsonUtil = container.resolve<JsonUtil>("JsonUtil");
        } catch (error) {
            const serviceName = error.message.includes("token:") ? error.message.split("token:")[1]?.trim() : "Unknown Service";
            console.error(`${this.logPrefix} Critical Error: Failed to resolve dependency '${serviceName}'. Module cannot function.`);
            this.logger?.error(`${this.logPrefix} Critical Error: Failed to resolve dependency '${serviceName}'. Module cannot function.`);
            throw error;
        }
    }

    /**
     * Executes logic during the pre-SPT load phase.
     * Loads configuration, retrieves base weather config, detects FIKA, and registers routes.
     */
    public runPreSptLogic(): void {
        this.logger.info(`${this.logPrefix} Initializing...`);

        // Load this module's specific configuration ('config_weather.jsonc')
        this.moduleConfig = loadWeatherConfig(
            this.logger,
            this.jsonUtil,
            this.moduleConfigPath,
            this.logPrefix,
            this.debugEnabled,
            this.allowConfigWriteBack
        );

        // Retrieve the base SPT weather configuration object
        this.baseWeatherConfig = this.configServer.getConfig<IWeatherConfig>(ConfigTypes.WEATHER);
        if (!this.baseWeatherConfig) {
            this.logger.error(`${this.logPrefix} Failed to retrieve base weather config. Weather randomization disabled.`);
            return; // Cannot function
        }

        // Detect if FIKA mod is installed
        this.isFikaDetected = ModuleDetection.isFikaInstalled(this.container, this.logger, this.debugEnabled);

        // Register static routes
        this.registerRoutes();

        // Log the active weather selection mode
        this.logActiveMode();

        this.logger.info(`${this.logPrefix} Initialization complete.`);
    }

    /**
     * Registers static routes to intercept weather requests (/client/weather)
     * and FIKA raid creation (/fika/raid/create) if FIKA is detected.
     */
    private registerRoutes(): void {
        // Failsafe checks
        if (!this.moduleConfig || !this.router || !this.weatherCallbacks) {
            this.logger.error(`${this.logPrefix} Cannot register routes: Config or core services missing.`);
            return;
        }
        if (this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} Registering static routes...`);
        }

        // --- Intercept the standard /client/weather request ---
        this.router.registerStaticRouter(
            `${this.logPrefix} Weather Intercept`, // Unique name for router
            [{
                url: "/client/weather",
                // Use 'action' hook: Replaces original handler. Must call original handler to return data.
                action: (url: string, info: any, sessionID: string): any => {
                    let selectedIndex: number | null = null;
                    let selectionMethod = "Unknown";
                    let logContext = "SPT Request";
                    let determineSeason = true;

                    // If FIKA is active, only the *first* /client/weather request should set the season.
                    if (this.isFikaDetected) {
                        if (this.hasInitialSptWeatherBeenSet) {
                            // Skip determination; FIKA hook will handle subsequent changes.
                            determineSeason = false;
                            if (this.debugEnabled) {
                                this.logger.debug(`${this.logPrefix} Skipping determination via /client/weather: FIKA active and initial weather already set.`);
                            }
                        } else {
                            // This is the first request with FIKA active.
                            logContext = "Initial SPT Request (FIKA Active)";
                        }
                    }

                    // Determine and set season if needed for this specific request
                    if (determineSeason) {
                        const result = this.determineAndSetSeason();
                        selectedIndex = result.selectedIndex;
                        selectionMethod = result.selectionMethod;
                        // Log the outcome
                        this.logSelectedSeason(selectedIndex, selectionMethod, logContext);
                        // Mark that the initial weather has been set if FIKA is active
                        if (this.isFikaDetected) {
                            this.hasInitialSptWeatherBeenSet = true;
                        }
                    }

                    // IMPORTANT: Always call the original SPT callback to return data to the client
                    if (typeof this.weatherCallbacks.getWeather !== "function") {
                        this.logger.error(`${this.logPrefix} Original WeatherCallbacks.getWeather is not available! Cannot return weather data.`);
                        return null; // Or appropriate empty structure
                    }
                    return this.weatherCallbacks.getWeather(url, info, sessionID);
                }
            }],
            "spt-weather" // SPT tag for grouping
        );

        // --- Intercept FIKA's raid creation request (conditionally) ---
        // Hook '/fika/raid/create' to set weather *before* raid starts if FIKA is present.
        if (this.isFikaDetected) {
            const fikaHookUrl = "/fika/raid/create";
            const fikaHookName = `${this.logPrefix} FIKA Hook (${fikaHookUrl})`;

            this.router.registerStaticRouter(
                fikaHookName,
                [{
                    url: fikaHookUrl,
                    // Use 'action' hook type for compatibility
                    action: (url: string, info: any, sessionID: string, output: string): string => {
                        if (this.debugEnabled) this.logger.debug(`${this.logPrefix} Intercepting FIKA Raid Creation (Action Hook)...`);

                        // Always determine the season when the FIKA hook runs
                        const { selectedIndex, selectionMethod } = this.determineAndSetSeason();

                        let logContext = "FIKA Raid Creation";
                        // If the initial SPT weather flag hasn't been set yet (edge case: FIKA hook ran first), mark it now.
                        if (!this.hasInitialSptWeatherBeenSet) {
                            this.hasInitialSptWeatherBeenSet = true;
                            logContext = "FIKA Initial Trigger (Pre-SPT)";
                            this.logger.warning(`${this.logPrefix} FIKA hook triggered before initial SPT weather request. Setting initial flag now.`);
                        }

                        // Log the outcome
                        this.logSelectedSeason(selectedIndex, selectionMethod, logContext);

                        // MUST return the original output for 'action' hook
                        return output;
                    }
                }],
                "fika-raid-create" // Unique tag for SPT loader
            );

            if (this.debugEnabled) {
                this.logger.debug(`${this.logPrefix} Registered FIKA 'action' hook for: ${fikaHookUrl}`);
            }
        }
    }

    /**
     * Executes logic during the post-SPT load phase.
     * Currently empty for this module.
     */
    public runPostSptLogic(): void {
        // The 'hasInitialSptWeatherBeenSet' flag persists for the server session.
        // No reset needed here for the current logic.
    }

    /**
     * Calculates the array of available season indices (0-6) after applying exclusions
     * from the module config. Ensures at least one season is always available.
     * @returns An array of available season indices. Returns [0] (Summer) on critical failure.
     */
    private getAvailableSeasonIndices(): number[] {
        if (!this.moduleConfig) {
            this.logger.error(`${this.logPrefix} Cannot get available seasons: Module config not loaded.`);
            return [0]; // Default to Summer index
        }

        const excludedIndices = new Set(this.moduleConfig.exclude_seasons);
        let availableIndices: number[] = this.ALL_SEASON_INDICES.filter(i => !excludedIndices.has(i));

        // Safety Check: If configuration excluded all possible seasons (0-6)
        if (availableIndices.length === 0) {
            this.logger.warning(`${this.logPrefix} Configuration excludes all seasons! Overriding to enable all non-Storm seasons.`);
            // Fallback: Allow all non-storm seasons initially
            availableIndices = this.ALL_SEASON_INDICES.filter(i => i !== this.STORM_INDEX);

            // Edge Case: If *only* Storm was available originally, re-add it.
            if (availableIndices.length === 0 && excludedIndices.size === this.seasonsArray.length - 1 && !excludedIndices.has(this.STORM_INDEX)) {
                 this.logger.warning(`${this.logPrefix} Only Storm was available after initial exclusion, re-adding it.`);
                 availableIndices.push(this.STORM_INDEX);
            }
            // Final failsafe
            if (availableIndices.length === 0) {
                 this.logger.error(`${this.logPrefix} Internal Error: No available seasons after safety override! Defaulting to Summer [0].`);
                 return [0];
            }
        }

        if (this.debugEnabled) {
            this.logger.debug(`${this.logPrefix} Available season indices after exclusions: [${availableIndices.join(', ')}]`);
        }
        return availableIndices;
    }

    /**
     * Determines the season based on the module config's mode precedence (Fixed > Weighted > Random),
     * sets the `overrideSeason` property in the base SPT weather config, and returns details.
     * This is the core randomization logic.
     * @returns An object containing `selectedIndex` (0-6 or null if error) and `selectionMethod` (string).
     */
    private determineAndSetSeason(): { selectedIndex: number | null; selectionMethod: string } {
        // Failsafe checks
        if (!this.baseWeatherConfig || !this.moduleConfig) {
            this.logger.error(`${this.logPrefix} Cannot determine season: Base or module config unavailable.`);
            return { selectedIndex: null, selectionMethod: "Error - Config Missing" };
        }

        // Reset override before determination to ensure a fresh value is set
        this.baseWeatherConfig.overrideSeason = null;
        let selectedIndex: number | null = null;
        let selectionMethod = "Unknown";
        const availableIndices = this.getAvailableSeasonIndices();

        // Failsafe: If no indices are available even after safety checks
        if (availableIndices.length === 0) {
             this.logger.error(`${this.logPrefix} No available seasons to choose from! Defaulting to Summer (0).`);
             this.baseWeatherConfig.overrideSeason = 0;
             return { selectedIndex: 0, selectionMethod: "Error Fallback (No Available)" };
        }

        // Determine active mode based on precedence: Fixed > Weighted > Random
        if (this.moduleConfig.use_fixed_season) {
            // Map config value 1-7 to index 0-6
            const targetIndex = this.moduleConfig.fixed_season_index - 1;
            // Check if index is valid (0-6), allow even if excluded from random pools
            if (targetIndex >= 0 && targetIndex < this.seasonsArray.length) {
                 selectedIndex = targetIndex;
                 selectionMethod = "Fixed";
                 // Log if the chosen fixed season is technically excluded from random pools
                 if (this.moduleConfig.exclude_seasons.includes(selectedIndex) && this.debugEnabled) {
                      this.logger.debug(`${this.logPrefix} Using fixed season ${this.seasonsArray[selectedIndex]} (${selectedIndex}) despite exclusion.`);
                 }
            } else {
                 // Should not happen due to validation, but handle defensively
                 this.logger.error(`${this.logPrefix} Invalid fixed_season_index (${this.moduleConfig.fixed_season_index}) detected. Defaulting.`);
                 selectedIndex = 0; // Default to Summer index
                 selectionMethod = "Fixed (Invalid Fallback)";
            }
        } else if (this.moduleConfig.use_weight_system) {
            selectedIndex = this.getWeightedRandomSeasonIndex(availableIndices);
            selectionMethod = "Weighted Random";
        } else { // Fallback to Auto Random if Fixed and Weighted are false
            const randomMode = this.moduleConfig.random_system_mode; // 0 or 1 (validated)
            if (randomMode === 0) { // Auto All (ignore excludes)
                selectedIndex = this.getRandomSeasonIndexFromList(this.ALL_SEASON_INDICES);
                selectionMethod = "Auto Random (All)";
            } else { // Auto Available (respect excludes)
                selectedIndex = this.getRandomSeasonIndexFromList(availableIndices);
                selectionMethod = "Auto Random (Available)";
            }
            // Log if random mode was used implicitly because other modes were off
            if (!this.moduleConfig.use_random_system && this.debugEnabled) {
                 this.logger.debug(`${this.logPrefix} Activated Auto Random mode as fallback. Using mode ${randomMode}.`);
            }
        }

        // Final Validation: Ensure the selected index is valid and part of the appropriate pool for the method used.
        // (e.g., Weighted Random should pick from 'availableIndices', Auto Random (All) from 'ALL_SEASON_INDICES')
        const finalPool = (selectionMethod.includes("All") || selectionMethod.includes("Fixed"))
                             ? this.ALL_SEASON_INDICES
                             : availableIndices;
        if (selectedIndex === null || !finalPool.includes(selectedIndex)) {
            this.logger.error(`${this.logPrefix} Season selection resulted in invalid/excluded index (${selectedIndex}) for method '${selectionMethod}'. Defaulting.`);
            selectedIndex = availableIndices[0]; // Default to first available index
            selectionMethod += " - Final Fallback";
        }

        // Set the overrideSeason property in the base SPT config object. This is what SPT reads.
        this.baseWeatherConfig.overrideSeason = selectedIndex;

        return { selectedIndex, selectionMethod };
    }

    /**
     * Performs weighted random selection based on config weights, considering only available seasons.
     * @param availableIndices Indices (0-6) that are allowed based on exclusions.
     * @returns The selected season index (0-6). Returns first available index on error/zero weight.
     */
    private getWeightedRandomSeasonIndex(availableIndices: number[]): number {
        if (!this.moduleConfig) { this.logger.error(`${this.logPrefix} Cannot perform weighted selection: Module config missing.`); return availableIndices[0] ?? 0; }

        let totalWeight = 0;
        const weights: { index: number; weight: number }[] = [];

        // Calculate total weight ONLY for available seasons with positive weight defined in config
        for (const index of availableIndices) {
            // Type assertion needed to use index to access config property by season name
            const seasonName = this.seasonsArray[index] as keyof IWeatherModuleConfig;
            const weight = this.moduleConfig[seasonName];
            // Include only if weight is a valid, positive number
            if (typeof weight === 'number' && Number.isFinite(weight) && weight > 0) {
                 weights.push({ index: index, weight: weight });
                 totalWeight += weight;
            } else if (this.debugEnabled && typeof weight === 'number' && weight === 0) {
                  // Log seasons explicitly excluded by zero weight if debugging
                  this.logger.debug(`${this.logPrefix} Season ${seasonName} (${index}) excluded from weighted random (zero weight).`);
            }
        }

        // If total weight is 0 (e.g., all available seasons have 0 weight), fallback to equal random chance
        if (totalWeight <= 0) {
            this.logger.warning(`${this.logPrefix} Total positive weight of available seasons is zero. Selecting randomly from available.`);
            return this.getRandomSeasonIndexFromList(availableIndices);
        }

        // Perform standard weighted selection algorithm
        const random = Math.random() * totalWeight;
        let cumulativeWeight = 0;
        for (const item of weights) {
            cumulativeWeight += item.weight;
            if (random < cumulativeWeight) {
                return item.index; // Return the index once cumulative weight exceeds random threshold
            }
        }

        // Fallback (should not happen with valid logic and positive total weight)
        this.logger.error(`${this.logPrefix} Weighted selection failed unexpectedly. Defaulting.`);
        return availableIndices[0];
    }

    /**
     * Selects a random index with equal chance from the provided list of indices.
     * @param indices The list of indices to choose from. Assumed non-empty by callers.
     * @returns A randomly selected index from the list. Returns 0 on error.
     */
    private getRandomSeasonIndexFromList(indices: readonly number[]): number {
         // Failsafe check for empty list
         if (!indices || indices.length === 0) {
              this.logger.error(`${this.logPrefix} Cannot select random index from empty list. Defaulting to 0 (Summer).`);
              return 0;
         }
         // Generate random position within the bounds of the provided index array
         const randomIndexPosition = Math.floor(Math.random() * indices.length);
         // Return the actual season index value at that random position
         return indices[randomIndexPosition];
    }

    /**
     * Logs the selected season, including the method used and the context (SPT/FIKA).
     * @param selectedIndex The index (0-6) of the selected season, or null if selection failed.
     * @param selectionMethod The string describing how the season was selected.
     * @param context A string indicating the trigger context (e.g., "SPT Request", "FIKA Raid Creation").
     */
    private logSelectedSeason(selectedIndex: number | null, selectionMethod: string, context: string): void {
        // Validate selected index before proceeding
        if (selectedIndex === null) {
            if (this.debugEnabled) this.logger.debug(`${this.logPrefix} Cannot log season, selection failed or index was null.`);
            return;
        }
        if (selectedIndex < 0 || selectedIndex >= this.seasonsArray.length) {
            this.logger.error(`${this.logPrefix} Invalid season index (${selectedIndex}) passed to logger.`);
            return;
        }

        const seasonName = this.seasonsArray[selectedIndex];
        const message = `Selected Season [${selectionMethod}]: ${seasonName}`;

        // Log the result with the provided context tag
        this.logger.success(`${this.logPrefix} ${message} (${context})`);
    }

    /**
     * Logs a concise message indicating the active weather selection mode based on config.
     * Called once during initialization.
     */
    private logActiveMode(): void {
        if (!this.moduleConfig) {
            this.logger.warning(`${this.logPrefix} Cannot determine active mode: Module config missing.`);
            return;
        }

        let activeModeDescription = "Unknown";

        // Determine active mode description based on config precedence
        if (this.moduleConfig.use_fixed_season) {
            const fixedIndex = this.moduleConfig.fixed_season_index - 1; // Map 1-7 to 0-6
            activeModeDescription = (fixedIndex >= 0 && fixedIndex < this.seasonsArray.length)
                ? `Fixed (${this.seasonsArray[fixedIndex]})`
                : `Fixed (Invalid Index -> Defaulting)`; // Fallback text if index somehow invalid after validation
        } else if (this.moduleConfig.use_weight_system) {
            activeModeDescription = "Weighted Random (Respecting Exclusions)";
        } else if (this.moduleConfig.use_random_system) {
            activeModeDescription = (this.moduleConfig.random_system_mode === 0)
                ? "Auto Random (All Seasons)"
                : "Auto Random (Available Seasons)";
        } else {
            // Fallback if all mode flags are false (should default to random available based on defaults)
            activeModeDescription = "Fallback Auto Random (Available Seasons)";
        }

        this.logger.info(`${this.logPrefix} Active Mode: ${activeModeDescription}`);
    }

} // End of WeatherModule class
// --- END OF FILE src/module_weather.ts ---