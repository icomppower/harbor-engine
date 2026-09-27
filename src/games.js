// Games plug in here (ENGINE.md, "registerGame"): a game module calls registerGame() with its rules and view;
// the title picks one with map.json `games.default` or ?game=<id>. A map never imports a game, and a game
// only touches the App through the members ENGINE.md lists. `sightseeing` (walk, fly, take the helm) is built
// into the engine and needs no module.
import { CAPABILITIES } from './map/schema.js';

const GAMES = new Map();
export const BUILTIN_GAME = 'sightseeing';

// game = { requires: [capability…], init( app ) → state?, update( app, dt ), view( app ) → { dispose }? }
export function registerGame( id, game ) {

	if ( ! /^[a-z0-9][a-z0-9-]*$/.test( id ) ) throw new Error( `registerGame: bad id "${ id }"` );
	if ( id === BUILTIN_GAME ) throw new Error( `registerGame: "${ id }" is built in` );
	const requires = game.requires || [];
	const bad = requires.filter( ( c ) => ! CAPABILITIES.includes( c ) );
	if ( bad.length ) throw new Error( `registerGame(${ id }): unknown capabilities ${ bad.join( ', ' ) }` );
	for ( const k of [ 'init', 'update', 'view' ] ) if ( game[ k ] !== undefined && typeof game[ k ] !== 'function' ) throw new Error( `registerGame(${ id }): ${ k } must be a function` );
	GAMES.set( id, { id, requires, ...game } );

}

export const registeredGames = () => [ BUILTIN_GAME, ...GAMES.keys() ];

export async function startGame( app, map ) {

	const id = ( app.qs && app.qs.get( 'game' ) ) || map.games.default;
	if ( id === BUILTIN_GAME ) return null;
	const game = GAMES.get( id );
	if ( ! game ) throw new Error( `game "${ id }" is not registered (available: ${ registeredGames().join( ', ' ) })` );
	const missing = game.requires.filter( ( c ) => ! map.capabilities.includes( c ) );
	if ( missing.length ) throw new Error( `game "${ id }" needs map capabilities ${ missing.join( ', ' ) } that ${ map.id } does not provide` );
	const state = game.init ? await game.init( app ) : undefined;
	const view = game.view ? game.view( app, state ) : null;
	return { id, state, view, update: game.update ? ( a, dt ) => game.update( a, dt, state ) : null };

}
