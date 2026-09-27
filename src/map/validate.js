// A small JSON-schema checker for the engine contract (the subset src/map/schema.js uses: type, required,
// properties, additionalProperties, items, enum, const, pattern, minItems, maxItems, minimum, maximum,
// exclusiveMinimum). No dependencies, so it runs in the browser, in Node pipelines and in gates alike.
import { MAP_SCHEMA, GAME_SCHEMA } from './schema.js';

const typeOk = ( t, v ) => t === 'integer' ? Number.isInteger( v ) : t === 'number' ? typeof v === 'number' && Number.isFinite( v )
	: t === 'array' ? Array.isArray( v ) : t === 'object' ? v !== null && typeof v === 'object' && ! Array.isArray( v ) : typeof v === t;

export function schemaErrors( schema, value, path = '' ) {

	const errs = [], at = path || '(root)';
	if ( schema.const !== undefined && value !== schema.const ) errs.push( `${ at } must be ${ JSON.stringify( schema.const ) }` );
	if ( schema.enum && ! schema.enum.includes( value ) ) errs.push( `${ at } must be one of ${ schema.enum.map( ( e ) => JSON.stringify( e ) ).join( ', ' ) } (got ${ JSON.stringify( value ) })` );
	if ( schema.type && ! typeOk( schema.type, value ) ) { errs.push( `${ at } must be ${ schema.type === 'integer' ? 'an integer' : schema.type === 'array' || schema.type === 'object' ? 'an ' + schema.type : 'a ' + schema.type }` ); return errs; }
	if ( typeof value === 'number' ) {

		if ( schema.minimum !== undefined && value < schema.minimum ) errs.push( `${ at } must be ≥ ${ schema.minimum }` );
		if ( schema.maximum !== undefined && value > schema.maximum ) errs.push( `${ at } must be ≤ ${ schema.maximum }` );
		if ( schema.exclusiveMinimum !== undefined && ! ( value > schema.exclusiveMinimum ) ) errs.push( `${ at } must be > ${ schema.exclusiveMinimum }` );

	}

	if ( typeof value === 'string' && schema.pattern && ! new RegExp( schema.pattern ).test( value ) ) errs.push( `${ at } must match ${ schema.pattern }` );
	if ( Array.isArray( value ) ) {

		if ( schema.minItems !== undefined && value.length < schema.minItems ) errs.push( `${ at } needs at least ${ schema.minItems } item(s)` );
		if ( schema.maxItems !== undefined && value.length > schema.maxItems ) errs.push( `${ at } allows at most ${ schema.maxItems } item(s)` );
		if ( schema.items ) value.forEach( ( v, i ) => errs.push( ...schemaErrors( schema.items, v, `${ path }[${ i }]` ) ) );

	}

	if ( typeOk( 'object', value ) ) {

		for ( const k of schema.required || [] ) if ( value[ k ] === undefined ) errs.push( `missing required field "${ path ? path + '.' : '' }${ k }"` );
		for ( const [ k, v ] of Object.entries( value ) ) {

			const sub = schema.properties && schema.properties[ k ] || ( typeof schema.additionalProperties === 'object' ? schema.additionalProperties : null );
			if ( sub ) errs.push( ...schemaErrors( sub, v, path ? `${ path }.${ k }` : k ) );
			else if ( schema.additionalProperties === false ) errs.push( `unknown field "${ path ? path + '.' : '' }${ k }"` );

		}

	}

	return errs;

}

function check( schema, value, file ) {

	const errs = schemaErrors( schema, value );
	if ( errs.length ) {

		const e = new Error( `${ file } is invalid:\n  - ${ errs.join( '\n  - ' ) }` );
		e.errors = errs;
		throw e;

	}

	return value;

}

export const validateMap = ( map ) => check( MAP_SCHEMA, map, 'map.json' );
export const validateGame = ( game ) => check( GAME_SCHEMA, game, 'game.json' );
