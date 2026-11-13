// Kept for the screens that only need a plain block list (the profile). The articles and projects
// use the full Studio (see ../studio/).

import { createBlocksEditor } from '../studio/blocks-editor.mjs';

/** @returns {HTMLElement} */
export function blocksEditor(options) {
  return createBlocksEditor(options).el;
}
