import {
  //  Main renderer
  WebGLRenderer,

  //  Cameras
  PerspectiveCamera,
  OrthographicCamera,
} from 'three';

import {
  CSS3DRenderer
} from "three/examples/jsm/renderers/CSS3DRenderer";

import { ViewportLayerScenemaster } from "./viewport-layer-scenemaster";
import { ViewportRenders } from "./viewport-renders";
import { getEnvironmentMap } from './viewport-layer-environment';

import { ASPECTS } from "../util/constants";
import { is } from '../util/utils';
import { waitForCallback } from '../util/async_utils';


const KNOWN_IMAGE_TYPES = [
  'png',
  'jpg', 'jpeg',
  'webp',
]

const DEFAULT_SHADOWMAP_PARAMS = {
  start_enabled: true,
  type: PCFSoftShadowMap,
}

const DEFAULT_RENDERER_PARAMS = {
  antialias: true,
  alpha: true,
  toneMapping: 1,
  toneMappingExposure: 1,
  outputEncoding: sRGBEncoding,
  shadow_map: { ...DEFAULT_SHADOWMAP_PARAMS },
}

const DEFAULT_PERSPECTIVE_CAMERA_PARAMS = {
  perspective: true,
  fov: 50,
  aspect: ASPECTS.widescreen,
  near: 1,
  far: 10000,
}

const DEFAULT_CAMERA_PARAMS = { ...DEFAULT_PERSPECTIVE_CAMERA_PARAMS }
const DEFAULT_OPTIONAL_PASSES = {
  'Fxaa': { is_final_pass: true, args: [] },
}

const DEFAULT_ENVIRONMENT_PARAMS = [ null, null ];

const DEFAULT_CLASS_NAME = 'viewport-layer';
const DEFAULT_HIDDEN_CLASS_NAME = `${ DEFAULT_CLASS_NAME }-hidden`;

const VIEWPORT_DEFAULT_PARAMS = {
  css: false,
  bloom: false,
  camera: DEFAULT_CAMERA_PARAMS,
  renderer: DEFAULT_RENDERER_PARAMS,
  optional_passes: DEFAULT_OPTIONAL_PASSES,
  environments: {
    default: DEFAULT_ENVIRONMENT_PARAMS,
  },
  class_name: DEFAULT_CLASS_NAME,
  hidden_class_name: DEFAULT_HIDDEN_CLASS_NAME,
  start_visible: true,
}


function make_camera( params ) {
  const { near, far } = params;
  switch (true) {

    case Boolean( params.orthographic ):

      const { left, right, top, bottom } = params;
      return new OrthographicCamera( left, right, top, bottom, near, far );

    case Boolean( params.perspective ):
    default:

      const { fov, aspect } = params;
      return new PerspectiveCamera( fov, aspect, near, far );
      
  }
}

function make_renderer( params, is_css=false ) {
  switch (Boolean( is_css )) {

    case true:

      return new CSS3DRenderer();

    case false:
    default:

      const renderer = new WebGLRenderer( params );

      const shadow_map_params = params.shadow_map;
      renderer.shadowMap.enabled = shadow_map_params.start_enabled;
      renderer.shadowMap.type = shadow_map_params.type;

      return renderer;

  }
}


const DEFAULT_RENDER_NAME = 'normal';

class ViewportLayer extends ThreeElement {

  static sanitise() {
    
    //  Sanitise bloom and css flags:
    //    For now don't let css renderer bloom
    this._is_bloom = this.is_bloomable && !this.is_css;

    //  Sanitise optional passes
    const optional_passes = this._optional_passes;
    this._optional_passes = is.object( optional_passes ) ? optional_passes : {};

  }

  static validateSize( size ) {
    switch (false) {
      case 'width' in size:
      case 'height' in size:
        throw new TypeError( `Improper sizing object passed. Given: ${ size }. Try a Vector2.` );
    }
  }

  static validateClassName( name ) {
    return this.validateName( name );   //  This could change
  }

  static sanitiseSnapshotType( type ) {
    if (!KNOWN_IMAGE_TYPES.contains( type )) {
      console.warn( `Invalid image type ${ type }! Defaulting to png.`);
      type = 'png';
    }

    if (type === 'jpg') type = 'jpeg';    //  Because of course they couldn't handle both for me

    return type;
  }

  constructor( name, viewport, params={} ) {
    super( name );

    // Fill in any missing params with defaults
    params = { ...VIEWPORT_DEFAULT_PARAMS, ...params }

    const { class_name, hidden_class_name } = params;
    ViewportLayer.validateClassName( class_name );
    ViewportLayer.validateClassName( hidden_class_name );

    this._is_viewport_layer = true;

    this._viewport = viewport;

    this._size = viewport.size;

    this._name = name;

    this._class_name = class_name;
    this._hidden_class_name = hidden_class_name;

    const is_css = Boolean( params.css );

    this._renderer = make_renderer( params.renderer, is_css );

    this.container.id = `viewport-layer-${ name }`;
    this.container.classList.add( class_name );

    const camera = params.camera;
    this._camera = is.something( camera ) && camera.isCamera ?
      camera :
      make_camera( camera );

    this._scenemaster = new ViewportLayerScenemaster( this );

    const [ default_environment_name, default_environment_path ] = params.environments.default;
    this._defaultEnvironmentName = default_environment_name;
    this._currentEnvironmentName = default_environment_name;
    this._environments = new Map();
    this.addEnvironment( default_environment_name, default_environment_path )
      .then( () => this.setEnvironment( default_environment_name ) );

    this._defaultRenderName = DEFAULT_RENDER_NAME;
    this._currentRenderName = DEFAULT_RENDER_NAME;

    this._optional_passes = params.optional_passes;

    this._renders = new Map([
      [ 'normal', new ViewportRenders.normal( name, this ) ],
    ]);
    
    const is_bloom = Boolean( params.bloom ) && !is_css;
    if (is_bloom) {
      this._renders.set( 'bloom', new ViewportRenders.bloom( name, this ) );
    }

    this._is_css = is_css;
    this._is_bloom = is_bloom;

    this._bloom_enabled = false;

    this.is_bottom_layer = false;

    this._visible = Boolean( params.start_visible );

    this._updateRenderSizes();
    this._updateVisibility();

    ViewportLayer.sanitise.call( this );

  }

