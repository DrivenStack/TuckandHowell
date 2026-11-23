/**
 * Seeded dummy data. Every day is generated from its own seed (the New York date),
 * so reloading gives identical history, and today only reveals events up to "now".
 */
import { DAY, HOUR, MINUTE, nyAddDays, nyParts, nyStartOfDay } from "@/lib/time";
import {
  EMERGENCY_JOB_TYPES,
  type AvailabilityBlock,
  type AvailabilityStatus,
  type Call,
  type Csr,
  type Customer,
  type Dataset,
  type InboundCall,
  type InboundLead,
  type Job,
  type JobType,
  type OutboundCall,
  type TextMessage,
} from "@/lib/types";
import {
  AI_ISSUES,
  AI_NO_BOOK_REASONS,
  ANGI_MESSAGES,
  CAMPAIGNS,
  CITY_WEIGHTS,
  CSRS,
  FIRST_NAMES,
  JOB_TYPE_WEIGHTS,
  LAST_NAMES,
  PROFILE_ANSWER_WEIGHT,
  PROFILE_BOOKING,
  STREETS,
  USERS,
  WEB_FORM_MESSAGES,
} from "./fixtures";
import { Rng } from "./rng";

export const HISTORY_DAYS = 90;
export const GO_LIVE_DAYS_AGO = 14;
const CUSTOMER_COUNT = 1500;
const SEED = "tuck-and-howell";

/* ---------------- Customers ---------------- */

export function generateCustomers(now: number): Customer[] {
  const rng = new Rng(`${SEED}:customers`);
  const pools: Record<"864" | "828", number[]> = {
    "864": rng.shuffle(Array.from({ length: 1000 }, (_, i) => i)),
    "828": rng.shuffle(Array.from({ length: 1000 }, (_, i) => i)),
  };
  const take = (preferred: "864" | "828") => {
    // Upstate SC numbers run out first; overflow uses 828 (common for cell phones in the area)
    const area = pools[preferred].length ? preferred : preferred === "864" ? "828" : "864";
    const n = pools[area].pop() ?? 0;
    return `(${area}) 555-0${String(n).padStart(3, "0")}`;
  };
  const customers: Customer[] = [];
  const usedNames = new Set<string>();
  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    let firstName = rng.pick(FIRST_NAMES);
    let lastName = rng.pick(LAST_NAMES);
    let guard = 0;
    while (usedNames.has(`${firstName} ${lastName}`) && guard++ < 20) {
      firstName = rng.pick(FIRST_NAMES);
      lastName = rng.pick(LAST_NAMES);
    }
    usedNames.add(`${firstName} ${lastName}`);
    const city = rng.weighted(CITY_WEIGHTS);
    const area = city === "Hendersonville" ? "828" : "864";
    const phones = [take(area)];
    if (rng.chance(0.12)) phones.push(take(rng.chance(0.85) ? area : area === "864" ? "828" : "864"));
    const isVip = rng.chance(0.3);
    const yearsAgo = rng.range(0.1, 9);
    customers.push({
      id: `cust_${String(i + 1).padStart(4, "0")}`,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      phones,
      city,
      state: city === "Hendersonville" ? "NC" : "SC",
      address: `${rng.int(100, 4999)} ${rng.pick(STREETS)}`,
      isVip,
      membershipSince: isVip ? now - rng.range(0.1, Math.min(yearsAgo, 6)) * 365 * DAY : null,
      type: rng.chance(0.08) ? "Commercial" : "Residential",
      createdAt: now - yearsAgo * 365 * DAY,
    });
  }
  return customers;
}

/* ---------------- Availability (Dialpad) ---------------- */

interface ShiftPlan {
  start: number;
  end: number;
}

