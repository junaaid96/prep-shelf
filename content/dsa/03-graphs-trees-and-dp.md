# 3. Graphs, Trees & Dynamic Programming

---

## 3.1 Graph representations

```python
# Adjacency list — O(V+E) space. The default for sparse graphs (almost always).
graph = {0: [1, 2], 1: [2], 2: [0, 3], 3: []}

# Adjacency matrix — O(V²) space, O(1) edge lookup. Dense graphs, or when you need edge weights fast.
matrix = [[0, 1, 1, 0], [0, 0, 1, 0], [1, 0, 0, 1], [0, 0, 0, 0]]

# Edge list — for Kruskal's / Bellman-Ford
edges = [(0, 1, 4), (1, 2, 3), (2, 3, 7)]
```

**Grid problems are graph problems.** A cell `(r, c)` has up to four neighbours; the directions array is the adjacency list:

```python
DIRS = ((1,0), (-1,0), (0,1), (0,-1))
```

---

## 3.2 BFS and DFS

```python
from collections import deque

def bfs(graph, start):
    """Shortest path in an UNWEIGHTED graph — level by level."""
    seen, q, dist = {start}, deque([start]), {start: 0}
    while q:
        node = q.popleft()
        for nxt in graph[node]:
            if nxt not in seen:
                seen.add(nxt)
                dist[nxt] = dist[node] + 1
                q.append(nxt)
    return dist

def dfs_iterative(graph, start):
    seen, stack = set(), [start]
    while stack:
        node = stack.pop()
        if node in seen: continue
        seen.add(node)
        stack.extend(n for n in graph[node] if n not in seen)
    return seen
```

**Choose by the question:**

| Need | Use |
|---|---|
| Shortest path, unweighted | **BFS** |
| Level-by-level / minimum steps | **BFS** |
| Path existence, connected components | Either |
| All paths, cycle detection, topological order | **DFS** |
| Backtracking / exploring to a leaf | **DFS** |

**Multi-source BFS** — start with every source in the queue at distance 0. This is the trick for "rotting oranges", "walls and gates", "nearest exit":

```python
def rotting_oranges(grid):
    R, C = len(grid), len(grid[0])
    q = deque((r, c, 0) for r in range(R) for c in range(C) if grid[r][c] == 2)
    fresh = sum(row.count(1) for row in grid)
    minutes = 0
    while q:
        r, c, t = q.popleft()
        minutes = max(minutes, t)
        for dr, dc in DIRS:
            nr, nc = r + dr, c + dc
            if 0 <= nr < R and 0 <= nc < C and grid[nr][nc] == 1:
                grid[nr][nc] = 2
                fresh -= 1
                q.append((nr, nc, t + 1))
    return minutes if fresh == 0 else -1
```

**Flood fill / island counting** is DFS or BFS over a grid, marking visited in place:

```python
def num_islands(grid):
    if not grid: return 0
    R, C, count = len(grid), len(grid[0]), 0
    def sink(r, c):
        if not (0 <= r < R and 0 <= c < C) or grid[r][c] != "1": return
        grid[r][c] = "0"                                   # mark visited in place — O(1) space
        for dr, dc in DIRS: sink(r + dr, c + dc)
    for r in range(R):
        for c in range(C):
            if grid[r][c] == "1":
                count += 1
                sink(r, c)
    return count
```

> **Asked as:** Number of Islands · Rotting Oranges · Word Ladder · Clone Graph · Pacific Atlantic Water Flow · Shortest Path in Binary Matrix

---

## 3.3 Topological sort

**Signal:** dependencies, prerequisites, build order, task scheduling. Only defined for a **DAG** — if a cycle exists, there's no valid order (which is how you detect one).

```python
def course_schedule(n, prerequisites):
    """Kahn's algorithm — BFS on in-degrees."""
    graph = [[] for _ in range(n)]
    indegree = [0] * n
    for course, prereq in prerequisites:
        graph[prereq].append(course)
        indegree[course] += 1

    q = deque(i for i in range(n) if indegree[i] == 0)
    order = []
    while q:
        node = q.popleft()
        order.append(node)
        for nxt in graph[node]:
            indegree[nxt] -= 1
            if indegree[nxt] == 0: q.append(nxt)

    return order if len(order) == n else []     # short order ⇒ a cycle exists
```

The DFS version pushes nodes onto a stack after exploring all descendants; the reversed stack is the topological order, and a node found "in the current recursion stack" is a back edge, i.e. a cycle.

> **Asked as:** Course Schedule I/II · Alien Dictionary · Task Scheduling with Dependencies · Detect a cycle in a directed graph

---

## 3.4 Shortest paths

