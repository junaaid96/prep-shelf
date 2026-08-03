# 📗 Data Structures & Algorithms — MCQ Test Preparation Guide
### *(Guide 2 of 4 — based on your "MCQ Test Preparation Guideline" image: DSA card)*

**Covers:** Data Structures · Algorithms · Complexity Analysis · Recursion

> Companion files: `01-Programming.md` · `03-CS-Fundamentals.md` · `04-Logical-Reasoning.md`
> You already have 80+ Codeforces problems solved — this guide is structured to fill MCQ-style conceptual gaps (definitions, complexity, "which pattern fits") rather than re-teach you competitive programming from scratch.

---

## Table of Contents
1. [Complexity Analysis (Big O)](#1-complexity-analysis-big-o)
2. [Recursion](#2-recursion)
3. [Arrays & Strings](#3-arrays--strings)
4. [Linked Lists](#4-linked-lists)
5. [Stacks & Queues](#5-stacks--queues)
6. [Hashing](#6-hashing)
7. [Trees](#7-trees)
8. [Heaps / Priority Queues](#8-heaps--priority-queues)
9. [Graphs](#9-graphs)
10. [Tries](#10-tries)
11. [Sorting Algorithms](#11-sorting-algorithms)
12. [Searching Algorithms](#12-searching-algorithms)
13. [Algorithm Paradigms](#13-algorithm-paradigms)
14. [The 10 Highest-ROI Coding Interview Patterns](#14-the-10-highest-roi-coding-interview-patterns)
15. [Most Asked Interview Questions](#15-most-asked-interview-questions)
16. [Most Used in Real Software Engineering](#16-most-used-in-real-software-engineering)
17. [Learn More](#17-learn-more-links)

---

## 1. Complexity Analysis (Big O)

### 1.1 What Big O Measures
Big O describes how an algorithm's **time or space requirements grow** as input size (`n`) grows — it describes the **worst-case upper bound**, ignoring constants and lower-order terms.

### 1.2 Complexity Classes (memorize this order — smallest to largest growth)

| Notation | Name | Example |
|---|---|---|
| O(1) | Constant | Array index access, hash map lookup |
| O(log n) | Logarithmic | Binary search, balanced BST operations |
| O(n) | Linear | Single loop through array |
| O(n log n) | Linearithmic | Merge sort, quicksort (avg), heap sort |
| O(n²) | Quadratic | Nested loops, bubble/insertion/selection sort |
| O(n³) | Cubic | Triple nested loops (e.g. naive matrix multiplication) |
| O(2ⁿ) | Exponential | Naive recursive Fibonacci, subset generation |
| O(n!) | Factorial | Brute-force traveling salesman, generating all permutations |

```
Growth rate (slowest → fastest growing):
O(1) < O(log n) < O(n) < O(n log n) < O(n²) < O(2ⁿ) < O(n!)
```

### 1.3 Best, Average, Worst Case
- **Best case (Ω, Omega):** the most favorable input.
- **Average case (Θ, Theta):** expected performance over typical inputs.
- **Worst case (O, Big O):** the guarantee — what interviewers almost always ask for.

### 1.4 Time Complexity — Practical Examples
```java
// O(1)
int getFirst(int[] arr) { return arr[0]; }

// O(n)
int sum(int[] arr) {
    int total = 0;
    for (int x : arr) total += x;   // single pass
    return total;
}

// O(n²)
void printPairs(int[] arr) {
    for (int i = 0; i < arr.length; i++)
        for (int j = 0; j < arr.length; j++)
            System.out.println(arr[i] + "," + arr[j]);  // nested loop
}

// O(log n)
int binarySearch(int[] arr, int target) {
    int lo = 0, hi = arr.length - 1;
    while (lo <= hi) {
        int mid = lo + (hi - lo) / 2;
        if (arr[mid] == target) return mid;
        else if (arr[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    return -1;   // halves the search space each step → log n
}
```

### 1.5 Space Complexity
Measures extra memory used **relative to input size**, not counting the input itself.
- Iterative sum: O(1) space (a single accumulator variable).
- Recursive sum: O(n) space (each call adds a stack frame).
- Merge sort: O(n) space (auxiliary arrays for merging).

### 1.6 Common MCQ Traps
- `for (int i = 0; i < n; i *= 2)` → this is **O(log n)**, not O(n), because `i` doubles each time.
- Two separate (not nested) loops over the same array → still **O(n)**, not O(n²) — sequential, not multiplied.
- A loop inside a loop, but the inner loop's range shrinks (e.g., `for j = i to n`) → still **O(n²)** overall (sum of an arithmetic series is still quadratic).
- Recursive calls that branch into 2 each time with depth `n` → **O(2ⁿ)**.

### 🔗 Learn More — Complexity
- [Big-O Cheat Sheet (bigocheatsheet.com)](https://www.bigocheatsheet.com/)

---

## 2. Recursion

### 2.1 What is Recursion?
A function that calls **itself** to solve smaller instances of the same problem. Every recursive function needs:
1. **Base case** — the condition that stops recursion.
2. **Recursive case** — the function calling itself with a smaller/simpler input, moving toward the base case.

```java
int factorial(int n) {
    if (n <= 1) return 1;         // base case
    return n * factorial(n - 1);  // recursive case
}
```

### 2.2 How Recursion Works — The Call Stack
Each recursive call pushes a new **stack frame**. Understanding this is key for tracing execution and debugging `StackOverflowError`.
```
factorial(4)
 → 4 * factorial(3)
     → 3 * factorial(2)
         → 2 * factorial(1)
             → returns 1
         → returns 2*1 = 2
     → returns 3*2 = 6
 → returns 4*6 = 24
```

### 2.3 Classic Recursion Examples

**Fibonacci (naive — O(2ⁿ), and why it's slow):**
```java
int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);   // exponential — recomputes overlapping subproblems
}
```

**Fibonacci with memoization (O(n) — bridges into Dynamic Programming):**
```java
Map<Integer, Integer> memo = new HashMap<>();
int fibMemo(int n) {
    if (n <= 1) return n;
    if (memo.containsKey(n)) return memo.get(n);
    int result = fibMemo(n - 1) + fibMemo(n - 2);
    memo.put(n, result);
    return result;
}
```

**Reverse a string:**
```java
String reverse(String s) {
    if (s.isEmpty()) return s;
    return reverse(s.substring(1)) + s.charAt(0);
}
```

**Binary tree traversal (recursion is the natural fit for trees):**
```java
void inorder(TreeNode node) {
    if (node == null) return;
    inorder(node.left);
    System.out.print(node.val + " ");
    inorder(node.right);
}
```

### 2.4 Recursion vs Iteration
| | Recursion | Iteration |
|---|---|---|
| Readability | Often cleaner for tree/graph/divide-and-conquer problems | Cleaner for simple linear repetition |
| Memory | O(depth) stack space | O(1) typically |
| Risk | Stack overflow on deep recursion | None (unless infinite loop) |
| Tail call optimization | **Not guaranteed in Java/Python** (unlike Scheme/some functional langs) | N/A |

### 2.5 Backtracking (recursion + undo — very commonly tested)
Backtracking explores all possibilities, "undoing" a choice when it doesn't lead to a solution.
```java
void permute(int[] nums, List<Integer> current, boolean[] used, List<List<Integer>> result) {
    if (current.size() == nums.length) {
        result.add(new ArrayList<>(current));
        return;
    }
    for (int i = 0; i < nums.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        current.add(nums[i]);
        permute(nums, current, used, result);   // choose
        current.remove(current.size() - 1);      // un-choose (backtrack)
        used[i] = false;
    }
}
```
Common backtracking problems: N-Queens, Sudoku Solver, generating permutations/subsets/combinations, word search.

### 🔗 Learn More — Recursion
- [Recursion visualized (Python Tutor)](https://pythontutor.com/) — step through call stacks visually

---

## 3. Arrays & Strings

The most frequently tested data structure — 30%+ of interview questions touch arrays/strings.

- **Array:** contiguous memory, O(1) index access, O(n) insertion/deletion (shifting), fixed size (Java) vs dynamic (ArrayList/Python list, which amortize resizing to O(1) average append).
- **Amortized analysis:** Dynamic arrays double capacity when full — a single resize is O(n), but averaged (amortized) over many appends, each append is O(1).

**Common patterns:** two pointers, sliding window, prefix sums (covered in depth in Section 14).

```java
// Prefix sum — precompute cumulative sums for O(1) range-sum queries
int[] prefix = new int[nums.length + 1];
for (int i = 0; i < nums.length; i++) prefix[i + 1] = prefix[i] + nums[i];
int rangeSum = prefix[r + 1] - prefix[l];  // sum of nums[l..r] in O(1)
```

### 🔗 Learn More
- [GeeksforGeeks: Array Data Structure](https://www.geeksforgeeks.org/array-data-structure/)

---

## 4. Linked Lists

A sequence of nodes where each node holds data + a pointer to the next node (and previous, for doubly linked lists). No contiguous memory requirement.

| | Array | Linked List |
|---|---|---|
| Access by index | O(1) | O(n) |
| Insert/delete at known position | O(n) (shifting) | O(1) (pointer update) |
| Memory | Contiguous, cache-friendly | Scattered, extra pointer overhead |

```java
class ListNode {
    int val;
    ListNode next;
    ListNode(int val) { this.val = val; }
}

// Reverse a singly linked list — the single most common linked-list interview question
ListNode reverse(ListNode head) {
    ListNode prev = null, curr = head;
    while (curr != null) {
        ListNode next = curr.next;
        curr.next = prev;
        prev = curr;
        curr = next;
    }
    return prev;
}
```

**Cycle detection (Floyd's Tortoise and Hare — a must-know pattern):**
```java
boolean hasCycle(ListNode head) {
    ListNode slow = head, fast = head;
    while (fast != null && fast.next != null) {
        slow = slow.next;
        fast = fast.next.next;
        if (slow == fast) return true;   // they meet → cycle exists
    }
    return false;
}
```

Types: **Singly linked**, **Doubly linked** (prev + next pointers), **Circular linked** (tail points back to head).

### 🔗 Learn More
- [VisuAlgo: Linked List visualization](https://visualgo.net/en/list)

---

## 5. Stacks & Queues

### 5.1 Stack — LIFO (Last In, First Out)
Operations: `push`, `pop`, `peek/top` — all O(1).
Use cases: function call stack, undo functionality, expression evaluation, **balanced parentheses checking** (extremely common MCQ), DFS (iterative).

```java
boolean isValidParens(String s) {
    Deque<Character> stack = new ArrayDeque<>();
    Map<Character, Character> pairs = Map.of(')', '(', ']', '[', '}', '{');
    for (char c : s.toCharArray()) {
        if (!pairs.containsKey(c)) stack.push(c);
        else if (stack.isEmpty() || stack.pop() != pairs.get(c)) return false;
    }
    return stack.isEmpty();
}
```

### 5.2 Queue — FIFO (First In, First Out)
Operations: `enqueue`, `dequeue` — O(1) with a proper implementation (e.g., `ArrayDeque` or a linked list, **not** `ArrayList.remove(0)` which is O(n)).
Use cases: task scheduling, BFS, print queues, message queues (Kafka/RabbitMQ-style systems — directly relevant to your Event-Driven architecture study).

**Variants:**
- **Circular Queue:** fixed-size buffer that wraps around — used in producer-consumer buffering.
- **Deque (Double-Ended Queue):** insert/remove from both ends — used to implement both stacks and queues, and for the sliding window maximum problem.
- **Priority Queue:** see Heaps (Section 8).

### 🔗 Learn More
- [GeeksforGeeks: Stack vs Queue](https://www.geeksforgeeks.org/difference-between-stack-and-queue-data-structures/)

---

## 6. Hashing

### 6.1 Hash Table / Hash Map Basics
Maps keys → values using a **hash function** to compute an array index, giving **average O(1)** insert/lookup/delete.

- **Collision handling:**
  - *Chaining* — each bucket holds a linked list (or tree, in Java 8+ `HashMap` when a bucket gets large) of entries.
  - *Open addressing* — probe for the next free slot (linear probing, quadratic probing, double hashing).
- **Load factor:** `size / capacity` — Java's `HashMap` resizes (doubles) when load factor exceeds 0.75 by default.
- **Worst case:** O(n) if all keys collide into the same bucket (pre-Java-8) — Java 8+ mitigates this by treeifying long chains into red-black trees (O(log n) worst case).

```java
Map<String, Integer> wordCount = new HashMap<>();
for (String word : words) {
    wordCount.merge(word, 1, Integer::sum);  // idiomatic counting pattern
}
```

### 6.2 Why Hashing is Everywhere in Interviews
"Have we seen this before?" and "count frequencies" problems are almost always solved by trading O(n) space for O(1) lookup time instead of an O(n²) brute force.

```java
// Two Sum — THE most famous interview question, solved via hashing in O(n)
int[] twoSum(int[] nums, int target) {
    Map<Integer, Integer> seen = new HashMap<>();
    for (int i = 0; i < nums.length; i++) {
        int complement = target - nums[i];
        if (seen.containsKey(complement)) return new int[]{seen.get(complement), i};
        seen.put(nums[i], i);
    }
    return new int[]{};
}
```

### 🔗 Learn More
- [Java HashMap internals (Baeldung)](https://www.baeldung.com/java-hashmap)

---

## 7. Trees

### 7.1 Terminology
Root, parent, child, leaf, height (longest path root→leaf), depth (distance from root), subtree.

### 7.2 Binary Tree vs Binary Search Tree (BST)

| | Binary Tree | Binary Search Tree |
|---|---|---|
| Ordering | None | Left subtree < node < right subtree |
| Search | O(n) | O(log n) average, O(n) worst (skewed/unbalanced) |

```java
class TreeNode {
    int val;
    TreeNode left, right;
    TreeNode(int val) { this.val = val; }
}

// BST search
TreeNode search(TreeNode root, int target) {
    if (root == null || root.val == target) return root;
    return target < root.val ? search(root.left, target) : search(root.right, target);
}
```

### 7.3 Tree Traversals (near-guaranteed MCQ — know all 4)

| Traversal | Order | Use case |
|---|---|---|
| **Preorder** (Root, Left, Right) | Copy/serialize a tree | |
| **Inorder** (Left, Root, Right) | Gives **sorted order** for a BST | |
| **Postorder** (Left, Right, Root) | Delete a tree, evaluate expression trees | |
| **Level-order (BFS)** | Level by level using a queue | Shortest path in unweighted tree, printing by level |

```java
void levelOrder(TreeNode root) {
    if (root == null) return;
    Queue<TreeNode> queue = new LinkedList<>();
    queue.add(root);
    while (!queue.isEmpty()) {
        TreeNode node = queue.poll();
        System.out.print(node.val + " ");
        if (node.left != null) queue.add(node.left);
        if (node.right != null) queue.add(node.right);
    }
}
```

### 7.4 Balanced Trees
- **AVL Tree:** self-balancing BST, height difference between subtrees ≤ 1, rebalances via rotations on every insert/delete.
- **Red-Black Tree:** self-balancing BST with a coloring scheme; used internally by Java's `TreeMap`/`TreeSet` and C++'s `std::map`.
- **B-Trees / B+ Trees:** balanced multi-way trees — **the actual structure used inside most database indexes** (directly relevant to your indexing/DBMS study — see `03-CS-Fundamentals.md`).

### 7.5 Heaps as trees — see Section 8.

### 7.6 Common Tree Interview Problems
- Maximum depth/height of a tree
- Check if a tree is balanced / a valid BST
- Lowest Common Ancestor (LCA)
- Diameter of a binary tree
- Serialize/deserialize a binary tree
- Invert a binary tree (famously "the question that broke Homebrew's creator's Google interview")

### 🔗 Learn More
- [VisuAlgo: Binary Search Tree visualization](https://visualgo.net/en/bst)

---

## 8. Heaps / Priority Queues

A **heap** is a complete binary tree satisfying the heap property:
- **Min-heap:** parent ≤ children (root is the minimum).
- **Max-heap:** parent ≥ children (root is the maximum).

Typically implemented via an **array** (no explicit pointers needed): for index `i`, children are at `2i+1` and `2i+2`, parent is at `(i-1)/2`.

| Operation | Complexity |
|---|---|
| Peek (min/max) | O(1) |
| Insert | O(log n) |
| Extract min/max | O(log n) |
| Build heap from array | O(n) |

```java
PriorityQueue<Integer> minHeap = new PriorityQueue<>();          // min-heap by default in Java
PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());
minHeap.offer(5); minHeap.offer(1); minHeap.offer(3);
minHeap.poll();  // returns 1
```

**Use cases:** priority scheduling, Dijkstra's algorithm, "Top K" problems, median-of-stream problems (two heaps technique), heap sort.

### 🔗 Learn More
- [GeeksforGeeks: Heap Data Structure](https://www.geeksforgeeks.org/heap-data-structure/)

---

## 9. Graphs

Graphs = 30%+ of medium/hard interview questions, and the **most common topic at senior levels**.

### 9.1 Representations
- **Adjacency List:** `Map<Node, List<Node>>` — space-efficient for sparse graphs, most commonly used.
- **Adjacency Matrix:** `boolean[n][n]` — O(1) edge lookup, but O(n²) space — better for dense graphs.

```java
Map<Integer, List<Integer>> graph = new HashMap<>();
graph.computeIfAbsent(1, k -> new ArrayList<>()).add(2);  // edge 1 → 2
```

### 9.2 Graph Traversal — BFS vs DFS (must know when to use which)

| | BFS | DFS |
|---|---|---|
| Data structure | Queue | Stack (or recursion) |
| Finds | Shortest path in **unweighted** graph | Explores as deep as possible first |
| Use when | Shortest path, level-by-level processing | Exhaustive search, backtracking, cycle detection, topological sort |

```java
// BFS
void bfs(int start, Map<Integer, List<Integer>> graph) {
    Set<Integer> visited = new HashSet<>();
    Queue<Integer> queue = new LinkedList<>();
    queue.add(start); visited.add(start);
    while (!queue.isEmpty()) {
        int node = queue.poll();
        for (int neighbor : graph.getOrDefault(node, List.of())) {
            if (!visited.contains(neighbor)) {
                visited.add(neighbor);
                queue.add(neighbor);
            }
        }
    }
}

// DFS (recursive)
void dfs(int node, Map<Integer, List<Integer>> graph, Set<Integer> visited) {
    if (visited.contains(node)) return;
    visited.add(node);
    for (int neighbor : graph.getOrDefault(node, List.of())) dfs(neighbor, graph, visited);
}
```

### 9.3 Shortest Path Algorithms

| Algorithm | Handles | Complexity | Notes |
|---|---|---|---|
| **BFS** | Unweighted graphs | O(V+E) | Simplest, exact for unweighted |
| **Dijkstra's** | Weighted, non-negative edges | O((V+E) log V) with a min-heap | Greedy, most commonly asked weighted shortest-path algorithm |
| **Bellman-Ford** | Weighted, **allows negative edges** | O(V·E) | Also detects negative cycles |
| **Floyd-Warshall** | All-pairs shortest paths | O(V³) | DP-based |
| **A\*** | Weighted, with a heuristic | Varies | Used in pathfinding/games (heuristic-guided Dijkstra) |

### 9.4 Other Essential Graph Algorithms
- **Topological Sort** (DAGs only): orders nodes so every edge points forward — used for build systems, course prerequisite scheduling, and directly maps to dependency resolution in microservice deployment ordering.
- **Union-Find (Disjoint Set Union):** efficiently tracks connected components; used in Kruskal's MST algorithm and cycle detection in undirected graphs. Near O(1) amortized with path compression + union by rank.
- **Minimum Spanning Tree:** Kruskal's (edge-sorted, greedy + Union-Find) and Prim's (vertex-based, greedy + min-heap) — connect all nodes with minimum total edge weight.
- **Cycle detection:** DFS with a "visiting" state (for directed graphs) or Union-Find (for undirected graphs).

### 🔗 Learn More
- [VisuAlgo: Graph traversal visualization](https://visualgo.net/en/dfsbfs)
- [CP-Algorithms: Graph algorithms](https://cp-algorithms.com/graph/breadth-first-search.html)

---

## 10. Tries

A **trie** (prefix tree) stores strings character-by-character in a tree structure, enabling fast prefix-based lookups.

```java
class TrieNode {
    Map<Character, TrieNode> children = new HashMap<>();
    boolean isEndOfWord;
}

class Trie {
    TrieNode root = new TrieNode();
    void insert(String word) {
        TrieNode node = root;
        for (char c : word.toCharArray())
            node = node.children.computeIfAbsent(c, k -> new TrieNode());
        node.isEndOfWord = true;
    }
    boolean search(String word) {
        TrieNode node = root;
        for (char c : word.toCharArray()) {
            node = node.children.get(c);
            if (node == null) return false;
        }
        return node.isEndOfWord;
    }
}
```
**Use cases:** autocomplete, spell checkers, IP routing (longest prefix match), word search games.
Complexity: O(L) for insert/search, where L = word length — independent of how many words are stored.

### 🔗 Learn More
- [GeeksforGeeks: Trie Data Structure](https://www.geeksforgeeks.org/trie-insert-and-search/)

---

## 11. Sorting Algorithms

### 11.1 Comparison Table (a guaranteed MCQ table — memorize this)

| Algorithm | Best | Average | Worst | Space | Stable? |
|---|---|---|---|---|---|
| Bubble Sort | O(n) | O(n²) | O(n²) | O(1) | Yes |
| Selection Sort | O(n²) | O(n²) | O(n²) | O(1) | No |
| Insertion Sort | O(n) | O(n²) | O(n²) | O(1) | Yes |
| Merge Sort | O(n log n) | O(n log n) | O(n log n) | O(n) | Yes |
| Quick Sort | O(n log n) | O(n log n) | O(n²) | O(log n) | No |
| Heap Sort | O(n log n) | O(n log n) | O(n log n) | O(1) | No |
| Counting Sort | O(n+k) | O(n+k) | O(n+k) | O(k) | Yes |

> **Stable** = equal elements keep their relative order after sorting (matters when sorting objects by a secondary key after already sorting by a primary key).

### 11.2 Merge Sort (Divide and Conquer — must be able to write from memory)
```java
void mergeSort(int[] arr, int left, int right) {
    if (left >= right) return;
    int mid = left + (right - left) / 2;
    mergeSort(arr, left, mid);
    mergeSort(arr, mid + 1, right);
    merge(arr, left, mid, right);
}
```

### 11.3 Quick Sort (Divide and Conquer, in-place — the other must-know)
```java
void quickSort(int[] arr, int low, int high) {
    if (low < high) {
        int pivotIndex = partition(arr, low, high);
        quickSort(arr, low, pivotIndex - 1);
        quickSort(arr, pivotIndex + 1, high);
    }
}
```
> Quick Sort's worst case O(n²) happens when the pivot is consistently the smallest/largest element (e.g., already-sorted input with a naive first-element pivot) — mitigated with random or median-of-three pivot selection.

### 11.4 Which sort does Java/Python use internally?
- Java's `Arrays.sort()` for primitives → **Dual-Pivot Quicksort**. For objects → **TimSort** (a hybrid of merge sort + insertion sort, stable).
- Python's `sorted()`/`.sort()` → **TimSort** as well.

### 🔗 Learn More
- [VisuAlgo: Sorting visualization](https://visualgo.net/en/sorting)
- [Toptal: Sorting Algorithms Animations](https://www.toptal.com/developers/sorting-algorithms)

---

## 12. Searching Algorithms

- **Linear Search:** O(n), works on unsorted data.
- **Binary Search:** O(log n), requires **sorted** data — see code in Section 1.4. Variants: find first/last occurrence, search in rotated sorted array, find peak element.
- **Jump Search:** O(√n), for sorted arrays, jumps in fixed blocks then linear-scans within a block.
- **Interpolation Search:** O(log log n) average for uniformly distributed sorted data.

### 🔗 Learn More
- [GeeksforGeeks: Searching Algorithms](https://www.geeksforgeeks.org/searching-algorithms/)

---

## 13. Algorithm Paradigms

### 13.1 Divide and Conquer
Break a problem into independent subproblems, solve recursively, combine results. Examples: Merge Sort, Quick Sort, Binary Search.

### 13.2 Greedy Algorithms
Make the locally optimal choice at each step, hoping it leads to a global optimum (doesn't always work — must be provably correct for the specific problem). Examples: Dijkstra's, Kruskal's/Prim's MST, activity selection, coin change (for canonical coin systems only).

### 13.3 Dynamic Programming (DP) — "the most feared topic," but pattern-based
DP solves problems by breaking them into **overlapping subproblems** and storing results to avoid recomputation. Requires: **optimal substructure** (optimal solution built from optimal sub-solutions) + **overlapping subproblems**.

**Two approaches:**
- **Top-down (memoization):** recursion + cache (see Fibonacci example, Section 2.3).
- **Bottom-up (tabulation):** build a table iteratively from base cases up.

```java
// Classic DP: 0/1 Knapsack — bottom-up
int knapsack(int[] weights, int[] values, int capacity) {
    int n = weights.length;
    int[][] dp = new int[n + 1][capacity + 1];
    for (int i = 1; i <= n; i++) {
        for (int w = 0; w <= capacity; w++) {
            if (weights[i - 1] <= w)
                dp[i][w] = Math.max(dp[i - 1][w], dp[i - 1][w - weights[i - 1]] + values[i - 1]);
            else
                dp[i][w] = dp[i - 1][w];
        }
    }
    return dp[n][capacity];
}
```
**Classic DP problems to know:** Fibonacci, 0/1 Knapsack, Longest Common Subsequence, Longest Increasing Subsequence, Coin Change, Edit Distance, House Robber, Matrix Chain Multiplication.

### 13.4 Backtracking
See Section 2.5 — systematic trial-and-undo exploration of all candidates.

### 13.5 Two Pointers / Sliding Window
Covered in depth in Section 14 — extremely high-ROI patterns for array/string problems.

### 🔗 Learn More — DP
- [freeCodeCamp: Dynamic Programming for Beginners](https://www.freecodecamp.org/news/follow-these-steps-to-solve-any-dynamic-programming-interview-problem/)

---

## 14. The 10 Highest-ROI Coding Interview Patterns

Recognizing the *pattern* behind a problem is more valuable than memorizing solutions — these patterns cover the large majority of interview questions.

| # | Pattern | Signal words / when to use | Example problem |
|---|---|---|---|
| 1 | **Two Pointers** | Sorted array, pair/triplet sum, palindrome check | Two Sum II, 3Sum |
| 2 | **Sliding Window** | Contiguous subarray/substring, "longest/shortest window satisfying X" | Longest substring without repeating characters |
| 3 | **Fast & Slow Pointers** | Linked list cycle, middle of list | Detect cycle, find duplicate number |
| 4 | **Merge Intervals** | Overlapping ranges | Merge intervals, meeting rooms |
| 5 | **BFS/DFS (Tree & Graph)** | Traversal, connected components, shortest path (unweighted) | Number of islands, level-order traversal |
| 6 | **Topological Sort** | Dependency ordering, "prerequisite" wording | Course schedule |
| 7 | **Binary Search (& variants)** | Sorted data, "find minimum X such that condition holds" | Search in rotated sorted array, koko eating bananas |
| 8 | **Backtracking** | "Generate all," "find all combinations/permutations" | Subsets, N-Queens, Sudoku |
| 9 | **Dynamic Programming** | "Maximum/minimum/count number of ways," optimal substructure | Knapsack, LCS, coin change |
| 10 | **Top-K / Heap** | "Kth largest/smallest," "top K frequent" | Kth largest element, top K frequent words |

**Where to spend practice time (highest problem count on platforms like LeetCode):** Arrays > Strings > Trees/Graphs (~30% combined) > Dynamic Programming > Linked Lists > Hashing.

### 🔗 Learn More
- [Grokking the Coding Interview: Patterns (DesignGuru)](https://www.designgurus.io/course/grokking-the-coding-interview)
- [NeetCode 150 (free curated list + video explanations)](https://neetcode.io/practice)

---

## 15. Most Asked Interview Questions

1. Explain time and space complexity of your solution — always state Big O for both.
2. What's the difference between an array and a linked list? When would you choose one over the other?
3. Reverse a linked list (iteratively and recursively).
4. Detect a cycle in a linked list — explain Floyd's algorithm.
5. Implement a stack using two queues (and vice versa) — tests understanding of both structures deeply.
6. Given an array, find two numbers that sum to a target (Two Sum) — solve in O(n) using a hash map.
7. Explain BFS vs DFS — when is each the right choice?
8. What is a balanced binary tree? How do AVL/Red-Black trees maintain balance?
9. Explain how a hash map achieves O(1) average lookup, and what happens on a collision.
10. Write merge sort or quicksort from memory, and state their complexities including worst case.
11. What is dynamic programming? Give an example with overlapping subproblems.
12. Explain the difference between BFS shortest path and Dijkstra's algorithm — why can't BFS handle weighted edges?
13. What is a trie and when would you use one over a hash set for string storage?
14. Explain recursion with base case and recursive case using factorial or Fibonacci.
15. What is memoization, and how does it improve naive recursive Fibonacci from O(2ⁿ) to O(n)?
16. Given a rotated sorted array, how do you search in O(log n)?
17. What is topological sort used for? Give a real-world example (build systems, course prerequisites).
18. Explain the sliding window technique with an example problem.
19. What's the difference between a min-heap and max-heap, and how is a heap represented as an array?
20. How would you find the Kth largest element in an array efficiently (better than sorting)?

---

## 16. Most Used in Real Software Engineering

While LeetCode-style DSA questions are mostly interview-specific, the *underlying concepts* show up constantly in real backend work:

- **Hash maps** — caching, deduplication, grouping/counting — used in nearly every service you write.
- **Big O thinking** — choosing `ArrayList` vs `LinkedList` vs `HashMap`, avoiding N+1 queries (a database-flavored O(n) problem), avoiding nested loops over large datasets.
- **Queues** — literally the data structure behind message brokers (Kafka, RabbitMQ) that power your Event-Driven/Saga architecture study.
- **Trees** — B+ Trees power database indexes; JSON/XML parsing produces tree structures; org charts, category hierarchies.
- **Graphs** — service dependency graphs, social networks, recommendation systems, `git` commit history (a DAG).
- **Sorting/searching** — built-in library sorts are used constantly; understanding stability matters when sorting by multiple keys.
- **Recursion** — tree/JSON traversal, directory walking, divide-and-conquer in data processing pipelines.
- **Caching/memoization** — the same idea behind DP memoization is exactly what Redis-based caching does at the system level.

### 🔗 Learn More — General DSA
- [VisuAlgo (interactive visualizations for almost everything above)](https://visualgo.net/)
- [CS50: Introduction to Computer Science (Harvard, free)](https://cs50.harvard.edu/x/)
- [MIT 6.006 Introduction to Algorithms (OCW, free)](https://ocw.mit.edu/courses/6-006-introduction-to-algorithms-spring-2020/)

---

**Next:** `03-CS-Fundamentals.md` →
