// Helpers for the engine's own E-gates (run from the engine root): where the downstream titles are checked out.
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE = resolve( dirname( fileURLToPath( import.meta.url ) ), '../..' );
export const DOWNSTREAM = JSON.parse( readFileSync( join( ENGINE, 'downstream.json' ), 'utf8' ) ).titles;

// local checkout of a downstream title (HARBOR_<ID>=path overrides downstream.json `path`)
export function titlePath( id ) {

	const t = DOWNSTREAM.find( ( d ) => d.id === id );
	if ( ! t ) throw new Error( `downstream.json has no title "${ id }"` );
	const p = resolve( ENGINE, process.env[ 'HARBOR_' + id.toUpperCase().replace( /-/g, '_' ) ] || t.path );
	if ( ! existsSync( join( p, 'map.json' ) ) ) throw new Error( `title ${ id }: no checkout at ${ p } (clone ${ t.repo } there)` );
	return p;

}
