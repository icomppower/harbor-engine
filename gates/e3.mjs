// E3 Mobile look: on a phone (Playwright, Pixel 7 emulation, touch, one headless Chromium with WebGPU), a look
// drag turns the camera (1) normally, (2) after a finger's touchend was lost, and (3) when the finger starts
// on, or right beside, a HUD panel. The page is a real title build (placeholder data, this engine's code)
// served statically; touches go through CDP Input.dispatchTouchEvent so each finger keeps its own id.
// --negative: the engine with each half of the fix reverted (no lost-touch release; look only from the view
// canvas) must fail its check.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, extname } from 'node:path';
import { ENGINE } from './lib/engine.mjs';

const NEG = process.argv.includes( '--negative' );
const WORK = join( ENGINE, '.verify', 'e3' );
const TITLE = join( WORK, 'title' );
const MIN_TURN = 0.05; // rad: a 60 px drag turns the camera by ~0.4 rad; below this it did not turn

// a placeholder title linked to this engine, generated once per run
function ensureTitle() {

	if ( existsSync( join( TITLE, 'node_modules/vite' ) ) ) return;
	rmSync( TITLE, { recursive: true, force: true } );
	mkdirSync( WORK, { recursive: true } );
	const r = spawnSync( process.execPath, [ join( ENGINE, 'bin/harbor-engine.mjs' ), 'new-title', 'e3-touch', '--dir', TITLE, '--engine', `file:${ ENGINE }` ], { encoding: 'utf8', env: { ...process.env, HARBOR_TITLE: '' } } );
	if ( r.status !== 0 ) throw new Error( 'new-title failed: ' + ( r.stderr || r.stdout ).slice( - 400 ) );

}

