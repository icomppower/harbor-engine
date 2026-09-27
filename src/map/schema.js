// JSON schemas of the engine contract (docs/ENGINE.md): a title's map.json and a game's game.json.
// schema/*.schema.json are generated from this file (npm run schema); gate E1 checks they are in sync.
const num = { type: 'number' }, str = { type: 'string' }, int = { type: 'integer' };
const vec2 = { type: 'array', items: num, minItems: 2, maxItems: 2 };
const vec3 = { type: 'array', items: num, minItems: 3, maxItems: 3 };
const obj = ( properties, required = Object.keys( properties ) ) => ( { type: 'object', required, properties } );
const palette = { type: 'array', minItems: 1, items: vec3 };

export const CAPABILITIES = [ 'water', 'vessel', 'route', 'buildings', 'landmarks', 'habitats', 'spawnZones' ];

export const MAP_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	$id: 'https://github.com/icomppower/harbor-engine/schema/map.schema.json',
	title: 'Harbor Engine title map',
	...obj( {
		id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
		name: str,
		frame: obj( { crs: str, utmZone: { type: 'integer', minimum: 1, maximum: 60 }, hemisphere: { enum: [ 'N', 'S' ] }, originE: num, originN: num, size: { type: 'number', exclusiveMinimum: 0 }, cell: { type: 'number', exclusiveMinimum: 0 } }, [ 'crs', 'utmZone', 'hemisphere', 'originE', 'originN', 'size' ] ),
		bbox: obj( { south: num, west: num, north: num, east: num } ),
		slice: obj( { extent: obj( { minE: num, minN: num, maxE: num, maxN: num } ), note: str }, [ 'extent' ] ),
		sources: { type: 'array', minItems: 1, items: obj( { id: str, file: str, licence: str, url: str }, [ 'id', 'licence' ] ) },
		terrain: obj( { land: str, sea: str, datum: str, datumStation: str, aerial: str } ),
		controlPoints: { type: 'array', items: obj( { name: str, lat: num, lon: num, ref: str }, [ 'name', 'lat', 'lon' ] ) },
		vessel: obj( { name: str, source: str, length: num, beam: num, draft: num, topSpeedKn: num, hullWidth: num, hullSpacing: num, deckY: num, mass: num } ),
		route: obj( { file: str, schedule: str, from: str, to: str, source: str }, [ 'file', 'from', 'to' ] ),
		landmarks: { type: 'array', items: obj( { slug: str, name: str }, [ 'slug', 'name' ] ) },
		water: obj( { preset: { enum: [ 'bay', 'calm-river', 'still-pool', 'ocean' ] }, swellDir: vec2,
			optics: obj( { absorption: vec3, scattering: vec3 } ) }, [ 'preset', 'swellDir' ] ),
		sun: obj( { latitude: { type: 'number', minimum: - 90, maximum: 90 }, declination: num } ),
		buildings: obj( { baseAllRings: { type: 'boolean' } }, [] ),
		palettes: obj( { walls: { type: 'object', additionalProperties: palette }, roofs: { type: 'object', additionalProperties: palette } } ),
		layout: obj( {
			anchorUTM: vec2,
			pier: obj( { dx: num, dzStart: num, dzEnd: num, deckHeight: num, width: num, headWidth: num, headDepth: num } ),
			boatDock: obj( { dx: num, dz: num, heading: num } ),
			start: obj( { dx: num, dz: num, yaw: num } ),
			reef: obj( { center: vec3, radius: num } ),
		}, [ 'anchorUTM', 'pier', 'boatDock', 'start' ] ),
		places: { type: 'array', items: obj( { name: str, x: num, z: num, model: { type: 'boolean' }, r: num, waypoint: int }, [ 'name', 'x', 'z' ] ) },
		waypoints: { type: 'array', maxItems: 9, items: obj( { name: str, eye: vec3, at: vec3 } ) },
		ui: obj( { title: str, brand: str, autopilot: str, autopilotHelp: str, howToPlay: str }, [ 'title' ] ),
		capabilities: { type: 'array', items: { enum: CAPABILITIES } },
		games: obj( { default: str, available: { type: 'array', items: str } }, [ 'default' ] ),
		streaming: { const: false },
	}, [ 'id', 'name', 'frame', 'bbox', 'slice', 'sources', 'terrain', 'vessel', 'route', 'water', 'sun', 'layout', 'ui', 'capabilities', 'games' ] ),
};

export const GAME_SCHEMA = {
	$schema: 'https://json-schema.org/draft/2020-12/schema',
	$id: 'https://github.com/icomppower/harbor-engine/schema/game.schema.json',
	title: 'Harbor Engine game',
	...obj( {
		id: { type: 'string', pattern: '^[a-z0-9][a-z0-9-]*$' },
		name: str,
		version: str,
		engine: str,
		requires: { type: 'array', items: { enum: CAPABILITIES } },
		entry: str,
	}, [ 'id', 'name', 'version', 'requires', 'entry' ] ),
};
