// Harbor Engine public API (docs/ENGINE.md). Titles and games import from here only.
export { boot } from './boot.js';
export { configureMap, MAP } from './map/configure.js';
export { validateMap, validateGame, schemaErrors } from './map/validate.js';
export { MAP_SCHEMA, GAME_SCHEMA, CAPABILITIES } from './map/schema.js';
export { registerGame, registeredGames, BUILTIN_GAME } from './games.js';
export { FRAME, toLocal, toUTM } from './world/Frame.js';
export { WORLD } from './world/WorldLayout.js';
export { FERRY as VESSEL, KNOT } from './world/VesselSpec.js';
export { WAYPOINTS, waypointPose } from './world/Waypoints.js';
export { PLACES } from './world/Places.js';
export const ENGINE_VERSION = '1.0.0';
