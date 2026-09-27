// Vite plugin for a title: serves the engine's shared runtime assets (assets/: cloud noise, audio) next to the
// title's own public/ in dev, and copies them into the build. The title's public/ wins on a name clash.
//   import { harborEngine } from 'harbor-engine/vite';  export default defineConfig( { plugins: [ harborEngine() ] } );
import { cpSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ENGINE_ROOT = dirname( fileURLToPath( import.meta.url ) );
export const ENGINE_ASSETS = join( ENGINE_ROOT, 'assets' );
const TYPES = { '.bin': 'application/octet-stream', '.ogg': 'audio/ogg', '.json': 'application/json', '.md': 'text/markdown' };

export function harborEngine() {

	let outDir = 'dist', root = process.cwd();
	return {
		name: 'harbor-engine',
		config: () => ( {
			optimizeDeps: { exclude: [ 'harbor-engine' ] },
			server: { fs: { allow: [ ENGINE_ROOT, process.cwd() ] } },
		} ),
		configResolved( c ) { outDir = c.build.outDir; root = c.root; },
		configureServer( server ) {

			server.middlewares.use( ( req, res, next ) => {

				const url = decodeURIComponent( ( req.url || '' ).split( '?' )[ 0 ] ).replace( /^\/+/, '' );
				const title = join( root, 'public', url ), file = join( ENGINE_ASSETS, url );
				if ( ! url || url.includes( '..' ) || existsSync( title ) || ! existsSync( file ) || ! statSync( file ).isFile() ) return next();
				res.setHeader( 'Content-Type', TYPES[ extname( file ) ] || 'application/octet-stream' );
				res.end( readFileSync( file ) );

			} );

		},
		closeBundle() {

			const dest = join( root, outDir );
			if ( existsSync( dest ) ) cpSync( ENGINE_ASSETS, dest, { recursive: true, force: false, errorOnExist: false } );

		},
	};

}
