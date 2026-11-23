import type { Campaign, City, Csr, JobType, TeamUser } from "@/lib/types";

export const FIRST_NAMES = [
  "Dana", "Marcus", "Ellen", "Raymond", "Shelby", "Curtis", "Monica", "Wade", "Lorraine", "Terrence",
  "Brenda", "Hollis", "Jasmine", "Dwight", "Paula", "Garrett", "Renee", "Floyd", "Tamara", "Lyle",
  "Kristen", "Odell", "Megan", "Vernon", "Alicia", "Russell", "Denise", "Clint", "Yvonne", "Grady",
  "Heather", "Lamar", "Nora", "Bobby", "Caroline", "Earl", "Whitney", "Jerome", "Sylvia", "Travis",
  "Ann", "Desmond", "Carla", "Mitchell", "Lydia", "Rodney", "Bethany", "Harold", "Gina", "Calvin",
  "Margaret", "Tyrone", "Jill", "Franklin", "Ruth", "Emmett", "Natalie", "Luis", "Peggy", "Darnell",
  "Katie", "Wesley", "Ingrid", "Royce", "Celeste", "Arthur", "Joanna", "Dale", "Marisol", "Henry",
];

export const LAST_NAMES = [
  "Whitfield", "Ashby", "Pettigrew", "Holloway", "Barnwell", "Cothran", "McAbee", "Gossett", "Tollison", "Brockman",
  "Satterfield", "Ledford", "Rampey", "Blackwell", "Haynie", "Stroud", "Burdette", "Cely", "Gilreath", "Pittman",
  "Hiott", "Fowler", "Ballenger", "Waddell", "Rainey", "Crenshaw", "Mauldin", "Tinsley", "Edens", "Gaffney",
  "Pruett", "Bagwell", "Sprouse", "Lister", "Hammett", "Wofford", "Cantrell", "Bomar", "Kirby", "Thackston",
  "Dobbins", "Huff", "Owings", "Jameson", "Nix", "Leopard", "Center", "Durham", "Bramlett", "Payne",
  "Revis", "Medlock", "Abercrombie", "Ruppe", "Henson", "Talley", "Forrester", "Gambrell", "Yeargin", "Coker",
];

export const STREETS = [
  "Pelham Rd", "Wade Hampton Blvd", "Woodruff Rd", "Main St", "Brushy Creek Rd", "Fairview Rd", "Batesville Rd",
  "E Poinsett St", "W Butler Rd", "Holly Springs Rd", "Haywood Rd", "S Main St", "Laurens Rd", "Hudson Rd",
  "Old Spartanburg Rd", "Abner Creek Rd", "Highway 101", "Fairview St", "Church St", "Kanuga Rd", "Chimney Rock Rd",
  "Rutherford Rd", "Hammett Bridge Rd", "Suber Rd", "Buncombe St", "Augusta Rd", "Locust Hill Rd", "Jonesville Rd",
];

export const CITY_WEIGHTS: (readonly [City, number])[] = [
  ["Greenville", 26],
  ["Greer", 16],
  ["Duncan", 10],
  ["Simpsonville", 13],
  ["Spartanburg", 10],
  ["Taylors", 8],
  ["Mauldin", 7],
  ["Hendersonville", 10],
];

/** Late November: heating dominates. */
export const JOB_TYPE_WEIGHTS: (readonly [JobType, number])[] = [
  ["No Heat", 26],
  ["HVAC Service", 15],
  ["Plumbing Service", 12],
  ["Water Heater", 9],
  ["Drains / Jetting", 8],
  ["Estimate Request", 8],
  ["Call Back", 6],
  ["Gas Service", 6],
  ["Warranty", 4],
  ["No Cool", 2],
];

export const CAMPAIGNS: (Campaign & { weight: number })[] = [
  { id: "legacy_main", name: "Legacy Number: Main Line", category: "Untracked", isUntracked: true, weight: 30 },
  { id: "google_ads", name: "Google Ads (PPC)", category: "Paid search", isUntracked: false, weight: 14 },
  { id: "seo", name: "SEO", category: "Organic", isUntracked: false, weight: 9 },
  { id: "membership", name: "Membership Renewal", category: "Existing customers", isUntracked: false, weight: 6 },
  { id: "direct_mail", name: "Direct Mail", category: "Offline", isUntracked: false, weight: 5 },
  { id: "gbp_greer", name: "Google Business Profile: Greer", category: "Google Business Profile", isUntracked: false, weight: 4 },
  { id: "gbp_duncan", name: "Google Business Profile: Duncan", category: "Google Business Profile", isUntracked: false, weight: 4 },
  { id: "gbp_simpsonville", name: "Google Business Profile: Simpsonville", category: "Google Business Profile", isUntracked: false, weight: 4 },
  { id: "referral", name: "Refer a Friend", category: "Referral", isUntracked: false, weight: 4 },
  { id: "gbp_hendersonville", name: "Google Business Profile: Hendersonville", category: "Google Business Profile", isUntracked: false, weight: 3 },
  { id: "angi", name: "Angi", category: "Lead marketplace", isUntracked: false, weight: 3 },
  { id: "radio", name: "Radio", category: "Offline", isUntracked: false, weight: 3 },
  { id: "unsold_estimate", name: "Unsold Estimate Follow-up", category: "Existing customers", isUntracked: false, weight: 3 },
  { id: "web_form", name: "Web Form", category: "Web", isUntracked: false, weight: 2 },
];

const TONES = ["#2C6E9B", "#3F6B5B", "#7A5C3E", "#5B5F8A", "#8A4F4A", "#456B7D", "#6B6B3F", "#4D5D6B"];

