// SQL challenges run in the browser with sql.js (SQLite). Same schema for all of them.
// Interview SQL is largely portable: window functions, CTEs, joins, aggregation.
export const SQL_SCHEMA = `
CREATE TABLE departments (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE employees (id INTEGER PRIMARY KEY, name TEXT, dept_id INTEGER, salary INTEGER, manager_id INTEGER, hire_date TEXT);
CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT, country TEXT, email TEXT);
CREATE TABLE orders (id INTEGER PRIMARY KEY, customer_id INTEGER, amount INTEGER, order_date TEXT, status TEXT);

INSERT INTO departments VALUES (1,'Engineering'),(2,'Sales'),(3,'HR'),(4,'Legal');
INSERT INTO employees VALUES
 (1,'Asha',1,150,NULL,'2018-03-01'),
 (2,'Bala',1,120,1,'2019-06-15'),
 (3,'Chitra',1,120,1,'2020-01-10'),
 (4,'Dev',1,90,2,'2021-09-01'),
 (5,'Esha',2,100,1,'2019-02-20'),
 (6,'Farid',2,80,5,'2020-11-05'),
 (7,'Gita',2,110,5,'2022-04-18'),
 (8,'Hari',3,70,1,'2017-07-07'),
 (9,'Isha',3,75,8,'2023-01-02');
INSERT INTO customers VALUES
 (1,'Acme','IN','sales@acme.com'),
 (2,'Globex','US','hello@globex.com'),
 (3,'Initech','IN','sales@acme.com'),
 (4,'Umbrella','UK','info@umbrella.com'),
 (5,'Hooli','US','hello@globex.com'),
 (6,'Stark','US','tony@stark.com');
INSERT INTO orders VALUES
 (1,1,100,'2026-01-05','paid'),
 (2,1,250,'2026-01-20','paid'),
 (3,2,300,'2026-02-02','paid'),
 (4,1,150,'2026-02-14','cancelled'),
 (5,3,500,'2026-02-18','paid'),
 (6,2,200,'2026-03-03','paid'),
 (7,1,50,'2026-03-09','paid'),
 (8,4,700,'2026-03-15','paid'),
 (9,2,120,'2026-03-28','paid'),
 (10,3,80,'2026-04-01','paid');
`;

export const SCHEMA_HELP = `departments(id, name)
employees(id, name, dept_id, salary, manager_id, hire_date)
customers(id, name, country, email)
orders(id, customer_id, amount, order_date, status)`;

export const SQL_CHALLENGES = [
  { id: "sq01", title: "Second highest salary", diff: 1, topic: "Subquery / DISTINCT",
    desc: "Return the second highest DISTINCT salary as a single column named `salary`.",
    solution: "SELECT MAX(salary) AS salary FROM employees WHERE salary < (SELECT MAX(salary) FROM employees);",
    starter: "SELECT ...", ordered: false, hint: "Either MAX below the MAX, or DENSE_RANK() = 2." },
  { id: "sq02", title: "Top 2 earners per department", diff: 2, topic: "Window functions",
    desc: "For every department return the top 2 salaries by employee (ties: lower id first). Columns: `dept` (department name), `name`, `salary`. Order by dept, then salary desc, then name.",
    solution: "SELECT dept, name, salary FROM (SELECT d.name AS dept, e.name AS name, e.salary AS salary, ROW_NUMBER() OVER (PARTITION BY e.dept_id ORDER BY e.salary DESC, e.id) AS rn FROM employees e JOIN departments d ON d.id = e.dept_id) WHERE rn <= 2 ORDER BY dept, salary DESC, name;",
    starter: "SELECT ...", ordered: true, hint: "ROW_NUMBER() OVER (PARTITION BY dept_id ORDER BY salary DESC) in a subquery or CTE." },
  { id: "sq03", title: "Departments with no employees", diff: 1, topic: "LEFT JOIN",
    desc: "Return the names of departments that have no employees. Column: `name`.",
    solution: "SELECT d.name AS name FROM departments d LEFT JOIN employees e ON e.dept_id = d.id WHERE e.id IS NULL;",
    starter: "SELECT ...", ordered: false, hint: "LEFT JOIN and filter where the right side is NULL (or NOT EXISTS)." },
  { id: "sq04", title: "Employees earning more than their manager", diff: 2, topic: "Self join",
    desc: "Return employee names who earn more than their manager. Columns: `employee`, `manager`.",
    solution: "SELECT e.name AS employee, m.name AS manager FROM employees e JOIN employees m ON e.manager_id = m.id WHERE e.salary > m.salary;",
    starter: "SELECT ...", ordered: false, hint: "Join employees to itself on manager_id = id." },
  { id: "sq05", title: "Running total per customer", diff: 2, topic: "Window SUM",
    desc: "For PAID orders only, return `customer_id`, `order_date`, `amount` and `running_total` (cumulative amount per customer ordered by order_date). Order by customer_id, order_date.",
    solution: "SELECT customer_id, order_date, amount, SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS running_total FROM orders WHERE status = 'paid' ORDER BY customer_id, order_date;",
    starter: "SELECT ...", ordered: true, hint: "SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date)." },
  { id: "sq06", title: "Repeat customers", diff: 2, topic: "GROUP BY / HAVING",
    desc: "Return `customer_id`, `orders` (count) and `total` (sum of amount) for customers with MORE than 2 PAID orders. Order by customer_id.",
    solution: "SELECT customer_id, COUNT(*) AS orders, SUM(amount) AS total FROM orders WHERE status = 'paid' GROUP BY customer_id HAVING COUNT(*) > 2 ORDER BY customer_id;",
    starter: "SELECT ...", ordered: true, hint: "Filter rows with WHERE, groups with HAVING." },
  { id: "sq07", title: "Month-over-month revenue change", diff: 3, topic: "LAG / date functions",
    desc: "Using PAID orders, return `month` (YYYY-MM), `revenue` and `change` (revenue minus previous month's revenue; NULL for the first month). Order by month.",
    solution: "WITH m AS (SELECT strftime('%Y-%m', order_date) AS month, SUM(amount) AS revenue FROM orders WHERE status = 'paid' GROUP BY 1) SELECT month, revenue, revenue - LAG(revenue) OVER (ORDER BY month) AS change FROM m ORDER BY month;",
    starter: "SELECT ...", ordered: true, hint: "Aggregate by month in a CTE, then use LAG(revenue) OVER (ORDER BY month)." },
  { id: "sq08", title: "Customers sharing an email", diff: 2, topic: "Duplicates",
    desc: "Return each email used by more than one customer, with `emails` as the email and `customers` as the number of customers. Order by email.",
    solution: "SELECT email AS emails, COUNT(*) AS customers FROM customers GROUP BY email HAVING COUNT(*) > 1 ORDER BY email;",
    starter: "SELECT ...", ordered: true, hint: "GROUP BY email HAVING COUNT(*) > 1." },
];
