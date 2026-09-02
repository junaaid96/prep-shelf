# 2. Problem-Solving Patterns — The 12 That Cover Most Interviews

Almost every array/string interview question is one of a dozen patterns. Recognising the pattern in the first two minutes is the skill being tested.

---

## 2.1 Two pointers

**Signal:** sorted array, pair/triplet with a target, palindrome, in-place partition.

```python
def two_sum_sorted(nums, target):
    l, r = 0, len(nums) - 1
    while l < r:
        s = nums[l] + nums[r]
        if s == target: return [l, r]
        if s < target: l += 1                 # need bigger
        else:          r -= 1                 # need smaller
    return []

def three_sum(nums):
    nums.sort()
    out = []
    for i in range(len(nums) - 2):
        if i and nums[i] == nums[i-1]: continue          # skip duplicate anchors
        if nums[i] > 0: break                            # sorted → no triple can sum to 0
        l, r = i + 1, len(nums) - 1
        while l < r:
            s = nums[i] + nums[l] + nums[r]
            if s < 0: l += 1
            elif s > 0: r -= 1
            else:
                out.append([nums[i], nums[l], nums[r]])
                while l < r and nums[l] == nums[l+1]: l += 1
                while l < r and nums[r] == nums[r-1]: r -= 1
                l += 1; r -= 1
    return out                                            # O(n²)

def container_with_most_water(h):
    l, r, best = 0, len(h) - 1, 0
    while l < r:
        best = max(best, (r - l) * min(h[l], h[r]))
        if h[l] < h[r]: l += 1                            # move the shorter side — the only way to improve
        else: r -= 1
    return best
```

> **Asked as:** Two Sum II · 3Sum · Container With Most Water · Valid Palindrome · Trapping Rain Water · Sort Colours

---

## 2.2 Sliding window

**Signal:** contiguous subarray/substring, "longest/shortest/max sum with condition".

```python
def longest_unique_substring(s: str) -> int:
    last, best, start = {}, 0, 0
    for i, ch in enumerate(s):
        if ch in last and last[ch] >= start:
            start = last[ch] + 1                          # shrink past the previous occurrence
        last[ch] = i
        best = max(best, i - start + 1)
    return best

def min_window_substring(s: str, t: str) -> str:
    from collections import Counter
    need, missing = Counter(t), len(t)
    best, l = (0, float("inf")), 0
    for r, ch in enumerate(s):
        if need[ch] > 0: missing -= 1
        need[ch] -= 1
        while missing == 0:                               # valid window — shrink from the left
            if r - l < best[1] - best[0]: best = (l, r)
            need[s[l]] += 1
            if need[s[l]] > 0: missing += 1
            l += 1
    return "" if best[1] == float("inf") else s[best[0]:best[1]+1]

def max_sum_fixed_window(nums, k):
    window = sum(nums[:k]); best = window
    for i in range(k, len(nums)):
        window += nums[i] - nums[i-k]                     # add one, drop one — O(1) per step
        best = max(best, window)
    return best
```