// build the title against `engine` (this engine, or a copy with a reverted fix)
async function buildWith( engine, outDir ) {

	const { build } = await import( join( TITLE, 'node_modules/vite/dist/node/index.js' ) );
	const { harborEngine } = await import( join( engine, 'vite.mjs' ) );
	await build( {
		root: TITLE, configFile: false, base: './', logLevel: 'error', plugins: [ harborEngine() ],
		resolve: { alias: [ { find: /^harbor-engine$/, replacement: join( engine, 'src/index.js' ) }, { find: /^harbor-engine\//, replacement: engine + '/' } ] },
		build: { outDir, emptyOutDir: true, target: 'esnext' },
	} );
	return outDir;

}

function serve( dir ) {

	const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
	const server = createServer( ( req, res ) => {

		const p = join( dir, decodeURIComponent( req.url.split( '?' )[ 0 ] ).replace( /^\/+/, '' ) || 'index.html' );
		if ( ! p.startsWith( dir ) || ! existsSync( p ) ) { res.writeHead( 404 ); res.end(); return; }
		res.writeHead( 200, { 'Content-Type': TYPES[ extname( p ) ] || 'application/octet-stream' } );
		res.end( readFileSync( p ) );

	} );
	return new Promise( ( ok ) => server.listen( 0, '127.0.0.1', () => ok( { server, url: `http://127.0.0.1:${ server.address().port }/` } ) ) );

}

async function measure( browser, url ) {

	const { devices } = await import( 'playwright' );
	const ctx = await browser.newContext( { ...devices[ 'Pixel 7' ] } );
	const page = await ctx.newPage();
	// registered before any page script: when armed, the next touchend never reaches the page (a lost touchend —
	// a system gesture, an alert, a handler that swallowed it)
	await page.addInitScript( () => window.addEventListener( 'touchend', ( e ) => { if ( window.__dropTouchEnd ) { window.__dropTouchEnd = false; e.stopImmediatePropagation(); } }, { capture: true } ) );
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	await page.goto( url + '?touch&noAudio&tier=mobile' );
	await page.waitForFunction( () => ( window.__app && window.__app.booted ) || window.__bootError, null, { timeout: 240000 } );
	const bootError = await page.evaluate( () => window.__bootError || null );
	if ( bootError ) { await ctx.close(); return { errors: [ 'boot: ' + bootError ], viewport: [ 0, 0 ], panels: [] }; }
	const cdp = await ctx.newCDPSession( page );
	const touch = ( type, points ) => cdp.send( 'Input.dispatchTouchEvent', { type, touchPoints: points.map( ( [ id, x, y ] ) => ( { id, x, y, radiusX: 4, radiusY: 4, force: 1 } ) ) } );
	const wait = ( ms ) => page.waitForTimeout( ms );
	// start overlay: tap it away
	const start = await page.evaluate( () => { const s = document.querySelector( '.tw-start' ); if ( ! s || s.hidden ) return null; const r = s.getBoundingClientRect(); return [ r.x + r.width / 2, r.y + r.height / 2 ]; } );
	if ( start ) { await touch( 'touchStart', [ [ 90, ...start ] ] ); await touch( 'touchEnd', [] ); await wait( 400 ); }
	const yaw = () => page.evaluate( () => { const e = window.__app.camera.matrixWorld.elements; return Math.atan2( - e[ 8 ], - e[ 10 ] ); } );
	const turn = async ( id, [ x, y ], held = [] ) => {

		const y0 = await yaw();
		await touch( 'touchStart', [ ...held, [ id, x, y ] ] );
		for ( let k = 1; k <= 6; k ++ ) { await touch( 'touchMove', [ ...held, [ id, x + 10 * k, y ] ] ); await wait( 30 ); }
		await wait( 250 );
		const d = Math.abs( Math.atan2( Math.sin( await yaw() - y0 ), Math.cos( await yaw() - y0 ) ) );
		return d;

	};
	const W = page.viewportSize().width, H = page.viewportSize().height;
	const out = { errors, viewport: [ W, H ] };

	// 1. a plain look drag in the middle of the view
	out.plain = await turn( 1, [ W / 2 - 40, H * 0.4 ] );
	await touch( 'touchEnd', [] ); await wait( 150 );

	// 2. a finger whose touchend never arrives, then a new finger (the lost one is gone from the touch list)
	await touch( 'touchStart', [ [ 2, W / 2, H * 0.3 ] ] );
	await touch( 'touchMove', [ [ 2, W / 2 + 20, H * 0.3 ] ] );
	await wait( 100 );
	await page.evaluate( () => { window.__dropTouchEnd = true; } );
	await touch( 'touchEnd', [] ); // lifted, but the page never hears of it
	await wait( 100 );
	out.afterLost = await turn( 3, [ W / 2 - 40, H * 0.55 ] );
	await touch( 'touchEnd', [] ); await wait( 150 );

	// 3. fingers that start on the glass of a HUD panel (a spot of the panel that is not a control) and right
	// beside it (4 px outside its edge, on the view)
	const spots = await page.evaluate( () => {

		const CONTROLS = 'button, a, input, select, textarea, label, [role="slider"], [role="listbox"], [role="dialog"], .tc-stick, .tc-btn, .tw-panel, .tw-help, .tw-menu, .tw-start, .tw-sign';
		const out = [];
		for ( const el of document.querySelectorAll( '.tw-hud *, .tw-rail, .tc-pad, .tc-top' ) ) {

			const r = el.getBoundingClientRect(), cs = getComputedStyle( el );
			if ( r.width < 24 || r.height < 16 || cs.visibility === 'hidden' || cs.display === 'none' || el.closest( CONTROLS ) ) continue;
			if ( r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight ) continue;
			// on: a point of the panel whose hit target is the panel itself (or its text), not a control
			let on = null;
			for ( let y = r.top + 2; y < r.bottom - 1 && ! on; y += 3 ) for ( let x = r.left + 2; x < r.right - 1 && ! on; x += 3 ) {

				const hit = document.elementFromPoint( x, y );
				if ( hit && ( hit === el || el.contains( hit ) ) && ! hit.closest( CONTROLS ) && x > 0 && y > 0 && x < innerWidth && y < innerHeight ) on = [ x, y ];

			}

			// beside: 4 px outside the edge that faces the middle of the screen
			const bx = r.left > innerWidth / 2 ? r.left - 4 : r.right + 4, by = r.top + r.height / 2;
			const hitB = document.elementFromPoint( bx, by );
			const beside = hitB && ! hitB.closest( CONTROLS ) && bx > 0 && bx < innerWidth ? [ bx, by ] : null;
			if ( on || beside ) out.push( { name: el.className.baseVal ?? el.className, on, beside, pe: cs.pointerEvents } );

		}

		// panels that take touches first (pointer-events auto), then the rest; a few of each
		return out.sort( ( a, b ) => ( a.pe === 'none' ) - ( b.pe === 'none' ) ).slice( 0, 6 );

	} );
	out.panels = [];
	let id = 10;
	for ( const s of spots ) {

		const r = { name: String( s.name ).split( ' ' )[ 0 ], pe: s.pe };
		if ( s.on ) { r.on = await turn( id ++, s.on ); await touch( 'touchEnd', [] ); await wait( 120 ); }
		if ( s.beside ) { r.beside = await turn( id ++, s.beside ); await touch( 'touchEnd', [] ); await wait( 120 ); }
		out.panels.push( r );

	}

	await ctx.close();
	return out;

}

function judge( r ) {

	const fail = [], f = ( v ) => v === undefined ? '-' : v.toFixed( 3 );
	console.log( `viewport ${ r.viewport.join( '×' ) }: plain drag ${ f( r.plain ) } rad, after a lost touchend ${ f( r.afterLost ) } rad` );
	for ( const p of r.panels ) console.log( `  near ${ p.name } (pointer-events ${ p.pe }): on ${ f( p.on ) } rad, beside ${ f( p.beside ) } rad` );
	if ( r.errors.length ) fail.push( `page: ${ r.errors.length } errors, first: ${ r.errors[ 0 ].slice( 0, 160 ) }` );
	if ( ! ( r.plain > MIN_TURN ) ) fail.push( `look: a plain drag did not turn the camera (${ f( r.plain ) } rad)` );
	if ( ! ( r.afterLost > MIN_TURN ) ) fail.push( `lost-touchend: after a lost touchend the look is dead (${ f( r.afterLost ) } rad)` );
	if ( ! r.panels.some( ( p ) => p.pe !== 'none' && p.on !== undefined ) ) fail.push( 'hud: no touch-catching HUD panel found to start on (the check would be empty)' );
	for ( const p of r.panels ) {

		if ( p.on !== undefined && ! ( p.on > MIN_TURN ) ) fail.push( `hud-panel: a drag starting on ${ p.name } did not turn the camera (${ f( p.on ) } rad)` );
		if ( p.beside !== undefined && ! ( p.beside > MIN_TURN ) ) fail.push( `hud-panel: a drag starting beside ${ p.name } did not turn the camera (${ f( p.beside ) } rad)` );

	}

	return fail;

}

// an engine copy with part of the fix reverted (src/ui/TouchControls.js edited; everything else linked)
function revertedEngine( name, edit ) {

	const dir = join( WORK, 'engine-' + name );
	rmSync( dir, { recursive: true, force: true } );
	mkdirSync( dir, { recursive: true } );
	cpSync( join( ENGINE, 'src' ), join( dir, 'src' ), { recursive: true } );
	for ( const f of [ 'vite.mjs', 'package.json' ] ) cpSync( join( ENGINE, f ), join( dir, f ) );
	for ( const d of [ 'assets', 'node_modules' ] ) symlinkSync( join( ENGINE, d ), join( dir, d ) );
	const p = join( dir, 'src/ui/TouchControls.js' ), before = readFileSync( p, 'utf8' ), after = edit( before );
	if ( after === before ) throw new Error( `fixture ${ name }: anchor not found` );
	writeFileSync( p, after );
	return dir;

}

async function runOn( browser, engine, tag ) {

	const dist = await buildWith( engine, join( WORK, 'dist-' + tag ) );
	const { server, url } = await serve( dist );
	try { return judge( await measure( browser, url ) ); } finally { server.close(); }

}

ensureTitle();
const { chromium } = await import( 'playwright' );
const browser = await chromium.launch( { headless: true, channel: 'chromium', args: [ '--enable-unsafe-webgpu', '--ignore-gpu-blocklist' ] } );
let code = 0;
try {

	if ( ! NEG ) {

		const fail = await runOn( browser, ENGINE, 'engine' );
		if ( fail.length ) { console.log( 'E3 FAIL\n- ' + fail.join( '\n- ' ) ); code = 1; }
		else console.log( 'E3 PASS — touch look turns the camera normally, after a lost touchend, and from on / beside every HUD panel' );

	} else {

		const MUTATIONS = [
			[ 'lost touchend never released', 'lost-touchend:', ( s ) => s.replace( 'this.forgetLost( e );\n\t\t\tif ( this.lookId !== null ) return;', 'if ( this.lookId !== null ) return;' ).replace( "( e ) => { this.forgetLost( e ); this.move( e ); }", '( e ) => this.move( e )' ) ],
			[ 'look only from the view canvas', 'hud-panel:', ( s ) => s.replace( "window.addEventListener( 'touchstart', ( e ) => {\n\n\t\t\tthis.forgetLost( e );", "view.addEventListener( 'touchstart', ( e ) => {\n\n\t\t\tthis.forgetLost( e );" ).replace( "}, { passive: false, capture: true } );\n\t\twindow.addEventListener( 'touchmove'", "}, opts );\n\t\twindow.addEventListener( 'touchmove'" ) ],
		];
		let missed = 0;
		for ( const [ name, tag, edit ] of MUTATIONS ) {

			let fail;
			try { fail = ( await runOn( browser, revertedEngine( name.replace( /\W+/g, '-' ), edit ), name.replace( /\W+/g, '-' ) ) ).filter( ( m ) => m.startsWith( tag ) ); } catch ( e ) { console.log( `fixture error: ${ e.message }` ); fail = []; }
			console.log( `${ fail.length ? 'caught  ' : 'MISSED  ' } ${ name }${ fail.length ? ' — ' + fail[ 0 ] : '' }` );
			if ( ! fail.length ) missed ++;

		}

		console.log( `NEGATIVE ${ MUTATIONS.length - missed }/${ MUTATIONS.length }` );
		code = missed ? 0 : 1;

	}

} finally {

	await browser.close();

}

process.exit( code );