  get isViewportLayer() {
    return this._is_viewport_layer;
  }

  get name() {
    return this._name;
  }

  get spoofing() {
    return this.viewport.spoofing;
  }

  get override_spoofing() {
    return this.viewport.override_spoofing;
  }

  get viewport() {
    return this._viewport;
  }

  get renders() {
    return this._renders;
  }

  get currentRenderName() {
    return this._currentRenderName;
  }

  get currentRender() {
    return this.renders.get( this.currentRenderName );
  }

  get environments() {
    return this._environments;
  }

  get currentEnvironmentName() {
    return this._currentEnvironmentName;
  }

  get currentEnvironment() {
    if (is.nothing( this.currentEnvironmentName )) return null;

    return this.environments.get( this.currentEnvironmentName );
  }

  get isEnvironmentSet() {
    return is.something( this.currentEnvironment );
  }

  get container() {
    return this.renderer.domElement;
  }

  get class_name() {
    return this._class_name;
  }

  get hidden_class_name() {
    return this._hidden_class_name;
  }

  get scenes() {
    return this.scenemaster.scenes;
  }

  get renderScenes() {
    return this.scenemaster.renderScenes;
  }

  get optionalPasses() {
    return this._optional_passes;
  }

  get is_css() {
    return this._is_css;
  }

  get is_bloomable() {
    return this._is_bloom;
  }

  get bloom_enabled() {
    return this._bloom_enabled;
  }

  set bloom_enabled( enabled ) {

    this._bloom_enabled = this.is_bloomable && Boolean( enabled );

    if (this.bloom_enabled) {

      this._currentRenderName = 'bloom';

    } else {

      this._currentRenderName = this._defaultRenderName;

    }

  }

  get camera() {
    return this._camera;
  }

  get renderer() {
    return this._renderer;
  }

  get element() {
    return this.renderer.domElement;
  }
  
  get scenemaster() {
    return this._scenemaster;
  }

  get size() {
    return this.viewport.size;
  }

  get aspect() {
    return this.viewport.aspect;
  }

  get width() {
    return this.size.width;
  }

  get height() {
    return this.size.height;
  }

  get visible() {
    return this._visible;
  }

  set visible( new_visibility ) {
    new_visibility = Boolean( new_visibility );
    if (this.visible === new_visibility) return;

    this._visible = new_visibility;

    this._updateVisibility();
    
  }

  _updateVisibility() {

    this.container.classList.toggle( this.hidden_class_name, !this._visible );

  }

  _updateEnvironment() {

    this.renderScenes.forEach( scene => scene.environment = this.currentEnvironment );

  }

  _updateRenderSizes() {

    this._renders.values( render => render.size = this.size );

    const { camera } = this;
    camera.aspect = this.aspect;
    camera.updateProjectionMatrix();

  }

  async addEnvironment( name, path ) {
    ViewportLayer.validateName( name );

    const environment_map = await getEnvironmentMap( this.renderer, path );
    this.environments.set( name, environment_map );

    return this;
  }

  setEnvironment( name ) {
    if (is.something( name )) {
      ViewportLayer.validateName( name );

      if (!this._environments.has( name )) name = null;

    }
    
    this._currentEnvironmentName = name;

    this._updateEnvironment();

    return this;
  }

  getOptionalPassData( is_final ) {
    is_final = Boolean( is_final );
    return Object.entries( this.optionalPasses )
      .reduce( ([ pass_type, { is_final_pass, args } ], pass_data ) => {
        if (is_final_pass === is_final) {
          pass_data.push( [ this.name, pass_type, ...args ] );
        }
        return pass_data;
      }, [] );
  }

  getPassData( is_final ) {
    return this.renderScenes
      .map( ({ name, scene, camera }) => [ name, 'Render', scene, camera ] )
      .concat( this.getOptionalPassData( Boolean( is_final ) ) );
  }

  //  This can be thread-blocking!!
  getSnapshotData() {

    if (this.is_css) {
      console.warn( `Not Implemented yet!` );
      return null;
    }

    return this.element.toDataURL();
  }

  async getSnapshotURL( type='png', quality=1 ) {

    if (this.is_css) {
      console.warn( `Not Implemented yet!` );
      return null;
    }

    quality = is.number( quality ) ? quality : 1;

    type = ViewportLayer.sanitiseSnapshotType( type );

    const blob = await waitForCallback( this.element.toBlob, `image/${ type }`, quality );
    return URL.createObjectURL( blob );
  }

  getSnapshotBitmap() {

    if (this.is_css) {
      console.warn( `Not Implemented yet!` );
      return null;
    }

    return createImageBitmap( this.element );
  }

  render( dt, force_spoof_override=false ) {
    if (this.spoofing && !this.override_spoofing && !force_spoof_override) return;

    const render = this.currentRender;

    this.dispatchEvent( { type: 'before-render', render, dt } );

    this.dispatchEvent( { type: 'render', render, dt } );
    render.render( dt );

    this.dispatchEvent( { type: 'after-render', render, dt } );

    return this;
  }

}


export { ViewportLayer }