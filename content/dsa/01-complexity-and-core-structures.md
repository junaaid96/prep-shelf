# 1. Complexity & Core Data Structures

---

## 1.1 Big-O, honestly

Big-O describes how runtime grows with input size, ignoring constants. It's a tool for choosing between approaches — not a substitute for measuring.

| Complexity | n = 10 | n = 1 000 | n = 1 000 000 | Typical source |
|---|---|---|---|---|
| O(1) | 1 | 1 | 1 | Hash lookup, array index |
| O(log n) | 3 | 10 | 20 | Binary search, balanced tree |
| O(n) | 10 | 1 000 | 10⁶ | Single scan |
| O(n log n) | 33 | 10⁴ | 2×10⁷ | Good sorts, divide & conquer |
| O(n²) | 100 | 10⁶ | 10¹² ✗ | Nested loops over the same data |
| O(2ⁿ) | 1 024 | ✗ | ✗ | Naive subsets/recursion |
| O(n!) | 3.6M | ✗ | ✗ | Permutations, brute-force TSP |

**Interview arithmetic:** most judges allow ~10⁸ simple operations per second. So:

| n | Target complexity |
|---|---|
| ≤ 12 | O(n!) permutations are fine |
| ≤ 25 | O(2ⁿ) subsets / meet-in-the-middle |
| ≤ 500 | O(n³) |
| ≤ 5 000 | O(n²) |
| ≤ 10⁶ | O(n log n) |
| ≤ 10⁸ | O(n) or O(log n) |

Reading the constraint tells you the intended complexity before you've thought about the problem — use it.

**Amortised** ≠ average. Dynamic-array `push` is O(1) *amortised*: most pushes are O(1), an occasional resize is O(n), and the total over n pushes is O(n).

**Space complexity counts the recursion stack.** A recursive DFS on a skewed tree of n nodes is O(n) space even though it allocates nothing.

> **Asked as:** "What's the time and space complexity?" (asked about every answer you give) · "Why is amortised O(1) not the same as O(1)?" · "What complexity should I aim for given n ≤ 10⁵?"

---

## 1.2 Arrays and dynamic arrays

Contiguous memory. O(1) indexed access, and cache locality that makes them faster in practice than their Big-O suggests.

| Operation | Cost |
|---|---|
| Index | O(1) |
| Append | O(1) amortised |
| Insert/delete at front or middle | O(n) — everything shifts |
| Search (unsorted) | O(n) |
| Search (sorted) | O(log n) via binary search |

**Two-pointer in-place removal** — the pattern behind dozens of problems:

```python
def remove_val(nums: list[int], val: int) -> int:
    write = 0
    for read in range(len(nums)):
        if nums[read] != val:
            nums[write] = nums[read]
            write += 1
    return write            # new length; nums[:write] holds the kept elements
```

**Prefix sums** turn repeated range queries from O(n) each into O(1):

```python
prefix = [0]
for x in nums: prefix.append(prefix[-1] + x)
range_sum = lambda l, r: prefix[r + 1] - prefix[l]     # inclusive [l, r]
```

> **Asked as:** "Remove duplicates from a sorted array in place." · "Range sum queries with many queries." · "Why is an array faster than a linked list for iteration?"

---

## 1.3 Hash tables

Average O(1) insert/lookup/delete; worst case O(n) when everything collides. Collisions are handled by chaining (buckets of entries) or open addressing (probe for the next free slot). Java's `HashMap` converts a long chain into a red-black tree, making the worst case O(log n).

**Load factor** (entries ÷ buckets) triggers a resize at ~0.75; resizing rehashes everything — which is why `HashMap<>(expectedSize)` / `dict` pre-sizing matters in hot paths.

```python
# Two Sum — the canonical "hash map turns O(n²) into O(n)" problem
def two_sum(nums: list[int], target: int) -> list[int]:
    seen = {}                       # value -> index
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
    return []

# Group anagrams — canonical form as the key
from collections import defaultdict
def group_anagrams(words):
    groups = defaultdict(list)
    for w in words:
        groups[tuple(sorted(w))].append(w)     # or a 26-length count tuple: O(n·k) not O(n·k log k)
    return list(groups.values())
```

**Keys must be immutable and have a stable hash.** Mutating a key after insertion puts it in the wrong bucket permanently.

> **Asked as:** "How does a hash map work internally?" · "What's the worst case and when does it happen?" · "Why must keys be immutable?" · "Two Sum."

---

## 1.4 Linked lists

O(1) insert/delete **given a reference to the node**; O(n) to find that node. Poor cache locality — in practice an `ArrayList`/`vector` beats a linked list for almost everything except O(1) splice.

