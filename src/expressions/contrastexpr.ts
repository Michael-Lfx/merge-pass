import { Float, Vec4 } from "../exprtypes";
import { glslFuncs } from "../glslfunctions";
import { ExprVec4, n2e, tag } from "./expr";
import { fcolor } from "./fragcolorexpr";

export class Contrast extends ExprVec4 {
  contrast: Float;

  constructor(contrast: Float, col: Vec4 = fcolor()) {
    super(tag`contrast(${contrast}, ${col})`, ["uVal", "uCol"]);
    this.contrast = contrast;
    this.externalFuncs = [glslFuncs.contrast];
  }

  setContrast(contrast: Float) {
    this.setUniform("uContrast" + this.id, contrast);
    this.contrast = contrast;
  }
}

/**
 * changes the contrast of a color
 * @param val float for how much to change the contrast by (should probably be
 * between -1 and 1)
 * @param col the color to increase the contrast of (defaults to current
 * fragment color)
 */
export function contrast(val: Float | number, col?: Vec4) {
  return new Contrast(n2e(val), col);
}
