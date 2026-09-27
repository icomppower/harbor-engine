// Side-effect import for Node gates and tests: configures the engine's world objects (Frame, WorldLayout,
// VesselSpec, Places, Waypoints) from the title's map.json before anything reads them.
import { configureMap } from '../../src/map/configure.js';
import { loadMap } from './title.mjs';

export const map = configureMap(loadMap());