```python
class Node:
    def __init__(self, val, nxt=None): self.val, self.next = val, nxt

def reverse(head):
    prev = None
    while head:
        head.next, prev, head = prev, head, head.next   # the classic three-way swap
    return prev

def has_cycle(head):
    """Floyd's tortoise and hare — O(1) space."""
    slow = fast = head
    while fast and fast.next:
        slow, fast = slow.next, fast.next.next
        if slow is fast: return True
    return False

def middle(head):
    slow = fast = head
    while fast and fast.next: slow, fast = slow.next, fast.next.next
    return slow                                          # fast/slow gives the midpoint in one pass

def merge_sorted(a, b):
    dummy = tail = Node(0)                               # dummy head removes edge cases
    while a and b:
        if a.val <= b.val: tail.next, a = a, a.next
        else:              tail.next, b = b, b.next
        tail = tail.next
    tail.next = a or b
    return dummy.next
```

**Two techniques cover most linked-list problems:** a **dummy head** (kills special-casing the first node) and **fast/slow pointers** (cycle detection, middle, nth-from-end).

> **Asked as:** "Reverse a linked list — iteratively and recursively." · "Detect a cycle and find where it starts." · "Merge two sorted lists." · "Why use a dummy node?"

---

## 1.5 Stacks and queues

```python
from collections import deque
stack = []                    # append / pop — O(1) both ends of the tail
queue = deque()               # append / popleft — O(1); a list's pop(0) is O(n)
```

**Monotonic stack** — the pattern for "next greater/smaller element", and it turns many O(n²) problems into O(n):

```python
def daily_temperatures(temps: list[int]) -> list[int]:
    result = [0] * len(temps)
    stack = []                                   # indices, decreasing temperature
    for i, t in enumerate(temps):
        while stack and temps[stack[-1]] < t:
            j = stack.pop()
            result[j] = i - j
        stack.append(i)
    return result
```

Also: valid parentheses, min-stack (push `(val, current_min)` pairs), largest rectangle in a histogram, evaluate RPN, and implementing a queue with two stacks (amortised O(1)).

**Deque** additionally gives you the **sliding-window maximum** in O(n).

> **Asked as:** "Valid parentheses." · "Min stack in O(1)." · "Next greater element." · "Implement a queue using two stacks."

---

## 1.6 Heaps / priority queues

A binary heap in an array: parent at `i`, children at `2i+1`/`2i+2`. Push and pop are O(log n); peek is O(1); building from an array is O(n).

```python
import heapq

# Python's heapq is a MIN-heap. For a max-heap, negate.
def k_largest(nums, k):
    return heapq.nlargest(k, nums)                    # O(n log k)

def k_closest_to_origin(points, k):
    heap = []                                          # max-heap of size k via negation
    for x, y in points:
        heapq.heappush(heap, (-(x*x + y*y), x, y))
        if len(heap) > k: heapq.heappop(heap)
    return [(x, y) for _, x, y in heap]

def merge_k_sorted(lists):
    heap = [(lst[0], i, 0) for i, lst in enumerate(lists) if lst]
    heapq.heapify(heap)
    out = []
    while heap:
        val, li, idx = heapq.heappop(heap)
        out.append(val)
        if idx + 1 < len(lists[li]):
            heapq.heappush(heap, (lists[li][idx+1], li, idx+1))
    return out                                         # O(N log k)
```

**Two heaps for a running median:** a max-heap for the lower half, a min-heap for the upper half, rebalanced so their sizes differ by at most one. Median is the top of the larger (or the average of both tops).

> **Asked as:** "Top K frequent elements." · "Merge K sorted lists." · "Find the median of a data stream." · "Why is heapify O(n) and not O(n log n)?"

---

## 1.7 Trees

```python
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val, self.left, self.right = val, left, right
```

**Traversals:**

```python
def inorder(root):                    # left → node → right : SORTED order in a BST
    out, stack, cur = [], [], root
    while cur or stack:
        while cur: stack.append(cur); cur = cur.left
        cur = stack.pop(); out.append(cur.val); cur = cur.right
    return out

def level_order(root):                # BFS — the shape of "by depth" questions
    if not root: return []
    out, q = [], deque([root])
    while q:
        level = []
        for _ in range(len(q)):       # snapshot the size — this is what separates the levels
            node = q.popleft()
            level.append(node.val)
            if node.left:  q.append(node.left)
            if node.right: q.append(node.right)
        out.append(level)
    return out
```

**BST** — left < node < right. Search/insert/delete are O(h): O(log n) balanced, O(n) degenerate (which is why AVL/red-black trees exist). Validate with bounds, not by checking each node against its children:

