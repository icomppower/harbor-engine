// E0 Extract without change (the oracle): the engine was extracted from bay-crossing at 884246a and
// bay-crossing turned into a title that depends on this engine. Proven here:
//   structure  the title holds no engine code and resolves `harbor-engine` to this engine (same version)
//   data       every baked file in the title's public/ is byte-identical to the pre-extraction manifest
//              (gates/fixtures/e0/public.sha256), and the runtime assets that moved into the engine
//              (clouds/, audio/) are byte-identical in assets/
//   gates      the title's own ./verify.sh passes every gate (G0–G7, G6 advisory) on this engine
//   look       the title's G6 shots (golden hour, blue hour, night) match the pre-extraction shots
//              (gates/fixtures/e0/*.png) within a calibrated tolerance (SPEC-THRESHOLDS.md)
//   live       the title's live URL still serves the game
// --negative: a deliberate palette change (the title's water colour) must fail the screenshot match, a changed
// baked file must fail the data check, and a title that still carries engine code must fail the structure check.
// --quick skips the title's full verify (for iterating; a gate run never passes it).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { ENGINE, DOWNSTREAM, titlePath } from './lib/engine.mjs';
import { readPNG } from './lib/png.mjs';
import { freeze, readThresholds } from './lib/thresholds.mjs';

const NEG = process.argv.includes( '--negative' ), QUICK = process.argv.includes( '--quick' );
const TITLE = titlePath( 'bay-crossing' ), LIVE = DOWNSTREAM.find( ( d ) => d.id === 'bay-crossing' ).live;
const FIX = join( ENGINE, 'gates/fixtures/e0' );
const SHOTS = [ 'golden-hour', 'blue-hour', 'night' ];
const MOVED = [ 'clouds/', 'audio/' ]; // runtime assets that moved from the title's public/ into assets/
const sameDir = ( a, b ) => { try { return realpathSync( a ) === realpathSync( b ); } catch { return false; } };
const sha = ( b ) => createHash( 'sha256' ).update( b ).digest( 'hex' );
const ENGINE_PKG = JSON.parse( readFileSync( join( ENGINE, 'package.json' ), 'utf8' ) );

function checkStructure( dir = TITLE ) {

	const fail = [];
	for ( const p of [ 'src/App.js', 'src/engine', 'src/ocean', 'tools', 'gates/lib/tiles.mjs' ] ) if ( existsSync( join( dir, p ) ) ) fail.push( `structure: the title still carries engine code (${ p })` );
	const pkg = JSON.parse( readFileSync( join( dir, 'package.json' ), 'utf8' ) );
	const spec = pkg.dependencies && pkg.dependencies[ 'harbor-engine' ];
	const tag = `github:icomppower/harbor-engine#v${ ENGINE_PKG.version }`;
	if ( ! spec ) fail.push( 'structure: package.json does not depend on harbor-engine' );
	else if ( spec !== tag && ! ( spec.startsWith( 'file:' ) && sameDir( join( dir, spec.slice( 5 ) ), ENGINE ) ) ) fail.push( `structure: harbor-engine spec "${ spec }" is neither ${ tag } nor a link to this engine` );
	const installed = join( dir, 'node_modules/harbor-engine/package.json' );
	if ( ! existsSync( installed ) ) fail.push( 'structure: harbor-engine is not installed in the title (npm install)' );
	else {

		const v = JSON.parse( readFileSync( installed, 'utf8' ) ).version;
		if ( v !== ENGINE_PKG.version ) fail.push( `structure: the title runs harbor-engine ${ v }, not ${ ENGINE_PKG.version }` );
		// the installed engine's runtime must be this engine's, file for file
		for ( const f of [ 'src/App.js', 'src/map/configure.js', 'src/ocean/WaterMaterial.js', 'tools/terrain/build.mjs' ] ) {

			const a = join( dir, 'node_modules/harbor-engine', f );
			if ( ! existsSync( a ) || sha( readFileSync( a ) ) !== sha( readFileSync( join( ENGINE, f ) ) ) ) fail.push( `structure: installed harbor-engine differs from this engine at ${ f }` );

		}

	}

	return fail;

}

