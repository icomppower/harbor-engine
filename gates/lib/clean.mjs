// The generic G1 "clean title" checks, shared by every title (the template's gates/g1.mjs uses runCleanGate):
// `vite build` passes; every bare import resolves to a declared dependency or a Node builtin; the ocean and sky
// render in headless Dawn (the real App on the title's data, measured numerically, one App per child process).
// --negative: an import of a missing module must break the build, an undeclared package must fail the audit,
// a never-drawn ocean and a sun frozen at noon must fail the render check.
import { spawnSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root } from './tiles.mjs';

const SELF = fileURLToPath( import.meta.url );

export function checkBuild( dir = root ) {

	const out = join( root, '.verify', 'g1-build-' + Math.random().toString( 36 ).slice( 2 ) );
	const r = spawnSync( join( root, 'node_modules/.bin/vite' ), [ 'build', '--outDir', out, '--emptyOutDir', '--logLevel', 'error' ], { cwd: dir, encoding: 'utf8' } );
	rmSync( out, { recursive: true, force: true } );
	return r.status === 0 ? [] : [ `build: vite build failed — ${ ( r.stderr || r.stdout ).trim().split( '\n' ).slice( 0, 2 ).join( ' ' ) }` ];

}

// Every bare import in src/, pipelines/, gates/, test/, hooks.js resolves to a package.json dependency or a Node builtin.
export function sourceFiles( dir ) {

	const out = [];
	if ( existsSync( join( dir, 'hooks.js' ) ) ) out.push( join( dir, 'hooks.js' ) );
	for ( const d of [ 'src', 'pipelines', 'gates', 'test' ] ) {

		const walk = ( p ) => {

			if ( ! existsSync( p ) ) return;
			for ( const e of readdirSync( p, { withFileTypes: true } ) ) {

				const f = join( p, e.name );
				if ( e.isDirectory() ) { if ( e.name !== 'node_modules' ) walk( f ); } else if ( /\.(m?js)$/.test( e.name ) ) out.push( f );

			}

		};
		walk( join( dir, d ) );

	}

	return out;

}

