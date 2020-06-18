import { AllVals, Vec, Float } from "../exprtypes";
import { Operator as Op, wrapInValue, PrimitiveFloat } from "./expr";
import { typeStringToLength, checkLegalComponents } from "./getcompexpr";

type ArithOp = "" | "/" | "*" | "+" | "-";

// test with just setting
function getChangeFunc(
  typ: string,
  id: string,
  setter: AllVals,
  comps: string,
  op: ArithOp = ""
) {
  return `${typ} changecomp_${id}(${typ} col, ${setter.typeString()} setter) {
  col.${comps} ${op}= setter;
  return col;
}`;
}

// illegal when:

// duplicate components

// setter has different length than components

// components are illegal

function checkGetComponents(comps: string, setter: AllVals, vec: Vec) {
  // setter has different length than components
  if (comps.length !== typeStringToLength(setter.typeString())) {
    throw new Error("components length must be equal to the target float/vec");
  }
  // duplicate components
  if (duplicateComponents(comps)) {
    throw new Error("duplicate components not allowed on left side");
  }
  // legal components
  checkLegalComponents(comps, vec);
}

function duplicateComponents(comps: string) {
  return new Set(comps.split("")).size !== comps.length;
}

export class ChangeCompExpr<T extends Vec, U extends AllVals> extends Op<T> {
  constructor(vec: T, setter: U, comps: string, op?: ArithOp) {
    checkGetComponents(comps, setter, vec);
    /** random hash to name a custom function */
    const hash = Math.random().toString(36).substring(5);
    console.log(hash);
    super(
      vec,
      { sections: [`changecomp_${hash}(`, ", ", ")"], values: [vec, setter] },
      ["uOriginal", "uNew"]
    );
    this.externalFuncs = [
      getChangeFunc(vec.typeString(), hash, setter, comps, op),
    ];
  }

  setOriginal(vec: T) {
    this.setUniform("uOriginal" + this.id, vec);
  }

  setNew(setter: U | number) {
    this.setUniform("uNew" + this.id, wrapInValue(setter));
  }
}

export function changecomp<T extends Vec>(
  vec: T,
  setter: number,
  comps: string,
  op?: ArithOp
): ChangeCompExpr<T, PrimitiveFloat>;

export function changecomp<T extends Vec, U extends AllVals>(
  vec: T,
  setter: U,
  comps: string,
  op?: ArithOp
): ChangeCompExpr<T, U>;

export function changecomp(vec: any, setter: any, comps: string, op?: ArithOp) {
  return new ChangeCompExpr(vec, wrapInValue(setter), comps, op);
}
