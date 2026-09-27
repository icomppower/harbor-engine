// Waypoints: named viewpoints (map.json `waypoints`). Keys 1–9 (or the Explore tab, or N on touch for the next
// one) fly the free camera there; F then drops the walker at that spot. World frame metres: x east, z south,
// y up from MSL. Filled by configureMap().
import * as THREE from '../engine/index.js';

export const WAYPOINTS = [];

// camera pose (FlyCamera yaw / pitch, YXZ, looking down -z at yaw 0) for a waypoint
export function waypointPose( w ) {

	const [ x, y, z ] = w.eye, dx = w.at[ 0 ] - x, dy = w.at[ 1 ] - y, dz = w.at[ 2 ] - z;
	return { position: new THREE.Vector3( x, y, z ), yaw: Math.atan2( - dx, - dz ), pitch: Math.atan2( dy, Math.hypot( dx, dz ) ) };

}