| Algorithm | Handles | Complexity | Use |
|---|---|---|---|
| **BFS** | Unweighted | O(V+E) | Equal-cost edges |
| **Dijkstra** | Non-negative weights | O((V+E) log V) | Road networks, latency routing |
| **0-1 BFS** | Weights of 0 or 1 | O(V+E) | Deque instead of a heap |
| **Bellman-Ford** | Negative weights, detects negative cycles | O(V·E) | Currency arbitrage |
| **Floyd-Warshall** | All pairs | O(V³) | Small dense graphs |
| **A\*** | Heuristic-guided | Depends on h | Games, maps — Dijkstra + a distance estimate |

```python
import heapq

def dijkstra(graph, src):
    """graph: {node: [(neighbour, weight), ...]}"""
    dist = {src: 0}
    pq = [(0, src)]
    while pq:
        d, node = heapq.heappop(pq)
        if d > dist.get(node, float("inf")): continue      # stale entry — skip
        for nxt, w in graph[node]:
            nd = d + w
            if nd < dist.get(nxt, float("inf")):
                dist[nxt] = nd
                heapq.heappush(pq, (nd, nxt))
    return dist
```

**Dijkstra fails with negative weights** — once a node is finalised it's never revisited, and a negative edge could have improved it. That's the question behind "why not just use Dijkstra everywhere?".

