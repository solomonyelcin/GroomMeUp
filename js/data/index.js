import { QA } from "./questions-a.js";
import { QB } from "./questions-b.js";
import { QC } from "./questions-c.js";
import { QD } from "./questions-d.js";
import { QE } from "./questions-e.js";
import { QF } from "./questions-f.js";

export { CATEGORIES } from "./mk.js";
import { MCQ_A } from "./mcq-a.js";
import { MCQ_B } from "./mcq-b.js";
import { MCQ_C } from "./mcq-c.js";
import { MCQ_D } from "./mcq-d.js";
import { MCQ_E } from "./mcq-e.js";
export const MCQ = [...MCQ_A, ...MCQ_B, ...MCQ_C, ...MCQ_D, ...MCQ_E];
export { JS_CHALLENGES } from "./coding-js.js";
export { SQL_CHALLENGES, SQL_SCHEMA, SCHEMA_HELP } from "./coding-sql.js";
export { CS_CHALLENGES } from "./coding-cs.js";
export { MARKET } from "./market.js";

export const QUESTIONS = [...QA, ...QB, ...QC, ...QD, ...QE, ...QF];
