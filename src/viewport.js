import {
  Clock,
  Vector2,
  Vector3,
} from "three";

import { is, makeUrlString, Range } from "../vendor/nice-things/utils"
import { Pointer } from "../vendor/nice-things/Pointer";
import { normalise } from "../vendor/nice-things/math2d";

import { ThreeElement } from "./three-element";
import { ViewportLayer } from "./viewport-layer";


const { abs } = Math;


let __previous_render_log_time = null;
let __previous_average_render_time = null;
let __render_debug_period = 5000;   //  ms
let __last_render_times = [];
let __last_render_times_max_length = 32;


const DEFAULT_CSS_PATH_FACTORY = ( path='./' ) => {
  const this_filename = location.pathname.split('/').pop();
  const css_filename = `${ this_filename.slice( 0, this_filename.lastIndexOf('.') ) }.css`;
  return `${ path }${ css_filename }`;
}

const DEFAULT_CONTAINER_FACTORY = (element_type='div') => document.createElement( element_type );

const DEFAULT_CONTAINER_ID_FACTORY = viewport => `viewport-${ viewport.uuid }`;
const DEFAULT_CONTAINER_CLASS_NAME = 'viewport';

const DEFAULT_LISTENER_PARAMS = {
  capture: true,
  once: false,
  passive: false,
}

const DEFAULT_EVENT_PARAMS = {
  stop: true,
  prevent_default: true,
}

const DEFAULT_VIEWPORT_PARAMS = {
  element: null,
  start_enabled: true,
  class_name: DEFAULT_CONTAINER_CLASS_NAME,
  listenerParams: DEFAULT_LISTENER_PARAMS,
  eventParams: DEFAULT_EVENT_PARAMS,
}

class Viewport extends ThreeElement {

  static __debug = false;

  static sanitiseIndex( index ) {
    return normalise( index, new Range( 0, this._layers.length ) );
  }

  static validateIndex( index ) {
    if (!is.number( index )) {
      throw new TypeError( `Improper index passed! Given: ${ index }. Expected Number.` );
    }
  }

  /**   Bindable (instance) validators   **/
  static isValidInstance( throw_error_if_unbound=false ) {
    const is_class_definition = Viewport === this;
    if (is_class_definition) {

      const msg = `Class definition instance function called!`;
      if (throw_error_if_unbound) {
        throw new Error( msg );
      } else {
        console.warn( msg );
      }

    }

    return !is_class_definition && this.isViewport;
  }

  static validateInstance() {
    this.isValidInstance( true );
  }

  /**   Bindable (instance) functions   **/
  static _loadCss() {
    if (Viewport.is_css_loaded) return;

    const href = DEFAULT_CSS_PATH_FACTORY();
    const link = {
      ...document.createElement('link'),
      href: href,
      type: 'text/css',
      rel: 'stylesheet',
      onload: () => {

        Viewport._is_css_loaded = true;

        this.dispatchEvent({ type: 'css-loaded', path: href, caller: this });

      },
    }

    document.querySelector('head').appendChild( link );

  }

  static _onPointerDown( event ) {
    if (!Viewport.isValidInstance.call( this )) return;

    this._handleEventMeta( event );

    const current_pointer = new Viewport.Pointer( event );
    this._currentPointerStart = current_pointer;
    this._currentPointer = current_pointer;

    this.pointer_down_enabled = false;
    this.pointer_move_enabled = true;
    this.pointer_up_enabled = true;

    this.dispatchEvent({ type: 'pointerdown', viewport: this, pointer: current_pointer });

  }

  static _onPointerMove( event ) {
    if (!Viewport.isValidInstance.call( this )) return;

    this._handleEventMeta( event );

    /** COOLDOWN? **/

    const current_pointer = new Viewport.Pointer( event );
    this._currentPointer = current_pointer;
    
    this.dispatchEvent({ type: 'pointermove', viewport: this, pointer: current_pointer });
    
  }

  static _onPointerUp( event ) {
    if (!Viewport.isValidInstance.call( this )) return;

    this._handleEventMeta( event );

    this._currentPointerStart = null;
    this._currentPointer = null;

    this._previousPointer = this._currentPointerEnd;

    const current_pointer = new Viewport.Pointer( event );
    this._currentPointerEnd = current_pointer;

    this.pointer_down_enabled = true;
    this.pointer_move_enabled = false;
    this.pointer_up_enabled = false;

    this.dispatchEvent({ type: 'pointerup', viewport: this, pointer: current_pointer });
    
  }

  static Pointer = Pointer;

  static _list = new Set();

  static _is_css_loaded = false;

  static get list() {
    return this._list;
  }

  static get is_css_loaded() {
    return this._is_css_loaded;
  }

  static *[Symbol.iterator]() {

    for (const viewport of this.list) yield viewport;

  }

  static _add( viewport ) {
    Viewport.isValidInstance.call( viewport );

    this.list.add( viewport );

  }


