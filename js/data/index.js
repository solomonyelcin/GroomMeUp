import { QA } from "./questions-a.js";
import { QB } from "./questions-b.js";
import { QC } from "./questions-c.js";
import { QD } from "./questions-d.js";
import { QE } from "./questions-e.js";
import { QF } from "./questions-f.js";
import { QG } from "./questions-g.js";
import { QH } from "./questions-h.js";

export { CATEGORIES } from "./mk.js";
import { MCQ_A } from "./mcq-a.js";
import { MCQ_B } from "./mcq-b.js";
import { MCQ_C } from "./mcq-c.js";
import { MCQ_D } from "./mcq-d.js";
import { MCQ_E } from "./mcq-e.js";
import { MCQ_G } from "./mcq-g.js";
import { MCQ_H } from "./mcq-h.js";
import { JS_CHALLENGES as JS_BASE } from "./coding-js.js";
import { SQL_CHALLENGES as SQL_BASE, SQL_SCHEMA, SCHEMA_HELP } from "./coding-sql.js";
import { CS_CHALLENGES as CS_BASE } from "./coding-cs.js";
import { AC_JS, AC_SQL, AC_CS } from "./coding-accenture.js";
export const MCQ = [...MCQ_A, ...MCQ_B, ...MCQ_C, ...MCQ_D, ...MCQ_E, ...MCQ_G, ...MCQ_H];
// The Accenture practice problems are part of the normal coding lists (their topics start with "Accenture").
export const JS_CHALLENGES = [...JS_BASE, ...AC_JS];
export const SQL_CHALLENGES = [...SQL_BASE, ...AC_SQL];
export const CS_CHALLENGES = [...CS_BASE, ...AC_CS];
export { SQL_SCHEMA, SCHEMA_HELP };
export { MARKET } from "./market.js";

export const QUESTIONS = [...QA, ...QB, ...QC, ...QD, ...QE, ...QF, ...QG, ...QH];
