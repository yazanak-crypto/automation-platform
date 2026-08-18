// Guided-setup question sets. Importable as `@platform/brain/verticals` from
// CLIENT components: this entry point is pure data, types and pure functions,
// with NO database, queue or Node dependencies.
//
// Do not re-export anything from the parent `@platform/brain` barrel here. That
// barrel reaches `ingest` → `@platform/core` → bullmq → `child_process`, which
// cannot be bundled for the browser and fails the production build.

export * from "./types";
export * from "./sets";
export * from "./facts";
export { CORE_QUESTIONS } from "./core";
export { VERTICALS } from "./definitions";
