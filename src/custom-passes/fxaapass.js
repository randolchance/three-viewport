import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
import { FXAAShader } from "three/examples/jsm/shaders/FXAAShader";


class FxaaPass extends ShaderPass {
  constructor() {
    super( FXAAShader );
  }

  setSize( width, height ) {

    const { value } = this.material.uniforms['resolution'];
    value.x = 1 / width;
    value.y = 1 / height;

  }

}

export { FxaaPass }