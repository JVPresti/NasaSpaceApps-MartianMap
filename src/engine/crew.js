// Crew identities. Colours are the suggested player colours in public/marswalk/assets_astronaut/astronaut.json
// (player_color.suggested): they tint the accent bands of the Z-2 suit. EV1 is the player, EV2 the partner.
// Players 3 and 4 are there for online play (#52, #53).
export const PLAYER_COLORS = [[0.05, 0.25, 0.9], [1.0, 0.32, 0.03], [0.1, 0.8, 0.3], [0.85, 0.1, 0.75]];

export const CREW = [
  { id: 'EV1', color: PLAYER_COLORS[0] },
  { id: 'EV2', color: PLAYER_COLORS[1] },
];
