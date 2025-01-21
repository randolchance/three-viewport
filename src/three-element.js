import { MathUtils, EventDispatcher } from "three";
import { is } from "../vendor/nice-things/utils";

const { generateUUID } = MathUtils;


class ThreeElement extends EventDispatcher {

  static validateName( name ) {
    if (!is.string( name )) {
      throw new TypeError( `Improper name passed! Given: ${ name }. Expected String.` );
    }
  }

  constructor( name ) {
    super();
    ThreeElement.validateName( name );

    this._name = name;

    this._uuid = generateUUID();
    this._type = 'ThreeElement';

    this._is_three_element = true;

  }

  get isThreeElement() {
    return this._is_three_element;
  }

  get name() {
    return this._name;
  }

  get uuid() {
    return this._uuid;
  }

  get type() {
    return this._type;
  }

}


export { ThreeElement }