function shiftFor(csr: Csr, dayStart: number, weekday: number, weekIndex: number, rng: Rng): ShiftPlan | null {
  const idx = CSRS.findIndex((c) => c.id === csr.id);
  if (weekday === 6) {
    // Saturday: two CSRs rotate, 8 am to 4 pm
    const onDuty = [(weekIndex * 2) % 8, (weekIndex * 2 + 1) % 8];
    return onDuty.includes(idx) ? { start: dayStart + 8 * HOUR, end: dayStart + 16 * HOUR } : null;
  }
  if (weekday === 0) {
    // Sunday: one CSR, 10 am to 4 pm
    return idx === (weekIndex + 3) % 8 ? { start: dayStart + 10 * HOUR, end: dayStart + 16 * HOUR } : null;
  }
  if (rng.chance(0.04)) return null; // day off / sick
  return { start: dayStart + csr.shiftStartHour * HOUR, end: dayStart + csr.shiftEndHour * HOUR };
}

function buildAvailability(csr: Csr, dayStart: number, shift: ShiftPlan | null, rng: Rng): AvailabilityBlock[] {
  const dayEnd = dayStart + DAY;
  if (!shift) return [{ csrId: csr.id, start: dayStart, end: dayEnd, status: "Offline" }];
  const struggling = csr.profile === "struggling";
  let start = shift.start;
  if (rng.chance(struggling ? 0.3 : 0.06)) start += rng.int(4, 18) * MINUTE;
  const len = shift.end - shift.start;
  const off: { start: number; end: number; status: AvailabilityStatus }[] = [];
  const add = (s: number, mins: number, status: AvailabilityStatus) => {
    const st = Math.max(start, Math.min(shift.end - 10 * MINUTE, s));
    off.push({ start: st, end: Math.min(shift.end, st + mins * MINUTE), status });
  };
  if (len >= 6 * HOUR) {
    add(shift.start + 2 * HOUR + rng.int(-20, 20) * MINUTE, struggling ? rng.int(16, 26) : rng.int(14, 17), "Break");
    add(shift.start + 4 * HOUR + rng.int(-25, 30) * MINUTE, rng.int(30, 45), "Lunch");
    add(shift.start + 6 * HOUR + rng.int(-20, 20) * MINUTE, struggling ? rng.int(15, 24) : rng.int(13, 16), "Break");
  } else {
    add(shift.start + 3 * HOUR, 15, "Break");
  }
  const aways = struggling ? rng.int(1, 3) : rng.chance(0.35) ? 1 : 0;
  for (let i = 0; i < aways; i++) {
    // Struggling CSR sometimes steps away during the morning peak
    const at = struggling && i === 0 && rng.chance(0.5) ? dayStart + rng.range(8.5, 9.6) * HOUR : rng.range(start, shift.end);
    add(at, rng.int(6, 22), "Away");
  }
  off.sort((a, b) => a.start - b.start);
  const blocks: AvailabilityBlock[] = [];
  const push = (s: number, e: number, status: AvailabilityStatus) => {
    if (e - s < MINUTE) return;
    const last = blocks[blocks.length - 1];
    if (last && last.status === status && last.end >= s) last.end = Math.max(last.end, e);
    else blocks.push({ csrId: csr.id, start: s, end: e, status });
  };
  push(dayStart, start, "Offline");
  let cursor = start;
  for (const o of off) {
    if (o.start < cursor) o.start = cursor;
    if (o.end <= o.start) continue;
    push(cursor, o.start, "Available");
    push(o.start, o.end, o.status);
    cursor = o.end;
  }
  push(cursor, shift.end, "Available");
  push(shift.end, dayEnd, "Offline");
  return blocks;
}

function statusAt(blocks: AvailabilityBlock[], t: number): AvailabilityStatus {
  for (const b of blocks) if (t >= b.start && t < b.end) return b.status;
  return "Offline";
}

/** How long an abandoned caller waited before hanging up. Most give up fast; a tail waits on hold. */
export function hangUpSeconds(rng: Rng): number {
  return rng.weighted([
    [rng.int(2, 10), 58],
    [rng.int(11, 30), 20],
    [rng.int(31, 60), 11],
    [rng.int(61, 120), 7],
    [rng.int(121, 300), 4],
  ] as const);
}

/** How long a caller talked with the AI Voice Agent. Some hang up as soon as they hear a bot. */
export function aiCallSeconds(rng: Rng, booked: boolean): number {
  if (booked) return rng.int(120, 360);
  return rng.weighted([
    [rng.int(6, 29), 16],
    [rng.int(30, 59), 20],
    [rng.int(60, 119), 30],
    [rng.int(120, 239), 26],
    [rng.int(240, 480), 8],
  ] as const);
}

