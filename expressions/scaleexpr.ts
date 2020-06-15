import { Float, Vec } from "../exprtypes";
import { n2e, n2p, Operator, tag } from "./expr";

/** scalar multiplication of vector */
export class ScaleExpr<T extends Vec> extends Operator<T> {
  constructor(scalar: Float, vec: T) {
    super(vec, tag`(${scalar} * ${vec})`, ["uScalar", "uVec"]);
  }

  setScalar(scalar: number) {
    this.setUniform("uScalar" + this.id, n2p(scalar));
  }

  setVector(scalar: T) {
    this.setUniform("uVec" + this.id, scalar);
  }
}

export function scale<T extends Vec>(scalar: Float, vec: T) {
  return new ScaleExpr(n2e(scalar), vec);
}
