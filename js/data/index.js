import { QA } from "./questions-a.js";
import { QB } from "./questions-b.js";
import { QC } from "./questions-c.js";
import { QD } from "./questions-d.js";

export { CATEGORIES } from "./mk.js";
export { MCQ } from "./mcq.js";
export { JS_CHALLENGES } from "./coding-js.js";
export { SQL_CHALLENGES, SQL_SCHEMA, SCHEMA_HELP } from "./coding-sql.js";
export { CS_CHALLENGES } from "./coding-cs.js";
export { MARKET } from "./market.js";

export const QUESTIONS = [...QA, ...QB, ...QC, ...QD];
