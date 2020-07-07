import { CodeBuilder } from "./codebuilder";
import { ExprVec4 } from "./expressions/expr";
import { WebGLProgramLoop } from "./webglprogramloop";

/** repetitions and callback for loop */
export interface LoopInfo {
  /** amount of times to repeat the loop */
  num: number;
  /** optional callback for loop */
  func?: (arg0: number) => void;
}

export interface EffectLike {
  /**
   * gets the amount of times an effect will need to sample the original scene
   * @param mult multiplier of the loop
   */
  getSampleNum(mult: number): number;
}

/**
 * a class implementing this interface can be compiled into a
 * [[WebGLProgramLoop]] which can contain nested loops
 */
export interface Generable {
  /** recursively generate programs out of this effect and all nested effects */
  genPrograms(
    gl: WebGL2RenderingContext,
    vShader: WebGLShader,
    uniformLocs: UniformLocs
  ): WebGLProgramLoop;
}

/** effect loop, which can loop over other effects or effect loops */
export class EffectLoop implements EffectLike, Generable {
  effects: EffectElement[];
  repeat: LoopInfo;

  constructor(effects: EffectElement[], repeat: LoopInfo) {
    this.effects = effects;
    this.repeat = repeat;
  }

  getSampleNum(mult = 1, sliceStart = 0, sliceEnd = this.effects.length) {
    mult *= this.repeat.num;
    let acc = 0;
    const sliced = this.effects.slice(sliceStart, sliceEnd);
    for (const e of sliced) {
      acc += e.getSampleNum(mult);
    }
    return acc;
  }

  /**
   * @ignore
   * places effects into loops broken up by sampling effects
   */
  regroup() {
    let sampleCount = 0;
    /** number of samples in all previous */
    let prevSampleCount = 0;
    let prevEffects: EffectElement[] = [];
    const regroupedEffects: EffectElement[] = [];
    const breakOff = () => {
      if (prevEffects.length > 0) {
        // break off all previous effects into their own loop
        if (prevEffects.length === 1) {
          // this is to prevent wrapping in another effect loop
          regroupedEffects.push(prevEffects[0]);
        } else {
          regroupedEffects.push(new EffectLoop(prevEffects, { num: 1 }));
        }
        sampleCount -= prevSampleCount;
        prevEffects = [];
      }
    };
    for (const e of this.effects) {
      const sampleNum = e.getSampleNum();
      prevSampleCount = sampleCount;
      sampleCount += sampleNum;
      if (sampleCount > 0) breakOff();
      prevEffects.push(e);
    }
    // push on all the straggling effects after the grouping is done
    breakOff();
    return regroupedEffects;
  }

  genPrograms(
    gl: WebGL2RenderingContext,
    vShader: WebGLShader,
    uniformLocs: UniformLocs
  ): WebGLProgramLoop {
    // validate
    const fullSampleNum = this.getSampleNum() / this.repeat.num;
    const firstSampleNum = this.getSampleNum(undefined, 0, 1) / this.repeat.num;
    const restSampleNum = this.getSampleNum(undefined, 1) / this.repeat.num;
    if (fullSampleNum === 0 || (firstSampleNum === 1 && restSampleNum === 0)) {
      const codeBuilder = new CodeBuilder(this);
      const program = codeBuilder.compileProgram(gl, vShader, uniformLocs);
      return program;
    }
    // otherwise, regroup and try again on regrouped loops
    this.effects = this.regroup();
    // okay to have undefined needs here
    return new WebGLProgramLoop(
      this.effects.map((e) => e.genPrograms(gl, vShader, uniformLocs)),
      this.repeat,
      gl
    );
  }
}

/** creates an effect loop */
export function loop(effects: EffectElement[], rep: number) {
  return new EffectLoop(effects, { num: rep });
}

/**
 * type denoting that expressions that return a vec4 or loops can be considered
 * "effects"
 */
type EffectElement = ExprVec4 | EffectLoop;

