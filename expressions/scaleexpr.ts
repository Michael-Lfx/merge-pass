import { Float, tag, Vec } from "../effect";
import { Expr } from "../effects/expression";

export class ScaleExpr extends Expr<Float> {
  scalar: Float;
  vec: Vec;

  constructor(scalar: Float, vec: Vec) {
    super(tag`(${scalar} * ${vec})`, ["uScalar", "uVec"]);
    this.scalar = scalar;
    this.vec = vec;
  }
}
