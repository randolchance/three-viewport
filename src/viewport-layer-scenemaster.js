import { Scene, Fog } from "three";

import { is, Range } from "../vendor/nice-things/utils";
import { normalise } from "../vendor/nice-things/math2d";

import { ThreeElement } from "./three-element";


const FOG_PARAMS = {
  near: 100,
  far: 1000,
  colour: 0x161c5f,
  enabled: true,
}


class ViewportLayerScenemaster extends ThreeElement {

  static sanitiseIndex( index ) {
    return normalise( index, new Range( 0, this._stack.length ) );
  }

  static sanitiseScene( scene, must_be_in_scenemaster=true ) {
    if (must_be_in_scenemaster && !this._stack.includes( scene )) {
      throw new TypeError( `Invalid Scene! Given scene named '${ scene.name }', which is not a member of this scenemaster.` );
    }

    return scene.isScene ? scene : this.createScene();
  }

  static validateIndex( index ) {
    if (!is.number( index )) {
      throw new TypeError( `Improper index passed! Given: ${ index }. Expected Number.` );
    }
  }

  static validateScene( scene ) {
    if (!scene.isScene) {
      throw new TypeError( `Invalid Scene! Given: ${ scene }. Try a Scene instead.` );
    }
  }

  constructor( viewport_layer ) {
    const name = `${ viewport_layer.name }-scenemaster`;
    super( name );

    this._viewport_layer = viewport_layer;

    const scene = new Scene();
    scene.name = `${ name }-masterscene`;
    this._scene = scene;

    this._stack = [];

    const { colour, near, far, enabled } = FOG_PARAMS;
    this._fog = new Fog( colour, near, far );
    this._fog_enabled = Boolean( enabled );
    
  }

  get viewportLayer() {
    return this._viewport_layer;
  }

  get masterscene() {
    return this._scene;
  }

  get stack() {
    return this._stack;
  }

  get scenes() {
    return [ ...this._stack ];
  }

  get renderScenes() {
    const { viewportLayer, stack } = this;
    return stack.map( scene => {
      const camera = scene.getObjectByName( 'selected-camera' ) || viewportLayer.camera;
      const name = `${ viewportLayer.viewport.name }-layer-${ viewportLayer.uuid }-${ scene.uuid }-${ camera.uuid }`;
      return { name, scene, camera }
    } );
  }

  get fog_enabled() {
    return this._fog_enabled;
  }

  set fog_enabled( new_fog_enabled ) {

    this._fog_enabled = Boolean( new_fog_enabled );

    this._update_fog();

  }

  _update_fog() {

    this.masterscene.fog = this._fog_enabled ? this._fog : null;

  }

  _update_render_order() {

    this._stack.forEach( ( scene, index ) => scene.renderOrder = index );

  }

  createScene( name=null ) {
    const scene = new Scene();
    scene.name = name || `scene-${ scene.uuid }`;

    this.masterscene.attach( scene );

    return scene;
  }

  at( index ) {
    ViewportLayerScenemaster.validateIndex( index );
    index = ViewportLayerScenemaster.sanitiseIndex.call( this, index );

    return this._stack.at( index );
  }

  insertAt( scene, index=-1, ignore_invalid_scene=true ) {
    if (!ignore_invalid_scene) ViewportLayerScenemaster.validateScene( scene );
    ViewportLayerScenemaster.validateIndex( index );

    scene = ViewportLayerScenemaster.sanitiseScene.call( this, scene, false );
    index = ViewportLayerScenemaster.sanitiseIndex.call( this, index );

    this._stack.splice( index, 0, scene );

    this._update_render_order();

    return this;
  }

  has( scene ) {
    return this._stack.includes( scene );
  }

  indexOf( scene ) {
    ViewportLayerScenemaster.sanitiseScene.call( this, scene );

    return this._stack.indexOf( scene );
  }

  insert( scene, before_scene=null ) {
    
    let index = -1;
    if (is.something( before_scene )) {

      index = this.indexOf( before_scene );

    }

    return this.insertAt( scene, index );
  }

  getObjectScene({ uuid }) {
    return this._stack.find( scene => scene.getObjectById( uuid ) ) || null;
  }

}


export { ViewportLayerScenemaster }