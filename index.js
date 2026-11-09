/**
 * caopazi-marks — host half.
 *
 * The feature is entirely client-side: it reads the conversation DOM anchors
 * (`data-chat-flow-key` / `data-chat-turn`), the `turnOutline` projection for a
 * turn's load-through seq, and the client `sessions` service for history paging.
 * No host service, route, or storage is involved, so this half only satisfies the
 * bundle entry contract.
 */
export function apply() {}
