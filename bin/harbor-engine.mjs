#!/usr/bin/env node
// Harbor Engine CLI.
//   harbor-engine new-title <id> [--name "<Name>"] [--dir <path>] [--engine <npm spec>]
//       a new title repo from template/: map.json + hooks.js + placeholder public/ + gates (G1) + Pages deploy;
//       installs its dependencies and bakes the placeholder data. Default engine spec:
//       github:icomppower/harbor-engine#v<this version>.
//   harbor-engine schema            write schema/*.schema.json from src/map/schema.js
//   harbor-engine update [<spec>]   (in a title) bump the pinned engine, npm install, run ./verify.sh
//   harbor-engine validate [file]   check a map.json (default ./map.json) or game.json against the contract
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAP_SCHEMA, GAME_SCHEMA } from '../src/map/schema.js';
import { validateMap, validateGame } from '../src/map/validate.js';

const ENGINE = resolve( dirname( fileURLToPath( import.meta.url ) ), '..' );
const PKG = JSON.parse( readFileSync( join( ENGINE, 'package.json' ), 'utf8' ) );
const [ cmd, ...rest ] = process.argv.slice( 2 );
const opt = ( k, d ) => { const i = rest.indexOf( k ); return i >= 0 ? rest[ i + 1 ] : d; };
const run = ( c, args, cwd ) => { const r = spawnSync( c, args, { cwd, stdio: 'inherit' } ); if ( r.status !== 0 ) throw new Error( `${ c } ${ args.join( ' ' ) } failed (exit ${ r.status })` ); };

export const schemaFiles = () => ( {
	'schema/map.schema.json': JSON.stringify( MAP_SCHEMA, null, 2 ) + '\n',
	'schema/game.schema.json': JSON.stringify( GAME_SCHEMA, null, 2 ) + '\n',
} );

function newTitle() {

	const id = rest.find( ( a, i ) => ! a.startsWith( '--' ) && ! ( i > 0 && rest[ i - 1 ].startsWith( '--' ) ) );
	if ( ! id || ! /^[a-z0-9][a-z0-9-]*$/.test( id ) ) throw new Error( 'usage: harbor-engine new-title <id> (lower-case letters, digits, dashes)' );
	const name = opt( '--name', id.split( '-' ).map( ( w ) => w[ 0 ].toUpperCase() + w.slice( 1 ) ).join( ' ' ) );
	const dir = resolve( opt( '--dir', id ) );
	const spec = opt( '--engine', `github:icomppower/harbor-engine#v${ PKG.version }` );
	if ( existsSync( dir ) && readdirSync( dir ).length ) throw new Error( `${ dir } exists and is not empty` );
	mkdirSync( dir, { recursive: true } );
	cpSync( join( ENGINE, 'template' ), dir, { recursive: true } );
	renameSync( join( dir, 'gitignore' ), join( dir, '.gitignore' ) ); // npm drops .gitignore from packages
	const fill = ( p ) => {

		for ( const e of readdirSync( p ) ) {

			const f = join( p, e );
			if ( statSync( f ).isDirectory() ) { fill( f ); continue; }
			const s = readFileSync( f, 'utf8' );
			writeFileSync( f, s.replaceAll( '{{id}}', id ).replaceAll( '{{name}}', name ).replaceAll( '{{engineVersion}}', `v${ PKG.version }` ) );

		}

	};
	fill( dir );
	const pkg = {
		name: id, version: '0.1.0', private: true, type: 'module', license: 'MIT',
		scripts: {
			dev: 'vite --host 127.0.0.1', build: 'vite build', preview: 'vite preview', verify: './verify.sh',
			'placeholder-data': 'node node_modules/harbor-engine/tools/placeholder/build.mjs',
			'engine:update': 'node node_modules/harbor-engine/bin/harbor-engine.mjs update',
		},
		dependencies: { 'harbor-engine': spec },
		devDependencies: { vite: PKG.devDependencies.vite },
	};
	writeFileSync( join( dir, 'package.json' ), JSON.stringify( pkg, null, 2 ) + '\n' );
	validateMap( JSON.parse( readFileSync( join( dir, 'map.json' ), 'utf8' ) ) );
	if ( ! rest.includes( '--no-install' ) ) {

		run( 'npm', [ 'install', '--no-audit', '--no-fund' ], dir );
		run( process.execPath, [ join( dir, 'node_modules/harbor-engine/tools/placeholder/build.mjs' ) ], dir );

	}

	console.log( `new title ${ id } ("${ name }") at ${ dir }, engine ${ spec }` );

}

function update() {

	const spec = rest[ 0 ] && ! rest[ 0 ].startsWith( '--' ) ? rest[ 0 ] : `github:icomppower/harbor-engine#v${ PKG.version }`;
	const p = JSON.parse( readFileSync( 'package.json', 'utf8' ) );
	const before = p.dependencies[ 'harbor-engine' ];
	p.dependencies[ 'harbor-engine' ] = spec;
	writeFileSync( 'package.json', JSON.stringify( p, null, 2 ) + '\n' );
	console.log( `harbor-engine ${ before } → ${ spec }` );
	run( 'npm', [ 'install', '--no-audit', '--no-fund' ], process.cwd() );
	if ( ! rest.includes( '--no-verify' ) ) run( './verify.sh', [], process.cwd() );

}

try {

	if ( cmd === 'new-title' ) newTitle();
	else if ( cmd === 'schema' ) { for ( const [ f, s ] of Object.entries( schemaFiles() ) ) { mkdirSync( dirname( join( ENGINE, f ) ), { recursive: true } ); writeFileSync( join( ENGINE, f ), s ); console.log( 'wrote ' + f ); } }
	else if ( cmd === 'update' ) update();
	else if ( cmd === 'validate' ) {

		const f = rest[ 0 ] || 'map.json', j = JSON.parse( readFileSync( f, 'utf8' ) );
		( basename( f ) === 'game.json' ? validateGame : validateMap )( j );
		console.log( `${ f }: valid` );

	} else { console.log( readFileSync( fileURLToPath( import.meta.url ), 'utf8' ).split( '\n' ).slice( 1, 11 ).map( ( l ) => l.replace( /^\/\/ ?/, '' ) ).join( '\n' ) ); if ( cmd ) process.exit( 1 ); }

} catch ( e ) {

	console.error( e.message );
	process.exit( 1 );

}
