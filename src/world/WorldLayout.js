import * as THREE from '../engine/index.js';

// Shared world layout in the title frame (Frame.js): metres, y up, x east, z south, sea level y = 0.
// Filled from map.json `layout`, `water`, `sun`, `swellDir` by configureMap() (src/map/configure.js).
export const WORLD = {
	terrainSize: 0,
	pier: { x: 0, zStart: 0, zEnd: 0, deckHeight: 0, width: 0, headWidth: 0, headDepth: 0 },
	boatDock: { position: new THREE.Vector3(), heading: 0 },
	start: { position: new THREE.Vector3(), yaw: 0 },
	// the terrain shader's reef term; inert (far away, 1 m radius) unless the map places a reef
	reef: { center: new THREE.Vector3( 1e6, 0, 1e6 ), radius: 1 },
	// water optics (absorption / scattering per m, r g b); Tidewater's clear tropical sea unless the map says
	water: { absorption: [ 0.42, 0.075, 0.035 ], scattering: [ 0.012, 0.018, 0.024 ] },
	// latitude and solar declination (time of day = local solar time)
	sun: { latitude: 0, declination: 0 },
	// direction wind chop and residual swell travel
	swellDir: new THREE.Vector2( 1, 0 ),
};
