import { SourceLists, Expr, Needs } from "./exprs/expr";
import { Float } from "./exprtypes";
import { glslFuncs } from "./glslfunctions";

/** @ignore */
export function captureAndAppend(str: string, reg: RegExp, suffix: string) {
  const matches = str.match(reg);
  if (matches === null) throw new Error("no match in the given string");
  return str.replace(reg, matches[0] + suffix);
}

// TODO get rid of this
/** @ignore */
export function replaceSampler(
  fullString: string,
  funcRegExp: RegExp,
  samplerNum: number,
  extra?: string // TODO see if this is even useful anymore
) {
  return captureAndAppend(
    fullString.replace(/uSampler/g, "uBufferSampler" + samplerNum),
    funcRegExp,
    "_" + samplerNum + (extra === undefined ? "" : extra)
  );
}

function nameExtractor(sourceLists: SourceLists, extra: string) {
  const origFuncName = sourceLists.sections[0];
  const ending = origFuncName[origFuncName.length - 1] === ")" ? ")" : "";
  const newFuncName =
    origFuncName.substr(0, origFuncName.length - 1 - ~~(ending === ")")) +
    extra +
    "(" +
    ending;
  return { origFuncName, newFuncName, ending };
}

/** @ignore */
export function brandWithChannel(
  sourceLists: SourceLists,
  funcs: string[],
  needs: Needs,
  funcIndex: number,
  samplerNum?: number
) {
  if (samplerNum === undefined) return;
  // TODO make this generic
  /*
  const origFuncName = sourceLists.sections[0];
  const ending = origFuncName[origFuncName.length - 1] === ")" ? ")" : "";
  const newFuncName =
    origFuncName.substr(0, origFuncName.length - 1 - ~~(ending === ")")) +
    (samplerNum !== undefined ? "_" + samplerNum : "") +
    "(" +
    ending;
  */
  const { origFuncName, newFuncName, ending } = nameExtractor(
    sourceLists,
    samplerNum !== undefined ? "_" + samplerNum : ""
  );

  sourceLists.sections[0] = sourceLists.sections[0]
    .split(origFuncName)
    .join(newFuncName);
  // TODO get rid of this
  console.log(origFuncName);
  console.log(newFuncName);
  console.log(sourceLists);
  console.log(funcs[funcIndex]);
  funcs[funcIndex] = funcs[funcIndex]
    .split(origFuncName)
    .join(newFuncName)
    .split("uSampler")
    .join("uBufferSampler" + samplerNum);
  needs.extraBuffers = new Set([samplerNum]);
}

/** @ignore */
export function brandWithRegion(
  sourceLists: SourceLists,
  funcs: string[],
  space: Float[]
) {
  // TODO only do if it's a sampling expression
  const { origFuncName, newFuncName, ending } = nameExtractor(
    sourceLists,
    "_region"
  );
  const openFuncName = newFuncName.substr(
    0,
    newFuncName.length - ~~(ending === ")")
  );
  // TODO get rid of this
  console.log(origFuncName);
  console.log(newFuncName);
  const newFuncDeclaration =
    openFuncName +
    "float r_x_min, float r_y_min, float r_x_max, float r_y_max" +
    (ending === ")" ? ")" : ", ");

  console.log(newFuncDeclaration);
  const origTextureName = "texture2D(";
  const newTextureName =
    "texture2D_region(r_x_min, r_y_min, r_x_max, r_y_max, ";

  // replace name in the external function and `texture2D` and sampler
  // (assumes the sampling function is the first external function)
  funcs[0] = funcs[0]
    .split(origFuncName)
    .join(newFuncDeclaration)
    .split(origTextureName)
    .join(newTextureName);

  // shift the original name off the list
  sourceLists.sections.shift();
  // add the close paren if we're opening up a function with 0 args
  if (ending === ")") sourceLists.sections.unshift(")");
  // add commas (one less if it is a 0 arg function call)
  for (let i = 0; i < 4 - ~~(ending === ")"); i++) {
    sourceLists.sections.unshift(", ");
  }

  // add the new name to the beginning of the list
  sourceLists.sections.unshift(
    newFuncName.substr(0, newFuncName.length - ~~(ending === ")"))
  );
  // add values from region data
  sourceLists.values.unshift(...space);

  // put the texture access wrapper at the beginning
  funcs.unshift(glslFuncs.texture2D_region);
  // TODO get rid of this
  console.log(sourceLists);
}
