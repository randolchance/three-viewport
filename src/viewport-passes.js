import { ShaderMaterial } from "three";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass";
import { FxaaPass } from "../fxaapass";
import { is } from "../util/utils";

const DEFAULT_VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
  }
`;

const DEFAULT_BLOOM_PARAMS = {
  threshold: 0,
  strength: 2,
  radius: 0,
}


class ViewportPasses {

  static createPassByType( type, specific_type, ...args ) {
    const pass_subtypes = this.passesByType.get( type );
    if (is.nothing( pass_subtypes )) {
      throw new TypeError( `No known pass of type ${ type }!` );
    }

    const create_pass = pass_subtypes.get( specific_type );
    if (is.nothing( create_pass )) {
      throw new TypeError( `No known pass of specific type ${ specific_type }!` );
    }

    return create_pass( ...args );
  }

  //  The above static function should replace this one if specific types
  //    ever need to occur differently in various types
  static createPass( specific_type, ...args ) {

    const create_pass = this.passes.get( specific_type );
    if (is.nothing( create_pass )) {
      throw new TypeError( `No known pass of specific type ${ specific_type }!` );
    }

    return create_pass( ...args );
  }

  /** SPECIFIC PASSES **/
  /** Viewport Passes **/
  static createInitialBloomPass( viewport, params={}, enabled=true ) {
    //  This will be cleaned up with the three.js update,
    //  but for now it has to be this way for no good reason   -DC20241008
    const initial_bloom_pass = {
      ...new UnrealBloomPass( viewport.size, 0, 0, 0 ),
      ...DEFAULT_BLOOM_PARAMS,
      ...params,
    }
    initial_bloom_pass.enabled = Boolean( enabled );
    initial_bloom_pass.needsSwap = true;
    return initial_bloom_pass;
  }

  /** Layer Scene Passes **/
  static createRenderPass( scene, camera, enabled=true ) {
    const render_pass = new RenderPass( scene, camera );
    render_pass.enabled = Boolean( enabled );
    return render_pass;
  }

  /** Texture Passes **/
  static createObfuscationPass( texture, enabled=true ) {
    const shader_pass = new ShaderPass(
      new ShaderMaterial( {
        uniforms: {
          baseTexture: { value: null },
          obfuscationTexture: { value: texture }
        },
        vertexShader: DEFAULT_VERTEX_SHADER,
        fragmentShader: `
          uniform sampler2D baseTexture;
          uniform sampler2D obfuscationTexture;
          varying vec2 vUv;
          vec4 baseColor;
          void main() {
            baseColor = texture2D( baseTexture, vUv );
            gl_FragColor = baseColor * vec4(1.0 - texture2D( obfuscationTexture, vUv ).a);
          }
        `,
        defines: {}
      } ),
      "baseTexture",
    );
    shader_pass.enabled = Boolean( enabled );
    return shader_pass;
  }

  static createFinalBloomPass( texture, enabled=true ) {
    const final_bloom_pass = new ShaderPass(
      new ShaderMaterial( {
        uniforms: {
          baseTexture: { value: null },
          bloomTexture: { value: texture }
        },
        vertexShader: DEFAULT_VERTEX_SHADER,
        fragmentShader: `
          uniform sampler2D baseTexture;
          uniform sampler2D bloomTexture;
          varying vec2 vUv;
          vec4 baseColor;
          void main() {
            baseColor = texture2D( baseTexture, vUv );
            gl_FragColor = ( baseColor +  ( vec4( 1.0 ) - baseColor )  * texture2D( bloomTexture, vUv ) / vec4( 2.0 ) );
          }`,
        defines: {}
      } ),
      "baseTexture"
    );
    final_bloom_pass.enabled = Boolean( enabled );
    final_bloom_pass.needsSwap = true;
    return final_bloom_pass;
  }

  /** Algorithm Passes **/
  static createFxaaPass( enabled=true ) {
    const fxaa_pass = new FxaaPass();
    fxaa_pass.enabled = Boolean( enabled );
    return fxaa_pass;
  }

}


const VIEWPORT_PASS_TYPES = [
  [ 'InitialBloom', ViewportPasses.createInitialBloomPass ],
];

const VIEWPORT_LAYER_PASS_TYPES = [
  [ 'Render', ViewportPasses.createRenderPass ],
];

const TEXTURE_PASS_TYPES = [
  [ 'Obfuscation', ViewportPasses.createObfuscationPass ],
  [ 'FinalBloom', ViewportPasses.createFinalBloomPass ],
];

const ALGORITHM_PASS_TYPES = [
  [ 'Fxaa', ViewportPasses.createFxaaPass ],
];

const PASSES_BY_TYPE = [
  [ 'Viewport', new Map( VIEWPORT_PASS_TYPES ) ],
  [ 'ViewportLayer', new Map( VIEWPORT_LAYER_PASS_TYPES ) ],
  [ 'Texture', new Map( TEXTURE_PASS_TYPES ) ],
  [ 'Algorithm', new Map( ALGORITHM_PASS_TYPES ) ],
];

const PASSES = [
  ...VIEWPORT_PASS_TYPES,
  ...VIEWPORT_LAYER_PASS_TYPES,
  ...TEXTURE_PASS_TYPES,
  ...ALGORITHM_PASS_TYPES,
];

ViewportPasses.passesByType = new Map( PASSES_BY_TYPE );
ViewportPasses.passes = new Map( PASSES );


export { ViewportPasses }