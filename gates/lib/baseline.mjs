// G7 Baseline-limits compile: every pipeline compiles, and every frame validates, on an adapter that offers only
// WebGPU's default limits and no optional features (the owner's Chrome crash, 2026-09-26: a shader over a limit
// failed to compile and setPipeline( null ) threw). The real App boots in headless Dawn behind an adapter proxy
// that reports the spec defaults (16 sampled / 4 storage textures, 8 storage buffers per stage, 16 KB workgroup
// storage, ...) and an empty feature set. The App asks for min( wanted, adapter ), so the device gets those limits
// and Dawn validates every layout and shader against them. Covered: the low / mobile / high tiers, each in ferry
// mode and free flight (the fixed views, under water, night).
// Shared by a title's G7 and the engine's E2: runBaselineGate( { views } ) from a gate script run in the title.
// --negative: each fix reverted in a copy of the engine source must fail, and so must a run without the clamp.
// The title's viewpoints come from `views` (a module exporting VIEWS + poseFor; optional).
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { root } from './tiles.mjs';

const ENGINE = realpathSync( join( dirname( fileURLToPath( import.meta.url ) ), '../..' ) );
const SELF = fileURLToPath( import.meta.url );

// WebGPU spec default limits (the ones the App would otherwise raise)
export const DEFAULTS = {
	maxSampledTexturesPerShaderStage: 16, maxSamplersPerShaderStage: 16, maxStorageBuffersPerShaderStage: 8,
	maxStorageTexturesPerShaderStage: 4, maxComputeWorkgroupStorageSize: 16384, maxColorAttachmentBytesPerSample: 32,
	maxUniformBuffersPerShaderStage: 12, maxBindingsPerBindGroup: 1000, maxBufferSize: 268435456,
	maxStorageBufferBindingSize: 134217728, maxComputeInvocationsPerWorkgroup: 256,
	maxStorageBuffersInVertexStage: 8, maxStorageBuffersInFragmentStage: 8, maxStorageTexturesInFragmentStage: 4,
};

const CONFIGS = [];
for ( const tier of [ 'low', 'mobile', 'high' ] ) for ( const mode of [ 'ferry', 'fly' ] ) CONFIGS.push( { tier, mode } );

// ---- child: one App per process
async function runOne( { dir, tier, mode, unclamped, views } ) {

	await import( pathToFileURL( join( dir, 'test/headless.mjs' ) ).href );
	if ( ! unclamped ) {

		const gpu = navigator.gpu, request = gpu.requestAdapter.bind( gpu );
		gpu.requestAdapter = async ( o ) => {

			const a = await request( o );
			const limits = new Proxy( a.limits, { get: ( l, k ) => ( k in DEFAULTS ? DEFAULTS[ k ] : l[ k ] ) } );
			return new Proxy( a, { get( t, k ) {

				if ( k === 'limits' ) return limits;
				if ( k === 'features' ) return new Set();
				const v = t[ k ];
				return typeof v === 'function' ? v.bind( t ) : v;

			} } );

		};

	}

	const r = { tier, mode, failures: [], errors: [], over: [], features: [], frames: 0, mean: 0, nullPipelines: 0 };
	// a pass must never bind a pipeline that failed to compile: count every setPipeline( null )
	for ( const P of [ globalThis.GPURenderPassEncoder, globalThis.GPUComputePassEncoder ] ) {

		const set = P.prototype.setPipeline;
		P.prototype.setPipeline = function ( p ) { if ( ! p ) r.nullPipelines ++; return set.call( this, p ); };

	}

	let H;
	try {

		const { bootApp } = await import( pathToFileURL( join( dir, 'tools/headless/app.mjs' ) ).href );
		H = await bootApp( { width: 640, height: 360, query: `?noAudio&tier=${ tier }${ mode === 'fly' ? '&fly' : '' }` } );
		const { GPU } = H, app = H.app;
		for ( const k in DEFAULTS ) if ( GPU.device.limits[ k ] > DEFAULTS[ k ] ) r.over.push( `${ k } ${ GPU.device.limits[ k ] }` );
		r.features = [ ...GPU.device.features ].filter( ( f ) => f !== 'core-features-and-limits' ); // implicit on every core device
		const step = async ( n ) => { H.frames( n, 1 / 30 ); r.frames += n; await GPU.pipelinesReady(); await H.settle(); };
		await step( 10 );
		if ( mode === 'fly' && views ) {

			const { VIEWS, poseFor } = await import( pathToFileURL( views ).href );
			const { Vector3 } = await import( pathToFileURL( join( dir, 'src/engine/index.js' ) ).href );
			for ( const v of VIEWS ) {

				const p = await poseFor( v );
				app.fly.setPose( new Vector3( p.x, p.y, p.z ), p.yaw, p.pitch );
				await step( 8 );

			}

			// under water at the second view, looking along the seabed
			const p = await poseFor( VIEWS[ 1 ] );
			app.fly.setPose( new Vector3( p.x, - 4, p.z ), p.yaw, - 0.2 );
			await step( 8 );
			app.fly.setPose( new Vector3( p.x, p.y, p.z ), p.yaw, p.pitch );

		}

		app.settings.timeOfDay = 20.5; // night: local lights, moon, stars
		await step( 12 );
		const px = await H.readPixels();
		let s = 0;
		for ( let k = 0; k < px.length; k += 4 ) s += px[ k ] + px[ k + 1 ] + px[ k + 2 ];
		r.mean = s / ( px.length / 4 * 3 );
		r.failures = GPU.failures.map( ( f ) => `${ f.label }: ${ f.message }` );
		r.errors = H.errors.map( ( e ) => e.split( '\n' )[ 0 ] );

	} catch ( e ) {

		r.errors.push( 'boot: ' + e.message.split( '\n' )[ 0 ] );
		const { GPU } = await import( pathToFileURL( join( dir, 'src/engine/gpu/GPU.js' ) ).href ); // the same module instance the App used
		r.failures = GPU.failures.map( ( f ) => `${ f.label }: ${ f.message }` );

	}

	return r;

}

