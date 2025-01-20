import { PMREMGenerator, UnsignedByteType } from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';


const envMaps = new Map();
const envMapPromises = new Map();

export async function getEnvironmentMap( renderer, path, onProgress=()=>{} ) {

  const { uuid } = renderer;

  const maps = envMaps.has( uuid ) ? envMaps.get( uuid ) : new Map();
  if (maps.has( path )) return maps.get( path );
  
  const envMap = await loadEnvironmentMap( renderer, path, onProgress )
  maps.set( path, envMap );

  return envMap;
}

function loadEnvironmentMap( renderer, path, onProgress=()=>{} ) {

  const { uuid } = renderer;

  const mapPromises = envMapPromises.has( uuid ) ?
    envMapPromises.get( uuid ) :
    new Map();
  if (mapPromises.has( path )) return mapPromises.get( path );

  const envMapPromise = loadEnvMapPromise( renderer, path, onProgress );
  mapPromises.set( path, envMapPromise );
  
  return envMapPromise;
}

//  Revisit with three.js update  -DC202427
function loadEnvMapPromise( renderer, path, onProgress ){
  return new Promise( resolve => {
    new RGBELoader()
      .setDataType( UnsignedByteType )
      .load(
        path,
        texture => {
          const pmremGenerator = new PMREMGenerator( renderer );
          pmremGenerator.compileEquirectangularShader();

          resolve( pmremGenerator.fromEquirectangular( texture ).texture );

          //  Lol do this after, async, why not?
          pmremGenerator.dispose();
        },
        onProgress,
        err => {
          console.error( err );
          resolve( null );
        }
      );
  })
}