**Minimum spanning tree:** Kruskal (sort edges, union-find, add if it doesn't create a cycle) or Prim (grow from a node with a heap). Used for network design and clustering.

> **Asked as:** Network Delay Time · Cheapest Flights Within K Stops · Path with Minimum Effort · Min Cost to Connect All Points · "Why can't Dijkstra handle negative weights?"

---

## 3.5 Tree problems: the recursive shape

Most tree questions reduce to "what do I need from my children, and what do I return to my parent?"

```python
def max_depth(root):
    return 0 if not root else 1 + max(max_depth(root.left), max_depth(root.right))

def diameter(root):
    """Longest path between any two nodes — may not pass through the root."""
    best = 0
    def depth(node):
        nonlocal best
        if not node: return 0
        l, r = depth(node.left), depth(node.right)
        best = max(best, l + r)                # path THROUGH this node
        return 1 + max(l, r)                   # depth returned to the parent
    depth(root)
    return best

def lowest_common_ancestor(root, p, q):
    if not root or root is p or root is q: return root
    left  = lowest_common_ancestor(root.left, p, q)
    right = lowest_common_ancestor(root.right, p, q)
    if left and right: return root             # p and q are in different subtrees → this is the LCA
    return left or right

def is_balanced(root):
    def check(node):
        if not node: return 0
        l = check(node.left)
        if l < 0: return -1
        r = check(node.right)
        if r < 0 or abs(l - r) > 1: return -1   # -1 propagates "unbalanced" up without a second pass
        return 1 + max(l, r)
    return check(root) >= 0

def serialize(root):
    out = []
    def go(node):
        if not node: out.append("#"); return
        out.append(str(node.val)); go(node.left); go(node.right)
    go(root)
    return ",".join(out)
```

**The "compute-and-report" trick** (as in `diameter` and `is_balanced`): return one value to the parent while updating a global best. It turns many O(n²) tree solutions into O(n).

> **Asked as:** Diameter of Binary Tree · LCA · Balanced Binary Tree · Serialize/Deserialize · Path Sum III · Binary Tree Maximum Path Sum

---

## 3.6 Dynamic programming

**DP applies when the problem has (a) optimal substructure and (b) overlapping subproblems.** If subproblems don't overlap, it's divide and conquer; if a locally-best choice is provably globally best, it's greedy.

**The five-step method:**

1. **Define the state.** "`dp[i]` = the answer for the first `i` items." Getting this right is 80% of the work.
2. **Write the recurrence.** How does `dp[i]` follow from smaller states?
3. **Set the base cases.**
4. **Choose the order** (bottom-up iteration, or top-down memoised recursion).
5. **Optimise space** if only the last row/two values are needed.

```python
# 1D — Climbing Stairs / Fibonacci shape
def climb_stairs(n):
    a, b = 1, 1
    for _ in range(n - 1): a, b = b, a + b
    return b                                    # O(n) time, O(1) space

# 1D with a choice — House Robber
def rob(nums):
    prev = cur = 0
    for x in nums:
        prev, cur = cur, max(cur, prev + x)     # skip this house, or take it plus the best before last
    return cur

# Unbounded knapsack — Coin Change (minimum coins)
def coin_change(coins, amount):
    dp = [0] + [float("inf")] * amount
    for a in range(1, amount + 1):
        for c in coins:
            if c <= a: dp[a] = min(dp[a], dp[a - c] + 1)
    return -1 if dp[amount] == float("inf") else dp[amount]

# 0/1 knapsack — each item once. Note the REVERSED inner loop.
def knapsack(weights, values, capacity):
    dp = [0] * (capacity + 1)
    for w, v in zip(weights, values):
        for c in range(capacity, w - 1, -1):    # backwards so each item is used at most once
            dp[c] = max(dp[c], dp[c - w] + v)
    return dp[capacity]

# 2D — Longest Common Subsequence
def lcs(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]
    for i in range(1, len(a) + 1):
        for j in range(1, len(b) + 1):
            dp[i][j] = dp[i-1][j-1] + 1 if a[i-1] == b[j-1] else max(dp[i-1][j], dp[i][j-1])
    return dp[-1][-1]

# Top-down memoisation — often easier to derive, same complexity
from functools import cache
def lis(nums):
    @cache
    def best_from(i):
        return 1 + max((best_from(j) for j in range(i+1, len(nums)) if nums[j] > nums[i]), default=0)
    return max((best_from(i) for i in range(len(nums))), default=0)
    # The O(n log n) version uses patience sorting with bisect
```

**The DP families to recognise:**

| Family | Signature | Examples |
|---|---|---|
| Linear / 1D | `dp[i]` from `dp[i-1]`, `dp[i-2]` | Climbing Stairs, House Robber, Decode Ways |
| Knapsack | Choose/skip with a capacity | Coin Change, Partition Equal Subset Sum, Target Sum |
| Two sequences | `dp[i][j]` over two strings | LCS, Edit Distance, Regex Matching |
| Grid | `dp[r][c]` from above/left | Unique Paths, Minimum Path Sum |
| Interval | `dp[i][j]` over a range | Burst Balloons, Matrix Chain, Palindrome Partitioning |
| State machine | `dp[i][state]` | Best Time to Buy/Sell Stock with cooldown/fee/k transactions |
| Bitmask | `dp[mask]` over subsets, n ≤ 20 | TSP, Assignment |
| Tree DP | Post-order with per-node states | House Robber III, Binary Tree Max Path Sum |

**Memoisation vs tabulation:** top-down is easier to write (just add `@cache` to the recursion) and only computes reachable states; bottom-up avoids recursion limits and allows rolling-array space optimisation. Start top-down to find the recurrence, convert if you need the space win.

> **Asked as:** Climbing Stairs · House Robber I/II/III · Coin Change · Longest Increasing Subsequence · Edit Distance · Word Break · Unique Paths · Best Time to Buy and Sell Stock (all variants) · Partition Equal Subset Sum

---

## 3.7 Greedy — and how to tell it's safe

Greedy makes the locally optimal choice and never reconsiders. It's O(n log n) or better, and **wrong** unless the problem has the "greedy choice property".

```python
def can_jump(nums):
    reach = 0
    for i, n in enumerate(nums):
        if i > reach: return False
        reach = max(reach, i + n)
    return True

def min_arrows(points):
    points.sort(key=lambda p: p[1])              # sort by END — the classic activity-selection insight
    arrows, end = 0, float("-inf")
    for s, e in points:
        if s > end: arrows += 1; end = e
    return arrows
```

**How to justify greedy in an interview:** state the exchange argument — "any optimal solution can be transformed into one that makes my greedy choice, without getting worse." If you can't articulate that, use DP.

Classic greedy problems: interval scheduling (sort by end time), Huffman coding, fractional knapsack (0/1 knapsack is **not** greedy), Dijkstra, Kruskal, jump game, gas station.

> **Asked as:** Jump Game I/II · Minimum Number of Arrows · Gas Station · Task Scheduler · Partition Labels · "How do you know greedy is correct here?"

---

## 3.8 Rapid-fire answers

| Question | Answer |
|---|---|
| BFS vs DFS space | BFS O(width) — can be huge on wide graphs; DFS O(depth) |
| Detect a cycle: undirected vs directed | Union-find or DFS with a parent check vs DFS with a recursion-stack (colour) marker |
| Bipartite check | 2-colour with BFS/DFS; a conflict means not bipartite |
| Number of connected components | BFS/DFS from each unvisited node, or union-find `components` |
| Why memoise | Overlapping subproblems: naive Fibonacci is O(2ⁿ), memoised is O(n) |
| DP vs greedy | Greedy needs a provable exchange argument; DP explores all choices |
| DP vs backtracking | DP reuses overlapping results; backtracking enumerates distinct paths |
| Space optimisation | If `dp[i]` only reads `dp[i-1]`, keep two rows/variables |
| Recursion depth | Python defaults to ~1000 — convert to iteration or raise the limit for deep inputs |
| When DP is impossible | State space too large — look for greedy, a different formulation, or an approximation |
