import { ViewportComposers } from "./viewport-composers";

const DEFAULT_COMPOSER_NAME = 'master';

class Render {

  static default_composer_name = DEFAULT_COMPOSER_NAME;

  constructor( name, viewport_layer ) {

    this._name = name;

    this._layer = viewport_layer;

    const { renderer, scenemaster, camera, optionalPasses } = viewport_layer;
    this._renderer = renderer;
    this._scenemaster = scenemaster;
    this._camera = camera;

    this._optional_passes = optionalPasses;

    this._composers = [];

  }

  get name() {
    return this._name;
  }

  get composers() {
    return this._composers;
  }

  get layer() {
    return this._layer;
  }

  get size() {
    return this.layer.size;
  }

  set size( new_size ) {

    this.composers.forEach( composer => composer.setSize( new_size.width, new_size.height ) );

  }

  get width() {
    return this.size.width;
  }

  get height() {
    return this.size.height;
  }

  render( dt ) {

    this.composers.forEach( composer => composer.render( dt ) );

  }

}


class NormalRender extends Render {
  constructor( name, viewport_layer ) {
    super( name, viewport_layer );

    const normal_composer = ViewportComposers.createSimpleComposer( name, viewport_layer );
    this._composers.push( normal_composer );

  }
}


class BloomRender extends Render {
  constructor( name, viewport_layer ) {
    super( name, viewport_layer );

    const initial_bloom_composer = ViewportComposers.createInitialBloomComposer( name, viewport_layer );
    const final_bloom_composer = ViewportComposers.createFinalBloomComposer( name, viewport_layer );
    this._composers.push( initial_bloom_composer, final_bloom_composer );

  }
}

class ViewportRenders {
  static normal = NormalRender;
  static bloom = BloomRender;
}


export { ViewportRenders }