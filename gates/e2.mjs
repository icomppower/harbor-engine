// E2 Baseline-GPU compile (the 2026-09-26 Chrome crash): every engine pipeline compiles, and every frame
// validates, in headless Dawn behind an adapter that offers only WebGPU's default limits and no optional
// features — on a full title (bay-crossing: buildings, landmarks, ferry; its fixed views) and on a placeholder
// title (open water, no city), low / mobile / high × ferry / free flight. And a pipeline that does fail never
// reaches setPipeline: with a shader forced over a default limit, boot stops with the readable
// unsupported-GPU message and no pass ever binds a null pipeline (setPipeline is trapped).
// --negative: each engine fix reverted (G7's fixtures) must fail, an unclamped adapter must fail, and a failing
// pipeline with the draw guards and the boot check removed must be caught binding null.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE, titlePath } from './lib/engine.mjs';

const NEG = process.argv.includes( '--negative' );
const WORK = join( ENGINE, '.verify', 'e2' );
const PLACEHOLDER = join( WORK, 'title' );
const BAY = titlePath( 'bay-crossing' );

function ensurePlaceholder() {

	if ( existsSync( join( PLACEHOLDER, 'public/terrain/index.json' ) ) ) return;
	rmSync( PLACEHOLDER, { recursive: true, force: true } );
	mkdirSync( WORK, { recursive: true } );
	const r = spawnSync( process.execPath, [ join( ENGINE, 'bin/harbor-engine.mjs' ), 'new-title', 'e2-limits', '--dir', PLACEHOLDER, '--engine', `file:${ ENGINE }` ], { encoding: 'utf8', env: { ...process.env, HARBOR_TITLE: '' } } );
	if ( r.status !== 0 ) throw new Error( 'new-title failed: ' + ( r.stderr || r.stdout ).slice( - 400 ) );

}

// run a baseline.mjs task in the title's directory (it reads the title from the working directory)
function task( title, args ) {

	const r = spawnSync( process.execPath, [ join( ENGINE, 'gates/lib/baseline.mjs' ), '--task', ...args ], { cwd: title, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, HARBOR_TITLE: title } } );
	for ( const l of ( r.stdout || '' ).split( '\n' ) ) if ( l.startsWith( '  ' ) ) console.log( l );
	const line = ( r.stdout || '' ).split( '\n' ).find( ( l ) => l.startsWith( 'TASK ' ) );
	if ( ! line ) return [ `task: ${ args.join( ' ' ) } crashed: ${ ( r.stderr || '' ).trim().split( '\n' ).slice( - 2 ).join( ' ' ) }` ];
	return JSON.parse( line.slice( 5 ) );

}

const views = join( BAY, 'gates/lib/views.mjs' );
ensurePlaceholder();

if ( ! NEG ) {

	console.log( 'bay-crossing:' );
	const fail = task( BAY, [ 'compile', `--views=${ views }` ] ).map( ( m ) => 'bay-crossing ' + m );
	console.log( 'placeholder title:' );
	fail.push( ...task( PLACEHOLDER, [ 'compile' ] ).map( ( m ) => 'placeholder ' + m ) );
	console.log( 'a pipeline forced over a default limit:' );
	fail.push( ...task( BAY, [ 'guard' ] ) );
	if ( fail.length ) { console.log( 'E2 FAIL\n- ' + fail.slice( 0, 30 ).join( '\n- ' ) ); process.exit( 1 ); }
	console.log( 'E2 PASS — every pipeline compiles at WebGPU default limits on a full and a placeholder title; a failing pipeline stops boot with a clear message and never reaches setPipeline' );
	process.exit( 0 );

}

let missed = 0, total = 0;
const report = ( name, fail ) => { total ++; console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } ${ name }${ fail.length ? ' — ' + fail[ 0 ] : '' }` ); if ( ! fail.length ) missed ++; };
for ( const name of task( BAY, [ 'list-fixes' ] ) ) report( `fix reverted: ${ name }`, task( BAY, [ 'reverted', `--fix=${ name }`, `--views=${ views }` ] ) );
report( 'unclamped adapter', task( BAY, [ 'unclamped' ] ) );
report( 'failing pipeline with the draw guards and the boot check removed', task( BAY, [ 'guard', '--unguarded' ] ).filter( ( m ) => m.startsWith( 'guard:' ) ) );
console.log( `NEGATIVE ${ total - missed }/${ total }` );
process.exit( missed ? 0 : 1 );