// ---- parent
function spawn( dir, cfg, unclamped = false, views = null ) {

	const args = [ SELF, '--child', `--dir=${ dir }`, `--tier=${ cfg.tier }`, `--mode=${ cfg.mode }` ];
	if ( unclamped ) args.push( '--unclamped' );
	if ( views ) args.push( `--views=${ views }` );
	const p = spawnSync( process.execPath, args, { encoding: 'utf8', timeout: 300000, maxBuffer: 64 << 20, cwd: root, env: { ...process.env, HARBOR_TITLE: root } } );
	const line = ( p.stdout || '' ).split( '\n' ).find( ( l ) => l.startsWith( 'RESULT ' ) );
	if ( ! line ) return { ...cfg, failures: [], errors: [ `child exited ${ p.status } without a result: ${ ( p.stderr || '' ).trim().split( '\n' ).slice( - 2 ).join( ' ' ) }` ], over: [], features: [], frames: 0, mean: 0 };
	return JSON.parse( line.slice( 7 ) );

}

function problems( r ) {

	const out = [];
	const tag = `${ r.tier }/${ r.mode }`;
	for ( const o of r.over ) out.push( `${ tag }: device limit above the WebGPU default: ${ o }` );
	if ( r.features.length ) out.push( `${ tag }: optional features enabled: ${ r.features.join( ', ' ) }` );
	for ( const f of r.failures ) out.push( `${ tag }: pipeline failed: ${ f }` );
	if ( r.nullPipelines ) out.push( `${ tag }: setPipeline( null ) called ${ r.nullPipelines } times` );
	for ( const e of r.errors ) out.push( `${ tag }: error: ${ e }` );
	if ( ! r.errors.length && ! ( r.mean > 1 ) ) out.push( `${ tag }: blank frame (mean ${ r.mean.toFixed( 2 ) })` );
	return out;

}

function check( dir, configs, unclamped = false, views = null ) {

	const fail = [];
	for ( const cfg of configs ) {

		const r = spawn( dir, cfg, unclamped, views );
		const p = problems( r );
		console.log( `  ${ r.tier.padEnd( 6 ) } ${ r.mode.padEnd( 5 ) } ${ r.frames } frames, mean ${ r.mean.toFixed( 1 ) }, ${ p.length ? p.length + ' problem(s)' : 'ok' }` );
		fail.push( ...p );

	}

	return fail;

}

