// Reference single-core scores (Geekbench 6) behind the cb-* CPU throttle rates. Sources and dates: docs/1.3/PROFILES.md.
// rate = this machine / chromebook class chip, never below 1 (CDP can only slow down). Raw below ONLY_CI_BELOW means the VM is far
// too slow to stand in for the class, so the gate skips that profile here.
export const REF = {
  thisMachine: { chip: 'Xeon E5-2670 (Sandy Bridge-EP)', gb6: 575 },
  classes: {
    'cb-low': { chip: 'Kompanio 520 (slowest chip of the class)', gb6: 633 },
    'cb-mid': { chip: 'Kompanio 838 (slowest chip of the class)', gb6: 1003 },
    'cb-high': { chip: 'Core i3-N305', gb6: 1280 },
  },
};
export const ONLY_CI_BELOW = 0.5;

export function rates(ref = REF) {
  const out = {};
  for (const [name, c] of Object.entries(ref.classes)) {
    const raw = ref.thisMachine.gb6 / c.gb6;
    out[name] = { raw: +raw.toFixed(2), rate: Math.max(1, +raw.toFixed(2)), ciOnly: raw < ONLY_CI_BELOW };
  }
  return out;
}
