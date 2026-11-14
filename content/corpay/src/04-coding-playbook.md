# Coding round playbook: .NET snippets, SOLID design, SQL and the API take-home

**Reported by candidates:** "what does this .NET snippet output?", "write a class that gives each object a unique ID", a flexible user-management design with SOLID, easy and hard algorithm problems (valid anagram, contains duplicate), SQL joins, lambdas, class versus object, and for one candidate a take-home end-to-end API endpoint. Practise in a plain editor because the screen may be shared without IDE help.

## Output-prediction traps in C#

Work through each, say the answer, then the reason.

1. **Closure in a for loop:** `for (int i=0;i<3;i++) actions.Add(() => Console.Write(i));` prints 333 because all lambdas share one `i`. A `foreach` variable is per iteration since C# 5, so it prints 012.
2. **Deferred LINQ:** `var q = list.Where(x => x > 1); list.Add(5);` the query runs when enumerated, so it includes 5. Call ToList to snapshot.
3. **String immutability:** `s.ToUpper();` alone changes nothing; strings are immutable, the result must be assigned.
4. **Floating point:** `0.1 + 0.2 == 0.3` is false for double; for decimal it is true. Use decimal for money.
5. **Integer division:** `5 / 2` is 2, `5 / 2.0` is 2.5, `-5 / 2` is -2 (truncates toward zero), `-5 % 3` is -2.
6. **Method hiding versus overriding:** with `new` the method chosen depends on the variable type; with `virtual` and `override` it depends on the runtime type.
7. **try, catch, finally order:** finally always runs, even after return; a return inside finally replaces the earlier result.
8. **Static constructor and field order:** static field initialisers run in textual order before the static constructor, once per type.
9. **Struct copy:** assigning a struct copies it; changing the copy does not change the original, but a struct inside a List accessed by index returns a copy.
10. **Boxing and equality:** `object a = 1, b = 1; a == b` is false (reference comparison); `a.Equals(b)` is true. Strings compare by value with `==`.
11. **async void and exceptions:** exceptions in async void crash the process; return Task instead.
12. **Task.Delay versus Thread.Sleep:** the first frees the thread, the second blocks it.

## Design: flexible user management with SOLID

State assumptions first (registration, authentication, roles, profile, deactivation). Then:

- **S:** `UserService` orchestrates, `IUserRepository` persists, `IPasswordHasher` hashes, `IEmailSender` notifies. One reason to change each.
- **O:** add a new notification channel by adding a class that implements `INotifier`; do not edit the service.
- **L:** any `IUserRepository` implementation (SQL, in-memory for tests) must behave the same.
- **I:** small interfaces (`IUserReader`, `IUserWriter`) rather than one huge one.
- **D:** the service depends on interfaces, constructed through dependency injection.

Mention validation, password hashing with a slow algorithm (PBKDF2, bcrypt or Argon2), unique email constraint, soft delete, audit log, and tests with a fake repository. Draw five boxes before you type.

## Unique ID class

```csharp
public sealed class Widget
{
    private static long _next;
    public long Id { get; } = Interlocked.Increment(ref _next);
}
```

Say why: Interlocked makes it thread-safe; a plain `++` is a race. Then discuss alternatives: Guid for distributed uniqueness, database sequences for persistence, and ULID or snowflake-style ids for sortable ids across nodes.

## Algorithm warm-ups (two minutes each)

- **Contains duplicate:** HashSet, O(n) time and space; sorting is O(n log n) with O(1) extra space.
- **Valid anagram:** compare 26-letter count arrays, or a Dictionary for Unicode; check lengths first.
- **Two sum, group anagrams, valid parentheses, LRU cache:** these appear in the app's coding practice.
Always state complexity and edge cases (empty input, nulls, duplicates, overflow).

## SQL you must write without help

Joins: inner (matching rows), left (all left, nulls for no match), right, full, cross; anti-join with `LEFT JOIN ... WHERE b.id IS NULL` or `NOT EXISTS`. Aggregates: `GROUP BY` with `HAVING` to filter groups; `COUNT(*)` versus `COUNT(col)` (nulls skipped). Typical task: customers with no orders; top 3 per group with `ROW_NUMBER() OVER (PARTITION BY ...)`; duplicates with `GROUP BY ... HAVING COUNT(*) > 1`. Know indexes, execution plans, transaction isolation levels and deadlocks.

## API take-home checklist

If you get a "build an endpoint" task, reviewers look for judgement, not volume.

- **Structure:** minimal API or controller, a service layer, a repository or EF Core, DTOs separate from entities.
- **Correctness:** input validation with clear 400 problem-details responses, correct status codes (201 with Location, 404, 409 conflict), async with CancellationToken.
- **Reliability:** idempotency for create, a unique constraint, concurrency token if updates matter.
- **Money:** decimal and currency if amounts appear.
- **Tests:** unit tests for the service and one integration test with WebApplicationFactory.
- **Operability:** structured logging, health check, Swagger/OpenAPI, configuration through options, no secrets in the repo.
- **Docs:** a short README: how to run, design decisions, what you would do with more time, assumptions. This is where you score.
- **Scope:** finish the required part cleanly rather than half-building extras.

## Skill-upgrade checklist

- [ ] Answer all 12 traps aloud without notes.
- [ ] Type the SOLID design and the unique-ID class in a plain editor under 15 minutes.
- [ ] Write the three SQL tasks from memory.
- [ ] Do two array/string problems with complexity and edge cases.

## Read next (official)

- [Microsoft Learn: C# language reference](https://learn.microsoft.com/dotnet/csharp/language-reference/)
- [Microsoft Learn: integration tests in ASP.NET Core](https://learn.microsoft.com/aspnet/core/test/integration-tests)
- [Microsoft Learn: SQL joins (T-SQL)](https://learn.microsoft.com/sql/relational-databases/performance/joins)