// a copy of the engine's sources with one fix reverted; assets/ and node_modules are linked, not copied (the
// title's public/ and map.json are read from the title itself)
const MUTATIONS = [
	[ 'env-sh-128-threads', 'src/sky/Environment.js', ( s ) => s
		.replace( 'workgroupSize: [ 64, 1, 1 ],\n\t\t\tcode: /* wgsl */`${ CUBE_DIR }', 'workgroupSize: [ 128, 1, 1 ],\n\t\t\tcode: /* wgsl */`${ CUBE_DIR }' )
		.replace( 'array<array<vec3f, 9>, 64>', 'array<array<vec3f, 9>, 128>' ).replace( '@workgroup_size( 64 ) fn main( @builtin( local_invocation_index )', '@workgroup_size( 128 ) fn main( @builtin( local_invocation_index )' )
		.replace( 'idx += 64u', 'idx += 128u' ).replace( 'var s = 32u', 'var s = 64u' ) ],
	[ 'mips-5-outputs', 'src/ocean/ComputeMips.js', ( s ) => s.replace( 'GPU.limits?.maxStorageTexturesPerShaderStage ?? 4', '8' ) ],
	[ 'ocean-mips-level5-in-A', 'src/ocean/OceanFFT.js', ( s ) => s.replace( "out4: level( tex, 4 ),\n", "out4: level( tex, 4 ), out5: level( tex, 5 ),\n" ).replace( "reduce( 's4', null, 1, 5, t, false )", "reduce( 's4', null, 1, 5, t )" ) ],
	[ 'unused-bindings-visible', 'src/engine/gpu/Shader.js', ( s ) => s.replace( "if ( st === 'none' ) l.visibility = 0;", '' ) ],
	[ 'no-reduced-textures', 'src/engine/gpu/GPU.js', ( s ) => s.replace( 'this.reducedTextures = device.limits.maxSampledTexturesPerShaderStage < 21;', 'this.reducedTextures = false;' ) ],
];

function mutatedCopy( name, file, fn, more = [] ) {

	const dir = join( root, '.verify', 'limits-' + name );
	rmSync( dir, { recursive: true, force: true } );
	mkdirSync( dir, { recursive: true } );
	for ( const d of [ 'src', 'tools', 'test' ] ) cpSync( join( ENGINE, d ), join( dir, d ), { recursive: true } );
	cpSync( join( ENGINE, 'package.json' ), join( dir, 'package.json' ) );
	for ( const d of [ 'assets', 'node_modules' ] ) symlinkSync( join( ENGINE, d ), join( dir, d ) );
	for ( const [ f, edit ] of [ [ file, fn ], ...more ] ) {

		const path = join( dir, f ), before = readFileSync( path, 'utf8' ), after = edit( before );
		// a fixture whose anchor no longer matches would silently test the fixed code
		if ( after === before ) throw new Error( `fixture ${ name }: anchor not found in ${ f }` );
		writeFileSync( path, after );

	}

	return dir;

}

