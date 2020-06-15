import { EffectLoop } from "../mergepass";
import { gauss5 } from "./blurexpr";
import { pvec2 } from "./vecexprs";
import { mut } from "./expr";

const baseLog = (x: number, y: number) => Math.log(y) / Math.log(x);

export class PowerBlur extends EffectLoop {
  private size: number;

  constructor(size: number) {
    const side = gauss5(mut(pvec2(size, 0)));
    const up = gauss5(mut(pvec2(0, size)));
    const reps = Math.ceil(baseLog(2, size));
    super([side, up], {
      num: reps + 1,
    });
    this.size = size;
    this.repeat.func = (i) => {
      const distance = this.size / 2 ** i;
      up.setDirection(pvec2(0, distance));
      side.setDirection(pvec2(distance, 0));
    };
  }

  setSize(size: number) {
    this.size = size;
    this.repeat.num = Math.ceil(baseLog(2, size));
  }
}

export function pblur(size: number) {
  return new PowerBlur(size);
}