/* ---------------- Jobs ---------------- */

const HOURLY_WEIGHTS = [
  0.25, 0.15, 0.1, 0.1, 0.15, 0.35, 0.9, 3.2, 9, 10, 8, 6.2, 5, 8, 9, 7.2, 6, 4.2, 3, 1.6, 1.1, 0.8, 0.5, 0.35,
];

export function jobAmount(rng: Rng, jobType: JobType): { amount: number; isReplacement: boolean } {
  const replaceable = jobType === "No Heat" || jobType === "No Cool" || jobType === "Estimate Request" || jobType === "HVAC Service";
  if (replaceable && rng.chance(jobType === "Estimate Request" ? 0.35 : 0.06)) {
    return { amount: Math.round(rng.range(6000, 18000) / 50) * 50, isReplacement: true };
  }
  if (jobType === "Water Heater" && rng.chance(0.3)) {
    return { amount: Math.round(rng.range(1900, 3600) / 10) * 10, isReplacement: true };
  }
  const base = rng.normal(450, 45);
  return { amount: Math.round(Math.max(290, Math.min(640, base))), isReplacement: false };
}

function makeJob(
  rng: Rng,
  id: string,
  customerId: string,
  jobType: JobType,
  bookedAt: number,
  campaignId: string,
  bookedBy: Job["bookedBy"],
  csrId: string | null,
  originCallId: string | null,
  now: number,
): Job {
  const { amount, isReplacement } = jobAmount(rng, jobType);
  const emergency = EMERGENCY_JOB_TYPES.includes(jobType);
  const bookedDay = nyStartOfDay(bookedAt);
  const scheduledFor = emergency && rng.chance(0.7)
    ? bookedAt + rng.range(1.5, 6) * HOUR
    : nyAddDays(bookedDay, rng.int(1, 3)) + rng.int(8, 15) * HOUR;
  const canceled = rng.chance(0.04);
  let completedAt: number | null = canceled ? null : scheduledFor + rng.range(1, 3) * HOUR;
  let paidAt: number | null = completedAt && rng.chance(0.88) ? completedAt + rng.range(0, 9) * DAY : null;
  if (completedAt && completedAt > now) completedAt = null;
  if (!completedAt || (paidAt && paidAt > now)) paidAt = null;
  return {
    id,
    customerId,
    jobType,
    bookedAt,
    scheduledFor,
    completedAt,
    paidAt,
    status: canceled ? "Canceled" : paidAt ? "Paid" : completedAt ? "Completed" : "Booked",
    bookedByCsrId: csrId,
    bookedBy,
    campaignId,
    originCallId,
    amount,
    isReplacement,
  };
}

/* ---------------- Main generator ---------------- */

const HOUR_ITEMS = HOURLY_WEIGHTS.map((w, h) => [h, w] as const);

interface DraftInbound {
  at: number;
  customer: Customer;
  phone: string;
  jobType: JobType;
  campaignId: string;
  forced?: "missed" | "csr_answered";
  repeat?: boolean;
}