**The template:** expand `r` always; shrink `l` while the window is invalid (or while it's valid, if you want the minimum). Every element enters and leaves once → O(n).

> **Asked as:** Longest Substring Without Repeating Characters · Minimum Window Substring · Longest Repeating Character Replacement · Permutation in String · Max Consecutive Ones III

---

## 2.3 Binary search (including on the answer)

```python
def binary_search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = lo + (hi - lo) // 2              # avoids overflow in fixed-width languages
        if nums[mid] == target: return mid
        if nums[mid] < target: lo = mid + 1
        else: hi = mid - 1
    return -1

def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target: return mid
        if nums[lo] <= nums[mid]:                          # left half is sorted
            if nums[lo] <= target < nums[mid]: hi = mid - 1
            else: lo = mid + 1
        else:                                              # right half is sorted
            if nums[mid] < target <= nums[hi]: lo = mid + 1
            else: hi = mid - 1
    return -1

# Binary search on the ANSWER — the pattern most people miss
def min_ship_capacity(weights, days):
    def feasible(cap):
        need, cur = 1, 0
        for w in weights:
            if cur + w > cap: need, cur = need + 1, 0
            cur += w
        return need <= days
    lo, hi = max(weights), sum(weights)
    while lo < hi:                                         # find the FIRST feasible value
        mid = (lo + hi) // 2
        if feasible(mid): hi = mid
        else: lo = mid + 1
    return lo
```

**Signal for "binary search the answer":** you're asked for a minimum/maximum value, and given a candidate you can check feasibility in O(n) — and feasibility is monotonic.

**Off-by-one discipline:** pick one template and stick to it. `while lo < hi` with `hi = mid` / `lo = mid + 1` finds the leftmost valid answer and never infinite-loops.

> **Asked as:** Search in Rotated Sorted Array · Find First/Last Position · Koko Eating Bananas · Capacity to Ship Packages · Median of Two Sorted Arrays · Find Peak Element

---

## 2.4 Fast & slow pointers (Floyd)

```python
def find_duplicate(nums):
    """n+1 numbers in [1,n] — treat the array as a linked list, find the cycle entrance. O(1) space."""
    slow = fast = nums[0]
    while True:
        slow, fast = nums[slow], nums[nums[fast]]
        if slow == fast: break
    slow = nums[0]
    while slow != fast:
        slow, fast = nums[slow], nums[fast]
    return slow
```

> **Asked as:** Linked List Cycle I/II · Find the Duplicate Number · Happy Number · Middle of the Linked List · Palindrome Linked List

---

## 2.5 Intervals

```python
def merge_intervals(intervals):
    intervals.sort(key=lambda x: x[0])                     # sorting by start is step one, always
    out = [intervals[0]]
    for start, end in intervals[1:]:
        if start <= out[-1][1]: out[-1][1] = max(out[-1][1], end)   # overlap → extend
        else: out.append([start, end])
    return out

def min_meeting_rooms(intervals):
    """Sweep line: +1 at each start, -1 at each end; the peak is the answer."""
    events = sorted([(s, 1) for s, _ in intervals] + [(e, -1) for _, e in intervals])
    cur = best = 0
    for _, delta in events:
        cur += delta
        best = max(best, cur)
    return best
```

> **Asked as:** Merge Intervals · Insert Interval · Non-overlapping Intervals · Meeting Rooms I/II · Employee Free Time

---

## 2.6 Backtracking

**Signal:** "all combinations/permutations/subsets", N-Queens, Sudoku, word search.

```python
def subsets(nums):
    out, path = [], []
    def backtrack(start):
        out.append(path[:])                                # copy — path is mutated in place
        for i in range(start, len(nums)):
            path.append(nums[i])
            backtrack(i + 1)
            path.pop()                                     # UNDO — this is the backtrack
    backtrack(0)
    return out

def permutations(nums):
    out = []
    def backtrack(path, remaining):
        if not remaining: out.append(path[:]); return
        for i in range(len(remaining)):
            backtrack(path + [remaining[i]], remaining[:i] + remaining[i+1:])
    backtrack([], nums)
    return out

def combination_sum(candidates, target):
    candidates.sort()
    out, path = [], []
    def backtrack(start, remain):
        if remain == 0: out.append(path[:]); return
        for i in range(start, len(candidates)):
            if candidates[i] > remain: break               # PRUNE — sorted, so all later are worse
            path.append(candidates[i])
            backtrack(i, remain - candidates[i])           # `i` not `i+1`: reuse allowed
            path.pop()
    backtrack(0, target)
    return out
```

**The template:** choose → explore → un-choose. Add pruning as early as possible; it's the difference between passing and TLE.

> **Asked as:** Subsets I/II · Permutations · Combination Sum · N-Queens · Word Search · Palindrome Partitioning · Generate Parentheses

---

## 2.7 Top-K / heap

```python
from collections import Counter
import heapq

def top_k_frequent(nums, k):
    counts = Counter(nums)
    return heapq.nlargest(k, counts, key=counts.get)       # O(n log k)
    # Or bucket sort by frequency for true O(n)
```

> **Asked as:** Top K Frequent Elements · Kth Largest in an Array · K Closest Points · Task Scheduler · Reorganize String

---

## 2.8 Cyclic sort & index-as-hash

**Signal:** array contains numbers in the range 1..n (or 0..n-1) and you need O(1) space.

```python
def first_missing_positive(nums):
    n = len(nums)
    for i in range(n):
        while 1 <= nums[i] <= n and nums[nums[i] - 1] != nums[i]:
            j = nums[i] - 1
            nums[i], nums[j] = nums[j], nums[i]            # put each value at its index
    for i in range(n):
        if nums[i] != i + 1: return i + 1
    return n + 1
```

Alternative trick: negate `nums[abs(x)-1]` to mark "seen" without extra space.

> **Asked as:** Missing Number · Find All Numbers Disappeared · Find the Duplicate · First Missing Positive

---

## 2.9 Prefix sum & hash map

```python
def subarray_sum_equals_k(nums, k):
    from collections import defaultdict
    counts = defaultdict(int); counts[0] = 1               # empty prefix
    total = result = 0
    for x in nums:
        total += x
        result += counts[total - k]                        # how many prefixes make a valid subarray
        counts[total] += 1
    return result                                          # O(n), handles negatives
```

> **Asked as:** Subarray Sum Equals K · Continuous Subarray Sum · Product of Array Except Self · Range Sum Query

---

## 2.10 Monotonic stack

```python
def largest_rectangle_in_histogram(heights):
    stack, best = [], 0                                    # stack holds indices, increasing heights
    for i, h in enumerate(heights + [0]):                  # sentinel flushes the stack
        while stack and heights[stack[-1]] > h:
            height = heights[stack.pop()]
            width = i - stack[-1] - 1 if stack else i
            best = max(best, height * width)
        stack.append(i)
    return best
```

> **Asked as:** Daily Temperatures · Next Greater Element · Largest Rectangle in Histogram · Trapping Rain Water · Remove K Digits

---

## 2.11 Merge intervals / k-way merge / two heaps

Covered above and in the heaps note — the recurring idea is that **sorting or a heap turns a quadratic comparison into a linear sweep**.

---

## 2.12 Bit manipulation

```python
x & 1                 # odd?
x >> 1                # divide by 2
x & (x - 1)           # clear the lowest set bit → count bits by looping until 0
x & -x                # isolate the lowest set bit
x ^ y                 # differing bits; a^a == 0 and a^0 == a

def single_number(nums):
    result = 0
    for x in nums: result ^= x        # pairs cancel; the loner survives. O(n), O(1) space
    return result

def count_bits(n):
    return [bin(i).count("1") for i in range(n + 1)]
    # DP version: dp[i] = dp[i >> 1] + (i & 1)

# Enumerate all subsets of an n-element set
for mask in range(1 << n):
    subset = [items[i] for i in range(n) if mask & (1 << i)]
```

> **Asked as:** Single Number I/II/III · Number of 1 Bits · Counting Bits · Reverse Bits · Sum of Two Integers Without `+`

---

## 2.13 How to attack an unseen problem (say this out loud)

1. **Restate** the problem and confirm the input/output shape.
2. **Ask about constraints and edge cases**: size of n, value ranges, duplicates, empty input, negatives, sorted?, memory limit. The constraint tells you the target complexity.
3. **Give the brute force**, with its complexity. Never start silent — a working O(n²) beats a broken O(n).
4. **Find the redundancy.** What is the brute force recomputing? That's where the hash map / sorted order / window / memo goes.
5. **State the approach and its complexity before coding.** Get agreement.
6. **Code it**, narrating as you go, with meaningful names.
7. **Trace an example by hand**, including an edge case.
8. **State the complexity** and one thing you'd improve with more time.

**Communication is scored.** A candidate who thinks aloud, asks good questions, and catches their own bug beats a silent candidate who happens to produce the same code.

> **Asked as:** every problem. Practise the process, not just the answers.