export function auditImports( files, pkg ) {

	const declared = new Set( [ ...Object.keys( pkg.dependencies || {} ), ...Object.keys( pkg.devDependencies || {} ) ] );
	const builtins = new Set( builtinModules );
	const fail = [];
	for ( const [ file, src ] of files ) {

		const code = src.replace( /\/\*[\s\S]*?\*\//g, '' ).replace( /^\s*\/\/.*$/gm, '' );
		for ( const m of code.matchAll( /(?:^|[\s;])(?:import|export)\s[^'"`]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;(=])import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s*['"]([^'"]+)['"]/gm ) ) {

			const spec = m[ 1 ] || m[ 2 ] || m[ 3 ];
			if ( ! spec || spec.startsWith( '.' ) || spec.startsWith( '/' ) || /^https?:/.test( spec ) ) continue;
			if ( spec.startsWith( 'node:' ) || builtins.has( spec.split( '/' )[ 0 ] ) ) continue;
			const name = spec.startsWith( '@' ) ? spec.split( '/' ).slice( 0, 2 ).join( '/' ) : spec.split( '/' )[ 0 ];
			if ( ! declared.has( name ) ) fail.push( `audit: ${ file } imports '${ spec }', not declared in package.json` );

		}

	}

	return fail;

}

export function checkAudit( extra = [] ) {

	const pkg = JSON.parse( readFileSync( join( root, 'package.json' ), 'utf8' ) );
	const files = sourceFiles( root ).map( ( f ) => [ relative( root, f ), readFileSync( f, 'utf8' ) ] );
	return auditImports( [ ...files, ...extra ], pkg );

}

// Ocean + sky in headless Dawn: the real App, free camera 12 m above the bay looking at the horizon.
export async function checkRender( sabotage = null, pose = null ) {

	const { bootApp } = await import( '../../tools/headless/app.mjs' );
	const { Vector3 } = await import( '../../src/engine/index.js' );
	const H = await bootApp( { width: 960, height: 540, query: '?fly&noAudio' } );
	const { FRAME } = await import( '../../src/world/Frame.js' );
	const app = H.app, fail = [];
	if ( sabotage ) sabotage( app );
	// 12 m above the water at the title's pose (default: a quarter of the way to the east edge, looking east)
	const P = pose || { x: FRAME.size / 4, z: 0, yaw: - Math.PI / 2 };
	pose = () => app.fly.setPose( new Vector3( P.x, 12, P.z ), P.yaw, - 0.02 );
	const band = ( px, y0, y1 ) => {

		let r = 0, g = 0, b = 0, n = 0;
		for ( let y = Math.floor( y0 * H.height ); y < Math.floor( y1 * H.height ); y ++ ) for ( let x = 0; x < H.width; x ++ ) {

			const k = ( y * H.width + x ) * 4; r += px[ k ]; g += px[ k + 1 ]; b += px[ k + 2 ]; n ++;

		}

		return { r: r / n, g: g / n, b: b / n, l: ( r + g + b ) / ( 3 * n ) };

	};
	const diff = ( a, b, y0, y1 ) => {

		let s = 0, n = 0;
		for ( let y = Math.floor( y0 * H.height ); y < Math.floor( y1 * H.height ); y ++ ) for ( let x = 0; x < H.width; x ++ ) {

			const k = ( y * H.width + x ) * 4;
			s += Math.abs( a[ k ] - b[ k ] ) + Math.abs( a[ k + 1 ] - b[ k + 1 ] ) + Math.abs( a[ k + 2 ] - b[ k + 2 ] ); n += 3;

		}

		return s / n;

	};
	const shot = async ( hours, frames = 24, dt = 1 / 30 ) => {

		app.settings.timeOfDay = hours;
		pose();
		H.frames( frames, dt );
		return H.readPixels();

	};

	await shot( 13 ); // settle the atmosphere, clouds and temporal history
	// ocean on / off with time frozen (dt 0): the only change between the two frames is the ocean mesh
	const day = await shot( 13, 16, 0 );
	const oceanWas = app.ocean.visible;
	app.ocean.visible = false;
	const noOcean = await shot( 13, 16, 0 );
	app.ocean.visible = oceanWas;
	await shot( 13, 16, 0 );
	const dayLater = await shot( 13, 30 ); // one more second of simulated sea
	const night = await shot( 23, 40 );

	const sky = band( day, 0, 0.3 ), skyNight = band( night, 0, 0.3 );
	const sea = band( day, 0.7, 1 );
	const oceanDelta = diff( day, noOcean, 0.7, 1 ), waveDelta = diff( day, dayLater, 0.7, 1 );
	console.log( `render: sky day L ${ sky.l.toFixed( 1 ) } (r ${ sky.r.toFixed( 0 ) } b ${ sky.b.toFixed( 0 ) }), night L ${ skyNight.l.toFixed( 1 ) }; sea L ${ sea.l.toFixed( 1 ) }; ocean on/off Δ ${ oceanDelta.toFixed( 1 ) }; 1 s wave Δ ${ waveDelta.toFixed( 2 ) }; GPU/console errors ${ H.errors.length }` );
	if ( H.errors.length ) fail.push( `render: ${ H.errors.length } console/GPU errors, first: ${ H.errors[ 0 ].slice( 0, 160 ) }` );
	if ( ! ( sky.l >= 60 && sky.l <= 250 && sky.b > sky.r ) ) fail.push( `render-sky: daytime sky L ${ sky.l.toFixed( 1 ) }, b ${ sky.b.toFixed( 0 ) } vs r ${ sky.r.toFixed( 0 ) } (want L 60–250, blue > red)` );
	if ( ! ( skyNight.l < 0.35 * sky.l ) ) fail.push( `render-sky: night sky L ${ skyNight.l.toFixed( 1 ) } not below 35% of day ${ sky.l.toFixed( 1 ) }` );
	if ( ! ( oceanDelta > 8 ) ) fail.push( `render-ocean: hiding the ocean changes the lower frame by only ${ oceanDelta.toFixed( 1 ) } (want > 8)` );
	if ( ! ( waveDelta > 1 ) ) fail.push( `render-ocean: the sea is static over 1 s (Δ ${ waveDelta.toFixed( 2 ) }, want > 1)` );
	return fail;

}

const SABOTAGE = {
	ocean: ( app ) => { Object.defineProperty( app.ocean, 'visible', { get: () => false, set: () => {} } ); },
	sun: ( app ) => { const f = app.updateSun.bind( app ); app.updateSun = () => { const t = app.settings.timeOfDay; app.settings.timeOfDay = 13; f(); app.settings.timeOfDay = t; }; },
};

// one App per process: each render check runs in a fresh child (this module, --render)
export function renderChild( sabotage = '' ) {

	const r = spawnSync( process.execPath, [ SELF, '--render', ...( sabotage ? [ '--sabotage=' + sabotage ] : [] ) ], { encoding: 'utf8', maxBuffer: 1 << 26, cwd: root, env: { ...process.env, HARBOR_TITLE: root } } );
	const line = ( r.stdout || '' ).split( '\n' ).find( ( l ) => l.startsWith( 'RENDER ' ) );
	for ( const l of ( r.stdout || '' ).split( '\n' ) ) if ( l.startsWith( 'render:' ) ) console.log( l );
	return line ? JSON.parse( line.slice( 7 ) ) : [ `render: child crashed (exit ${ r.status }): ${ ( r.stderr || '' ).trim().split( '\n' ).slice( - 3 ).join( ' ' ) }` ];

}

if ( process.argv[ 1 ] === SELF && process.argv.includes( '--render' ) ) {

	const s = ( process.argv.find( ( a ) => a.startsWith( '--sabotage=' ) ) || '' ).split( '=' )[ 1 ];
	const fail = await checkRender( s ? SABOTAGE[ s ] : null );
	console.log( 'RENDER ' + JSON.stringify( fail ) );
	process.exit( 0 );

}

// the gate (exits the process); `extra` = [ [ label, () => failures[] ] ] title-specific checks
export function runCleanGate( { label = 'G1', extra = [], negative = process.argv.includes( '--negative' ) } = {} ) {

	if ( ! negative ) {

		const fail = [ ...extra.flatMap( ( [ , fn ] ) => fn() ), ...checkBuild( root ), ...checkAudit(), ...renderChild() ];
		if ( fail.length ) { console.log( `${ label } FAIL\n- ` + fail.join( '\n- ' ) ); process.exit( 1 ); }
		console.log( `${ label } PASS — build passes, dependency audit clean, ocean + sky render in headless Dawn` );
		process.exit( 0 );

	}

	const fx = join( root, '.verify', 'clean-neg' );
	rmSync( fx, { recursive: true, force: true } );
	mkdirSync( fx, { recursive: true } );
	for ( const f of [ 'index.html', 'vite.config.js', 'package.json', 'map.json' ] ) if ( existsSync( join( root, f ) ) ) cpSync( join( root, f ), join( fx, f ) );
	cpSync( join( root, 'src' ), join( fx, 'src' ), { recursive: true } );
	symlinkSync( join( root, 'node_modules' ), join( fx, 'node_modules' ) );
	// a deleted module imported at the top of the entry (prepended, so the fixture cannot silently miss)
	writeFileSync( join( fx, 'src/main.js' ), "import { Gone } from './gone/Gone.js';\nconsole.log( Gone );\n" + readFileSync( join( fx, 'src/main.js' ), 'utf8' ) );
	const MUTATIONS = [
		[ 'import of a deleted module', 'build:', () => checkBuild( fx ) ],
		[ "undeclared package ('three')", 'audit:', () => checkAudit( [ [ 'src/fixture.js', "import * as THREE from 'three';\n" ] ] ) ],
		[ 'ocean mesh never drawn', 'render-ocean:', () => renderChild( 'ocean' ) ],
		[ 'sun frozen at noon', 'render-sky:', () => renderChild( 'sun' ) ],
	];
	let missed = 0;
	for ( const [ name, tag, run ] of MUTATIONS ) {

		const fail = run().filter( ( m ) => m.startsWith( tag ) );
		console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } ${ name }${ fail.length ? ' — ' + fail[ 0 ] : '' }` );
		if ( ! fail.length ) missed ++;

	}

	rmSync( fx, { recursive: true, force: true } );
	console.log( `NEGATIVE ${ MUTATIONS.length - missed }/${ MUTATIONS.length }` );
	process.exit( missed ? 0 : 1 );

}