  constructor( name, size, params={} ) {
    super( name );
    ViewportLayer.validateSize( size );

    this._is_viewport = true;

    this._size = new Vector2( size.width, size.height );

    const {
      element, element_id, start_enabled, class_name, listenerParams, eventParams
    } = { ...DEFAULT_VIEWPORT_PARAMS, ...params };
    
    element = element instanceof HTMLElement ?
      element :
      DEFAULT_CONTAINER_FACTORY();

    element.id = element.id || element_id || DEFAULT_CONTAINER_ID_FACTORY( this );
    if (class_name) element.classList.add( class_name );

    this._container = element;

    this._enabled = Boolean( start_enabled );

    this._spoof_layer = DEFAULT_CONTAINER_FACTORY();
    this._spoof_layer.classList.add('viewport-layer');

    this._layers = [];
    this._primaryLayer = null;

    this._background_name = 'default';

    this._backdrop_layer = DEFAULT_CONTAINER_FACTORY();
    this._backdrop_layer.classList.add('viewport-layer');
    this._backdrop_layer.classList.add('viewport-backdrop-layer');

    this._listenerParams = listenerParams;
    this._eventParams = eventParams;

    this._spoofing = false;
    this._override_spoofing = false;

    this._currentPointerStart = null;
    this._currentPointer = null;
    this._currentPointerEnd = null;

    this._previousPointer = null;

    this._pointer_down_enabled = false;
    this._pointer_move_enabled = false;
    this._pointer_up_enabled = false;

    this.force_spoof_override = false;

    this._loadCss();

    this._bindEvents();

    Viewport._add( this );

    this._clock = new Clock(false);

    this.enabled = Boolean( start_enabled );

  }


  get isViewport() {
    return this._is_viewport;
  }

  get enabled() {
    return this._enabled;
  }

  set enabled( new_enabled ) {
    new_enabled = Boolean( new_enabled );

    this._enabled = new_enabled;
    
    this._pointer_down_enabled = new_enabled;

    this._start();

  }

  get listenerParams() {
    return this._listenerParams;
  }

  get eventParams() {
    return this._eventParams;
  }

  get background_name() {
    return this._background_name;
  }

  set background_name( new_background_name ) {
    Viewport.validateName( new_background_name );

    const old_background_name = this.background_name;
    if (old_background_name === new_background_name) return;
    
    this.container.classList.replace( old_background_name, new_background_name ); 

    this.dispatchEvent({ type: 'change-background', old: old_background_name, new: new_background_name });

    this._background_name = new_background_name;

  }

  get backdrop() {
    return this._backdrop_layer;
  }

  get spoofing() {
    return this._spoofing;
  }

  set spoofing( spoofing ) {
    spoofing = Boolean( spoofing );
    if (this._spoofing === spoofing) return;

    const new_spoof_layers = [];
    if (spoofing) {
      new_spoof_layers.concat( this.layers.map( layer => {
        const container = DEFAULT_CONTAINER_FACTORY();
        container.classList.add('viewport-spoof-layer');
        container.style.backgroundImage = makeUrlString( layer.getSnapshotURL() );
        return container;
      } ) );
    }

    this._spoof_layer.replaceChildren( new_spoof_layers );

    this._spoofing = spoofing;

    this.dispatchEvent({ type: 'spoofing', spoofing });

  }

  get override_spoofing() {
    return this._override_spoofing;
  }

  set override_spoofing( new_override_spoofing ) {

    this._override_spoofing = Boolean( new_override_spoofing );

  }

  get layers() {
    return this._layers;
  }

  *[Symbol.iterator]() {
    for (const layer of this.layers) yield layer;
  }

  get primaryLayer() {
    return this._primaryLayer;
  }

  set primaryLayer( layer ) {
    if (!this.layer.includes( layer )) {
      throw Error( `Invalid primary layer specified! This viewport does not have that layer.` );
    }

    this._primaryLayer = layer;

  }

  get primaryScenemaster() {
    return this.primaryLayer.scenemaster;
  }

  get primaryCamera() {
    return this.primaryLayer.camera;
  }

  get container() {
    return this._container;
  }

  get size() {
    return this._size.clone();
  }

  set size( new_size ) {
    ViewportLayer.validateSize( new_size );

    const old_size = this._size;
    this._size = new Vector2( new_size.width, new_size.height );

    this.dispatchEvent({ type: 'resize', viewport: this, old: old_size, new: new_size });

  }

  get width() {
    return this._size.width;
  }

  get height() {
    return this._size.height;
  }

  get aspect() {
    const { x, y } = this._size;
    return x / y;
  }

  get is_css_loaded() {
    return Viewport.is_css_loaded;
  }

  get previousPointer() {
    return this._previousPointer;
  }

  get currentPointerEnd() {
    return this._currentPointerEnd;
  }

  get currentPointer() {
    return this._currentPointer;
  }

  get currentPointerStart() {
    return this._currentPointerStart;
  }

  get pointer_down_enabled() {
    return this._pointer_down_enabled;
  }

  set pointer_down_enabled( new_pointer_down_enabled ) {

    this._pointer_down_enabled = Boolean( new_pointer_down_enabled );

    this._updatePointerDownEvents();

  }

  get pointer_move_enabled() {
    return this._pointer_move_enabled;
  }

