# 📕 Logical Reasoning — MCQ Test Preparation Guide
### *(Guide 4 of 4 — based on your "MCQ Test Preparation Guideline" image: Logical Reasoning card)*

**Covers:** Analytical Challenges · Simple Mathematics

> Companion files: `01-Programming.md` · `02-Data-Structures-Algorithms.md` · `03-CS-Fundamentals.md`
> This section of an MCQ test is usually **speed-focused** (aptitude-test style, common at TCS, Infosys, Wipro, Capgemini, and most tech-company screening rounds) — the goal is pattern recognition under a time limit, not deep theory.

---

## Table of Contents
1. [How This Section Is Usually Structured](#1-how-this-section-is-usually-structured)
2. [Analytical Challenges — Verbal Reasoning](#2-analytical-challenges--verbal-reasoning)
3. [Analytical Challenges — Non-Verbal Reasoning](#3-analytical-challenges--non-verbal-reasoning)
4. [Simple Mathematics — Core Topics](#4-simple-mathematics--core-topics)
5. [Time-Saving Formulas Cheat Sheet](#5-time-saving-formulas-cheat-sheet)
6. [Most Asked Question Types (Practice Set)](#6-most-asked-question-types-practice-set)
7. [Exam-Day Strategy](#7-exam-day-strategy)
8. [Learn More](#8-learn-more-links)

---

## 1. How This Section Is Usually Structured

Logical reasoning / aptitude sections in company MCQ tests are typically split into:
- **Verbal Reasoning** — reasoning expressed through words/language (analogy, syllogism, blood relations, coding-decoding).
- **Non-Verbal / Abstract Reasoning** — reasoning through shapes, patterns, figures (mirror images, figure series, embedded figures).
- **Quantitative Aptitude ("Simple Mathematics")** — numerical problem solving (percentages, profit/loss, time-speed-distance, etc.).

At real placement tests (TCS NQT, Infosys, Wipro, Capgemini) the quant section typically runs **~26 questions in ~40 minutes** — roughly **90 seconds per question**, meaning speed and formula recall matter more than derivation from first principles.

---

## 2. Analytical Challenges — Verbal Reasoning

### 2.1 Coding–Decoding
Letters/numbers are encoded by a rule (shift, reversal, substitution); you must crack the rule and apply/reverse it.

**Example (letter-shift coding):**
```
If CAT is coded as DBU, what is DOG coded as?
Rule: each letter shifted +1 in the alphabet (C→D, A→B, T→U)
DOG → E P H
```

**Example (symbol coding — common in bank/SSC-style tests):**
```
A = B means 'A is the sister of B'
A $ B means 'A is the brother of B'
A @ B means 'A is the wife of B'
A * B means 'A is the father of B'
```
You're given a chain like `C @ F * K $ L = G` and must trace the family relationships step by step to answer "How is C related to G?" — solve these by drawing a small family tree diagram, not by trying to hold it all in your head.

### 2.2 Blood Relations
Tests understanding of family relationships from indirect statements.

**Example:**
```
Pointing to a photo, Raju says: "She is the daughter of the only son of my father."
How is the woman related to Raju?
→ "Only son of my father" = Raju himself (if Raju is male) or his brother.
→ If Raju has no brothers, "only son of my father" = Raju → the woman is Raju's daughter.
```
**Tip:** Always draw a quick family tree with symbols (male/female, generation levels) rather than tracking relationships mentally — this is the single biggest time-saver for this question type.

### 2.3 Syllogism
Given 2+ statements (premises), determine which conclusions logically follow — **using ONLY the given statements, not real-world knowledge.**

**Example:**
```
Statement 1: All cats are animals.
Statement 2: All animals are living beings.
Conclusion: All cats are living beings. → VALID (transitive chain)
```
```
Statement: All birds have wings. Penguins are birds.
Conclusion: Penguins can fly. → INVALID — this is a reasoning trap.
The statements only establish "penguins have wings," never "wings enable flight."
```
> ⚠️ **The #1 syllogism trap:** don't import outside knowledge. If the statements say something false-but-internally-consistent (e.g., "all cats are birds"), you must still evaluate conclusions strictly from the given premises, not from what you know is actually true.

**Common syllogism structures (Venn diagram approach is fastest):**
- All A are B + All B are C → All A are C ✅
- All A are B + No B is C → No A is C ✅
- Some A are B + All B are C → Some A are C ✅
- Some A are B + Some B are C → **No valid conclusion** (classic trap — "some ∩ some" doesn't chain)

### 2.4 Series Completion (Number / Alphabet / Alphanumeric)
Identify the pattern and predict the next term.

```
Number series: 2, 6, 12, 20, 30, ?
Pattern: differences are 4, 6, 8, 10 (increasing by 2) → next diff = 12 → answer = 42
(Also recognizable as n(n+1): 1×2, 2×3, 3×4, 4×5, 5×6, 6×7 = 42)

Alphabet series: A, C, F, J, O, ?
Pattern: gaps increase by 1 each time (+2, +3, +4, +5, +6) → O + 6 = U

Alphanumeric series: A1, C4, E9, G16, ?
Pattern: letters skip by 2 (A,C,E,G,I); numbers are perfect squares (1,4,9,16,25) → I25
```

### 2.5 Analogy
Identify the relationship between a given word pair, then apply the same relationship to a new pair.

```
Doctor : Hospital :: Teacher : ?
Relationship: person → workplace
Answer: School

Pen : Write :: Knife : ?
Relationship: tool → its primary function
Answer: Cut
```

### 2.6 Classification (Odd One Out)
Find the item that doesn't share the common property of the rest.

```
Find the odd one: Apple, Banana, Carrot, Mango
→ Carrot (it's a vegetable; the rest are fruits)

Find the odd one out: 117, 137, 183, 123
→ Check digit sums or a numeric pattern rule specified in the question
  (odd-one-out numeric questions usually hinge on a rule like "sum of digits is prime"
   or "not divisible by X" — read the specific rule the question implies)
```

### 2.7 Direction Sense
Tracks movement/turns to determine final position or direction.

```
A man walks 5 km North, then 3 km East, then 5 km South.
Where is he relative to his starting point?
→ North and South cancel out (5 km each) → he is 3 km East of start.
```
**Tip:** Sketch a simple compass (N-E-S-W) and plot each move as a vector — don't try to track this mentally beyond 2 moves.

### 2.8 Seating Arrangement & Puzzles
Multi-constraint problems (linear row, circular table) — place people/objects according to given clues.

```
5 people (A, B, C, D, E) sit in a row. 
Clue 1: B is immediately right of A.
Clue 2: D is at one of the ends.
Clue 3: C is exactly in the middle.
→ Solve by drawing 5 blank slots and filling in constraints one at a time,
  starting with the most restrictive clue (usually position-fixing clues like "at an end").
```

### 2.9 Statement & Conclusion / Assumption
Distinguish between what is explicitly **stated**, what can be **validly concluded**, and what is merely **assumed** (an unstated premise the argument depends on).

### 🔗 Learn More — Verbal Reasoning
- [IndiaBix: Logical Reasoning](https://www.indiabix.com/logical-reasoning/questions-and-answers/)
- [Sanfoundry: Logical Reasoning Questions](https://www.sanfoundry.com/logical-reasoning-questions-answers/)

---

## 3. Analytical Challenges — Non-Verbal Reasoning

Less common in *technical* company MCQ tests but still appears in general aptitude rounds:

- **Mirror Images / Water Images:** predicting how a figure appears when reflected.
- **Figure Series / Pattern Completion:** identifying the next shape in a visual sequence (rotation, shading, element-count patterns).
- **Embedded Figures:** finding a simpler shape hidden within a complex one.
- **Paper Folding/Cutting:** visualizing the result of folding paper and cutting a shape out, then unfolding.
- **Venn Diagrams:** classifying overlapping/disjoint sets (e.g., "Doctors, Men, Fathers" — draw 3 overlapping circles and reason about which regions satisfy which combination).
- **Dice/Cube problems:** given a few rotated views of a die, determine the opposite/adjacent face of a given number.

### 🔗 Learn More — Non-Verbal Reasoning
- [Sanfoundry: Non-Verbal Reasoning Tests](https://test.sanfoundry.com/logical-reasoning-tests/)

---

## 4. Simple Mathematics — Core Topics

These are the topics that dominate placement-style quantitative aptitude sections (TCS, Infosys, Wipro, Capgemini, and most technical MCQ screening tests).

### 4.1 Percentages
```
Percentage = (Part / Whole) × 100

Example: A shirt's price increased from ৳500 to ৳600. What's the % increase?
% increase = (600 - 500)/500 × 100 = 20%

Successive percentage change shortcut:
Two changes of a% and b% → net change = a + b + (ab/100)
Example: 20% increase then 10% decrease → 20 - 10 + (20×-10/100) = 8% net increase
```

### 4.2 Profit & Loss
```
Profit % = (SP - CP)/CP × 100        (SP = Selling Price, CP = Cost Price)
SP = CP × (1 + profit%/100)
CP = SP / (1 + profit%/100)

Example: A phone bought for ৳10,000, sold for ৳11,500.
Profit % = (11500-10000)/10000 × 100 = 15%

Discount: Marked Price (MP) vs Selling Price (SP)
Discount % = (MP - SP)/MP × 100
```

### 4.3 Simple Interest (SI) & Compound Interest (CI)
```
SI = (P × R × T) / 100        (P=Principal, R=Rate%, T=Time in years)

CI = P × (1 + R/100)^T - P

Example: ৳5,000 at 10% for 2 years
SI = (5000×10×2)/100 = ৳1,000
CI = 5000×(1.1)² - 5000 = 6050 - 5000 = ৳1,050  (CI > SI because of compounding)
```

### 4.4 Ratio & Proportion
```
a:b :: c:d  means  a/b = c/d  →  a×d = b×c (cross multiplication)

Example: Divide ৳1,200 between A and B in ratio 3:5
Total parts = 3+5 = 8
A's share = (3/8)×1200 = ৳450, B's share = (5/8)×1200 = ৳750
```

### 4.5 Time, Speed & Distance
```
Speed = Distance / Time
Distance = Speed × Time

Unit conversion: km/h → m/s: multiply by 5/18
                 m/s → km/h: multiply by 18/5

Relative speed:
- Same direction: speeds subtract
- Opposite direction: speeds add

Example: Two trains, 60 km/h and 40 km/h, moving toward each other, 500 km apart.
Relative speed = 60+40 = 100 km/h
Time to meet = 500/100 = 5 hours
```

### 4.6 Time & Work
```
If A can finish a job in 'x' days, A's work rate = 1/x per day.

Example: A finishes a job in 12 days, B finishes it in 18 days. Together?
Combined rate = 1/12 + 1/18 = 3/36 + 2/36 = 5/36 per day
Time together = 36/5 = 7.2 days
```

### 4.7 Averages
```
Average = Sum of values / Number of values

Example: A cricketer's average after 10 innings is 40. After the 11th innings
(scoring 62), what's the new average?
New average = (40×10 + 62)/11 = 462/11 = 42
```

### 4.8 Permutations & Combinations
```
Permutation (order matters): nPr = n! / (n-r)!
Combination (order doesn't matter): nCr = n! / (r! × (n-r)!)

Example: How many ways to choose 3 people from 5 for a committee (order doesn't matter)?
5C3 = 5!/(3!×2!) = 10

Example: How many ways to arrange 3 books out of 5 on a shelf (order matters)?
5P3 = 5!/2! = 60
```

### 4.9 Probability
```
Probability = Favorable outcomes / Total outcomes

Example: Probability of drawing a king from a standard 52-card deck
= 4/52 = 1/13

Example: Probability of getting at least one head in 2 coin tosses
Total outcomes = 4 (HH, HT, TH, TT)
P(at least one head) = 1 - P(no heads) = 1 - 1/4 = 3/4
```

### 4.10 Number Systems
```
- Prime numbers: only divisible by 1 and themselves (2, 3, 5, 7, 11, 13...)
- LCM (Least Common Multiple) & HCF/GCD (Highest Common Factor):
  LCM × HCF = product of the two numbers (for exactly 2 numbers)
- Divisibility rules:
  ÷2: last digit even | ÷3: digit sum divisible by 3 | ÷5: ends in 0 or 5
  ÷9: digit sum divisible by 9 | ÷11: alternating digit sum divisible by 11
```

### 4.11 Mixtures & Alligation
```
Alligation rule: for mixing two quantities of different concentrations/prices,
the ratio of quantities mixed = (difference of far value from mean) : (difference of mean from near value)

Example: Mix 20% and 30% saline solutions to get 24% concentration.
Ratio = (30-24) : (24-20) = 6:4 = 3:2
```

### 4.12 Pipes & Cisterns (a Time & Work variant)
```
An inlet pipe fills at rate 1/x per hour; an outlet pipe drains at rate 1/y per hour.
Net rate (both open) = 1/x - 1/y

Example: Pipe A fills a tank in 6 hours, Pipe B drains it in 12 hours. Both open together?
Net rate = 1/6 - 1/12 = 1/12 per hour → tank fills in 12 hours
```

### 4.13 Ages
```
Classic setup: "5 years ago, A's age was twice B's age. In 5 years, A will be 1.5 times B's age."
→ Set up two linear equations from the two time-shifted statements and solve simultaneously.
```

### 4.14 Clocks & Calendars (lower-frequency but occasionally tested)
```
Clock: minute hand moves 6°/min, hour hand moves 0.5°/min → angle between them
     = |30H - 5.5M|  (H = hour, M = minutes)

Calendar: use the odd-days method (days beyond complete weeks) to find what day
of the week a given date falls on.
```

### 🔗 Learn More — Quantitative Aptitude
- [IndiaBix: Aptitude Questions](https://www.indiabix.com/aptitude/questions-and-answers/)
- [GeeksforGeeks: Quantitative Aptitude](https://www.geeksforgeeks.org/aptitude-quantitative-aptitude/)

---

## 5. Time-Saving Formulas Cheat Sheet

| Topic | Formula |
|---|---|
| Profit % | (SP−CP)/CP × 100 |
| Simple Interest | (P×R×T)/100 |
| Compound Interest | P(1+R/100)^T − P |
| Speed | Distance/Time |
| km/h → m/s | × 5/18 |
| Average | Sum/Count |
| Work rate | 1/(days to finish) |
| nPr | n!/(n−r)! |
| nCr | n!/(r!(n−r)!) |
| Probability | Favorable/Total |
| LCM × HCF | = product of the two numbers |
| Successive % change | a + b + (ab/100) |

---

## 6. Most Asked Question Types (Practice Set)

Try these — solutions/approach noted after each (cover the answer and self-test first):

1. **Series:** 3, 7, 15, 31, 63, ? → *(each term = previous×2 + 1 → answer: 127)*
2. **Blood relation:** "A is B's father. C is B's sister. D is C's daughter. How is D related to A?" → *(D is A's granddaughter)*
3. **Syllogism:** "All pens are pencils. Some pencils are erasers. Conclusion: Some pens are erasers." → *(Invalid — "some" relationships don't chain transitively)*
4. **Coding:** "In a code, GARDEN is written as XZIWVM. How is FLOWER written in that code?" → *(Find the letter-substitution rule — likely each letter mapped to its mirror position in the alphabet: A↔Z, B↔Y, etc. — then apply to FLOWER)*
5. **Percentage:** "In an exam, 30% failed in Math and 20% failed in English, 10% failed in both. What % passed both?" → *(Passed both = 100 − (30+20−10) = 60%)*
6. **Time & Work:** "A and B together finish a job in 6 days. A alone finishes it in 10 days. How long does B alone take?" → *(1/6 − 1/10 = 1/15 → B takes 15 days)*
7. **Probability:** "A bag has 4 red and 6 blue balls. What's the probability of picking 2 red balls without replacement?" → *((4/10)×(3/9) = 12/90 = 2/15)*
8. **Direction:** "Facing north, a man turns 90° clockwise, then 180°, then 90° anticlockwise. Which direction does he face now?" → *(Trace each turn step by step on a compass — this tests careful execution, not cleverness)*

---

## 7. Exam-Day Strategy

- **Time budget:** ~60–90 seconds per question in most placement-style tests — if a question isn't clicking within that window, mark it and move on; return if time permits.
- **Solve easy questions first** to bank guaranteed marks and build confidence before tackling harder puzzle-style questions.
- **Draw diagrams** for blood relations, seating arrangements, and direction problems — mental tracking is the #1 source of careless errors under time pressure.
- **Memorize the formula cheat sheet (Section 5)** so quant questions become direct substitution rather than derivation.
- **For syllogism/statement-conclusion questions**, strictly use only the given statements — resist the urge to apply outside/real-world knowledge.
- **Negative marking:** many aptitude tests deduct marks for wrong answers — if genuinely unsure and negative marking applies, weigh whether an educated guess is worth the risk versus skipping.

---

## 8. Learn More — General Aptitude Practice
- [IndiaBix (huge free MCQ bank across all reasoning + aptitude topics)](https://www.indiabix.com/)
- [Sanfoundry (topic-wise reasoning tests with instant scoring)](https://test.sanfoundry.com/logical-reasoning-tests/)
- [GeeksforGeeks Aptitude section](https://www.geeksforgeeks.org/aptitude-quantitative-aptitude/)
- [PrepInsta (placement-focused aptitude + company-wise patterns)](https://prepinsta.com/)

---

## 📚 Full Set Recap
This is guide 4 of 4 for your MCQ Test Preparation:
1. `01-Programming.md` — OOP, Design Patterns, API, Database, Networking, HTML/CSS, Programming Fundamentals
2. `02-Data-Structures-Algorithms.md` — Data Structures, Algorithms, Complexity Analysis, Recursion
3. `03-CS-Fundamentals.md` — Database, Networking, OS, Security, API/HTTP, General Knowledge
4. `04-Logical-Reasoning.md` — Analytical Challenges, Simple Mathematics

**Suggested prep order given your background:** Since you're already deep into backend architecture (Java/Spring Boot, distributed systems patterns), guides 1 and 3 will feel like reinforcement of what you know — skim for gaps. Guide 2 (DSA) is worth dedicated daily practice given it's the highest-volume interview topic. Guide 4 is the most different from your daily work — a couple of timed practice sets from IndiaBix/Sanfoundry alongside this reference will build the speed you need.
