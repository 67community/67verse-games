// bots.js — AI-driven characters running the same deterministic sim as the player.
import { createPlayerState, stepPlayer } from '../player.js';
import { createFriendsieRival, isFriendsieRival } from './friendsie-bot.js';

/**
 * spawnBot(ctx, scene, env, { charId, x, z, behavior })
 * env: { sampleGround(x,z,fromY)->{y,box2|null}, bounds } — same shape the hub world exposes.
 * behavior(bot, dt, world) -> { dirX, dirZ, moving, jumpHeld, grabPressed }
 *   bot.state = sim state; bot.group = THREE.Group; world = optional game context you pass to stepAll.
 * Returns { state, group, input, step(dt, world), dispose() }
 * The OWNER steps the bot inside its own fixed-timestep loop (deterministic!).
 */
export async function spawnBot(ctx, scene, env, { charId, x = 0, z = 0, behavior } = {}) {
  // A rival can be one of Oscar's fRiENDSiES rather than a roster character.
  // createFriendsieRival returns the same surface — root, animator.signal,
  // animator.update, dispose — so nothing below needs to know which it got,
  // and a model that fails to load falls back to the roster rather than
  // leaving a race with an invisible runner in it.
  const character = (isFriendsieRival(charId) ? await createFriendsieRival(charId) : null)
    || await ctx.characters.createInstance(isFriendsieRival(charId) ? 'kid' : (charId || 'kid'), {
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
