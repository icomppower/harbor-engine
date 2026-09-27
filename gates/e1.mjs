// E1 Contract: map.json and game.json are validated by JSON schema with a clear error on every missing field;
// schema/*.schema.json match src/map/schema.js; the engine repo holds no title names or coordinates (scanned
// with the terms of every downstream title's own map.json, so the scan list itself never lives here).
// --negative: a validator that accepts anything, a stale schema file and a title name planted in an engine
// file must each fail.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE, DOWNSTREAM, titlePath } from './lib/engine.mjs';
import { schemaErrors, validateMap, validateGame } from '../src/map/validate.js';
import { MAP_SCHEMA, GAME_SCHEMA } from '../src/map/schema.js';

const NEG = process.argv.includes( '--negative' );
const GAME = { id: 'fishing', name: 'Fishing', version: '1.0.0', engine: '^1.0.0', requires: [ 'water', 'habitats' ], entry: 'src/index.js' };

// every required field (recursively) deleted in turn must be rejected with an error naming its path
function missingFieldChecks( label, schema, doc, validate ) {

	const fail = [], paths = [];
	const walk = ( s, v, path ) => {

		if ( ! s || s.type !== 'object' || ! v || typeof v !== 'object' ) return;
		for ( const k of s.required || [] ) if ( v[ k ] !== undefined ) { paths.push( [ ...path, k ] ); walk( s.properties[ k ], v[ k ], [ ...path, k ] ); }

	};
	walk( schema, doc, [] );
	try { validate( doc ); } catch ( e ) { fail.push( `contract: the valid ${ label } is rejected: ${ e.message.split( '\n' )[ 1 ] }` ); }
	for ( const p of paths ) {

		const copy = structuredClone( doc );
		let o = copy;
		for ( const k of p.slice( 0, - 1 ) ) o = o[ k ];
		delete o[ p.at( - 1 ) ];
		const want = `missing required field "${ p.join( '.' ) }"`;
		let msg = null;
		try { validate( copy ); } catch ( e ) { msg = e.message; }
		if ( msg === null ) fail.push( `contract: ${ label } without ${ p.join( '.' ) } was accepted` );
		else if ( ! msg.includes( want ) ) fail.push( `contract: ${ label } without ${ p.join( '.' ) }: unclear error "${ msg.split( '\n' ).slice( 0, 2 ).join( ' ' ) }"` );

	}

	// a wrong type is named too
	const bad = structuredClone( doc ); bad.id = 42;
	let msg = null;
	try { validate( bad ); } catch ( e ) { msg = e.message; }
	if ( ! msg || ! msg.includes( 'id must be a string' ) ) fail.push( `contract: ${ label } with a numeric id: ${ msg ? 'unclear error' : 'accepted' }` );
	return { fail, fields: paths.length };

}

function schemaSync( files ) {

	const want = { 'schema/map.schema.json': JSON.stringify( MAP_SCHEMA, null, 2 ) + '\n', 'schema/game.schema.json': JSON.stringify( GAME_SCHEMA, null, 2 ) + '\n' };
	return Object.entries( want ).filter( ( [ f, s ] ) => files[ f ] !== s ).map( ( [ f ] ) => `contract: ${ f } is out of date (npm run schema)` );

}

// names and coordinates of every downstream title (its own map.json), matched case-insensitively
function scanTerms() {

	const terms = new Set();
	for ( const t of DOWNSTREAM ) {

		const m = JSON.parse( readFileSync( join( titlePath( t.id ), 'map.json' ), 'utf8' ) );
		const names = [ m.name, m.ui.title, m.vessel.name, m.route.from, m.route.to, ...( m.places || [] ).map( ( p ) => p.name ),
			...( m.waypoints || [] ).map( ( w ) => w.name ), ...( m.landmarks || [] ).map( ( l ) => l.name ), ...( m.controlPoints || [] ).map( ( c ) => c.name ) ];
		for ( const n of names ) if ( n && n.length >= 6 ) terms.add( n.toLowerCase() );
		for ( const v of [ m.frame.originE, m.frame.originN ] ) terms.add( String( v ) );
		const deg = [ ...( m.controlPoints || [] ).flatMap( ( c ) => [ c.lat, c.lon ] ), m.bbox.south, m.bbox.north, m.bbox.west, m.bbox.east, m.sun.latitude ];
		for ( const d of deg ) terms.add( d.toFixed( 2 ) );

	}

	return [ ...terms ];

}

