// Scenario-based quiz questions, batch e.
const m = (id, c, l, q, o, a, e) => ({ id, c, l, q, o, a, e });

export const MCQ_E = [
  m("ce01", "corpay", "s",
    "A client POSTs /payments with Idempotency-Key K. The call times out, and the client retries with the same K while the first request is still running on another instance. How should the server guarantee a single payment?",
    [
      "Run a SELECT for the key; if it is absent, process the payment and then insert the key",
      "Insert the key under a unique constraint before processing; a retry hits the existing record and gets the stored result, or a 409 while in flight",
      "Keep processed keys in an in-memory dictionary on each API instance and reject repeats",
      "Treat any POST with the same payee, amount and currency in the last five minutes as a duplicate"
    ], 1,
    "A unique constraint makes claiming the key atomic, so two concurrent requests cannot both win; the stored response lets the retry return the original outcome. Check-then-insert looks right but both requests can pass the SELECT before either inserts."),
  m("ce02", "corpay", "j",
    "A multi-currency wallet must hold JPY (0 decimal places), EUR (2) and KWD (3). Which storage design avoids rounding drift and works for every currency?",
    [
      "Store amounts as double and round to two decimals only when displaying",
      "Store integer cents and multiply every amount by 100, whatever the currency",
      "Store an integer count of minor units plus the ISO 4217 currency code, using each currency's own exponent",
      "Store formatted strings such as \"1,234.50\" so that no numeric conversion is ever needed"
    ], 2,
    "Integers in minor units are exact, and the currency's ISO 4217 exponent says how to scale them, so JPY, EUR and KWD all work. A fixed factor of 100 is tempting but is wrong for JPY (off by 100x) and KWD (loses a digit)."),
  m("ce03", "corpay", "m",
    "A customer moves 100 EUR from wallet A to wallet B. Which design best follows double-entry ledger principles?",
    [
      "In one DB transaction, insert immutable entries: a debit of 100 on A and a credit of 100 on B, so the transfer's entries sum to zero",
      "Update the balance columns of A and B in two separate transactions, then log the transfer afterwards",
      "Insert one transfer row with from, to and amount, and let a nightly job recompute the balances",
      "Subtract 100 from A's balance and add an audit row; B is credited later by its own service"
    ], 0,
    "Balanced, append-only entries written atomically mean money is never created or lost, and balances can always be re-derived and audited. Updating balances in separate transactions can leave the books unbalanced if the second step fails."),
  m("ce04", "corpay", "s",
    "Your service calls a bank API to submit a payout. The HTTP request times out with no response at all. What is the safest next step?",
    [
      "Mark the payout failed, refund the wallet and resubmit under a fresh reference",
      "Mark the payout successful, since most timeouts occur after the bank has accepted the request",
      "Retry immediately up to three times, generating a new reference for each attempt",
      "Mark the payout as pending/unknown, then query its status by your reference or retry with the same idempotency key before deciding"
    ], 3,
    "A timeout says nothing about whether the bank executed the request, so the outcome is unknown and must be resolved by querying or an idempotent retry. Refunding and resubmitting under a new reference can pay the beneficiary twice if the first attempt actually succeeded."),
  m("ce05", "corpay", "m",
    "A payment is already Failed when a delayed provider webhook reports it as Settled. The handler simply overwrites Status with whatever arrives. What is the most robust fix?",
    [
      "Always accept the latest-arriving event, since it reflects the provider's newest view",
      "Define allowed transitions in a state machine, apply them with a conditional update, and route illegal ones to alerting or manual review",
      "Overwrite Status only when the webhook's timestamp is newer than the stored one",
      "Stop using webhooks and poll the provider every minute, overwriting Status each time"
    ], 1,
    "A state machine encodes which transitions are legal, and a conditional UPDATE enforces it even under concurrency, so contradictions are surfaced rather than applied. A timestamp check only orders events; it would still accept a Failed to Settled change that may need investigation."),
  m("ce06", "corpay", "m",
    "Your ledger shows 1,000 payouts for the day but the bank's settlement file has 998 lines. What is the right reconciliation approach?",
    [
      "Adjust the ledger totals to match the bank file so the books balance",
      "Trust the 200 OK responses from the bank API and skip matching",
      "Match items by bank reference, amount and value date, then raise the two unmatched items as breaks for investigation with an audit trail",
      "Reconcile monthly totals only, since daily differences cancel out"
    ], 2,
    "Item-level matching identifies exactly which transactions are missing, and breaks are investigated and resolved with a traceable correcting entry. Silently forcing the ledger to match hides the real problem, and an API response is not proof of settlement."),
  m("ce07", "corpay", "s",
    "An API saves a Payment in SQL Server and then publishes PaymentCreated to SNS. A crash between the two steps leaves a payment that nobody hears about. Which pattern fixes this?",
    [
      "Transactional outbox: insert the event into an outbox table in the same DB transaction, and let a relay publish it with at-least-once delivery",
      "Publish to SNS first and save the payment afterwards, so the event is never lost",
      "Wrap the SQL save and the SNS publish in a TransactionScope so both commit atomically",
      "Publish inside a try/catch after commit and log the exception if it fails"
    ], 0,
    "Writing the event and the payment in one local transaction guarantees both exist or neither; the relay then retries publishing, so consumers must be idempotent. TransactionScope cannot enlist SNS in a distributed transaction, and publish-first just flips the failure window."),
  m("ce08", "corpay", "s",
    "In a cross-border payout saga the wallet has been debited and an FX trade booked, then the beneficiary bank rejects the payout permanently. What should happen?",
    [
      "Roll back the earlier steps by rolling back the first database transaction",
      "Delete the debit and FX records so the history shows no attempt",
      "Retry the payout indefinitely until the bank accepts it",
      "Run compensating actions: reverse the FX booking and credit the wallet back with new ledger entries, keeping the failed attempt on record"
    ], 3,
    "Earlier saga steps are already committed, so they are undone by compensating transactions, and the audit trail stays intact. A database rollback is impossible after commit, and deleting records destroys the evidence regulators expect."),
  m("ce09", "corpay", "m",
    "Two requests each debit 80 from a wallet holding 100 at the same moment. Both read 100, both pass the balance check, and the wallet is overdrawn. Which fix works across several API instances?",
    [
      "Wrap the balance check in a lock on a static object in the service class",
      "Add a rowversion concurrency token so the second save fails with DbUpdateConcurrencyException, then reload and re-validate",
      "Read the balance under READ UNCOMMITTED so each request sees the latest value",
      "Check the balance twice in C# before calling SaveChanges"
    ], 1,
    "Optimistic concurrency detects that the row changed since it was read, no matter which instance wrote it, and the retry re-checks the new balance. A static lock only serialises requests inside one process, so it does nothing across instances."),
  m("ce10", "corpay", "m",
    "Finance expects a fee of 0.125 EUR to round to 0.13, but `Math.Round(0.125m, 2)` returns 0.12. What is the cause and the fix?",
    [
      "decimal cannot represent 0.125 exactly, so switch the calculation to double",
      "The current culture changes rounding; set CultureInfo.InvariantCulture",
      "The default is banker's rounding (MidpointRounding.ToEven); pass MidpointRounding.AwayFromZero for half-up",
      "Math.Round truncates extra digits; add 0.005m before rounding"
    ], 2,
    "Math.Round defaults to rounding midpoints to the nearest even digit, so 0.125 becomes 0.12; the overload with AwayFromZero gives 0.13. decimal stores 0.125 exactly, and the rounding rule should be an explicit business decision."),
  m("ce11", "corpay", "s",
    "A customer is shown an EUR/USD rate of 1.0850 locked for 30 seconds. Their confirm request reaches your API after 45 seconds. What should the booking logic do?",
    [
      "Check the quote's expiry using the server clock, reject it as expired and require a fresh quote",
      "Honour 1.0850 because the customer saw that rate when they clicked",
      "Silently book at the current market rate and tell the customer afterwards",
      "Extend the quote by another 30 seconds if the client's clock says it is still valid"
    ], 0,
    "A locked quote is a time-limited commitment, so the server must enforce its expiry and record the quote ID and rate used when booking. Honouring an expired rate exposes the firm to market movement, and trusting the client's clock lets users extend it."),
  m("ce12", "corpay", "m",
    "You are building a card-payment form for a .NET app and want to minimise PCI DSS scope. Which design is best?",
    [
      "Post card numbers to your API, encrypt the PAN with AES in your database and keep the key in a key vault",
      "Store the PAN and CVV encrypted so recurring charges never need the customer again",
      "Accept card data on your server but never log request bodies, and delete it after the charge",
      "Collect card data with the PSP's hosted fields so the PAN never reaches your servers, and store only the returned token"
    ], 3,
    "With hosted fields or similar, card data goes straight to the PSP and your systems only handle a token, which keeps them largely out of scope. Encrypting the PAN yourself still leaves your servers in scope, and the CVV must not be stored after authorisation."),
  m("ce13", "corpay", "m",
    "A Lambda consuming an SQS queue takes about 90 seconds per message, but the queue's visibility timeout is the default 30 seconds. Payments are being processed twice. What is the fix?",
    [
      "Raise the visibility timeout above the maximum processing time (AWS advises at least six times the function timeout) and keep handlers idempotent",
      "Lower maxReceiveCount to 1 so a message can only be received once",
      "Enable long polling so a message is not delivered while it is being processed",
      "Set a delivery delay of 90 seconds on the queue"
    ], 0,
    "When the visibility timeout expires before the message is deleted, SQS makes it visible again and another invocation picks it up. maxReceiveCount of 1 would instead send the message to the DLQ after the first duplicate receive, and long polling only affects how consumers fetch."),
  m("ce14", "corpay", "m",
    "A malformed message keeps failing in a consumer and is redelivered again and again. You want it parked after 3 failed attempts for inspection. What configures that?",
    [
      "Set the DLQ's message retention period to 3 minutes",
      "Attach a dead-letter queue to the source queue with a redrive policy whose maxReceiveCount is 3",
      "Set the source queue's visibility timeout to 3 seconds",
      "Set a maximum receive count of 3 on the dead-letter queue itself"
    ], 1,
    "maxReceiveCount lives in the redrive policy of the source queue; once a message has been received that many times without deletion, SQS moves it to the DLQ. Retention and visibility timeout control age and invisibility, not the number of attempts."),
  m("ce15", "corpay", "s",
    "On an SQS FIFO queue, payment events for one account must be processed in order, while different accounts should be processed in parallel. How should MessageGroupId be set?",
    [
      "A single constant value, so FIFO preserves global order and still scales",
      "A new GUID per message, so every message can be processed concurrently",
      "The account ID, so order is kept within an account while accounts proceed in parallel",
      "The account ID as MessageDeduplicationId, which creates one ordered lane per account"
    ], 2,
    "FIFO guarantees order within a message group and lets different groups be consumed concurrently, so the account ID is the right group. A constant group serialises everything, and using the account ID as the deduplication ID would drop later messages for the account within the 5-minute deduplication window."),
  m("ce16", "corpay", "m",
    "A PaymentSettled event must reach the Ledger, Notifications and Analytics services independently, and a slow Analytics consumer must not delay the others. Which design fits?",
    [
      "One SQS queue read by all three services so each takes what it needs",
      "A Lambda that calls the three services in sequence and retries on failure",
      "One SQS queue with three Lambda event sources attached",
      "Publish to an SNS topic with a separate SQS queue subscribed for each service"
    ], 3,
    "SNS-to-SQS fan-out gives every service its own copy and its own backlog, retries and DLQ. Consumers sharing one queue are competing consumers, so each message goes to only one of them."),
  m("ce17", "corpay", "m",
    "You want a Lambda invoked only for PaymentFailed events with an amount over 10000, and not for other events on the bus. Where do you express that filter?",
    [
      "In the EventBridge rule's event pattern, matching detail-type and a numeric condition on detail.amount",
      "In a cron-scheduled rule that polls the bus and filters",
      "In the Lambda code, since EventBridge rules cannot inspect the event payload",
      "In a dead-letter queue attached to the rule's target"
    ], 0,
    "Event patterns can match on detail-type and on fields inside detail, including numeric comparisons, so only matching events invoke the target. Filtering inside the Lambda works but pays for an invocation per irrelevant event, and EventBridge can in fact inspect the payload."),
  m("ce18", "corpay", "s",
    "An SQS-triggered Lambda receives batches of 10. When one record fails, throwing an exception returns all 10 to the queue, so 9 successful payments are reprocessed. Which change fixes this without lowering the batch size?",
    [
      "Catch the exception and return normally so the failed message is deleted too",
      "Enable ReportBatchItemFailures and return the failed messages' IDs in batchItemFailures",
      "Increase the function timeout so the batch has more time to succeed",
      "Raise maxReceiveCount on the DLQ policy so retries are spread out"
    ], 1,
    "With partial batch responses Lambda deletes the successful messages and only the IDs you report are retried. Swallowing the exception would delete the failed message and lose the payment."),
  m("ce19", "corpay", "s",
    "A RabbitMQ worker uses autoAck = true. When workers are killed mid-processing during a deploy, payments vanish. Which setup prevents loss and also shares work fairly between workers?",
    [
      "Keep autoAck, declare the queue durable and publish with persistent delivery mode",
      "Keep autoAck = true and set a high prefetch so messages are buffered locally",
      "Use manual acknowledgements after processing succeeds, with a small prefetch set via basic.qos, such as 10",
      "Use manual acknowledgements with unlimited prefetch (0) so each consumer receives the whole queue"
    ], 2,
    "Acking only after successful processing means unacked messages are requeued if the worker dies, and a small prefetch stops one consumer hoarding messages. Durability and persistence protect messages in the broker, not messages already delivered to a consumer that auto-acked."),
  m("ce20", "corpay", "j",
    "A .NET service running on ECS Fargate must read objects from S3. Which is the recommended way to provide credentials?",
    [
      "Put an IAM user's access key and secret in appsettings.json",
      "Pass the access key and secret as plain environment variables in the task definition",
      "Bake the key into the Docker image so it is available at startup",
      "Attach an IAM task role with least-privilege S3 permissions and let the AWS SDK's default credential chain use its temporary credentials"
    ], 3,
    "A role supplies short-lived credentials that rotate automatically and never appear in code or images. Any long-lived access key, wherever it is stored, can leak and has to be rotated by hand."),
  m("ce21", "corpay", "m",
    "A Kafka topic has 12 partitions and a consumer sees events for the same account out of order. Producers currently send with a null key. What fixes the ordering?",
    [
      "Set the message key to the account ID so all events for that account hash to the same partition",
      "Add more partitions so each account gets its own",
      "Add more consumers to the group so ordering is merged across partitions",
      "Enable the idempotent producer, which orders messages across partitions"
    ], 0,
    "Kafka guarantees order only within a partition, and the key decides the partition, so keying by account keeps each account's events in order. Extra partitions or consumers do not create order across partitions, and the idempotent producer guarantees order only per partition."),
  m("ce22", "corpay", "s",
    "A Kafka consumer with enable.auto.commit=true processes payments. After a crash some messages were never fully processed yet are not redelivered. What is the most likely cause and fix?",
    [
      "The broker deleted them; raise retention.ms",
      "Offsets were committed before processing finished; disable auto commit and commit after successful processing, with idempotent handling for redeliveries",
      "A consumer group rebalance lost them; add more partitions to prevent rebalances",
      "Commit offsets before processing, so that each message is processed exactly once"
    ], 1,
    "Auto-commit advances offsets on a timer regardless of whether processing completed, so a crash can skip messages; committing after success gives at-least-once delivery, which idempotent handlers make safe. Committing before processing makes loss more likely, not exactly-once."),
  m("ce23", "corpay", "j",
    "What does this print?\n```\nvar actions = new List<Action>();\nfor (int i = 0; i < 3; i++)\n    actions.Add(() => Console.Write(i));\nforeach (var a in actions) a();\n```",
    ["012", "123", "333", "Compile error"], 2,
    "A for loop declares one variable i shared by all lambdas; each lambda captures the variable, not its value, and by the time they run i is 3. Only foreach (since C# 5) creates a fresh variable per iteration, which is why 012 is the tempting but wrong answer."),
  m("ce24", "corpay", "m",
    "What does this print?\n```\nvar list = new List<int> { 1, 2, 3 };\nvar q = list.Where(x => x > 1);\nlist.Add(4);\nConsole.Write(q.Count());\n```",
    ["2", "4", "InvalidOperationException", "3"], 3,
    "Where is deferred: the filter runs when Count() enumerates the list, by which point it holds 1, 2, 3, 4, so 2, 3 and 4 match. The answer 2 assumes the query ran at the Where line, and no exception occurs because the list is not modified during enumeration."),
  m("ce25", "corpay", "j",
    "What does this print?\n```\nstring s = \"pay\";\nstring t = s;\ns += \"ment\";\nConsole.Write(t + \" \" + s);\n```",
    ["pay payment", "payment payment", "pay pay", "payment pay"], 0,
    "Strings are immutable, so += creates a new string and rebinds s, while t still references the original \"pay\". The answer \"payment payment\" wrongly assumes both variables share a mutable object."),
  m("ce26", "corpay", "j",
    "What does this print?\n```\nConsole.Write((0.1m + 0.2m == 0.3m) + \" \" + (0.1 + 0.2 == 0.3));\n```",
    ["True True", "True False", "False False", "False True"], 1,
    "decimal stores base-10 fractions exactly, so 0.1m + 0.2m equals 0.3m, while binary double gives 0.30000000000000004, which is not equal to 0.3. That is why money should use decimal, and why the answer \"True True\" is wrong."),
  m("ce27", "corpay", "m",
    "What does this print?\n```\nConsole.Write((-7 / 2) + \" \" + (-7 % 3));\n```",
    ["-4 2", "-3 2", "-3 -1", "-4 -1"], 2,
    "C# integer division truncates toward zero, so -7 / 2 is -3, and the remainder takes the sign of the dividend, so -7 % 3 is -1 (since -2 * 3 + -1 = -7). Floor-style results such as -4 and 2 come from languages like Python, not C#."),
  m("ce28", "corpay", "m",
    "What does this print?\n```\nclass A { public virtual string F() => \"A\"; }\nclass B : A { public override string F() => \"B\"; }\nclass C : B { public new string F() => \"C\"; }\n\nA x = new C(); B y = new C();\nConsole.Write(x.F() + y.F() + new C().F());\n```",
    ["CCC", "BBB", "ABC", "BBC"], 3,
    "Calls through A and B references use the virtual slot, which B overrode, so both give \"B\"; C.F uses new, which hides rather than overrides, so only a variable typed as C reaches it. CCC would be right only if C.F were an override."),
  m("ce29", "corpay", "s",
    "What does this print?\n```\nstatic int F()\n{\n    int x = 1;\n    try { return x; }\n    finally { x = 2; Console.Write(\"F\"); }\n}\nConsole.Write(F());\n```",
    ["F1", "F2", "1F", "1"], 0,
    "The return value 1 is evaluated before finally runs, so changing x afterwards does not affect it; finally prints F during F(), before the caller writes the returned value. The answer F2 assumes the return reads x after finally."),
  m("ce30", "corpay", "s",
    "What does this print?\n```\nclass P\n{\n    public static int A = B + 1;\n    public static int B = 5;\n}\nConsole.Write(P.A + \" \" + P.B);\n```",
    ["6 5", "1 5", "0 5", "Compile error"], 1,
    "Static field initialisers run in textual order, so when A is initialised B still has its default value 0, making A equal 1, and then B becomes 5. Forward references to static fields compile fine, unlike instance field initialisers referencing other instance fields."),
  m("ce31", "corpay", "s",
    "What does this print?\n```\nstruct Pt { public int X; }\nvar l = new List<Pt> { new Pt { X = 1 } };\nvar p = l[0];\np.X = 9;\nConsole.Write(l[0].X);\n```",
    ["9", "0", "1", "Compile error"], 2,
    "The List indexer returns a copy of the struct, so p is an independent copy and changing it leaves the list element at 1. Writing l[0].X = 9 directly would be the compile error (CS1612), which is why this form is the tempting trap."),
  m("ce32", "corpay", "m",
    "What does this print?\n```\nobject a = 5;\nobject b = 5;\nConsole.Write((a == b) + \" \" + a.Equals(b));\n```",
    ["True True", "True False", "False False", "False True"], 3,
    "Each assignment boxes the int into a separate heap object, and == on object compares references, so it is False; Equals is overridden by Int32 to compare values, so it is True. Expecting \"True True\" mistakes the reference comparison for a value comparison."),
  m("ce33", "corpay", "s",
    "In a console app, what is true of this code?\n```\nstatic async void Run()\n{\n    await Task.Delay(10);\n    throw new InvalidOperationException(\"x\");\n}\ntry { Run(); } catch { Console.Write(\"caught\"); }\n```",
    [
      "The catch never runs: Run returns at the await, and the later exception is raised on a thread-pool thread as unhandled, which can crash the process",
      "The catch prints \"caught\" because await rethrows the exception to the caller of Run",
      "The exception is stored in a Task that nobody observes, so it is silently swallowed",
      "The compiler rejects the code because an async void method cannot contain await"
    ], 0,
    "An async void method returns to its caller at the first incomplete await, so the try block has already exited when the exception is thrown; with no SynchronizationContext it is raised on the thread pool and is unhandled. Swallowing happens with async Task whose Task is ignored, not with async void."),
  m("ce34", "corpay", "m",
    "An ASP.NET Core action calls `Thread.Sleep(2000)` to simulate a downstream wait. Under load, throughput collapses with thread pool starvation. Why does `await Task.Delay(2000)` help?",
    [
      "Task.Delay is more precise, so requests finish sooner",
      "Thread.Sleep blocks a thread-pool thread for the whole 2 seconds, while awaiting Task.Delay frees the thread to serve other requests",
      "Task.Delay runs on a dedicated new thread per call, which avoids the pool",
      "Thread.Sleep holds a lock on the HttpContext that Task.Delay does not"
    ], 1,
    "The async version registers a timer and releases the thread until it fires, so a small pool can serve many waiting requests. Task.Delay does not create a thread, and its precision is not the point."),
  m("ce35", "corpay", "m",
    "List customers who have never placed an order (tables Customers c and Orders o, joined on o.CustomerId = c.Id). Which query is a correct anti-join?",
    [
      "SELECT c.* FROM Customers c INNER JOIN Orders o ON o.CustomerId = c.Id WHERE o.Id IS NULL",
      "SELECT c.* FROM Customers c LEFT JOIN Orders o ON o.CustomerId = c.Id WHERE o.Id = NULL",
      "SELECT c.* FROM Customers c LEFT JOIN Orders o ON o.CustomerId = c.Id WHERE o.Id IS NULL",
      "SELECT c.* FROM Customers c, Orders o WHERE o.CustomerId <> c.Id"
    ], 2,
    "A LEFT JOIN keeps every customer and fills order columns with NULL when there is no match, so filtering IS NULL leaves only customers without orders. An INNER JOIN drops unmatched customers first, so it returns nothing, and = NULL is never true."),
  m("ce36", "corpay", "m",
    "`SELECT * FROM Payees WHERE Id NOT IN (SELECT PayeeId FROM Payments)` returns no rows even though several payees have no payments. Payments.PayeeId is nullable. What explains it and what is the fix?",
    [
      "NOT IN only works with literal lists; use a JOIN against a temp table",
      "The subquery needs DISTINCT because duplicate PayeeIds make NOT IN return nothing",
      "A collation mismatch between the columns; add COLLATE to the comparison",
      "A NULL PayeeId makes NOT IN evaluate to UNKNOWN for every row; use NOT EXISTS or filter the NULLs out"
    ], 3,
    "x NOT IN (..., NULL) can never be true because the comparison with NULL is UNKNOWN, so no row qualifies. NOT EXISTS handles NULLs correctly, and duplicates in the subquery are harmless."),
  m("ce37", "corpay", "s",
    "In SQL Server, return each merchant's three largest payments from Payments(Id, MerchantId, Amount). Which approach is correct?",
    [
      "In a CTE compute ROW_NUMBER() OVER (PARTITION BY MerchantId ORDER BY Amount DESC) AS rn, then select from it WHERE rn <= 3",
      "SELECT TOP 3 * FROM Payments GROUP BY MerchantId ORDER BY Amount DESC",
      "SELECT * FROM Payments WHERE ROW_NUMBER() OVER (PARTITION BY MerchantId ORDER BY Amount DESC) <= 3",
      "SELECT TOP 3 * FROM Payments ORDER BY MerchantId, Amount DESC"
    ], 0,
    "Window functions cannot appear in WHERE, so the ranking is computed in a CTE or subquery and filtered in the outer query; PARTITION BY restarts the numbering per merchant. TOP 3 on the whole table returns only three rows in total, not three per merchant."),
  m("ce38", "corpay", "j",
    "Which query finds email addresses that appear more than once in a Users table?",
    [
      "SELECT DISTINCT Email FROM Users WHERE COUNT(*) > 1",
      "SELECT Email FROM Users GROUP BY Email HAVING COUNT(*) > 1",
      "SELECT Email FROM Users GROUP BY Id HAVING COUNT(Email) > 1",
      "SELECT Email FROM Users WHERE COUNT(Email) > 1 GROUP BY Email"
    ], 1,
    "Group by the column you are checking for duplicates, then filter groups with HAVING since aggregates are not allowed in WHERE. Grouping by Id fails because each Id is unique, so no group ever has more than one row."),
  m("ce39", "corpay", "s",
    "`SELECT Amount, Status FROM Payments WHERE AccountId = @a AND CreatedAt >= @d` is slow; the plan shows an index seek plus many key lookups. Which index removes the lookups?",
    [
      "A nonclustered index on (AccountId, CreatedAt) alone, since its key order already matches the filter",
      "Separate single-column indexes on AccountId and CreatedAt",
      "A nonclustered index on (AccountId, CreatedAt) INCLUDE (Amount, Status)",
      "A nonclustered index on (Amount, Status)"
    ], 2,
    "Equality column first then the range column gives an efficient seek, and INCLUDE stores the selected columns in the index leaf so no lookup into the clustered index is needed. The key columns alone still force a lookup for Amount and Status."),
  m("ce40", "corpay", "s",
    "Two concurrent wallet transfers each SELECT the balance (100) and then UPDATE it to subtract 80 inside READ COMMITTED transactions; the wallet ends up overdrawn. Which change prevents this?",
    [
      "Switch to READ UNCOMMITTED so the second transfer sees the first one's change",
      "Add a NOLOCK hint to the balance read to avoid blocking",
      "Keep READ COMMITTED and wrap the UPDATE in a retry loop",
      "Read the balance WITH (UPDLOCK), or use UPDATE ... SET Balance = Balance - @amt WHERE Balance >= @amt, so the second transfer waits and re-evaluates"
    ], 3,
    "Under READ COMMITTED, shared locks are released after the read, so both transactions can see 100; an update lock or a single conditional UPDATE serialises them so the second one sees 20. READ UNCOMMITTED and NOLOCK allow dirty reads and make the race worse, not better."),
  m("ce41", "corpay", "m",
    "A UserManager class validates input, hashes passwords, writes to SQL Server and sends the welcome email. Changing the email provider means editing and retesting the whole class. Which principle is most directly violated?",
    [
      "Single Responsibility Principle: the class has several reasons to change",
      "Liskov Substitution Principle: subclasses cannot replace it",
      "Interface Segregation Principle: its interface is too large",
      "Open/Closed Principle: it should be extended through inheritance"
    ], 0,
    "One class mixing validation, hashing, persistence and notification has multiple reasons to change, which is the definition of an SRP violation; the fix is to split these into focused collaborators behind interfaces. LSP concerns substitutability of derived types, and nothing here involves inheritance."),
  m("ce42", "corpay", "m",
    "Order numbers must be unique, and are generated by several API instances running in parallel. Which approach is correct?",
    [
      "A static int counter incremented with Interlocked.Increment",
      "A SQL Server SEQUENCE read with NEXT VALUE FOR (or a GUID/ULID generated per order)",
      "SELECT MAX(OrderNo) + 1 inside a READ COMMITTED transaction",
      "DateTime.UtcNow.Ticks at the moment of creation"
    ], 1,
    "A database sequence is atomic and shared by all instances, and GUIDs/ULIDs are unique without coordination. Interlocked is thread-safe only within one process and restarts from zero, so instances would collide."),
  m("ce43", "corpay", "j",
    "A POST /payees endpoint can create a payee, find that it already exists, or reject invalid input. Which set of status codes is the most appropriate?",
    [
      "200 for every outcome, with an error flag in the body",
      "201 for create, 304 for duplicate, 404 for validation errors",
      "201 Created with a Location header, 409 Conflict for a duplicate, 400 (or 422) for validation errors",
      "202 for create, 403 for duplicate, 500 for validation errors"
    ], 2,
    "201 with Location signals a new resource, 409 signals a conflict with existing state, and 400 or 422 tells the client its input was invalid. Returning 200 with an error flag hides failures from clients, proxies and monitoring."),
  m("ce44", "corpay", "s",
    "You have a few hours for a take-home payments API. Which submission is most likely to show production-minded judgement?",
    [
      "A multi-service solution with Kafka and Kubernetes manifests to show breadth",
      "A generic repository and mediator framework with maximum abstraction",
      "Unit tests focused on getters and setters to reach 100 percent coverage",
      "A small layered API with tests on core payment rules, input validation, consistent error responses and a README that states assumptions and trade-offs"
    ], 3,
    "A focused, well-tested solution with clear error handling and documented trade-offs shows judgement under a time limit. Over-engineering or vanity coverage metrics add noise and usually leave the core requirements less polished."),
];
