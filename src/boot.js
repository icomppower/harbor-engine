// A title's page entry: configure the map, build the UI and the App, run the loader, start.
//   import map from '../map.json'; import { boot } from 'harbor-engine';  boot( { map } );
// `games`: modules that call registerGame() before the App starts (map.json `games.available`).
import { configureMap } from './map/configure.js';

export async function boot( { map, onReady } = {} ) {

	configureMap( map );
	// the App and UI read the configured map, so they load after configureMap()
	const [ { App }, { UI }, { AppUI }, { TouchControls, wantsTouch } ] = await Promise.all( [
		import( './App.js' ), import( './ui/UI.js' ), import( './ui/AppUI.js' ), import( './ui/TouchControls.js' ) ] );
	const ui = new UI();
	const app = new App();
	window.__ui = ui;
	window.__app = app; // debugging / browser checks

	try {

		await app.init( ( p, text, until ) => ui.setLoading( p, text, until ) );
		app.ui = new AppUI( app, ui );
		if ( wantsTouch( app.qs ) ) app.touch = new TouchControls( app );
		ui.setLoading( 1, 'Ready' );
		await ui.hideLoader();
		app.start();
		ui.showStartOverlay( () => {

			document.documentElement.classList.add( 'is-started' );

			app.input.requestLock();
			if ( app.audio ) app.audio.resume();

		} );
		app.booted = true; // browser checks wait for this
		if ( onReady ) onReady( app, ui );

	} catch ( e ) {

		console.error( e );
		window.__bootError = e.message;
		ui.setLoadingError( 'Something went wrong: ' + e.message );

	}

	return app;

}
