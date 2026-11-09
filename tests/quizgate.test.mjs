// Quiz gate: a question reaches a quiz only with clear options and one marked correct answer.
import { mcqProblem, questionLike } from "../js/import/quality.js";
import { makeMcqFor, prepPlain } from "../js/import/build.js";
let fails = 0; const check = (c, m) => { if (!c) { fails++; console.log("FAIL:", m); } else console.log("ok  :", m); };
const good = { q: "Which lifetime creates one instance per HTTP request?", o: ["Singleton", "Scoped", "Transient", "Static"], a: 1 };
check(mcqProblem(good) === "", "a clean MCQ passes");
check(mcqProblem({ ...good, a: undefined }) !== "", "no marked answer is rejected");
check(mcqProblem({ ...good, a: 9 }) !== "", "answer index outside the options is rejected");
check(mcqProblem({ ...good, o: ["Scoped"] }) !== "", "a single option is rejected");
check(mcqProblem({ ...good, o: ["Scoped", "Scoped", "Transient"] }) !== "", "duplicate options are rejected");
check(mcqProblem({ ...good, o: ["Scoped", "What are the types of Hosting in ASP.NET Core?", "Transient"] }) !== "", "an option that is itself a question is rejected");
check(mcqProblem({ q: "What is Dependency Injection?", o: ["These two functions belong to the HttpContext object.", "Yes, you can post and access a view state in other applications.", "What are the types of Hosting in ASP.NET Core?", "How to implement Dependency injection in .NET Core?"], a: 3 }) !== "", "the reported bad item is rejected");
check(mcqProblem({ ...good, o: ["Singleton", good.q, "Transient"] }) !== "", "an option repeating the question is rejected");
check(questionLike("How to implement Dependency injection in .NET Core?") && !questionLike("Scoped services live for one request."), "question-like text is told apart from answers");
// generated MCQs never use a question as an option or as the right answer
const plain = (id, q, a) => ({ id, c: "x", d: 2, q, a, kp: [] });
const qs = [plain("1", "What is DI?", "How to implement Dependency injection in .NET Core?"), plain("2", "What is a scope?", "A scope groups services that live as long as one request does in the container."), plain("3", "What is a singleton?", "A singleton is created once and shared for the whole life of the application."), plain("4", "What is transient?", "A transient service is created again every time something asks for it."), plain("5", "What is a factory?", "A factory builds objects on demand so callers do not need to know the concrete type.")];
const prep = prepPlain(qs);
check(!prep.some((x) => x.o.id === "1"), "an answer that is really another question is not used for options");
check(makeMcqFor(qs[0], prep) === null, "a question whose answer is a question gets no generated MCQ");
const m = makeMcqFor(qs[1], prep);
check(m && mcqProblem(m) === "" && m.o.length === 4, "a good Q&A still produces a clean 4 option MCQ");
console.log(fails ? `${fails} FAILED` : "all passed"); process.exit(fails ? 1 : 0);
