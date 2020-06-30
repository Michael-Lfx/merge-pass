import { BuildInfo, Expr, Needs } from "./expressions/expr";
import { EffectLoop, UniformLocs } from "./mergepass";
import { WebGLProgramLoop } from "./webglprogramloop";

const FRAG_SET = `  gl_FragColor = texture2D(uSampler, gl_FragCoord.xy / uResolution);\n`;

const SCENE_SET = `uniform sampler2D uSceneSampler;\n`;

const TIME_SET = `uniform mediump float uTime;\n`;

const BOILERPLATE = `#ifdef GL_ES
precision mediump float;
#endif

uniform sampler2D uSampler;
uniform mediump vec2 uResolution;\n`;

export function bufferSamplerName(buf: number) {
  // texture 2 sampler has number 0 (0 and 1 are used for back buffer and scene)
  return `uBufferSampler${buf}`;
}

function bufferSamplerDeclaration(buf: number) {
  return `uniform sampler2D ${bufferSamplerName(buf)};`;
}

export class CodeBuilder {
  private calls: string[] = [];
  private externalFuncs: Set<string> = new Set();
  private uniformDeclarations: Set<string> = new Set();
  private counter = 0;
  /** flat array of expressions within loop for attaching uniforms */
  private exprs: Expr[];
  private baseLoop: EffectLoop;
  private totalNeeds: Needs;

  constructor(effectLoop: EffectLoop) {
    this.baseLoop = effectLoop;
    const buildInfo: BuildInfo = {
      uniformTypes: {},
      externalFuncs: new Set<string>(),
      exprs: [],
      needs: {
        centerSample: false,
        neighborSample: false,
        sceneBuffer: false,
        timeUniform: false,
        extraBuffers: new Set(),
      },
    };
    this.addEffectLoop(effectLoop, 1, buildInfo);
    // add all the types to uniform declarations from the `BuildInfo` instance
    for (const name in buildInfo.uniformTypes) {
      const typeName = buildInfo.uniformTypes[name];
      this.uniformDeclarations.add(`uniform mediump ${typeName} ${name};`);
    }
    //this.uniformNames = Object.keys(buildInfo.uniformTypes);
    // add all external functions from the `BuildInfo` instance
    buildInfo.externalFuncs.forEach((func) => this.externalFuncs.add(func));
    this.totalNeeds = buildInfo.needs;
    this.exprs = buildInfo.exprs;
  }

  private addEffectLoop(
    effectLoop: EffectLoop,
    indentLevel: number,
    buildInfo: BuildInfo,
    topLevel = true
  ) {
    const needsLoop = !topLevel && effectLoop.repeat.num > 1;
    if (needsLoop) {
      const iName = "i" + this.counter;
      indentLevel++;
      const forStart =
        "  ".repeat(indentLevel - 1) +
        `for (int ${iName} = 0; ${iName} < ${effectLoop.repeat.num}; ${iName}++) {`;
      this.calls.push(forStart);
    }

    for (const e of effectLoop.effects) {
      if (e instanceof Expr) {
        e.parse(buildInfo);
        this.calls.push(
          "  ".repeat(indentLevel) + "gl_FragColor = " + e.sourceCode + ";"
        );
        this.counter++;
      } else {
        this.addEffectLoop(e, indentLevel, buildInfo, false);
      }
    }
    if (needsLoop) {
      this.calls.push("  ".repeat(indentLevel - 1) + "}");
    }
  }

  compileProgram(
    gl: WebGL2RenderingContext,
    vShader: WebGLShader,
    uniformLocs: UniformLocs
  ) {
    // set up the fragment shader
    const fShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (fShader === null) {
      throw new Error("problem creating fragment shader");
    }
    const fullCode =
      BOILERPLATE +
      (this.totalNeeds.sceneBuffer ? SCENE_SET : "") +
      (this.totalNeeds.timeUniform ? TIME_SET : "") +
      Array.from(this.totalNeeds.extraBuffers)
        .map((n) => bufferSamplerDeclaration(n))
        .join("\n") +
      "\n" +
      [...this.uniformDeclarations].join("\n") +
      "\n" +
      [...this.externalFuncs].join("\n") +
      "\n" +
      "void main() {\n" +
      (this.totalNeeds.centerSample ? FRAG_SET : "") +
      this.calls.join("\n") +
      "\n}";
    gl.shaderSource(fShader, fullCode);
    gl.compileShader(fShader);
    // set up the program
    const program = gl.createProgram();
    if (program === null) {
      throw new Error("problem creating program");
    }
    gl.attachShader(program, vShader);
    gl.attachShader(program, fShader);
    const shaderLog = (name: string, shader: WebGLShader) => {
      const output = gl.getShaderInfoLog(shader);
      if (output) console.log(`${name} shader info log\n${output}`);
    };
    shaderLog("vertex", vShader);
    shaderLog("fragment", fShader);
    gl.linkProgram(program);
    // we need to use the program here so we can get uniform locations
    gl.useProgram(program);
    console.log(fullCode);
    // find all uniform locations and add them to the dictionary
    for (const expr of this.exprs) {
      for (const name in expr.uniformValChangeMap) {
        const location = gl.getUniformLocation(program, name);
        if (location === null) {
          throw new Error("couldn't find uniform " + name);
        }
        // TODO enforce unique names in the same program
        if (uniformLocs[name] === undefined) {
          uniformLocs[name] = { locs: [], counter: 0 };
        }
        // assign the name to the location
        uniformLocs[name].locs.push(location);
      }
    }
    // set the uniform resolution (every program has this uniform)
    const uResolution = gl.getUniformLocation(program, "uResolution");
    gl.uniform2f(uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);

    if (this.totalNeeds.sceneBuffer) {
      // TODO allow for texture options for scene texture
      const location = gl.getUniformLocation(program, "uSceneSampler");
      // put the scene buffer in texture 1 (0 is used for the backbuffer)
      gl.uniform1i(location, 1);
    }
    // set all sampler uniforms
    for (const b of this.totalNeeds.extraBuffers) {
      const location = gl.getUniformLocation(program, bufferSamplerName(b));
      // offset the texture location by 2 (0 and 1 are used for scene and original)
      gl.uniform1i(location, b + 2);
    }

    // get attribute
    const position = gl.getAttribLocation(program, "aPosition");
    // enable the attribute
    gl.enableVertexAttribArray(position);
    // points to the vertices in the last bound array buffer
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    return new WebGLProgramLoop(
      program,
      this.baseLoop.repeat,
      gl,
      this.totalNeeds,
      this.exprs
    );
  }
}