function checkData( manifest = readFileSync( join( FIX, 'public.sha256' ), 'utf8' ) ) {

	const fail = [];
	let n = 0, moved = 0;
	for ( const line of manifest.trim().split( '\n' ) ) {

		const [ want, rel ] = line.split( /\s+/ );
		const inEngine = MOVED.some( ( m ) => rel.startsWith( m ) );
		const path = inEngine ? join( ENGINE, 'assets', rel ) : join( TITLE, 'public', rel );
		if ( ! existsSync( path ) ) { fail.push( `data: ${ inEngine ? 'assets' : 'public' }/${ rel } is missing` ); continue; }
		if ( sha( readFileSync( path ) ) !== want ) fail.push( `data: ${ inEngine ? 'assets' : 'public' }/${ rel } changed` );
		n ++; if ( inEngine ) moved ++;

	}

	console.log( `data: ${ n } files checked (${ n - moved } baked in the title's public/, ${ moved } runtime assets in the engine)` );
	return fail;

}

// the title's G6 shots, rendered by the title's own g6.mjs (HARBOR_MAP: an optional replacement map.json)
function shoot( mapFile = null ) {

	const out = join( ENGINE, '.verify', 'e0-shots' + ( mapFile ? '-neg' : '' ) );
	rmSync( out, { recursive: true, force: true } );
	mkdirSync( out, { recursive: true } );
	const r = spawnSync( process.execPath, [ join( TITLE, 'gates/g6.mjs' ), '--shoot', `--out=${ out }` ], { cwd: TITLE, encoding: 'utf8', maxBuffer: 1 << 26,
		env: { ...process.env, HARBOR_TITLE: TITLE, ...( mapFile ? { HARBOR_MAP: mapFile } : {} ) } } );
	if ( ! ( r.stdout || '' ).includes( 'SHOT ' ) ) throw new Error( 'shots crashed: ' + ( r.stderr || '' ).slice( - 600 ) );
	return out;

}

function compareShots( dir ) {

	const diffs = SHOTS.map( ( name ) => {

		const a = readPNG( join( FIX, `${ name }.png` ) ), b = readPNG( join( dir, `${ name }.png` ) );
		if ( a.width !== b.width || a.height !== b.height ) return { name, mean: Infinity, over: 1 };
		let s = 0, over = 0;
		for ( let k = 0; k < a.data.length; k += 4 ) {

			const d = Math.abs( a.data[ k ] - b.data[ k ] ) + Math.abs( a.data[ k + 1 ] - b.data[ k + 1 ] ) + Math.abs( a.data[ k + 2 ] - b.data[ k + 2 ] );
			s += d; if ( d > 24 ) over ++;

		}

		return { name, mean: s / ( a.data.length / 4 * 3 ), over: over / ( a.data.length / 4 ) };

	} );
	return diffs;

}

function judgeShots( diffs, tol ) {

	for ( const d of diffs ) console.log( `look: ${ d.name.padEnd( 12 ) } mean |Δ| ${ d.mean.toFixed( 4 ) } levels, ${ ( d.over * 100 ).toFixed( 3 ) } % of pixels off by > 8 levels per channel` );
	return diffs.filter( ( d ) => ! ( d.mean <= tol.mean && d.over <= tol.over ) ).map( ( d ) => `look: ${ d.name } differs from the pre-extraction shot (mean |Δ| ${ d.mean.toFixed( 3 ) } > ${ tol.mean } or ${ ( d.over * 100 ).toFixed( 2 ) } % > ${ tol.over * 100 } % of pixels)` );

}

function tolerance() {

	// calibrated once: the noise floor is the difference between two renders of the same build
	// (measured 2026-09-26: 0 — headless Dawn on the M4 renders bit-exact run to run)
	const t = readThresholds();
	return {
		mean: 'e0.look.meanAbsLevels' in t ? t[ 'e0.look.meanAbsLevels' ] : freeze( 'e0.look.meanAbsLevels', 0.5, 'max mean |Δ| per channel (0–255) vs the pre-extraction G6 shots; noise floor measured 0.000 over two renders of 884246a (bit-exact)' ),
		over: 'e0.look.pixelsOver8' in t ? t[ 'e0.look.pixelsOver8' ] : freeze( 'e0.look.pixelsOver8', 0.001, 'max fraction of pixels off by > 8 levels per channel on average; noise floor 0' ),
	};

}

