// --- START OF FILE src/module_detection.ts ---

/**
 * Module Detection Utility for AdditionalSettings Mod
 * File: src/module_detection.ts
 * Author: ViP3R_76
 * License: MIT
 *
 * Description:
 * Provides static functions to detect the presence of other specific mods,
 * currently focusing on FIKA (ServerMod), by attempting to resolve known
 * dependency tokens registered by those mods. This helps enable compatibility features
 * in other modules (like the Weather Module).
 */

// Required SPT interfaces and utilities
import type { DependencyContainer } from "tsyringe"; // For SPT's dependency injection container
import type { ILogger } from "@spt/models/spt/utils/ILogger"; // For logging messages

/**
 * Contains static methods for detecting the presence of specific third-party SPT mods.
 * Detection works by attempting to resolve known dependency injection tokens
 * registered by the target mod, indicating its services are available.
 */
export class ModuleDetection {

    /**
     * A known dependency injection token typically registered by the FIKA mod.
     * If this token can be resolved, FIKA is likely present and loaded.
     * Using a specific config token is generally reliable.
     */
    private static readonly FIKA_CONFIG_TOKEN = "FikaConfig";

    /**
     * Consistent log prefix for messages originating from this utility class.
     */
    private static readonly LOG_PREFIX = "[ASM Detection]";

    /**
     * Checks if the FIKA (ServerMod) mod appears to be installed and registered
     * within the SPT dependency container.
     *
     * @param container The SPT dependency injection container.
     * @param logger The logger instance for outputting messages.
     * @param debugEnabled If true, logs detection success/failure details.
     * @returns `true` if FIKA seems to be installed and registered, `false` otherwise.
     */
    public static isFikaInstalled(container: DependencyContainer, logger: ILogger, debugEnabled: boolean): boolean {
        // Failsafe checks for required parameters
        if (!container) {
            console.error(`${this.LOG_PREFIX} Error: DependencyContainer not provided for FIKA detection.`);
            logger?.error(`${this.LOG_PREFIX} Error: DependencyContainer not provided for FIKA detection.`);
            return false;
        }
        if (!logger) {
            console.error(`${this.LOG_PREFIX} Error: Logger not provided for FIKA detection.`);
            return false;
        }

        try {
            // Attempt to resolve the FIKA-specific token.
            // `resolve` throws an error if the token is not registered.
            container.resolve(ModuleDetection.FIKA_CONFIG_TOKEN);

            // If no error, the token exists, meaning FIKA is likely loaded.
            if (debugEnabled) {
                logger.debug(`${this.LOG_PREFIX} FIKA installation detected (Resolved token: '${ModuleDetection.FIKA_CONFIG_TOKEN}').`);
            }
            return true; // FIKA detected

        } catch (error) {
            // If resolving throws (usually 'unregistered dependency token'), FIKA is not detected.
            if (debugEnabled) {
                // Log the reason only if debug is enabled
                logger.debug(`${this.LOG_PREFIX} FIKA not detected (Could not resolve token: '${ModuleDetection.FIKA_CONFIG_TOKEN}').`);
                // logger.trace(error); // Optionally log full error details at trace level
            }
            return false; // FIKA not detected
        }
    }

    // Future: Add detection functions for other mods here using a similar pattern.
    // Example:
    // public static isSomeOtherModInstalled(container: DependencyContainer, logger: ILogger, debugEnabled: boolean): boolean {
    //     const OTHER_MOD_TOKEN = "UniqueTokenForOtherMod";
    //     try {
    //         container.resolve(OTHER_MOD_TOKEN);
    //         if (debugEnabled) logger.debug(`[ASM Detection] SomeOtherMod detected.`);
    //         return true;
    //     } catch (error) {
    //         if (debugEnabled) logger.debug(`[ASM Detection] SomeOtherMod not detected.`);
    //         return false;
    //     }
    // }
}
// --- END OF FILE src/module_detection.ts ---