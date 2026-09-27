// Minimal PNG reader for gate screenshots: 8-bit RGB / RGBA, non-interlaced, all five row filters → RGBA8.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export function readPNG( path ) {

	const b = readFileSync( path );
	let off = 8, width = 0, height = 0, type = 0;
	const idat = [];
	while ( off < b.length ) {

		const len = b.readUInt32BE( off ), kind = b.toString( 'ascii', off + 4, off + 8 ), data = b.subarray( off + 8, off + 8 + len );
		if ( kind === 'IHDR' ) {

			width = data.readUInt32BE( 0 ); height = data.readUInt32BE( 4 ); type = data[ 9 ];
			if ( data[ 8 ] !== 8 || data[ 12 ] !== 0 || ( type !== 2 && type !== 6 ) ) throw new Error( `${ path }: only 8-bit RGB/RGBA non-interlaced PNGs` );

		} else if ( kind === 'IDAT' ) idat.push( data );
		else if ( kind === 'IEND' ) break;
		off += 12 + len;

	}

	const bpp = type === 6 ? 4 : 3, stride = width * bpp, raw = inflateSync( Buffer.concat( idat ) );
	const px = Buffer.alloc( stride * height ), out = new Uint8Array( width * height * 4 );
	for ( let y = 0; y < height; y ++ ) {

		const f = raw[ y * ( stride + 1 ) ], src = raw.subarray( y * ( stride + 1 ) + 1, ( y + 1 ) * ( stride + 1 ) ), row = y * stride;
		for ( let x = 0; x < stride; x ++ ) {

			const a = x >= bpp ? px[ row + x - bpp ] : 0, u = y ? px[ row - stride + x ] : 0, c = x >= bpp && y ? px[ row - stride + x - bpp ] : 0;
			let v = src[ x ];
			if ( f === 1 ) v += a; else if ( f === 2 ) v += u; else if ( f === 3 ) v += ( a + u ) >> 1;
			else if ( f === 4 ) { const p = a + u - c, pa = Math.abs( p - a ), pb = Math.abs( p - u ), pc = Math.abs( p - c ); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
			px[ row + x ] = v & 255;

		}

	}

	for ( let k = 0, n = width * height; k < n; k ++ ) {

		out[ k * 4 ] = px[ k * bpp ]; out[ k * 4 + 1 ] = px[ k * bpp + 1 ]; out[ k * 4 + 2 ] = px[ k * bpp + 2 ]; out[ k * 4 + 3 ] = bpp === 4 ? px[ k * bpp + 3 ] : 255;

	}

	return { width, height, data: out };

}
