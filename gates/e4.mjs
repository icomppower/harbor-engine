// E4 Title template: `harbor-engine new-title <id>` (the command npx runs) generates a title repo that installs,
// builds and passes its G1 (build, dependency audit, headless ocean + sky render) on placeholder data.
// The generated title links this engine (--engine file:…) so the gate tests this checkout, not a release.
// --negative: a template map.json missing a field must stop new-title with a clear error; a generated title
// without its entry module must fail G1; a generated title without its terrain must fail G1.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE } from './lib/engine.mjs';

const NEG = process.argv.includes( '--negative' );
const WORK = join( ENGINE, '.verify', 'e4' );
const run = ( cmd, args, cwd, env = {} ) => spawnSync( cmd, args, { cwd, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, HARBOR_TITLE: '', ...env } } );

function generate( id, engine = ENGINE ) {

	const dir = join( WORK, id );
	rmSync( dir, { recursive: true, force: true } );
	mkdirSync( WORK, { recursive: true } );
	const r = run( process.execPath, [ join( engine, 'bin/harbor-engine.mjs' ), 'new-title', id, '--dir', dir, '--engine', `file:${ ENGINE }` ], WORK );
	return { dir, r };

}

// the generated title's own gate runner, G1 only (it is the only gate a placeholder title has)
function titleG1( dir ) {

	const r = run( './verify.sh', [], dir, { HARBOR_TITLE: dir } );
	const line = ( r.stdout || '' ).split( '\n' ).find( ( l ) => /^g1\s/.test( l ) ) || '(no summary)';
	return { ok: r.status === 0 && /ALL REQUIRED GATES GREEN/.test( r.stdout ), line: line.trim(), out: r.stdout };

}

function check( dir, r ) {

	const fail = [];
	if ( r.status !== 0 ) return [ `new-title: exited ${ r.status }: ${ ( r.stderr || r.stdout ).trim().split( '\n' ).slice( - 2 ).join( ' ' ) }` ];
	for ( const f of [ 'map.json', 'hooks.js', 'index.html', 'src/main.js', 'vite.config.js', 'verify.sh', 'gates/g1.mjs', 'gates/gates.json',
		'public/terrain/index.json', 'public/buildings/index.json', 'public/landmarks/index.json', 'public/ferry/route.json', '.gitignore', '.github/workflows/deploy.yml',
		'STATE.md', 'DECISIONS.md', 'CREDITS.md' ] ) if ( ! existsSync( join( dir, f ) ) ) fail.push( `template: ${ f } missing` );
	const txt = [ 'map.json', 'index.html', 'hooks.js', 'src/main.js' ].filter( ( f ) => existsSync( join( dir, f ) ) ).map( ( f ) => readFileSync( join( dir, f ), 'utf8' ) ).join( '' );
	if ( /\{\{\w+\}\}/.test( txt ) ) fail.push( 'template: unfilled {{placeholders}} left' );
	const g1 = titleG1( dir );
	console.log( `generated ${ dir.split( '/' ).pop() }: ${ g1.line }` );
	if ( ! g1.ok ) fail.push( `G1: the generated title is red — ${ g1.line }` );
	return fail;

}

if ( ! NEG ) {

	const { dir, r } = generate( 'e4-check' );
	const fail = check( dir, r );
	if ( fail.length ) { console.log( 'E4 FAIL\n- ' + fail.join( '\n- ' ) ); process.exit( 1 ); }
	console.log( 'E4 PASS — new-title generates a title that installs, builds and passes G1 on placeholder data' );
	process.exit( 0 );

}

// ---- negative fixtures
const MUTATIONS = [
	[ 'template map.json missing "frame"', 'new-title:', () => {

		const eng = join( WORK, 'engine-broken' );
		rmSync( eng, { recursive: true, force: true } );
		for ( const d of [ 'bin', 'src', 'template', 'schema' ] ) cpSync( join( ENGINE, d ), join( eng, d ), { recursive: true } );
		cpSync( join( ENGINE, 'package.json' ), join( eng, 'package.json' ) );
		const m = JSON.parse( readFileSync( join( eng, 'template/map.json' ), 'utf8' ) );
		delete m.frame;
		writeFileSync( join( eng, 'template/map.json' ), JSON.stringify( m, null, 2 ) );
		const { dir, r } = generate( 'e4-broken-map', eng );
		const fail = check( dir, r );
		if ( r.status !== 0 && ! /missing required field "frame"/.test( r.stderr + r.stdout ) ) return [ `other: new-title failed without naming the field: ${ r.stderr }` ];
		return fail;

	} ],
	[ 'generated title without src/main.js', 'G1:', () => {

		const { dir, r } = generate( 'e4-no-entry' );
		rmSync( join( dir, 'src/main.js' ) );
		return check( dir, r );

	} ],
	[ 'generated title without terrain', 'G1:', () => {

		const { dir, r } = generate( 'e4-no-terrain' );
		rmSync( join( dir, 'public/terrain' ), { recursive: true } );
		return check( dir, r );

	} ],
];
let missed = 0;
for ( const [ name, tag, fn ] of MUTATIONS ) {

	const fail = fn().filter( ( m ) => m.startsWith( tag ) );
	console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } ${ name }${ fail.length ? ' — ' + fail[ 0 ] : '' }` );
	if ( ! fail.length ) missed ++;

}

console.log( `NEGATIVE ${ MUTATIONS.length - missed }/${ MUTATIONS.length }` );
process.exit( missed ? 0 : 1 );