  set pointer_move_enabled( new_pointer_move_enabled ) {

    this._pointer_move_enabled = Boolean( new_pointer_move_enabled );

    this._updatePointerMoveEvents();

  }

  get pointer_up_enabled() {
    return this._pointer_up_enabled;
  }

  set pointer_up_enabled( new_pointer_up_enabled ) {

    this._pointer_up_enabled = Boolean( new_pointer_up_enabled );

    this._updatePointerUpEvents();

  }

  get clock() {
    return this._clock;
  }

  _handleEventMeta( event ) {
    
    const { eventParams } = this;
    const { prevent_default, stop } = eventParams;
    if (prevent_default) event.preventDefault();
    if (stop) event.stopPropagation();

  }

  _loadCss() {

    Viewport._loadCss.bind( this );

  }

  _updateContainer() {

    this.container.replaceChildren( ...this.layers.map( ({ container }) => container ) );

    this.container.prepend( this.backdrop );

    this.container.append( this._spoof_layer );

  }

  _createLayer( name, index=-1, params={} ) {
    Viewport.validateName( name );
    Viewport.validateIndex( index );

    index = Viewport.sanitiseIndex.call( this, index );

    const layer_name = `${ this.name }-layer-${ name }`;
    const new_layer = new ViewportLayer( layer_name, this, params );

    if (index === 0) {

      this.getBottomLayer().is_bottom_layer = false;
      new_layer.is_bottom_layer = true;

    }

    const old_layering = [ ...this.layers ];

    this.layers.splice( index, 0, new_layer );

    if (is.null( this.primaryLayer )) this.primaryLayer = new_layer;

    this.addEventListener( 'resize', event => new_layer._updateRenderSizes() );

    this._updateContainer();

    this.dispatchEvent({ type: 'reordered', old: old_layering, new: [ ...this.layers ] });

    return new_layer;
  }

  _bindPointerEvents() {

    this._onPointerDown = Viewport._onPointerDown.bind( this );
    this._onPointerMove = Viewport._onPointerMove.bind( this );
    this._onPointerUp = Viewport._onPointerUp.bind( this );

  }

  _bindEvents() {
    
    this._bindPointerEvents();

    this.render = Viewport.render.bind( this );

  }

  _updateListeners( event_names, fn, enable=false ) {
    Viewport.validateInstance.call( this );

    const { container, listenerParams } = this;

    const add_or_remove = enable ?
      container.addEventListener :
      container.removeEventListener;

    event_names.forEach( event_name => add_or_remove( event_name, fn, listenerParams ) );

  }

  _updatePointerDownEvents() {

    const event_names = ['mousedown', 'touchstart'];
    this._updateListeners( this._onPointerDown, event_names, this._pointer_down_enabled );

  }

  _updatePointerMoveEvents() {

    const event_names = ['mousemove', 'touchmove'];
    this._updateListeners( this._onPointerMove, event_names, this._pointer_move_enabled );

  }

  _updatePointerUpEvents() {

    const event_names = ['mouseup', 'touchend'];
    this._updateListeners( this._onPointerUp, event_names, this._pointer_up_enabled );
    this._updateListeners( this._pointer_up_enabled, event_names, this._onPointerUp );

  }

  _start() {

    this.clock.start();

    this.animate();

  }

  getBottomLayer() {
    return this.layers[0] || null;
  }

  createNormalLayer( override_name, index ) {
    return this._createLayer( override_name || 'Normal', index );
  }

  createBloomableLayer( override_name, index ) {
    return this._createLayer(
      override_name || 'Bloom',
      index,
      { bloom: true },
    );
  }

  createCssLayer( override_name, index ) {
    return this._createLayer(
      override_name || 'Css',
      index,
      { css: true },
    );
  }

  toScreenPosition( object ) {

    const layer = this.layers
      .find( ({ scenemaster }) => scenemaster.getObjectScene( object ) );

    if (!layer) return null;

    const vector = new Vector3();
    object.getWorldPosition( vector );

    const { camera } = layer;
    vector.project( camera );

    return new Vector2( 1 + vector.x, 1 - vector.y ).multiply( this.size ).divideScalar(2);
  }

  render( dt ) {
    if (!this.enabled) return;

    const start_time = performance.now();

    this.layers.forEach( layer => layer.render( dt, this.force_spoof_override ) );

    if (!Viewport.__debug) return;

    const end_time = performance.now();

    const render_time = end_time - start_time;
    __last_render_times.push( render_time );
    if (__last_render_times.length > __last_render_times_max_length) {

      __last_render_times.shift();

    }

    if (abs( end_time - __previous_render_log_time ) < __render_debug_period) return;

    __previous_average_render_time = __last_render_times
      .reduce( ( sum, value ) => sum += value ) / __last_render_times.length;

    console.log(`Render times:\n
      \tlast render time: ${ render_time }\n
      \tclock dt: ${ dt }\n
      \taverage render time: ${ __previous_average_render_time }`
    );

    __previous_render_log_time = end_time;

  }

  animate() {

    const dt = this.clock.getDelta();
    this.render( dt );

    this.dispatchEvent({ type: 'update', dt, caller: this });

    requestAnimationFrame( this.animate );

  }


}


export default Viewport;