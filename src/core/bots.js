// bots.js — AI-driven characters running the same deterministic sim as the player.
import { createPlayerState, stepPlayer } from '../player.js';

/**
 * spawnBot(ctx, scene, env, { charId, x, z, behavior })
 * env: { sampleGround(x,z,fromY)->{y,box2|null}, bounds } — same shape the hub world exposes.
 * behavior(bot, dt, world) -> { dirX, dirZ, moving, jumpHeld, grabPressed }
 *   bot.state = sim state; bot.group = THREE.Group; world = optional game context you pass to stepAll.
 * Returns { state, group, input, step(dt, world), dispose() }
 * The OWNER steps the bot inside its own fixed-timestep loop (deterministic!).
 */
export async function spawnBot(ctx, scene, env, { charId, x = 0, z = 0, behavior } = {}) {
  const character = await ctx.characters.createInstance(charId || 'kid', {
    skinTone: ctx.save.settings.skinTone,
    lod: 'crowd',
    shadow: 'none',
  });
  const group = character.root;
  scene.add(group);
  const state = createPlayerState(x, z);
  const bot = {
    state, group, env,
    input: { dirX: 0, dirZ: 0, moving: false, jumpHeld: false, grabPressed: false },
    step(dt, world) {
      const b = behavior ? behavior(bot, dt, world) : null;
      if (b) Object.assign(bot.input, b);
      const wasGrounded = state.grounded;
      stepPlayer(state, bot.input, dt, env);
      if (state.jumpEvent) character.animator.signal('jump');
      if (!wasGrounded && state.grounded) character.animator.signal('land');
      group.position.set(state.pos.x, state.pos.y, state.pos.z);
      group.rotation.y = state.yaw;
      character.animator.update(dt, {
        speed: Math.hypot(state.vel.x, state.vel.z),
        grounded: state.grounded,
      });
    },
    dispose() {
      character.dispose();
      scene.remove(group);
    },
    character,
  };
  return bot;
}