```python
def is_valid_bst(node, lo=float("-inf"), hi=float("inf")):
    if not node: return True
    if not (lo < node.val < hi): return False
    return is_valid_bst(node.left, lo, node.val) and is_valid_bst(node.right, node.val, hi)
```

**Tries** for prefix problems — autocomplete, word search, IP routing:

```python
class Trie:
    def __init__(self): self.children, self.is_word = {}, False
    def insert(self, word):
        node = self
        for ch in word:
            node = node.children.setdefault(ch, Trie())
        node.is_word = True
    def starts_with(self, prefix) -> bool:
        node = self
        for ch in prefix:
            node = node.children.get(ch)
            if node is None: return False
        return True
```

Also worth knowing by name: **heap** (above), **segment tree / Fenwick tree** (range queries with updates, O(log n)), **B-tree** (the database index), **LSM tree** (write-optimised storage: Cassandra, RocksDB).

> **Asked as:** "Validate a BST." · "Level-order traversal." · "Implement a trie." · "Why are database indexes B-trees rather than binary trees?" (fewer disk seeks — high fan-out means fewer levels)

---

## 1.8 Union-Find (Disjoint Set Union)

Near-O(1) per operation with path compression and union by rank. The tool for connectivity, cycle detection in undirected graphs, and Kruskal's MST.

```python
class DSU:
    def __init__(self, n):
        self.parent = list(range(n))
        self.rank = [0] * n
        self.components = n

    def find(self, x):
        while self.parent[x] != x:
            self.parent[x] = self.parent[self.parent[x]]   # path halving
            x = self.parent[x]
        return x

    def union(self, a, b) -> bool:
        ra, rb = self.find(a), self.find(b)
        if ra == rb: return False                          # already connected → a cycle
        if self.rank[ra] < self.rank[rb]: ra, rb = rb, ra
        self.parent[rb] = ra
        if self.rank[ra] == self.rank[rb]: self.rank[ra] += 1
        self.components -= 1
        return True
```

> **Asked as:** "Number of connected components." · "Detect a cycle in an undirected graph." · "Accounts merge / friend circles."

---

## 1.9 Sorting

| Algorithm | Average | Worst | Space | Stable | Notes |
|---|---|---|---|---|---|
| Quicksort | O(n log n) | O(n²) | O(log n) | No | Fastest in practice; worst case on bad pivots |
| Mergesort | O(n log n) | O(n log n) | O(n) | **Yes** | Predictable; the basis of external sorting |
| Heapsort | O(n log n) | O(n log n) | O(1) | No | In-place, no worst case, poor cache behaviour |
| Insertion | O(n²) | O(n²) | O(1) | Yes | Excellent for tiny or nearly-sorted inputs |
| Counting/Radix | O(n + k) | O(n + k) | O(n + k) | Yes | Only for bounded integer keys |

Real implementations are hybrids: **Timsort** (Python `sorted`, Java for objects) is mergesort + insertion sort exploiting existing runs; **introsort** (C++ `std::sort`) is quicksort that switches to heapsort at depth limit.

**Stability** matters when you sort by two keys in sequence: sort by name, then by department, and a stable sort keeps names ordered within each department.

**Comparison sorts cannot beat O(n log n)** — there are n! orderings and each comparison gives one bit, so you need log₂(n!) ≈ n log n comparisons.

**Quickselect** finds the k-th smallest in O(n) average without fully sorting — the right answer to "top K" when k is large relative to n.

> **Asked as:** "Which sort would you use and why?" · "What makes a sort stable and when do you care?" · "Why can't comparison sorting be faster than n log n?" · "Sort a 100 GB file with 8 GB of RAM." (external merge sort: sort chunks, then k-way merge)

---

## 1.10 Rapid-fire answers

| Question | Answer |
|---|---|
| Array vs linked list | Cache-friendly O(1) index vs O(1) splice given a node; arrays win in practice |
| Hash map vs tree map | O(1) unordered vs O(log n) sorted with range queries |
| Stack vs queue | LIFO (DFS, undo, parsing) vs FIFO (BFS, task queues) |
| When is O(n²) fine | Small, bounded n — clarity beats cleverness |
| Bit tricks | `x & (x-1)` clears the lowest set bit; `x & -x` isolates it; XOR finds the single non-duplicate |
| In-place | O(1) extra space beyond the input |
| Recursion → iteration | Use an explicit stack; needed to avoid stack overflow on deep inputs |
| Memory: 10⁶ ints | ~4 MB in C/Java, ~30+ MB as Python objects — Python's overhead is real |
| Choosing a structure | What operations dominate? Lookup → hash. Ordered/range → tree. Min/max → heap. Prefix → trie. Connectivity → DSU |
