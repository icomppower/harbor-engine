// The title's vessel (map.json `vessel`): published dimensions of a real boat on the title's route, cited in
// the title's DECISIONS.md. Filled by configureMap() before the App is built.
export const FERRY = {
	name: '',
	length: 0, // m overall
	beam: 0, // m overall
	draft: 0, // m, hull bottom below the design waterline
	topSpeedKn: 0,
	hullWidth: 0, // m, each demihull at the waterline
	hullSpacing: 0, // m, demihull centreline to centreline
	deckY: 0, // m, main deck above the waterline
	mass: 0, // kg, loaded displacement
};

export const KNOT = 0.514444; // m/s