function scan( files, terms ) {

	const fail = [];
	for ( const [ f, text ] of Object.entries( files ) ) {

		const low = text.toLowerCase();
		for ( const t of terms ) {

			const i = low.indexOf( t );
			// a decimal-degree term only counts as a whole number (12.34 must not match 112.345)
			if ( i >= 0 && ( ! /^-?[\d.]+$/.test( t ) || ! /[\d.]/.test( low[ i - 1 ] || '' ) && ! /\d/.test( low[ i + t.length ] || '' ) ) ) {

				fail.push( `scan: ${ f } contains "${ text.substr( i, t.length ) }" (a downstream title's name or coordinate)` );
				break;

			}

		}

	}

	return fail;

}

function engineFiles() {

	const out = {};
	const list = execFileSync( 'git', [ 'ls-files', '-co', '--exclude-standard' ], { cwd: ENGINE, encoding: 'utf8' } ).trim().split( '\n' );
	for ( const f of list ) {

		if ( f === 'downstream.json' || /\.(png|jpg|bin|ogg|glb|deflate|wav)$/i.test( f ) || f.startsWith( 'gates/fixtures/' ) ) continue;
		try { out[ f ] = readFileSync( join( ENGINE, f ), 'utf8' ); } catch { /* deleted in the working tree */ }

	}

	return out;

}

function check( { validate = validateMap, validateG = validateGame, extraFiles = {}, schemaOverride = null } = {} ) {

	const files = { ...engineFiles(), ...extraFiles, ...( schemaOverride || {} ) };
	const fail = [], notes = [];
	for ( const t of DOWNSTREAM ) {

		const m = JSON.parse( readFileSync( join( titlePath( t.id ), 'map.json' ), 'utf8' ) );
		const r = missingFieldChecks( `${ t.id } map.json`, MAP_SCHEMA, m, validate );
		fail.push( ...r.fail ); notes.push( `${ t.id } map.json: ${ r.fields } required fields each rejected when missing` );

	}

	const tpl = JSON.parse( files[ 'template/map.json' ].replaceAll( '{{id}}', 'template-check' ).replaceAll( '{{name}}', 'Template Check' ) );
	const rt = missingFieldChecks( 'template map.json', MAP_SCHEMA, tpl, validate );
	fail.push( ...rt.fail ); notes.push( `template map.json: ${ rt.fields } required fields` );
	const rg = missingFieldChecks( 'game.json', GAME_SCHEMA, GAME, validateG );
	fail.push( ...rg.fail ); notes.push( `game.json: ${ rg.fields } required fields` );
	fail.push( ...schemaSync( files ) );
	const terms = scanTerms();
	fail.push( ...scan( files, terms ) );
	notes.push( `scan: ${ Object.keys( files ).length } engine files × ${ terms.length } title terms` );
	return { fail, notes };

}

if ( ! NEG ) {

	const { fail, notes } = check();
	for ( const n of notes ) console.log( n );
	if ( fail.length ) { console.log( 'E1 FAIL\n- ' + fail.slice( 0, 40 ).join( '\n- ' ) ); process.exit( 1 ); }
	console.log( 'E1 PASS — map.json / game.json schema-validated with clear errors, schema files in sync, no title names or coordinates in the engine' );
	process.exit( 0 );

}

const lax = () => true;
const planted = scanTerms().find( ( t ) => /[a-z]/.test( t ) );
const MUTATIONS = [
	[ 'map validator accepts anything', 'contract:', () => check( { validate: lax } ) ],
	[ 'game validator accepts anything', 'contract: game.json', () => check( { validateG: lax } ) ],
	[ 'schema file out of date', 'contract: schema/', () => check( { schemaOverride: { 'schema/map.schema.json': '{}\n' } } ) ],
	[ `title name planted in src/ ("${ planted }")`, 'scan:', () => check( { extraFiles: { 'src/world/Planted.js': `// near ${ planted }\n` } } ) ],
	[ 'title origin planted in tools/', 'scan:', () => check( { extraFiles: { 'tools/geo/planted.mjs': `export const E0 = ${ scanTerms().find( ( t ) => /^\d{6,}$/.test( t ) ) };\n` } } ) ],
];
let missed = 0;
for ( const [ name, tag, run ] of MUTATIONS ) {

	const fail = run().fail.filter( ( m ) => m.startsWith( tag ) );
	console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } ${ name }${ fail.length ? ' — ' + fail[ 0 ] : '' }` );
	if ( ! fail.length ) missed ++;

}

console.log( `NEGATIVE ${ MUTATIONS.length - missed }/${ MUTATIONS.length }` );
process.exit( missed ? 0 : 1 );