export interface UniformLocs {
  [name: string]: { locs: WebGLUniformLocation[]; counter: number };
}

/** @ignore */
const V_SOURCE = `attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}\n`;

/** setting for min and max texture filtering modes */
type FilterMode = "linear" | "nearest";
/** setting for clamp */
type ClampMode = "clamp" | "wrap";

/** extra texture options for the merger */
interface MergerOptions {
  /** min filtering mode for the texture */
  minFilterMode?: FilterMode;
  /** max filtering mode for the texture */
  maxFilterMode?: FilterMode;
  /** how the edges of the texture should be handled */
  edgeMode?: ClampMode;
  /** textures or images to use as extra channels */
  channels?: (TexImageSource | WebGLTexture)[];
}

/** @ignore */
export interface TexInfo {
  front: WebGLTexture;
  back: WebGLTexture;
  scene: WebGLTexture | undefined;
  bufTextures: WebGLTexture[];
}

/** class that can merge effects */
export class Merger {
  /** the context to render to */
  readonly gl: WebGL2RenderingContext;
  /** the context to apply post-processing to */
  private source: TexImageSource | WebGLTexture;
  private tex: TexInfo;
  private framebuffer: WebGLFramebuffer;
  private uniformLocs: UniformLocs = {};
  private effectLoop: EffectLoop;
  private programLoop: WebGLProgramLoop;
  /** additional channels */
  private channels: (TexImageSource | WebGLTexture)[] = [];
  private options: MergerOptions | undefined;

