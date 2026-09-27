// configureMap(map): the one place a title's map.json enters the runtime. It fills the engine's shared
// world objects in place (Frame, WorldLayout, VesselSpec, Places, Waypoints) and must run before the App is
// built. Validation (schema/map.schema.json) happens here too, so a broken map.json fails with a clear message.
import { FRAME, toLocal } from '../world/Frame.js';
import { WORLD } from '../world/WorldLayout.js';
import { FERRY } from '../world/VesselSpec.js';
import { PLACES } from '../world/Places.js';
import { WAYPOINTS } from '../world/Waypoints.js';
import { validateMap } from './validate.js';

export const MAP = { current: null };

export function configureMap( map ) {

	validateMap( map );
	MAP.current = map;
	const f = map.frame;
	Object.assign( FRAME, { originE: f.originE, originN: f.originN, size: f.size, utmZone: f.utmZone } );

	// layout: positions relative to a UTM anchor (the title's main dock), so a title keeps its surveyed numbers
	const L = map.layout, a = toLocal( L.anchorUTM[ 0 ], L.anchorUTM[ 1 ] );
	WORLD.terrainSize = FRAME.size;
	const p = L.pier;
	Object.assign( WORLD.pier, { x: a.x + p.dx, zStart: a.z + p.dzStart, zEnd: a.z + p.dzEnd, deckHeight: p.deckHeight, width: p.width, headWidth: p.headWidth, headDepth: p.headDepth } );
	WORLD.boatDock.position.set( a.x + L.boatDock.dx, 0, a.z + L.boatDock.dz );
	WORLD.boatDock.heading = L.boatDock.heading;
	WORLD.start.position.set( a.x + L.start.dx, 0, a.z + L.start.dz );
	WORLD.start.yaw = L.start.yaw;
	if ( L.reef ) { WORLD.reef.center.set( ...L.reef.center ); WORLD.reef.radius = L.reef.radius; }

	if ( map.water && map.water.optics ) WORLD.water = { absorption: [ ...map.water.optics.absorption ], scattering: [ ...map.water.optics.scattering ] };
	WORLD.sun = { latitude: map.sun.latitude, declination: map.sun.declination };
	WORLD.swellDir.set( map.water.swellDir[ 0 ], map.water.swellDir[ 1 ] ).normalize();

	Object.assign( FERRY, map.vessel );

	PLACES.length = 0;
	PLACES.push( ...( map.places || [] ).map( ( q ) => ( { ...q } ) ) );
	WAYPOINTS.length = 0;
	WAYPOINTS.push( ...( map.waypoints || [] ).map( ( w ) => ( { ...w } ) ) );
	return map;

}
