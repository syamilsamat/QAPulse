// Shared mutable state bridging the DOM scroll (GSAP ScrollTrigger) and the
// WebGL scene (react-three-fiber useFrame). Mutated every frame — kept outside
// React state on purpose so it never triggers re-renders.
export const scrollState = {
  /** 0 → 1 across the whole page */
  progress: 0,
  /** normalised pointer, -1 → 1 */
  mouseX: 0,
  mouseY: 0,
};