export const CSRS: Csr[] = [
  { id: "csr_marcus", firstName: "Marcus", lastName: "Lee", shiftStartHour: 7, shiftEndHour: 15, profile: "strong", hiredYearsAgo: 4 },
  { id: "csr_tasha", firstName: "Tasha", lastName: "Greene", shiftStartHour: 7, shiftEndHour: 15, profile: "steady", hiredYearsAgo: 3 },
  { id: "csr_jordan", firstName: "Jordan", lastName: "Pruitt", shiftStartHour: 8, shiftEndHour: 16, profile: "steady", hiredYearsAgo: 2 },
  { id: "csr_keisha", firstName: "Keisha", lastName: "Morrow", shiftStartHour: 9, shiftEndHour: 17, profile: "steady", hiredYearsAgo: 2 },
  { id: "csr_caleb", firstName: "Caleb", lastName: "Dunn", shiftStartHour: 9, shiftEndHour: 17, profile: "new", hiredYearsAgo: 0.06 },
  { id: "csr_ben", firstName: "Ben", lastName: "Alvarez", shiftStartHour: 10, shiftEndHour: 18, profile: "struggling", hiredYearsAgo: 1 },
  { id: "csr_priya", firstName: "Priya", lastName: "Raman", shiftStartHour: 11, shiftEndHour: 19, profile: "steady", hiredYearsAgo: 1.5 },
  { id: "csr_rosa", firstName: "Rosa", lastName: "Delgado", shiftStartHour: 11, shiftEndHour: 19, profile: "steady", hiredYearsAgo: 3 },
].map((c, i) => ({
  id: c.id,
  firstName: c.firstName,
  lastName: c.lastName,
  name: `${c.firstName} ${c.lastName}`,
  initials: `${c.firstName[0]}${c.lastName[0]}`,
  avatarTone: TONES[i % TONES.length],
  shiftStartHour: c.shiftStartHour,
  shiftEndHour: c.shiftEndHour,
  hiredAt: 0, // filled in relative to "now" by the generator
  profile: c.profile as Csr["profile"],
  email: `${c.firstName.toLowerCase()}.${c.lastName.toLowerCase()}@example.com`,
  hiredYearsAgo: c.hiredYearsAgo,
})) as (Csr & { hiredYearsAgo: number })[];

export const CSR_IDS = CSRS.map((c) => c.id);

export const USERS: TeamUser[] = [
  { id: "u_owner", name: "Amanda", role: "Owner", email: "owner@example.com", csrId: null },
  { id: "u_coowner", name: "Co-owner", role: "Co-owner", email: "coowner@example.com", csrId: null },
  { id: "u_manager", name: "Lauren Pike", role: "Manager", email: "lauren.pike@example.com", csrId: null },
  ...CSRS.map((c) => ({ id: `u_${c.id}`, name: c.name, role: "CSR" as const, email: c.email, csrId: c.id })),
];

/** Booking rate on answered calls by performance profile */
export const PROFILE_BOOKING: Record<Csr["profile"], number> = {
  strong: 0.71,
  steady: 0.6,
  struggling: 0.46,
  new: 0.51,
};

export const PROFILE_ANSWER_WEIGHT: Record<Csr["profile"], number> = {
  strong: 1.35,
  steady: 1,
  struggling: 0.8,
  new: 0.75,
};

export const AI_ISSUES: Record<JobType, string[]> = {
  "No Heat": [
    "Caller reports no heat, thermostat reads 58 degrees.",
    "Furnace running but blowing cold air.",
    "Heat pump iced over, house getting cold.",
    "Gas furnace will not ignite after the cold snap.",
  ],
  "No Cool": ["Upstairs unit not cooling, caller has a server closet."],
  "HVAC Service": ["Wants a fall furnace tune-up before winter.", "Strange rattling from the air handler."],
  "Plumbing Service": ["Leak under the kitchen sink.", "Toilet running constantly in the main bath."],
  "Drains / Jetting": ["Main line backing up into the basement shower.", "Slow drains throughout the house."],
  "Gas Service": ["Smells gas near the water heater, already left the house.", "Needs gas line run for a new range."],
  "Water Heater": ["No hot water since this morning.", "Water heater leaking from the bottom."],
  "Call Back": ["Asking about a technician visit from last week."],
  Warranty: ["Unit installed last year making a loud noise."],
  "Estimate Request": ["Wants a price to replace a 19 year old system.", "Asking about a quote for a tankless water heater."],
};

export const AI_NO_BOOK_REASONS = [
  { text: "Did not book: wanted the price first.", hot: false },
  { text: "Did not book: asked to speak with a person.", hot: true },
  { text: "Did not book: needed to check with spouse.", hot: false },
  { text: "Did not book: wants the earliest slot tomorrow, ready to book.", hot: true },
  { text: "Did not book: hung up during scheduling.", hot: false },
  { text: "Did not book: asked about replacing the whole system.", hot: true },
  { text: "Did not book: no available slot matched.", hot: false },
];

export const WEB_FORM_MESSAGES = [
  "Furnace making a loud noise when it starts. Please call.",
  "Would like an estimate for a new heat pump.",
  "Water heater is 14 years old, thinking about replacing.",
  "Kitchen drain is slow, would like someone out this week.",
  "Need a quote for a whole-house water filter.",
];

export const ANGI_MESSAGES = [
  "Angi request: HVAC repair, project timeline urgent.",
  "Angi request: water heater replacement, within 1 week.",
  "Angi request: drain cleaning, flexible timeline.",
  "Angi request: furnace not heating, ASAP.",
];

/** Why Lace AI flagged an answered call that did not book for a follow-up */
export const LACE_REASONS = [
  "Customer asked for a quote by phone",
  "Customer wanted to check with their spouse",
  "Customer asked us to call back after work",
  "Price objection, open to a second option",
  "Asked about financing for a new system",
  "Wanted an earlier appointment than offered",
];