  /**
   *
   * @param effects list of effects that define the final effect
   * @param source the source image or texture
   * @param gl the target rendering context
   * @param options additional options for the texture
   */
  constructor(
    effects: (ExprVec4 | EffectLoop)[] | EffectLoop,
    source: TexImageSource | WebGLTexture,
    gl: WebGL2RenderingContext,
    options?: MergerOptions
  ) {
    // set channels if provided with channels
    if (options?.channels !== undefined) this.channels = options?.channels;
    // wrap the given list of effects as a loop if need be
    if (!(effects instanceof EffectLoop)) {
      this.effectLoop = new EffectLoop(effects, { num: 1 });
    } else {
      this.effectLoop = effects;
    }
    if (this.effectLoop.effects.length === 0) {
      throw new Error("list of effects was empty");
    }
    this.source = source;
    this.gl = gl;
    this.options = options;

    // set the viewport
    this.gl.viewport(
      0,
      0,
      this.gl.drawingBufferWidth,
      this.gl.drawingBufferHeight
    );

    // set up the vertex buffer
    const vertexBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer);
    const vertexArray = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
    const triangles = new Float32Array(vertexArray);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, triangles, this.gl.STATIC_DRAW);

    // compile the simple vertex shader (2 big triangles)
    const vShader = this.gl.createShader(this.gl.VERTEX_SHADER);
    if (vShader === null) {
      throw new Error("problem creating the vertex shader");
    }

    this.gl.shaderSource(vShader, V_SOURCE);
    this.gl.compileShader(vShader);

    // make textures
    this.tex = {
      // make the front texture the source if we're given a texture instead of
      // an image
      back:
        source instanceof WebGLTexture
          ? source
          : makeTexture(this.gl, this.options),
      front: makeTexture(this.gl, this.options),
      scene: undefined,
      bufTextures: [],
    };

    // create the framebuffer
    const framebuffer = gl.createFramebuffer();
    if (framebuffer === null) {
      throw new Error("problem creating the framebuffer");
    }
    this.framebuffer = framebuffer;

    // generate the fragment shaders and programs
    this.programLoop = this.effectLoop.genPrograms(
      this.gl,
      vShader,
      this.uniformLocs
    );

    // find the final program
    let atBottom = false;

    let currProgramLoop = this.programLoop;
    while (!atBottom) {
      if (currProgramLoop.programElement instanceof WebGLProgram) {
        // we traveled right and hit a program, so it must be the last
        currProgramLoop.last = true;
        atBottom = true;
      } else {
        // set the current program loop to the last in the list
        currProgramLoop =
          currProgramLoop.programElement[
            currProgramLoop.programElement.length - 1
          ];
      }
    }
    if (this.programLoop.getTotalNeeds().sceneBuffer) {
      this.tex.scene = makeTexture(this.gl, this.options);
    }
    console.log(this.programLoop);

    // create x amount of empty textures based on buffers needed
    let channelsNeeded = 0;
    if (this.programLoop.totalNeeds?.extraBuffers !== undefined) {
      channelsNeeded =
        Math.max(...this.programLoop.totalNeeds.extraBuffers) + 1;
    }
    let channelsSupplied = this.channels.length;
    if (channelsNeeded > channelsSupplied) {
      throw new Error("not enough channels supplied for this effect");
    }

    for (let i = 0; i < this.channels.length; i++) {
      const texOrImage = this.channels[i];
      if (!(texOrImage instanceof WebGLTexture)) {
        // create a new texture; we will update this with the image source every draw
        const texture = makeTexture(this.gl, this.options);
        this.tex.bufTextures.push(texture);
      } else {
        // this is already a texture; the user will handle updating this
        this.tex.bufTextures.push(texOrImage);
      }
    }
  }

  /**
   * use the source and channels to draw effect to target context
   * @param timeVal number to set the time uniform to (supply this if you plan to
   * use [[time]])
   * @param mouseX the x position of the mouse (supply this if you plan to use
   * [[mouse]] or [[nmouse]])
   * @param mouseY the y position of the mouse (supply this if you plan to use
   * [[mouse]] or [[nmouse]])
   */
  draw(timeVal = 0, mouseX = 0, mouseY = 0) {
    // TODO double check if this is neccessary
    const originalFront = this.tex.front;
    const originalBack = this.tex.back;

    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex.back);
    sendTexture(this.gl, this.source);

    // bind the scene buffer
    if (
      this.programLoop.getTotalNeeds().sceneBuffer &&
      this.tex.scene !== undefined
    ) {
      this.gl.activeTexture(this.gl.TEXTURE1);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex.scene);
      sendTexture(this.gl, this.source);
    }

    // bind the additional buffers
    let counter = 0;
    for (const b of this.channels) {
      // TODO what's the limit on amount of textures?
      this.gl.activeTexture(this.gl.TEXTURE2 + counter);
      this.gl.bindTexture(this.gl.TEXTURE_2D, this.tex.bufTextures[counter]);
      sendTexture(this.gl, b);
      counter++;
    }

    // swap textures before beginning draw
    this.programLoop.draw(
      this.gl,
      this.tex,
      this.framebuffer,
      this.uniformLocs,
      this.programLoop.last,
      { timeVal: timeVal, mouseX: mouseX, mouseY: mouseY }
    );

    // make sure front and back are in same order
    this.tex.front = originalFront;
    this.tex.back = originalBack;
  }
}

/** creates a texture given a context and options */
export function makeTexture(
  gl: WebGL2RenderingContext,
  options?: MergerOptions
) {
  const texture = gl.createTexture();
  if (texture === null) {
    throw new Error("problem creating texture");
  }

  // flip the order of the pixels, or else it displays upside down
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

  // bind the texture after creating it
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    gl.drawingBufferWidth,
    gl.drawingBufferHeight,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    null
  );

  const filterMode = (f: undefined | FilterMode) =>
    f === undefined || f === "linear" ? gl.LINEAR : gl.NEAREST;

  // how to map texture element
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    filterMode(options?.minFilterMode)
  );
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MAG_FILTER,
    filterMode(options?.maxFilterMode)
  );

  if (options?.edgeMode !== "wrap") {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  return texture;
}

/** copies onto texture */
export function sendTexture(
  gl: WebGL2RenderingContext,
  src: TexImageSource | WebGLTexture
) {
  // if you are using textures instead of images, the user is responsible for
  // doing `texImage2D` and updating it with new info, so just return
  if (src instanceof WebGLTexture) return;
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
}
