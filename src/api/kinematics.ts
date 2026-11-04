// src/api/kinematics.ts
// Idealized crank-slider kinematics. One source of truth: the renderer
// derives part transforms from these functions and the tests assert
// against them, so what is tested is what is drawn.
//
// Model: crank radius r, connecting rod length L, crank angle theta.
// Slider position along the crank axis: x = r*cos(t) + sqrt(L^2 - r^2*sin^2(t)).
// Rod angle from the axis: phi = asin(r*sin(t)/L). Idealized rigid
// parts, no friction, no dynamics. Requires L > r or the rod cannot
// complete a revolution.

export interface CrankSliderParams {
  crankRadius: number;
  rodLength: number;
}

/** Throws nothing; validity is a predicate so callers choose errors. */
export function validCrankSlider(p: CrankSliderParams): boolean {
  return (
    Number.isFinite(p.crankRadius) &&
    Number.isFinite(p.rodLength) &&
    p.crankRadius > 0 &&
    p.rodLength > p.crankRadius
  );
}

export function sliderPosition(theta: number, p: CrankSliderParams): number {
  const { crankRadius: r, rodLength: L } = p;
  const s = Math.sin(theta);
  return r * Math.cos(theta) + Math.sqrt(Math.max(L * L - r * r * s * s, 0));
}

export function rodAngle(theta: number, p: CrankSliderParams): number {
  return Math.asin(
    Math.max(-1, Math.min(1, (p.crankRadius * Math.sin(theta)) / p.rodLength))
  );
}

export function crankPin(theta: number, p: CrankSliderParams): { x: number; y: number } {
  return {
    x: p.crankRadius * Math.cos(theta),
    y: p.crankRadius * Math.sin(theta),
  };
}

/** Full pose at crank angle theta. Origin at the crank center; the
 * slider travels along +x. Rod connects pin to slider pin exactly. */
export function crankSliderPose(
  theta: number,
  p: CrankSliderParams
): {
  pin: { x: number; y: number };
  sliderX: number;
  rodAngle: number;
  rodMid: { x: number; y: number };
} {
  const pin = crankPin(theta, p);
  const sliderX = sliderPosition(theta, p);
  const phi = rodAngle(theta, p);
  return {
    pin,
    sliderX,
    rodAngle: phi,
    rodMid: { x: (pin.x + sliderX) / 2, y: pin.y / 2 },
  };
}

export interface PendulumParams {
  length: number;
  amplitude: number; // radians
  period: number; // seconds, 2*pi*sqrt(L/g) for the authored length
}

export function pendulumPeriod(length: number, g = 9.81): number {
  return 2 * Math.PI * Math.sqrt(length / g);
}

/** Small-angle pendulum angle at time t. Idealized: no friction, so
 * amplitude never decays; period is amplitude-independent in this
 * approximation (true within ~1% below 25 degrees). */
export function pendulumAngle(t: number, p: PendulumParams): number {
  return p.amplitude * Math.cos((2 * Math.PI * t) / p.period);
}
