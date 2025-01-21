import {
  //  Constants
  LinearFilter,
  sRGBEncoding,

  //  Materials
  MeshBasicMaterial,

  //  Other
  Layers,
} from "three";

import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer";

import { ViewportPasses } from "./viewport-passes";


const ALL_LAYERS_INDEX = 0;
const BLOOM_LAYER_INDEX = 1;

const BLOOM_LAYER = new Layers();
BLOOM_LAYER.set( BLOOM_LAYER_INDEX );


const NULLED_MATERIAL = new MeshBasicMaterial( { colorWrite: false } );
const NULLED_MATERIAL_SKINNED = new MeshBasicMaterial( { colorWrite: false, skinning: true } );


const DEFAULT_RENDER_TEXTURE_PARAMS = {
  minFilter: LinearFilter,
  magFilter: LinearFilter,
  encoding: sRGBEncoding,
  premultiplyAlpha: true,
}


class ViewportComposer extends EffectComposer {
  constructor( name, renderer, render_texture_params={} ) {
    super( renderer );

    this._name = name;

    render_texture_params = { ...DEFAULT_RENDER_TEXTURE_PARAMS, ...render_texture_params }

    Object.assign( this.ping, render_texture_params );
    Object.assign( this.pong, render_texture_params );
    
  }

  get name() {
    return this._name;
  }

  get ping() {
    return this.renderTarget1.texture;
  }

  get pong() {
    return this.renderTarget2.texture;
  }

  get target() {
    return this.pong;
  }

  onBeforeRender( dt, ...args ) {}

  onAfterRender( dt, ...args ) {}

  render( ...args ) {

    this.onBeforeRender( ...args );

    super.render( ...args );

    this.onAfterRender( ...args );

  }

}

const nulled_materials = new Map();

function null_bloomed_material( obj ) {

  const { material, uuid } = obj;
  if (nulled_materials.has( uuid )) return;

  nulled_materials.set( uuid, material );
  obj.material = obj.isSkinnedMesh ? NULLED_MATERIAL_SKINNED : NULLED_MATERIAL;

}

function restore_bloomed_material( obj ) {

  const { uuid } = obj;
  if (!nulled_materials.has( uuid )) return;

  obj.material = nulled_materials.get( uuid, material );
  nulled_materials.delete( uuid );

}

function null_bloomed( obj, restore=false ) {
  if (!obj.test( BLOOM_LAYER )) return;

  if (!restore) {
    null_bloomed_material( obj );
  } else {
    restore_bloomed_material( obj );
  }

}

function null_bloomed_mesh( obj ) {

  if (obj.isMesh) null_bloomed( obj );

}

function restore_bloomed_mesh( obj ) {

  if (obj.isMesh) null_bloomed( obj, true );

}

function make_passes_cache_key( name, type ) {
  return `${ name }-${ type }`;
}


class ViewportComposers {

  static cachedPasses = new Map();

  static createPass( name, specific_type, ...args ) {

    const key = make_passes_cache_key( name, specific_type );
    const { cachedPasses } = this;
    if (cachedPasses.has( key )) return cachedPasses.get( key );

    const pass = ViewportPasses.createPass( type, ...args );
    cachedPasses.set( key, pass );

    return pass;
  }

  static createRenderPasses( viewport_layer, is_final=true ) {
    return viewport_layer.getPassData( is_final )
      .map( pass_data => this.createPass( ...pass_data ) );
  }

  static _createComposer( name, renderer, passes, render_to_screen=true ) {

    const composer = new ViewportComposer( name, renderer );
    composer.renderToScreen = Boolean( render_to_screen );

    passes.forEach( pass => composer.addPass( pass ) );

    return composer;
  }

  static createSimpleComposer( composer_name, viewport_layer, is_final=true ) {
      
    const composer = this._createComposer(
      composer_name,
      viewport_layer.renderer,
      this.createRenderPasses( viewport_layer, is_final ),
      is_final
    );

    return composer;
  }

  static createInitialBloomComposer( composer_name, viewport_layer ) {

    //  1st pass: Create master scene rendering, render_pass
    const render_passes = this.createRenderPasses( viewport_layer, false );

    //  1st composer for 2nd pass: Create obfuscation_composer from a regular composer
    const obfuscation_composer = this.createSimpleComposer( `${ composer_name }-obfuscation`, viewport_layer, false );

    //  2nd pass: Create obfuscation_pass from obfuscation_composer
    const obfuscation_pass = this.createPass( composer_name, 'Obfuscation', obfuscation_composer.target );

    //  3rd pass: Create initial_bloom_pass from passed renderer size (might get updated on render?)
    const initial_bloom_pass = this.createPass( composer_name, 'InitialBloom', viewport_layer.viewport );

    const { renderer, scenemaster, camera } = viewport_layer;

    //  2nd (last) composer: Create initial_bloom_composer from render_pass, obfuscation_pass, and initial_bloom_pass
    const initial_bloom_composer = this._createComposer(
      composer_name,
      renderer,
      [ ...render_passes, obfuscation_pass, initial_bloom_pass ],
      false
    );
    initial_bloom_composer.swapBuffers();
    
    const { masterscene } = scenemaster;

    const original_masterscene_background = masterscene.background;
    const original_clear_alpha = renderer.getClearAlpha();

    initial_bloom_composer.onBeforeRender = dt => {

      masterscene.traverse( null_bloomed_mesh );
      masterscene.background = null;

      renderer.setClearAlpha(0);

      obfuscation_composer.render( dt );

      masterscene.traverse( restore_bloomed_mesh );

      camera.layers.set( BLOOM_LAYER_INDEX );
      //masterscene.background = new Color('black');  //  Do we still need this?? -DC20241012

    }

    initial_bloom_composer.onAfterRender = dt => {

      camera.layers.set( ALL_LAYERS_INDEX );

      masterscene.background = original_masterscene_background;

      //  Previously this might have been accomplished via the commented code above -DC20241013
      renderer.setClearAlpha( original_clear_alpha ); 

    }

    return initial_bloom_composer;
  }

  static createFinalBloomComposer( composer_name, viewport_layer, is_final=true ) {

    //  1st pass: Create master scene rendering
    const render_passes = this.createRenderPasses( viewport_layer, is_final );

    //  2nd pass: Create final_bloom_pass
    const final_bloom_pass = this.createPass( composer_name, 'FinalBloom' );
    
    //  Create the composer
    return this._createComposer(
      composer_name,
      viewport_layer.renderer,
      [ ...render_passes, final_bloom_pass ],
      is_final
    );
  }

}


export { ViewportComposers }