// With a shader over a default limit, boot must stop with the readable unsupported-GPU message before any
// frame binds the failed pipeline. `unguarded`: the draw guards and that boot check removed (E2's negative).
const UNGUARD = [
	[ 'src/engine/gpu/Compute.js', ( s ) => s.replace( 'if ( ! pipeline ) return; // failed to compile (GPU.failures)', '' ) ],
	[ 'src/engine/render/FullscreenPass.js', ( s ) => s.replace( 'if ( ! pipeline ) return; // failed to compile (GPU.failures)', '' ) ],
	[ 'src/App.js', ( s ) => s.replace( 'if ( GPU.failures.length ) {', 'if ( false ) {' ) ],
];
function guardCheck( unguarded ) {

	const [ name, file, fn ] = MUTATIONS.find( ( m ) => m[ 0 ] === 'mips-5-outputs' );
	const dir = mutatedCopy( unguarded ? 'guard-off' : 'guard', file, fn, unguarded ? UNGUARD : [] );
	const r = spawn( dir, CONFIGS[ 0 ], false, null );
	rmSync( dir, { recursive: true, force: true } );
	const fail = [];
	const boot = r.errors.find( ( e ) => e.startsWith( 'boot: ' ) );
	console.log( `  ${ name } forced to fail: ${ r.failures.length } failed pipeline(s), setPipeline( null ) × ${ r.nullPipelines || 0 }, boot: ${ boot ? boot.slice( 6, 120 ) : 'no error' }` );
	if ( ! r.failures.length ) fail.push( 'guard: the forced pipeline did not fail (the check would be empty)' );
	if ( r.nullPipelines ) fail.push( `guard: a failed pipeline reached setPipeline ${ r.nullPipelines } times` );
	if ( ! boot || ! /this GPU could not build the "/.test( boot ) ) fail.push( `guard: boot did not stop with the unsupported-GPU message (${ boot || 'it did not stop' })` );
	if ( r.errors.some( ( e ) => /setPipeline|TypeError/.test( e ) ) ) fail.push( 'guard: a setPipeline / TypeError crash was reported' );
	return fail;

}

if ( process.argv[ 1 ] === SELF && process.argv.includes( '--task' ) ) {

	const arg = ( k ) => ( process.argv.find( ( a ) => a.startsWith( `--${ k }=` ) ) || '' ).split( '=' )[ 1 ] || null;
	const t = process.argv[ process.argv.indexOf( '--task' ) + 1 ], views = arg( 'views' );
	let out;
	if ( t === 'compile' ) out = check( ENGINE, CONFIGS, false, views );
	else if ( t === 'unclamped' ) out = check( ENGINE, [ CONFIGS[ 0 ] ], true, views );
	else if ( t === 'list-fixes' ) out = MUTATIONS.map( ( m ) => m[ 0 ] );
	else if ( t === 'reverted' ) {

		const m = MUTATIONS.find( ( q ) => q[ 0 ] === arg( 'fix' ) );
		const dir = mutatedCopy( m[ 0 ], m[ 1 ], m[ 2 ] );
		out = check( dir, [ CONFIGS[ 0 ], CONFIGS[ 1 ] ], false, views );
		rmSync( dir, { recursive: true, force: true } );

	} else if ( t === 'guard' ) out = guardCheck( process.argv.includes( '--unguarded' ) );
	else throw new Error( 'unknown task ' + t );
	console.log( 'TASK ' + JSON.stringify( out ) );
	process.exit( 0 );

}

if ( process.argv.includes( '--child' ) ) {

	const arg = ( k ) => ( process.argv.find( ( a ) => a.startsWith( `--${ k }=` ) ) || '' ).split( '=' )[ 1 ];
	const r = await runOne( { dir: arg( 'dir' ), tier: arg( 'tier' ), mode: arg( 'mode' ), unclamped: process.argv.includes( '--unclamped' ), views: arg( 'views' ) || null } );
	console.log( 'RESULT ' + JSON.stringify( r ) );
	process.exit( 0 );

}

// the gate: exits the process (NEGATIVE n/n on --negative)
export function runBaselineGate( { views = null, label = 'G7', negative = process.argv.includes( '--negative' ) } = {} ) {

	if ( negative ) {

		let caught = 0, total = 0;
		const first = [ CONFIGS[ 0 ], CONFIGS[ 1 ] ]; // low tier, ferry + fly: every fix is exercised at boot
		for ( const [ name, file, fn ] of MUTATIONS ) {

			total ++;
			let fail;
			try {

				fail = check( mutatedCopy( name, file, fn ), first, false, views );

			} catch ( e ) {

				console.log( `NEG ${ name }: fixture error — ${ e.message }` );
				continue;

			}

			if ( fail.length ) caught ++;
			console.log( `NEG ${ name }: ${ fail.length ? 'caught — ' + fail[ 0 ] : 'MISSED' }` );

		}

		total ++;
		const fail = check( ENGINE, [ CONFIGS[ 0 ] ], true, views );
		if ( fail.length ) caught ++;
		console.log( `NEG unclamped-adapter: ${ fail.length ? 'caught — ' + fail[ 0 ] : 'MISSED' }` );
		for ( const [ name ] of MUTATIONS ) rmSync( join( root, '.verify', 'limits-' + name ), { recursive: true, force: true } );
		console.log( `NEGATIVE ${ caught }/${ total }` );
		process.exit( caught === total ? 1 : 0 );

	}

	console.log( `${ label } baseline limits: ` + Object.entries( DEFAULTS ).filter( ( [ k ] ) => /Textures|WorkgroupStorage|StorageBuffersPer/.test( k ) ).map( ( [ k, v ] ) => `${ k } ${ v }` ).join( ', ' ) + ', no optional features' );
	const fail = check( ENGINE, CONFIGS, false, views );
	for ( const f of fail.slice( 0, 30 ) ) console.log( '  FAIL ' + f );
	console.log( fail.length ? `${ label } FAIL (${ fail.length } problems)` : `${ label } PASS: ${ CONFIGS.length } configurations, every pipeline compiled and every frame validated at WebGPU default limits` );
	process.exit( fail.length ? 1 : 0 );

}
