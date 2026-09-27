import { BufferGeometry, BufferAttribute, Color, Group, Mesh } from '../engine/index.js';
import { Material } from '../engine/render/Material.js';
import { parseGLB } from '../engine/loaders/GLTF.js';

// Movable LOD models (v1.1): a Group of up to three LOD levels loaded from GLBs the title bakes (e.g. Blender
// exports of a vehicle), placed and oriented by the caller every frame. update( camera ) shows the level for the
// camera's distance to the model, scaled by the camera's field of view (a telephoto shot keeps the fine level).
// Materials come from the glTF PBR factors (colour, roughness, metalness), shared by key across models.
const _materials = new Map();
export function glbMaterial( m ) {

	const pbr = ( m && m.pbrMetallicRoughness ) || {};
	const key = JSON.stringify( [ pbr.baseColorFactor, pbr.roughnessFactor, pbr.metallicFactor, m && m.emissiveFactor ] );
	if ( ! _materials.has( key ) ) {

		const c = pbr.baseColorFactor || [ 0.8, 0.8, 0.8, 1 ], e = ( m && m.emissiveFactor ) || [ 0, 0, 0 ];
		_materials.set( key, new Material( { name: 'glb-' + ( m && m.name || 'default' ), color: new Color( c[ 0 ], c[ 1 ], c[ 2 ] ),
			emissive: new Color( e[ 0 ], e[ 1 ], e[ 2 ] ), roughness: pbr.roughnessFactor ?? 1, metalness: pbr.metallicFactor ?? 0 } ) );

	}

	return _materials.get( key );

}

// one GLB → a Group of meshes (node translation kept; every primitive its own mesh)
export function glbGroup( buffer, name = 'glb' ) {

	const glb = parseGLB( buffer );
	const g = new Group();
	g.name = name;
	let triangles = 0;
	for ( const n of glb.nodes ) {

		if ( n.mesh === undefined ) continue;
		for ( const p of glb.meshes[ n.mesh ] ) {

			const geo = new BufferGeometry();
			geo.setAttribute( 'position', new BufferAttribute( p.attributes.POSITION.array, 3 ) );
			if ( p.attributes.NORMAL ) geo.setAttribute( 'normal', new BufferAttribute( p.attributes.NORMAL.array, 3 ) );
			if ( p.indices ) geo.setIndex( new BufferAttribute( p.indices, 1 ) );
			triangles += ( p.indices ? p.indices.length : p.attributes.POSITION.array.length / 3 ) / 3;
			const mesh = new Mesh( geo, glbMaterial( glb.materials[ p.material ] ) );
			mesh.name = n.name;
			mesh.position.set( ...n.t );
			if ( n.r ) mesh.quaternion.set( ...n.r );
			if ( n.s ) mesh.scale.set( ...n.s );
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			g.add( mesh );

		}

	}

	g.userData.triangles = triangles;
	return g;

}

// files: GLB URLs from the finest level down; lodDistances: [ d0, d1 ] metres (level 0 nearer than d0, level 1 to d1,
// the last level beyond). refFov: the field of view (°) the distances are calibrated for.
export async function loadLodModel( files, { lodDistances = [ 800, 3000 ], refFov = 60, name = 'model' } = {} ) {

	const lods = await Promise.all( files.map( async ( url, i ) => {

		const r = await fetch( url );
		if ( ! r.ok ) throw new Error( `model: ${ url } HTTP ${ r.status }` );
		const g = glbGroup( await r.arrayBuffer(), `${ name }_lod${ i }` );
		g.visible = i === 0;
		return g;

	} ) );
	const model = new Group();
	model.name = name;
	model.userData = { lods, level: 0, lodDistances, refFov, lodBias: 1 };
	for ( const g of lods ) model.add( g );
	model.update = ( camera ) => {

		const u = model.userData, [ d0, d1 ] = u.lodDistances;
		const k = u.lodBias * ( camera.fov ? refFov / camera.fov : 1 ); // narrower lens: finer level at the same distance
		const d = camera.position.distanceTo( model.position );
		const level = Math.min( lods.length - 1, d < d0 * k ? 0 : d < d1 * k ? 1 : 2 );
		if ( level !== u.level ) { lods.forEach( ( g, i ) => { g.visible = i === level; } ); u.level = level; }

	};
	return model;

}
