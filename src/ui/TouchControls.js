// On-screen controls for touch devices, feeding the same Input state as the keyboard and mouse:
// a left-thumb joystick drives W / A / S / D (walk, or throttle and steering at the ferry helm), a drag anywhere
// else looks around, and buttons press keys (E helm / step ashore, jump, G autopilot, V camera, T time, F free
// camera, N next waypoint). Shown when the primary pointer is coarse, or with ?touch. Gate E3 covers the look.
const DEAD = 0.3; // joystick dead zone (fraction of its radius)

// controls keep their own fingers: buttons, the stick, sliders and menus, open panels and dialogs, signs
const CONTROLS = 'button, a, input, select, textarea, label, [role="slider"], [role="listbox"], [role="dialog"], .tc-stick, .tc-btn, .tw-panel, .tw-help, .tw-menu, .tw-start, .tw-sign';
const isControl = ( el ) => !! ( el && el.closest && el.closest( CONTROLS ) );

export function wantsTouch( qs ) {

	if ( qs.has( 'touch' ) ) return true;
	return typeof matchMedia === 'function' && matchMedia( '(pointer: coarse)' ).matches;

}

export class TouchControls {

	constructor( app ) {

		this.app = app;
		this.input = app.input;
		document.documentElement.classList.add( 'is-touch' );
		const root = this.root = document.createElement( 'div' );
		root.className = 'tc';
		root.innerHTML = `
			<div class="tc-stick" aria-label="Move"><div class="tc-knob"></div></div>
			<div class="tc-pad">
				<button type="button" class="tc-btn tc-btn-main" data-code="KeyE" aria-label="Interact: ferry helm, step ashore">E</button>
				<button type="button" class="tc-btn" data-code="KeyG" aria-label="Ferry autopilot">G<small>auto</small></button>
				<button type="button" class="tc-btn" data-code="Space" aria-label="Jump">&#x2191;<small>jump</small></button>
				<button type="button" class="tc-btn" data-code="KeyV" aria-label="Boat camera">V<small>cam</small></button>
			</div>
			<div class="tc-top">
				<button type="button" class="tc-btn tc-btn-small" data-code="KeyT" aria-label="Run or pause time">T<small>time</small></button>
				<button type="button" class="tc-btn tc-btn-small" data-code="KeyF" aria-label="Free camera">F<small>fly</small></button>
				<button type="button" class="tc-btn tc-btn-small" data-code="KeyN" aria-label="Next waypoint">N<small>go</small></button>
			</div>`;
		document.body.append( root );

		this.stick = root.querySelector( '.tc-stick' );
		this.knob = root.querySelector( '.tc-knob' );
		this.stickId = null; // identifiers of the fingers on the stick / looking around
		this.lookId = null;
		this.last = { x: 0, y: 0 };
		this.buttonTouches = new Map(); // touch identifier -> key code held by a button

		// Touch events (not pointer events): every mobile browser delivers them with coordinates, and each finger
		// keeps its identifier, so the stick, a button and a look drag work at the same time.
		const opts = { passive: false };
		this.stick.addEventListener( 'touchstart', ( e ) => {

			e.preventDefault();
			const t = e.changedTouches[ 0 ];
			this.stickId = t.identifier;
			this.stickAt( t );

		}, opts );
		for ( const b of root.querySelectorAll( '.tc-btn' ) ) {

			const code = b.dataset.code;
			b.addEventListener( 'touchstart', ( e ) => {

				e.preventDefault();
				for ( const t of e.changedTouches ) this.buttonTouches.set( t.identifier, [ code, b ] );
				b.classList.add( 'is-down' );
				if ( ! this.input.keys.has( code ) ) this.input.pressed.add( code );
				this.input.keys.add( code );

			}, opts );

		}

		// look: any finger that does not land on a control — on the view, or on the glass of a HUD panel next to it
		// (a panel's background is not a control, and a finger starting beside one must still turn the camera)
		const view = app.engine.domElement;
		view.style.touchAction = 'none';
		window.addEventListener( 'touchstart', ( e ) => {

			this.forgetLost( e );
			if ( this.lookId !== null ) return;
			const t = [ ...e.changedTouches ].find( ( q ) => ! isControl( q.target ) && ! this.buttonTouches.has( q.identifier ) && q.identifier !== this.stickId );
			if ( ! t ) return;
			if ( e.cancelable ) e.preventDefault();
			this.lookId = t.identifier;
			this.last = { x: t.clientX, y: t.clientY };

		}, opts );
		window.addEventListener( 'touchmove', ( e ) => { this.forgetLost( e ); this.move( e ); }, opts );
		const end = ( e ) => this.end( e );
		window.addEventListener( 'touchend', end );
		window.addEventListener( 'touchcancel', end );

	}

	// A touchend can be lost (a system gesture, a notification, the finger leaving the page): a tracked finger
	// that is no longer on the screen is released, or it would hold the look / stick / a button forever.
	forgetLost( e ) {

		const live = new Set( [ ...e.touches ].map( ( t ) => t.identifier ) );
		const lost = [];
		if ( this.lookId !== null && ! live.has( this.lookId ) ) lost.push( this.lookId );
		if ( this.stickId !== null && ! live.has( this.stickId ) ) lost.push( this.stickId );
		for ( const id of this.buttonTouches.keys() ) if ( ! live.has( id ) ) lost.push( id );
		if ( lost.length ) this.end( { changedTouches: lost.map( ( identifier ) => ( { identifier } ) ) } );

	}

	stickAt( t ) {

		const r = this.stick.getBoundingClientRect(), R = r.width / 2;
		let x = ( t.clientX - r.left - R ) / R, y = ( t.clientY - r.top - R ) / R;
		const l = Math.hypot( x, y );
		if ( l > 1 ) { x /= l; y /= l; }
		this.knob.style.transform = `translate(${ x * R * 0.55 }px, ${ y * R * 0.55 }px)`;
		const set = ( code, on ) => { if ( on ) this.input.keys.add( code ); else this.input.keys.delete( code ); };
		set( 'KeyW', y < - DEAD );
		set( 'KeyS', y > DEAD );
		set( 'KeyA', x < - DEAD );
		set( 'KeyD', x > DEAD );
		// a full push forward is a sprint (on foot) / boost (at the helm)
		set( 'ShiftLeft', Math.hypot( x, y ) > 0.95 && y < - 0.6 );

	}

	move( e ) {

		for ( const t of e.changedTouches ) {

			if ( t.identifier === this.stickId ) { e.preventDefault(); this.stickAt( t ); }
			else if ( t.identifier === this.lookId ) {

				e.preventDefault();
				this.input.look.x += ( t.clientX - this.last.x ) * 1.5;
				this.input.look.y += ( t.clientY - this.last.y ) * 1.5;
				this.last = { x: t.clientX, y: t.clientY };

			}

		}

	}

	end( e ) {

		for ( const t of e.changedTouches ) {

			if ( t.identifier === this.stickId ) {

				this.stickId = null;
				this.knob.style.transform = '';
				for ( const c of [ 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft' ] ) this.input.keys.delete( c );

			}

			if ( t.identifier === this.lookId ) this.lookId = null;
			const held = this.buttonTouches.get( t.identifier );
			if ( held ) {

				this.buttonTouches.delete( t.identifier );
				const [ code, b ] = held;
				if ( ! [ ...this.buttonTouches.values() ].some( ( [ c ] ) => c === code ) ) { this.input.keys.delete( code ); b.classList.remove( 'is-down' ); }

			}

		}

	}

}
