// The world frame of a title (map.json `frame`): metres, y up, x east, z south, origin at the centre of the
// slice extent in the title's UTM zone. Heights are metres above local MSL; sea level is y = 0.
// Filled by configureMap() (src/map/configure.js) before the App is built.
export const FRAME = { originE: 0, originN: 0, size: 0, utmZone: 0 };

export const toLocal = ( E, N ) => ( { x: E - FRAME.originE, z: FRAME.originN - N } );
export const toUTM = ( x, z ) => ( { E: x + FRAME.originE, N: FRAME.originN - z } );
