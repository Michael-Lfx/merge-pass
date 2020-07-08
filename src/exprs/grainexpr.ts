import { Float } from "../exprtypes";
import { glslFuncs } from "../glslfunctions";
import { ExprVec4, n2e, tag } from "./expr";

/** grain expression */
export class GrainExpr extends ExprVec4 {
  grain: Float;

  constructor(grain: Float) {
    super(
      tag`vec4((1.0 - ${grain} * random(gl_FragCoord.xy)) * gl_FragColor.rgb, gl_FragColor.a);`,
      ["uGrain"]
    );
    this.grain = grain;
    this.externalFuncs = [glslFuncs.random];
    this.needs.centerSample = true;
  }

  setGrain(grain: Float | number) {
    this.setUniform("uGrain" + this.id, grain);
    this.grain = n2e(grain);
  }
}

/**
 * adds random grain
 * @param val how much the grain should impact the image (0 to 1 is reasonable)
 */
export function grain(val: Float | number) {
  return new GrainExpr(n2e(val));
}
