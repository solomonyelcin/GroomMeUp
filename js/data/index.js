import { QA } from "./questions-a.js";
import { QB } from "./questions-b.js";
import { QC } from "./questions-c.js";
import { QD } from "./questions-d.js";
import { QE } from "./questions-e.js";

export { CATEGORIES } from "./mk.js";
import { MCQ as MCQ_BASE } from "./mcq.js";
import { MCQ_ROADMAP } from "./mcq-roadmap.js";
export const MCQ = [...MCQ_BASE, ...MCQ_ROADMAP];
export { JS_CHALLENGES } from "./coding-js.js";
export { SQL_CHALLENGES, SQL_SCHEMA, SCHEMA_HELP } from "./coding-sql.js";
export { CS_CHALLENGES } from "./coding-cs.js";
export { MARKET } from "./market.js";

export const QUESTIONS = [...QA, ...QB, ...QC, ...QD, ...QE];
