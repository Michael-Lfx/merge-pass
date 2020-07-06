import { Float, Vec2, Vec4 } from "../exprtypes";
import { glslFuncs, replaceSampler } from "../glslfunctions";
import { ExprVec4, float, mut, n2e, tag } from "./expr";
import { fcolor } from "./fragcolorexpr";
import { pvec2, vec4 } from "./vecexprs";

export class GodRaysExpr extends ExprVec4 {
  col: Vec4;
  exposure: Float;
  decay: Float;
  density: Float;
  weight: Float;
  lightPos: Vec2;
  threshold?: Float;
  newColor?: Vec4;

  constructor(
    col: Vec4 = fcolor(),
    exposure: Float = mut(1.0),
    decay: Float = mut(1.0),
    density: Float = mut(1.0),
    weight: Float = mut(0.01),
    lightPos: Vec2 = mut(pvec2(0.5, 0.5)),
    samplerNum: number = 0,
    convertDepth?: { threshold: Float; newColor: Vec4 }
  ) {
    // TODO the metaprogramming here is not so good!
    // leaving off the function call section for now
    const sourceLists = tag`${col}, ${exposure}, ${decay}, ${density}, ${weight}, ${lightPos}, ${
      convertDepth !== undefined ? convertDepth.threshold : float(0)
    }, ${
      convertDepth !== undefined ? convertDepth.newColor : vec4(0, 0, 0, 0)
    })`;
    // append the _<num> onto the function name
    // also add _depth if this is a version of the function that uses depth buffer
    sourceLists.sections[0] += `godrays_${samplerNum}${
      convertDepth !== undefined ? "_depth" : ""
    }(`;
    super(sourceLists, [
      "uCol",
      "uExposure",
      "uDecay",
      "uDensity",
      "uWeight",
      "uLightPos",
      "uThreshold",
      "uNewColor",
    ]);
    this.col = col;
    this.exposure = exposure;
    this.decay = decay;
    this.density = density;
    this.weight = weight;
    this.lightPos = lightPos;
    this.threshold = convertDepth?.threshold;
    this.newColor = convertDepth?.newColor;
    let customGodRayFunc = replaceSampler(
      glslFuncs.godrays,
      /vec4\sgodrays/g,
      samplerNum,
      convertDepth === undefined ? undefined : "_depth"
    );
    if (convertDepth !== undefined) {
      // uncomment the line that does the conversion
      customGodRayFunc = customGodRayFunc.replace(/\/\/uncomment\s/g, "");
      this.externalFuncs.push(glslFuncs.depth2occlusion);
    }
    this.externalFuncs.push(customGodRayFunc);
    this.needs.extraBuffers = new Set([0]);
  }

  setColor(color: Vec4) {
    this.setUniform("uCol" + this.id, color);
    this.col = color;
  }

  setExposure(exposure: Float | number) {
    this.setUniform("uExposure" + this.id, exposure);
    this.exposure = n2e(exposure);
  }

  setDecay(decay: Float | number) {
    this.setUniform("uDecay" + this.id, decay);
    this.decay = n2e(decay);
  }

  setDensity(density: Float | number) {
    this.setUniform("uDensity" + this.id, density);
    this.density = n2e(density);
  }

  setWeight(weight: Float | number) {
    this.setUniform("uWeight" + this.id, weight);
    this.weight = n2e(weight);
  }

  setLightPos(lightPos: Vec2) {
    this.setUniform("uLightPos" + this.id, lightPos);
    this.lightPos = lightPos;
  }

  // these only matter when you're using a depth buffer and not an occlusion
  // buffer (although right now, you'll still be able to set them)

  setThreshold(threshold: Float | number) {
    this.setUniform("uThreshold" + this.id, threshold);
    this.threshold = n2e(threshold);
  }

  setNewcolor(newColor: Vec4) {
    this.setUniform("uNewColor" + this.id, newColor);
    this.newColor = newColor;
  }
}

/** options that define how the godrays will look */
interface GodraysOptions {
  color?: Vec4;
  /** multiplies final output */
  exposure?: Float | number;
  /** how much to decrease light for each sample */
  decay?: Float | number;
  /** how close samples are together */
  density?: Float | number;
  /** multiplies the original background colors */
  weight?: Float | number;
  /** where the rays eminate from */
  lightPos?: Vec2;
  /** where to sample from */
  samplerNum?: number;
  /** information for how to convert a depth buffer into an occlusion buffer */
  convertDepth?: {
    /** what depth is unoccluded (assumes `1 / distance` depth buffer) */
    threshold: Float | number;
    /** what the unoccluded color should be */
    newColor: Vec4;
  };
}

// sane godray defaults from https://github.com/Erkaman/glsl-godrays/blob/master/example/index.js
/**
 * create a godrays expression which requires an occlusion map
 * @param options object that defines godrays properties (has sane defaults)
 */
export function godrays(options: GodraysOptions = {}) {
  return new GodRaysExpr(
    options.color,
    n2e(options.exposure),
    n2e(options.decay),
    n2e(options.density),
    n2e(options.weight),
    options.lightPos,
    options.samplerNum,
    options.convertDepth === undefined
      ? undefined
      : {
          threshold: n2e(options.convertDepth.threshold),
          newColor: options.convertDepth.newColor,
        }
  );
}
