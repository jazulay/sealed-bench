// 25 parameterized templates, each a numeric variant of one GSM8K test problem
// (see data/public-gsm8k-25.json). Answers are computed by code, never by a model.
// Every generator only produces parameter sets with a positive integer answer.

export interface Rng {
  int(lo: number, hi: number): number; // inclusive
  pick<T>(xs: readonly T[]): T;
}
export interface Variant { question: string; answer: number }
export interface Template { id: string; gsm8k: number; make(r: Rng): Variant }

const T = (id: string, gsm8k: number, make: (r: Rng) => Variant): Template => ({ id, gsm8k, make });

export const TEMPLATES: Template[] = [
  T("ducks", 0, (r) => {
    const e = r.int(14, 30), b = r.int(2, 5), m = r.int(2, 6), p = r.int(2, 6);
    return { question: `Janet’s ducks lay ${e} eggs per day. She eats ${b} for breakfast every morning and bakes muffins for her friends every day with ${m}. She sells the remainder at the farmers' market daily for $${p} per fresh duck egg. How much in dollars does she make every day at the farmers' market?`, answer: (e - b - m) * p };
  }),
  T("robe", 1, (r) => {
    const b = 2 * r.int(2, 15);
    return { question: `A robe takes ${b} bolts of blue fiber and half that much white fiber.  How many bolts in total does it take?`, answer: b + b / 2 };
  }),
  T("sprints", 3, (r) => {
    const s = r.int(2, 8), t = r.int(2, 6), m = 10 * r.int(4, 15);
    return { question: `James decides to run ${s} sprints ${t} times a week.  He runs ${m} meters each sprint.  How many total meters does he run a week?`, answer: s * t * m };
  }),
  T("chickens", 4, (r) => {
    const c = r.int(2, 4), f = r.int(12, 40), tot = c * f, x = r.int(Math.floor(tot / 5), Math.floor(tot / 3)), y = r.int(Math.floor(tot / 5), Math.floor(tot / 3));
    return { question: `Every day, Wendi feeds each of her chickens ${c} cups of mixed chicken feed, containing seeds, mealworms and vegetables to help keep them healthy.  She gives the chickens their feed in three separate meals. In the morning, she gives her flock of chickens ${x} cups of feed.  In the afternoon, she gives her chickens another ${y} cups of feed.  How many cups of feed does she need to give her chickens in the final meal of the day if the size of Wendi's flock is ${f} chickens?`, answer: tot - x - y };
  }),
  T("sheep", 6, (r) => {
    const m = r.int(2, 4), k = r.int(2, 6), s = r.int(5, 40);
    return { question: `Toulouse has ${m} times as many sheep as Charleston. Charleston has ${k} times as many sheep as Seattle. How many sheep do Toulouse, Charleston, and Seattle have together if Seattle has ${s} sheep?`, answer: s + k * s + m * k * s };
  }),
  T("overtime", 9, (r) => {
    const rate = 5 * r.int(2, 8), h = r.int(42, 55);
    return { question: `Eliza's rate per hour for the first 40 hours she works each week is $${rate}. She also receives an overtime pay of 1.2 times her regular hourly rate. If Eliza worked for ${h} hours this week, how much are her earnings for this week?`, answer: 40 * rate + ((h - 40) * rate * 6) / 5 };
  }),
  T("downloads", 10, (r) => {
    const d = 10 * r.int(3, 20), m = r.int(2, 5), p = 10 * r.int(1, 5);
    return { question: `A new program had ${d} downloads in the first month. The number of downloads in the second month was ${m} times as many as the downloads in the first month, but then reduced by ${p}% in the third month. How many downloads did the program have total over the three months?`, answer: d + m * d + (m * d * (100 - p)) / 100 };
  }),
  T("bakery", 11, (r) => {
    const a = r.int(2, 6), x = r.int(40, 90), b = r.int(1, 5), y = r.int(40, 90), c = r.int(2, 8), z = r.int(30, 70);
    return { question: `Toula went to the bakery and bought various types of pastries. She bought ${a} dozen donuts which cost $${x} per dozen, ${b} dozen mini cupcakes which cost $${y} per dozen, and ${c} dozen mini cheesecakes for $${z} per dozen. How much was the total cost?`, answer: a * x + b * y + c * z };
  }),
  T("salary", 17, (r) => {
    const a = r.int(15, 35), b = r.int(20, 45), w = r.int(40, 52), h1 = r.int(20, 40), h2 = r.int(5, 20);
    return { question: `Jill gets paid $${a} per hour to teach and $${b} to be a cheerleading coach. If she works ${w} weeks a year, ${h1} hours a week as a teacher and ${h2} hours a week as a coach, what's her annual salary?`, answer: w * (a * h1 + b * h2) };
  }),
  T("omelet", 18, (r) => {
    const [e, w] = r.pick([[2, 6], [2, 12], [3, 4], [3, 8], [4, 3], [4, 6], [6, 2], [6, 4], [6, 6]] as const);
    return { question: `Claire makes a ${e} egg omelet every morning for breakfast.  How many dozens of eggs will she eat in ${w} weeks?`, answer: (e * 7 * w) / 12 };
  }),
  T("cousins", 21, (r) => {
    const d = r.int(2, 12), a = r.int(20, 35), s = r.int(a - d + 3, a - d + 25);
    return { question: `Raymond and Samantha are cousins. Raymond was born ${d} years before Samantha. Raymond had a son at the age of ${a}. If Samantha is now ${s}, how many years ago was Raymond's son born?`, answer: s + d - a };
  }),
  T("dvds", 22, (r) => {
    const a = r.int(2, 6), b = r.int(2, 6), c = r.int(1, 5), k = r.int(2, 4);
    return { question: `Billy sells DVDs. He has ${a + b + c} customers on Tuesday. His first ${a} customers buy one DVD each.  His next ${b} customers buy ${k} DVDs each.  His last ${c} customers don't buy any DVDs. How many DVDs did Billy sell on Tuesday?`, answer: a + k * b };
  }),
  T("candle", 23, (r) => {
    const c = r.int(2, 6), h1 = r.int(1, 5), h2 = r.int(h1 + 2, 11);
    return { question: `A candle melts by ${c} centimeters every hour that it burns. How many centimeters shorter will a candle be after burning from ${h1}:00 PM to ${h2}:00 PM?`, answer: c * (h2 - h1) };
  }),
  T("clothes", 26, (r) => {
    const q = 2 * r.int(1, 4), x = r.int(10, 25), y = r.int(15, 35), z = r.int(30, 60);
    return { question: `Mishka bought ${q} pairs of shorts, ${q} pairs of pants, and ${q} pairs of shoes. One pair of shorts costs $${x}.50. One pair of pants costs $${y}.50 and one pair of shoes costs $${z}. How many dollars did Mishka spend on all the clothing items?`, answer: q * (x + y + z + 1) };
  }),
  T("icecream", 27, (r) => {
    const c = r.pick([10, 12, 15, 20] as const), p = r.int(3, 9), d = c * r.int(2, 9);
    return { question: `Cynthia eats one serving of ice cream every night.  She buys cartons of ice cream with ${c} servings of ice cream per carton at a cost of $${p}.00 per carton.  After ${d} days, how much will she spend on ice cream?`, answer: (d / c) * p };
  }),
  T("bike", 28, (r) => {
    const t = 5 * r.int(10, 24), a = r.int(10, Math.floor(t / 3)), b = r.int(5, Math.floor(t / 3));
    return { question: `Henry made two stops during his ${t}-mile bike trip. He first stopped after ${a} miles. His second stop was ${b} miles before the end of the trip. How many miles did he travel between his first and second stops?`, answer: t - a - b };
  }),
  T("boots", 29, (r) => {
    const h = r.int(20, 60), d = r.int(3, 15);
    return { question: `Gloria is shoe shopping when she comes across a pair of boots that fit her shoe budget. However, she has to choose between the boots and two pairs of high heels that together cost ${d} dollars less than the boots. If one pair of heels costs $${h} and the other costs twice as much, how many dollars are the boots?`, answer: 3 * h + d };
  }),
  T("ratio", 30, (r) => {
    const [p, q] = r.pick([[2, 3], [3, 5], [4, 5], [5, 7], [7, 11], [5, 9]] as const), u = r.int(4, 12), y = r.int(3, 15);
    return { question: `Darrell and Allen's ages are in the ratio of ${p}:${q}. If their total age now is ${(p + q) * u}, calculate Allen's age ${y} years from now.`, answer: q * u + y };
  }),
  T("dogs", 32, (r) => {
    const n = 2 * r.int(3, 12);
    return { question: `John takes care of ${n} dogs.  Each dog takes .5 hours a day to walk and take care of their business.  How many hours a week does he spend taking care of dogs?`, answer: (n / 2) * 7 };
  }),
  T("coins", 33, (r) => {
    const s = r.int(20, 80), g = s + 2 * r.int(5, 25);
    return { question: `Gretchen has ${s + g} coins. There are ${g - s} more gold coins than silver coins. How many gold coins does Gretchen have?`, answer: g };
  }),
  T("jewels", 34, (r) => {
    const rr = 2 * r.int(10, 40), b = r.int(2, 12), a = r.int(1, 6);
    return { question: `Siobhan has ${a} fewer jewels than Aaron. Aaron has ${b} more jewels than half of Raymond's jewels. If Raymond has ${rr} jewels, how many jewels does Siobhan have?`, answer: rr / 2 + b - a };
  }),
  T("yogurt", 36, (r) => {
    const y = r.int(1, 3), n = r.pick([2, 3, 4, 5] as const), p = r.int(3, 8);
    const d = n * r.int(5, 15);
    return { question: `Terry eats ${y} yogurts a day.  They are currently on sale at ${n} yogurts for $${p}.00.  How much does he spend on yogurt over ${d} days?`, answer: ((y * d) / n) * p };
  }),
  T("lego", 37, (r) => {
    const s = r.int(10, 25), k = r.int(6, 14), l = k + r.int(1, 8), g = r.int(3, 9);
    const total = s * k, c = Math.floor((total - 1) / g) - r.int(0, 3), left = total - g * c;
    return { question: `John plans to sell all his toys and use the money to buy video games. He has ${l} lego sets and he sells them for $${s} each. He ends up buying ${g} video games for $${c} each and has $${left} left. How many lego sets does he still have?`, answer: l - k };
  }),
  T("pies", 42, (r) => {
    const p = r.int(3, 9), s = r.pick([6, 8, 10, 12] as const), rem = r.int(3, p * s - 5);
    return { question: `Grandma Jones baked ${p} apple pies for the fireman's luncheon.  She cut each pie into ${s} pieces and set the ${p} pies out on the buffet table for the guests to serve themselves.  At the end of the evening, after the guests had taken and eaten their pieces of pie, there were ${rem} pieces of pie remaining.  How many pieces were taken by the guests?`, answer: p * s - rem };
  }),
  T("candles", 44, (r) => {
    const c = r.int(6, 12), y = r.int(2, 5), x = r.int(5, Math.min(15, c * y - 1)), n = c * r.int(2, 6);
    return { question: `Charlie wants to sell beeswax candles.  For every pound of beeswax, he can make ${c} tapered candles.  One pound of beeswax and the wicks cost $${x}.00 in supplies.   If he sells each candle for $${y}.00 each, what is his net profit if he makes and sells ${n} candles?`, answer: n * y - (n / c) * x };
  }),
];