async function checkLive() {

	try {

		const r = await fetch( LIVE, { redirect: 'follow' } );
		const html = await r.text();
		const m = JSON.parse( readFileSync( join( TITLE, 'map.json' ), 'utf8' ) );
		const script = ( html.match( /<script type="module"[^>]*src="([^"]+)"/ ) || [] )[ 1 ];
		const fail = [];
		if ( ! r.ok ) fail.push( `live: ${ LIVE } answers HTTP ${ r.status }` );
		else if ( ! html.includes( `<title>${ m.name }</title>` ) ) fail.push( `live: ${ LIVE } does not serve ${ m.name }` );
		else if ( ! script ) fail.push( `live: ${ LIVE } has no module script` );
		else {

			const js = await fetch( new URL( script, LIVE ) );
			if ( ! js.ok ) fail.push( `live: ${ script } answers HTTP ${ js.status }` );
			else console.log( `live: ${ LIVE } serves ${ m.name } (${ script })` );

		}

		return fail;

	} catch ( e ) {

		return [ `live: ${ LIVE } unreachable (${ e.message })` ];

	}

}

function titleVerify() {

	const r = spawnSync( './verify.sh', [], { cwd: TITLE, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, HARBOR_TITLE: TITLE } } );
	const summary = ( r.stdout || '' ).split( '===== verify.sh summary =====' )[ 1 ] || '';
	console.log( 'title gates:' + summary.trimEnd().split( '\n' ).map( ( l ) => '\n  ' + l ).join( '' ) );
	writeFileSync( join( ENGINE, '.verify', 'e0-title-verify.log' ), r.stdout || '' );
	return r.status === 0 && /ALL REQUIRED GATES GREEN/.test( r.stdout ) ? [] : [ `gates: the title's ./verify.sh is red (see .verify/e0-title-verify.log)` ];

}

mkdirSync( join( ENGINE, '.verify' ), { recursive: true } );

if ( ! NEG ) {

	const tol = tolerance();
	const fail = [ ...checkStructure(), ...checkData(), ...judgeShots( compareShots( shoot() ), tol ), ...await checkLive() ];
	if ( QUICK ) console.log( 'gates: skipped (--quick)' );
	else fail.push( ...titleVerify() );
	if ( fail.length || QUICK ) { console.log( 'E0 FAIL\n- ' + ( fail.length ? fail.join( '\n- ' ) : 'quick run: the title gates were not run' ) ); process.exit( 1 ); }
	console.log( 'E0 PASS — bay-crossing runs on this engine: no engine code in the title, baked data byte-identical, all title gates green, shots match the pre-extraction look, live URL serves it' );
	process.exit( 0 );

}

// ---- negative fixtures
const tol = tolerance();
const neg = join( ENGINE, '.verify', 'e0-neg' );
rmSync( neg, { recursive: true, force: true } );
mkdirSync( neg, { recursive: true } );
const MUTATIONS = [
	[ 'water palette changed (map.json water.optics)', 'look:', () => {

		const m = JSON.parse( readFileSync( join( TITLE, 'map.json' ), 'utf8' ) );
		m.water.optics = { absorption: [ 0.42, 0.075, 0.035 ], scattering: [ 0.012, 0.018, 0.024 ] }; // clear tropical sea
		const f = join( neg, 'map.json' );
		writeFileSync( f, JSON.stringify( m ) );
		return judgeShots( compareShots( shoot( f ) ), tol );

	} ],
	[ 'one baked terrain tile changed', 'data:', () => {

		const man = readFileSync( join( FIX, 'public.sha256' ), 'utf8' ).replace( /^[0-9a-f]{64}(\s+terrain\/t_3_3\.bin)$/m, ( _, f ) => '0'.repeat( 64 ) + f );
		return checkData( man );

	} ],
	[ 'engine code left in the title', 'structure:', () => {

		const d = join( neg, 'title' );
		mkdirSync( join( d, 'src' ), { recursive: true } );
		writeFileSync( join( d, 'src/App.js' ), 'export class App {}\n' );
		writeFileSync( join( d, 'package.json' ), readFileSync( join( TITLE, 'package.json' ) ) );
		return checkStructure( d );

	} ],
];
let missed = 0;
for ( const [ name, tag, run ] of MUTATIONS ) {

	const fail = run().filter( ( m ) => m.startsWith( tag ) );
	console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } ${ name }${ fail.length ? ' — ' + fail[ 0 ] : '' }` );
	if ( ! fail.length ) missed ++;

}

rmSync( neg, { recursive: true, force: true } );
console.log( `NEGATIVE ${ MUTATIONS.length - missed }/${ MUTATIONS.length }` );
process.exit( missed ? 0 : 1 );