export function generateDataset(now: number): Dataset {
  const todayStart = nyStartOfDay(now);
  const historyStart = nyAddDays(todayStart, -(HISTORY_DAYS - 1));
  const goLiveAt = nyAddDays(todayStart, -GO_LIVE_DAYS_AGO) + 9 * HOUR;

  const customers = generateCustomers(todayStart);
  const csrs: Csr[] = CSRS.map((c) => ({
    ...c,
    hiredAt: todayStart - Math.round((c as Csr & { hiredYearsAgo: number }).hiredYearsAgo * 365) * DAY,
  }));
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const campaignWeights = CAMPAIGNS.map((c) => [c.id, c.weight] as const);

  const calls: Call[] = [];
  const texts: TextMessage[] = [];
  const jobs: Job[] = [];
  const inboundLeads: InboundLead[] = [];
  const availability: AvailabilityBlock[] = [];
  const dialpadInternalCallsByDay: Record<string, number> = {};
  const coveredUntil = new Map<string, number>();

  for (let d = HISTORY_DAYS - 1; d >= 0; d--) {
    const dayStart = nyAddDays(todayStart, -d);
    const parts = nyParts(dayStart + 12 * HOUR);
    const dayKey = parts.dayKey;
    const weekday = parts.weekday;
    const weekIndex = Math.floor((dayStart - historyStart) / (7 * DAY));
    const rng = new Rng(`${SEED}:day:${dayKey}`);
    const live = dayStart + 12 * HOUR >= goLiveAt;
    const hiredBeforeDay = (c: Csr) => c.hiredAt <= dayStart;

    // Availability per CSR
    const dayBlocks = new Map<string, AvailabilityBlock[]>();
    for (const csr of csrs) {
      const shift = hiredBeforeDay(csr) ? shiftFor(csr, dayStart, weekday, weekIndex, rng) : null;
      const blocks = buildAvailability(csr, dayStart, shift, rng);
      dayBlocks.set(csr.id, blocks);
      availability.push(...blocks);
    }
    dialpadInternalCallsByDay[dayKey] = weekday === 0 ? rng.int(2, 6) : weekday === 6 ? rng.int(6, 14) : rng.int(18, 42);

    // Volume: weekday 140-220, Sat 40-80, Sun 20-40, colder recent weeks a bit busier.
    const cold = 1 + 0.12 * (1 - d / HISTORY_DAYS);
    const volume = Math.round(
      (weekday === 0 ? rng.int(20, 40) : weekday === 6 ? rng.int(40, 80) : rng.int(140, 205)) * cold,
    );
    const noHeatBoost = 0.55 + 0.9 * (1 - d / HISTORY_DAYS);
    const jobItems = JOB_TYPE_WEIGHTS.map(([j, w]) => [j, j === "No Heat" ? w * noHeatBoost : w] as const);

    const drafts: DraftInbound[] = [];
    for (let i = 0; i < volume; i++) {
      const hour = rng.weighted(HOUR_ITEMS);
      const at = dayStart + hour * HOUR + rng.int(0, 3599) * 1000;
      const customer = customers[rng.int(0, customers.length - 1)];
      const phone = customer.phones.length > 1 && rng.chance(0.3) ? customer.phones[1] : customer.phones[0];
      const jobType = rng.weighted(jobItems);
      const campaignId =
        customer.city === "Hendersonville" && rng.chance(0.3) ? "gbp_hendersonville" : rng.weighted(campaignWeights);
      drafts.push({ at, customer, phone, jobType, campaignId });
    }
    drafts.sort((a, b) => a.at - b.at);

    const busyUntil = new Map<string, number>();
    const dayInbound: InboundCall[] = [];
    let seq = 0;
    const queue = [...drafts];

    const freeCsrs = (t: number) =>
      csrs.filter((c) => statusAt(dayBlocks.get(c.id) ?? [], t) === "Available" && (busyUntil.get(c.id) ?? 0) <= t);

    for (let qi = 0; qi < queue.length; qi++) {
      const draft = queue[qi];
      const id = `call_${dayKey.replaceAll("-", "")}_${String(seq++).padStart(4, "0")}`;
      const free = freeCsrs(draft.at);
      let outcome: InboundCall["outcome"];
      if (draft.forced === "csr_answered" && free.length) outcome = "csr_answered";
      else if (draft.forced === "missed") outcome = free.length ? "missed" : "ai_agent";
      else if (!free.length) outcome = rng.chance(0.93) ? "ai_agent" : "abandoned";
      else {
        const r = rng.float();
        outcome = r < 0.875 ? "csr_answered" : r < 0.91 ? "ai_agent" : r < 0.94 ? "missed" : "abandoned";
      }

      let csrId: string | null = null;
      let durationSec = 0;
      let booked = false;
      let aiSummary: string | null = null;
      let hotLead = false;

      if (outcome === "csr_answered") {
        const csr = rng.weighted(free.map((c) => [c, PROFILE_ANSWER_WEIGHT[c.profile]] as const));
        csrId = csr.id;
        durationSec = rng.int(110, 560);
        busyUntil.set(csr.id, draft.at + durationSec * 1000 + rng.int(30, 120) * 1000);
        const factor = draft.jobType === "Call Back" || draft.jobType === "Warranty" ? 0.75 : 1;
        booked = rng.chance(PROFILE_BOOKING[csr.profile] * factor);
      } else if (outcome === "ai_agent") {
        booked = rng.chance(0.21);
        durationSec = aiCallSeconds(rng, booked);
        const issue = rng.pick(AI_ISSUES[draft.jobType]);
        if (booked) aiSummary = `${issue} Booked a visit.`;
        else {
          const reason = rng.pick(AI_NO_BOOK_REASONS);
          aiSummary = `${issue} ${reason.text}`;
          hotLead = reason.hot;
        }
      } else if (outcome === "missed") {
        // The call rang this CSR while they were Available and nobody picked up
        if (free.length) {
          csrId = rng.weighted(
            free.map((c) => [c.id, c.profile === "struggling" ? 3 : c.profile === "new" ? 2 : 1] as const),
          );
        }
      } else {
        durationSec = hangUpSeconds(rng);
      }

      if (!csrId && (outcome === "abandoned" || outcome === "ai_agent")) {
        // Routed to a CSR on shift first (busy or on break) before the caller gave up or the AI took it
        const onShift = csrs.filter((c) => statusAt(dayBlocks.get(c.id) ?? [], draft.at) !== "Offline");
        if (onShift.length) csrId = rng.pick(onShift).id;
      }

      const call: InboundCall = {
        id,
        direction: "inbound",
        customerId: draft.customer.id,
        phone: draft.phone,
        startedAt: draft.at,
        durationSec,
        jobType: draft.jobType,
        outcome,
        campaignId: draft.campaignId,
        csrId,
        booked,
        jobId: null,
        aiSummary,
        hotLead,
        source: "ServiceTitan",
      };
      if (booked) {
        const job = makeJob(
          rng,
          `job_${id}`,
          draft.customer.id,
          draft.jobType,
          draft.at + durationSec * 1000,
          draft.campaignId,
          outcome === "ai_agent" ? "ai_agent" : "csr",
          csrId,
          id,
          now,
        );
        call.jobId = job.id;
        jobs.push(job);
      }
      dayInbound.push(call);

      // Repeat callers: some customers call again a few minutes later.
      const trigger = outcome === "missed" || outcome === "abandoned" || (outcome === "ai_agent" && !booked);
      if (trigger && !draft.repeat && rng.chance(0.16)) {
        const again: DraftInbound = {
          ...draft,
          at: draft.at + rng.int(3, 28) * MINUTE,
          forced: rng.chance(0.5) ? "missed" : "csr_answered",
          repeat: true,
        };
        let pos = qi + 1;
        while (pos < queue.length && queue[pos].at <= again.at) pos++;
        queue.splice(pos, 0, again);
      }
    }
    calls.push(...dayInbound);

    // Callback follow-up behaviour (outbound calls, texts, customers calling in).
    const answeredInByCustomer = new Map<string, number[]>();
    for (const c of dayInbound) {
      if (c.outcome === "csr_answered") {
        const arr = answeredInByCustomer.get(c.customerId) ?? [];
        arr.push(c.startedAt);
        answeredInByCustomer.set(c.customerId, arr);
      }
    }
    let outSeq = 0;
    for (const c of dayInbound) {
      const isTrigger = c.outcome === "missed" || c.outcome === "abandoned" || (c.outcome === "ai_agent" && !c.booked);
      if (!isTrigger) continue;
      const key = c.customerId;
      // Already covered by a follow-up planned after this call (grouped into the same item)
      if (c.startedAt < (coveredUntil.get(key) ?? 0)) continue;
      const calledIn = (answeredInByCustomer.get(key) ?? []).find((t) => t > c.startedAt && t - c.startedAt < 2 * HOUR);
      if (calledIn) {
        coveredUntil.set(key, calledIn);
        continue;
      }

      const neverP = live ? (d === 0 ? 0.02 : 0) : c.outcome === "ai_agent" ? 0.92 : 0.6;
      if (rng.chance(neverP)) continue;

      const customer = customerById.get(key);
      if (!customer) continue;

      // Customer may call in again later and get a CSR (rule 5)
      if (rng.chance(0.08)) {
        const t = c.startedAt + rng.range(1, 5) * HOUR;
        const free = freeCsrs(t);
        if (free.length) {
          const csr = rng.pick(free);
          const inId = `call_${dayKey.replaceAll("-", "")}_r${outSeq++}`;
          const bookedIn = rng.chance(0.55);
          const inCall: InboundCall = {
            id: inId,
            direction: "inbound",
            customerId: key,
            phone: customer.phones[0],
            startedAt: t,
            durationSec: rng.int(120, 480),
            jobType: c.jobType,
            outcome: "csr_answered",
            campaignId: c.campaignId,
            csrId: csr.id,
            booked: bookedIn,
            jobId: null,
            aiSummary: null,
            hotLead: false,
            source: "ServiceTitan",
          };
          if (bookedIn) {
            const job = makeJob(rng, `job_${inId}`, key, c.jobType, t + inCall.durationSec * 1000, c.campaignId, "csr", csr.id, inId, now);
            inCall.jobId = job.id;
            jobs.push(job);
          }
          calls.push(inCall);
          coveredUntil.set(key, t);
          continue;
        }
      }

      // Outbound attempts
      let t = c.startedAt;
      // After go-live a few callbacks still slip past a day (counted as unreturned)
      const late = live && d >= 3 && rng.chance(c.outcome === "ai_agent" ? 0.09 : 0.05);
      const firstDelay = late
        ? rng.range(26, 40) * HOUR
        : live
        ? rng.weighted([
            [rng.range(1, 5), d === 0 ? 8 : 14],
            [rng.range(5, 15), d === 0 ? 14 : 24],
            [rng.range(15, 60), d === 0 ? 40 : 38],
            [rng.range(60, 220), d === 0 ? 38 : 24],
          ] as const) * MINUTE
        : rng.range(45, 540) * MINUTE;
      t += firstDelay;
      let lastAttemptAt = t;
      for (let attempt = 1; attempt <= 3; attempt++) {
        t = intoStaffedHours(t, rng);
        lastAttemptAt = t;
        const caller = live
          ? rng.weighted(csrs.filter(hiredBeforeDay).map((x) => [x, x.profile === "strong" ? 2 : x.profile === "struggling" ? 0.6 : 1] as const))
          : rng.pick(csrs.filter(hiredBeforeDay));
        const phone = customer.phones.length > 1 && rng.chance(0.35) ? customer.phones[1] : customer.phones[0];
        const r = rng.float();
        const kind = r < 0.55 ? "real" : r < 0.62 ? "short" : r < 0.85 ? "no_answer" : "voicemail";
        const out: OutboundCall = {
          id: `out_${dayKey.replaceAll("-", "")}_${String(outSeq++).padStart(4, "0")}`,
          direction: "outbound",
          customerId: key,
          phone,
          startedAt: t,
          durationSec: kind === "real" ? rng.int(70, 420) : kind === "short" ? rng.int(4, 17) : kind === "voicemail" ? rng.int(25, 50) : 0,
          jobType: c.jobType,
          outcome: kind === "real" || kind === "short" ? "answered" : kind,
          csrId: caller.id,
          source: "ServiceTitan",
        };
        calls.push(out);
        if (kind === "real") {
          // Faster callbacks book more often
          const waited = (t - c.startedAt) / MINUTE;
          if (rng.chance(waited <= 15 ? 0.52 : waited <= 60 ? 0.38 : waited <= 240 ? 0.24 : 0.12)) {
            jobs.push(
              makeJob(rng, `job_${out.id}`, key, c.jobType, t + out.durationSec * 1000, c.campaignId, "csr", caller.id, out.id, now),
            );
          }
          break;
        }
        if (live && rng.chance(0.2)) {
          texts.push({
            id: `txt_${out.id}`,
            customerId: key,
            phone: customer.phones[0],
            sentAt: t + 2 * MINUTE,
            csrId: caller.id,
            body: "Hi, this is Tuck & Howell returning your call. Reply or call us back at your convenience.",
          });
        }
        if (!live && rng.chance(0.55)) break; // before go-live, retries often never happened
        t += (120 + rng.range(5, 90)) * MINUTE;
      }
      coveredUntil.set(key, Math.max(coveredUntil.get(key) ?? 0, lastAttemptAt));
    }

    // Web form and Angi leads (Angi lands in GoHighLevel)
    const webCount = weekday === 0 ? rng.int(1, 3) : rng.int(3, 8);
    const angiCount = weekday === 0 ? rng.int(0, 2) : rng.int(2, 5);
    for (let i = 0; i < webCount + angiCount; i++) {
      const angi = i >= webCount;
      const customer = customers[rng.int(0, customers.length - 1)];
      const at = dayStart + rng.range(6, 22) * HOUR;
      const jobType = rng.weighted(JOB_TYPE_WEIGHTS);
      const lead: InboundLead = {
        id: `lead_${angi ? "angi" : "web"}_${dayKey.replaceAll("-", "")}_${i}`,
        customerId: customer.id,
        channel: angi ? "Angi" : "Web Form",
        receivedAt: at,
        jobType,
        message: rng.pick(angi ? ANGI_MESSAGES : WEB_FORM_MESSAGES),
        source: angi ? "GoHighLevel" : "ServiceTitan",
      };
      inboundLeads.push(lead);
      if (rng.chance(live ? 0.04 : 0.3)) continue;
      const t = intoStaffedHours(at + rng.range(live ? 8 : 60, live ? 90 : 900) * MINUTE, rng);
      const caller = rng.pick(csrs.filter(hiredBeforeDay));
      const answered = rng.chance(0.62);
      const out: OutboundCall = {
        id: `out_${lead.id}`,
        direction: "outbound",
        customerId: customer.id,
        phone: customer.phones[0],
        startedAt: t,
        durationSec: answered ? rng.int(90, 400) : 0,
        jobType,
        outcome: answered ? "answered" : "no_answer",
        csrId: caller.id,
        source: "ServiceTitan",
      };
      calls.push(out);
      if (answered && rng.chance(0.42)) {
        jobs.push(
          makeJob(rng, `job_${out.id}`, customer.id, jobType, t + out.durationSec * 1000, angi ? "angi" : "web_form", "csr", caller.id, out.id, now),
        );
      }
    }
  }

  // Reveal only what has happened by "now".
  const visibleCalls = calls.filter((c) => c.startedAt <= now).sort((a, b) => a.startedAt - b.startedAt);
  const visibleJobs = jobs.filter((j) => j.bookedAt <= now);
  const visibleCallIds = new Set(visibleCalls.map((c) => c.id));
  const visibleJobIds = new Set(visibleJobs.map((j) => j.id));
  for (const c of visibleCalls) {
    if (c.direction === "inbound" && c.jobId && !visibleJobIds.has(c.jobId)) {
      // booked at the end of a call still in progress
      c.jobId = null;
      c.booked = false;
    }
  }

  return {
    generatedAt: now,
    goLiveAt,
    customers,
    csrs,
    campaigns: CAMPAIGNS.map((c) => ({ id: c.id, name: c.name, category: c.category, isUntracked: c.isUntracked })),
    calls: visibleCalls,
    texts: texts.filter((t) => t.sentAt <= now),
    jobs: visibleJobs.filter((j) => !j.originCallId || visibleCallIds.has(j.originCallId)),
    inboundLeads: inboundLeads.filter((l) => l.receivedAt <= now),
    availability,
    users: USERS,
    dialpadInternalCallsByDay,
  };
}

/** Outbound calls happen during staffed hours (7 am to 7 pm). */
function intoStaffedHours(t: number, rng: Rng): number {
  const h = nyParts(t).hour;
  if (h >= 7 && h < 19) return t;
  const base = h >= 19 ? nyAddDays(t, 1) : nyStartOfDay(t);
  return base + 7 * HOUR + rng.range(5, 50) * MINUTE;
}
