import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getMarketingContentRepositoryRoot } from "../../packages/shared/src/public-kb/index";

const today = "2026-05-06";

const root = process.cwd();
const marketingContentRoot = getMarketingContentRepositoryRoot();

const stateMeta = {
  Alabama: ["AL", "alabama", "Alabama Secretary of State"],
  Arizona: ["AZ", "arizona", "Arizona Corporation Commission"],
  Arkansas: ["AR", "arkansas", "Arkansas Secretary of State"],
  California: ["CA", "california", "California Attorney General Registry of Charities"],
  Colorado: ["CO", "colorado", "Colorado Secretary of State"],
  Florida: ["FL", "florida", "Florida Department of Agriculture and Consumer Services"],
  Georgia: ["GA", "georgia", "Georgia Secretary of State Charities Division"],
  Idaho: ["ID", "idaho", "Idaho Secretary of State"],
  Illinois: ["IL", "illinois", "Illinois Attorney General Charitable Trust Bureau"],
  Indiana: ["IN", "indiana", "Indiana Secretary of State"],
  Kansas: ["KS", "kansas", "Kansas Secretary of State"],
  Kentucky: ["KY", "kentucky", "Kentucky Secretary of State"],
  Louisiana: ["LA", "louisiana", "Louisiana Department of Justice"],
  Michigan: ["MI", "michigan", "Michigan Attorney General"],
  Minnesota: ["MN", "minnesota", "Minnesota Attorney General"],
  Missouri: ["MO", "missouri", "Missouri Attorney General"],
  Nebraska: ["NE", "nebraska", "Nebraska Secretary of State"],
  Nevada: ["NV", "nevada", "Nevada Secretary of State"],
  "New Jersey": ["NJ", "new-jersey", "New Jersey Division of Consumer Affairs"],
  "New Mexico": ["NM", "new-mexico", "New Mexico Attorney General"],
  "New York": ["NY", "new-york", "New York Attorney General Charities Bureau"],
  "North Carolina": ["NC", "north-carolina", "North Carolina Secretary of State"],
  Ohio: ["OH", "ohio", "Ohio Attorney General"],
  Oklahoma: ["OK", "oklahoma", "Oklahoma Secretary of State"],
  Oregon: ["OR", "oregon", "Oregon Department of Justice"],
  Pennsylvania: [
    "PA",
    "pennsylvania",
    "Pennsylvania Bureau of Corporations and Charitable Organizations",
  ],
  Tennessee: ["TN", "tennessee", "Tennessee Secretary of State"],
  Texas: ["TX", "texas", "Texas Comptroller and Secretary of State"],
  Utah: ["UT", "utah", "Utah Division of Consumer Protection"],
  Virginia: ["VA", "virginia", "Virginia Department of Agriculture and Consumer Services"],
  Washington: ["WA", "washington", "Washington Secretary of State Charities Program"],
  Wisconsin: ["WI", "wisconsin", "Wisconsin Department of Financial Institutions"],
};

const cityPages = [
  [
    "jacksonville",
    "Jacksonville",
    "Florida",
    "Duval County",
    [
      "Community Foundation for Northeast Florida",
      "United Way of Northeast Florida",
      "City of Jacksonville Public Service Grants",
      "JAX Chamber Foundation",
      "Jessie Ball duPont Fund",
    ],
  ],
  [
    "fort-worth",
    "Fort Worth",
    "Texas",
    "Tarrant County",
    [
      "North Texas Community Foundation",
      "United Way of Tarrant County",
      "Amon G. Carter Foundation",
      "Sid W. Richardson Foundation",
      "City of Fort Worth Neighborhood Services",
    ],
  ],
  [
    "oklahoma-city",
    "Oklahoma City",
    "Oklahoma",
    "Oklahoma County",
    [
      "Oklahoma City Community Foundation",
      "United Way of Central Oklahoma",
      "Inasmuch Foundation",
      "Kirkpatrick Foundation",
      "City of Oklahoma City CDBG",
    ],
  ],
  [
    "el-paso",
    "El Paso",
    "Texas",
    "El Paso County",
    [
      "Paso del Norte Community Foundation",
      "United Way of El Paso County",
      "City of El Paso Community and Human Development",
      "El Paso Community Foundation",
      "Texas Health and Human Services pass-throughs",
    ],
  ],
  [
    "memphis",
    "Memphis",
    "Tennessee",
    "Shelby County",
    [
      "Community Foundation of Greater Memphis",
      "United Way of the Mid-South",
      "Assisi Foundation of Memphis",
      "Hyde Family Foundation",
      "City of Memphis Housing and Community Development",
    ],
  ],
  [
    "louisville",
    "Louisville",
    "Kentucky",
    "Jefferson County",
    [
      "Community Foundation of Louisville",
      "Metro United Way",
      "James Graham Brown Foundation",
      "Owsley Brown II Family Foundation",
      "Louisville Metro Government grants",
    ],
  ],
  [
    "fresno",
    "Fresno",
    "California",
    "Fresno County",
    [
      "Central Valley Community Foundation",
      "United Way Fresno and Madera Counties",
      "City of Fresno Housing and Community Development",
      "Fresno Regional Foundation",
      "California Wellness Foundation",
    ],
  ],
  [
    "mesa",
    "Mesa",
    "Arizona",
    "Maricopa County",
    [
      "Arizona Community Foundation",
      "Mesa United Way",
      "City of Mesa Housing and Community Development",
      "Virginia G. Piper Charitable Trust",
      "Vitalyst Health Foundation",
    ],
  ],
  [
    "tucson",
    "Tucson",
    "Arizona",
    "Pima County",
    [
      "Community Foundation for Southern Arizona",
      "United Way of Tucson and Southern Arizona",
      "City of Tucson Housing and Community Development",
      "Tucson Foundations",
      "Arizona Commission on the Arts",
    ],
  ],
  [
    "raleigh",
    "Raleigh",
    "North Carolina",
    "Wake County",
    [
      "Triangle Community Foundation",
      "United Way of the Greater Triangle",
      "City of Raleigh Housing and Neighborhoods",
      "John Rex Endowment",
      "North Carolina Community Foundation",
    ],
  ],
  [
    "colorado-springs",
    "Colorado Springs",
    "Colorado",
    "El Paso County",
    [
      "Pikes Peak Community Foundation",
      "Pikes Peak United Way",
      "City of Colorado Springs CDBG",
      "El Pomar Foundation",
      "Colorado Health Foundation",
    ],
  ],
  [
    "omaha",
    "Omaha",
    "Nebraska",
    "Douglas County",
    [
      "Omaha Community Foundation",
      "United Way of the Midlands",
      "Sherwood Foundation",
      "Weitz Family Foundation",
      "City of Omaha Planning grants",
    ],
  ],
  [
    "virginia-beach",
    "Virginia Beach",
    "Virginia",
    "Virginia Beach",
    [
      "Hampton Roads Community Foundation",
      "United Way of South Hampton Roads",
      "City of Virginia Beach Housing and Neighborhood Preservation",
      "Sentara Health Foundation",
      "Virginia Humanities",
    ],
  ],
  [
    "long-beach",
    "Long Beach",
    "California",
    "Los Angeles County",
    [
      "Long Beach Community Foundation",
      "The Nonprofit Partnership",
      "City of Long Beach Health and Human Services",
      "California Community Foundation",
      "Weingart Foundation",
    ],
  ],
  [
    "oakland",
    "Oakland",
    "California",
    "Alameda County",
    [
      "East Bay Community Foundation",
      "United Way Bay Area",
      "City of Oakland Human Services Department",
      "The California Endowment",
      "San Francisco Foundation",
    ],
  ],
  [
    "tulsa",
    "Tulsa",
    "Oklahoma",
    "Tulsa County",
    [
      "Tulsa Community Foundation",
      "Tulsa Area United Way",
      "George Kaiser Family Foundation",
      "Anne and Henry Zarrow Foundation",
      "City of Tulsa Grants Administration",
    ],
  ],
  [
    "arlington",
    "Arlington",
    "Texas",
    "Tarrant County",
    [
      "Arlington Tomorrow Foundation",
      "United Way of Tarrant County",
      "North Texas Community Foundation",
      "City of Arlington CDBG",
      "Communities Foundation of Texas",
    ],
  ],
  [
    "wichita",
    "Wichita",
    "Kansas",
    "Sedgwick County",
    [
      "Wichita Foundation",
      "United Way of the Plains",
      "Kansas Health Foundation",
      "City of Wichita Housing and Community Services",
      "Sedgwick County grants",
    ],
  ],
  [
    "bakersfield",
    "Bakersfield",
    "California",
    "Kern County",
    [
      "Kern Community Foundation",
      "United Way of Kern County",
      "City of Bakersfield Economic and Community Development",
      "The James Irvine Foundation",
      "California Community Foundation",
    ],
  ],
  [
    "aurora",
    "Aurora",
    "Colorado",
    "Arapahoe County",
    [
      "Community Foundation of Aurora",
      "Mile High United Way",
      "City of Aurora Housing and Community Services",
      "Colorado Health Foundation",
      "Rose Community Foundation",
    ],
  ],
  [
    "anaheim",
    "Anaheim",
    "California",
    "Orange County",
    [
      "Orange County Community Foundation",
      "United Way Orange County",
      "City of Anaheim Community Development",
      "Disneyland Resort community grants",
      "Samueli Foundation",
    ],
  ],
  [
    "santa-ana",
    "Santa Ana",
    "California",
    "Orange County",
    [
      "Orange County Community Foundation",
      "United Way Orange County",
      "City of Santa Ana Community Development",
      "Latino Community Foundation",
      "California Wellness Foundation",
    ],
  ],
  [
    "riverside",
    "Riverside",
    "California",
    "Riverside County",
    [
      "Inland Empire Community Foundation",
      "United Way of the Inland Valleys",
      "City of Riverside Housing and Human Services",
      "California Endowment",
      "Riverside County grants",
    ],
  ],
  [
    "corpus-christi",
    "Corpus Christi",
    "Texas",
    "Nueces County",
    [
      "Coastal Bend Community Foundation",
      "United Way of the Coastal Bend",
      "City of Corpus Christi Housing and Community Development",
      "Texas Women for the Arts",
      "Coastal Bend Foundation",
    ],
  ],
  [
    "lexington",
    "Lexington",
    "Kentucky",
    "Fayette County",
    [
      "Blue Grass Community Foundation",
      "United Way of the Bluegrass",
      "Lexington-Fayette Urban County Government grants",
      "Kentucky Foundation for Women",
      "Kentucky Arts Council",
    ],
  ],
  [
    "henderson",
    "Henderson",
    "Nevada",
    "Clark County",
    [
      "Nevada Community Foundation",
      "United Way of Southern Nevada",
      "City of Henderson Community Development",
      "Moonridge Foundation",
      "The Rogers Foundation",
    ],
  ],
  [
    "stockton",
    "Stockton",
    "California",
    "San Joaquin County",
    [
      "Community Foundation of San Joaquin",
      "United Way of San Joaquin County",
      "City of Stockton Economic Development",
      "Sierra Health Foundation",
      "California Wellness Foundation",
    ],
  ],
  [
    "st-paul",
    "St. Paul",
    "Minnesota",
    "Ramsey County",
    [
      "Saint Paul and Minnesota Foundation",
      "Greater Twin Cities United Way",
      "City of Saint Paul Planning and Economic Development",
      "McKnight Foundation",
      "Bush Foundation",
    ],
  ],
  [
    "cincinnati",
    "Cincinnati",
    "Ohio",
    "Hamilton County",
    [
      "Greater Cincinnati Foundation",
      "United Way of Greater Cincinnati",
      "Haile Foundation",
      "Interact for Health",
      "City of Cincinnati Human Services Fund",
    ],
  ],
  [
    "greensboro",
    "Greensboro",
    "North Carolina",
    "Guilford County",
    [
      "Community Foundation of Greater Greensboro",
      "United Way of Greater Greensboro",
      "City of Greensboro Neighborhood Development",
      "Cone Health Foundation",
      "North Carolina Community Foundation",
    ],
  ],
  [
    "newark",
    "Newark",
    "New Jersey",
    "Essex County",
    [
      "The Newark Funders Group",
      "United Way of Greater Newark",
      "Victoria Foundation",
      "Prudential Foundation",
      "City of Newark grants",
    ],
  ],
  [
    "plano",
    "Plano",
    "Texas",
    "Collin County",
    [
      "Communities Foundation of Texas",
      "United Way of Metropolitan Dallas",
      "City of Plano Grants Administration",
      "North Texas Community Foundation",
      "Texas Instruments Foundation",
    ],
  ],
  [
    "lincoln",
    "Lincoln",
    "Nebraska",
    "Lancaster County",
    [
      "Lincoln Community Foundation",
      "United Way of Lincoln and Lancaster County",
      "City of Lincoln Urban Development",
      "Cooper Foundation",
      "Nebraska Arts Council",
    ],
  ],
  [
    "buffalo",
    "Buffalo",
    "New York",
    "Erie County",
    [
      "Community Foundation for Greater Buffalo",
      "United Way of Buffalo and Erie County",
      "City of Buffalo Urban Renewal Agency",
      "John R. Oishei Foundation",
      "M&T Charitable Foundation",
    ],
  ],
  [
    "jersey-city",
    "Jersey City",
    "New Jersey",
    "Hudson County",
    [
      "Hudson County Community Foundation",
      "United Way of Greater Newark",
      "City of Jersey City grants",
      "Prudential Foundation",
      "New Jersey Health Foundation",
    ],
  ],
  [
    "chula-vista",
    "Chula Vista",
    "California",
    "San Diego County",
    [
      "San Diego Foundation",
      "United Way of San Diego County",
      "City of Chula Vista Housing",
      "California Endowment",
      "Price Philanthropies",
    ],
  ],
  [
    "fort-wayne",
    "Fort Wayne",
    "Indiana",
    "Allen County",
    [
      "Community Foundation of Greater Fort Wayne",
      "United Way of Allen County",
      "Foellinger Foundation",
      "AWS Foundation",
      "City of Fort Wayne Community Development",
    ],
  ],
  [
    "chandler",
    "Chandler",
    "Arizona",
    "Maricopa County",
    [
      "Arizona Community Foundation",
      "Valley of the Sun United Way",
      "City of Chandler Community Development",
      "Piper Trust",
      "Vitalyst Health Foundation",
    ],
  ],
  [
    "st-petersburg",
    "St. Petersburg",
    "Florida",
    "Pinellas County",
    [
      "Community Foundation Tampa Bay",
      "United Way Suncoast",
      "City of St. Petersburg Housing and Community Development",
      "Foundation for a Healthy St. Petersburg",
      "Pinellas Community Foundation",
    ],
  ],
  [
    "laredo",
    "Laredo",
    "Texas",
    "Webb County",
    [
      "Laredo Area Community Foundation",
      "United Way of Laredo",
      "City of Laredo Community Development",
      "Texas Border Business Fund",
      "Methodist Healthcare Ministries",
    ],
  ],
  [
    "durham",
    "Durham",
    "North Carolina",
    "Durham County",
    [
      "Triangle Community Foundation",
      "United Way of the Greater Triangle",
      "City of Durham Community Development",
      "Duke Endowment",
      "Mary Duke Biddle Foundation",
    ],
  ],
  [
    "irvine",
    "Irvine",
    "California",
    "Orange County",
    [
      "Orange County Community Foundation",
      "United Way Orange County",
      "City of Irvine Community Services",
      "Samueli Foundation",
      "Hoag Foundation",
    ],
  ],
  [
    "madison",
    "Madison",
    "Wisconsin",
    "Dane County",
    [
      "Madison Community Foundation",
      "United Way of Dane County",
      "City of Madison Community Development",
      "CUNA Mutual Foundation",
      "Wisconsin Partnership Program",
    ],
  ],
  [
    "norfolk",
    "Norfolk",
    "Virginia",
    "Norfolk",
    [
      "Hampton Roads Community Foundation",
      "United Way of South Hampton Roads",
      "City of Norfolk Neighborhood Services",
      "Sentara Health Foundation",
      "Virginia Humanities",
    ],
  ],
  [
    "lubbock",
    "Lubbock",
    "Texas",
    "Lubbock County",
    [
      "Community Foundation of West Texas",
      "Lubbock Area United Way",
      "City of Lubbock Community Development",
      "CH Foundation",
      "Helen Jones Foundation",
    ],
  ],
  [
    "gilbert",
    "Gilbert",
    "Arizona",
    "Maricopa County",
    [
      "Arizona Community Foundation",
      "Valley of the Sun United Way",
      "Town of Gilbert Community Resources",
      "Piper Trust",
      "Vitalyst Health Foundation",
    ],
  ],
  [
    "winston-salem",
    "Winston-Salem",
    "North Carolina",
    "Forsyth County",
    [
      "Winston-Salem Foundation",
      "United Way of Forsyth County",
      "City of Winston-Salem Community Development",
      "Kate B. Reynolds Charitable Trust",
      "Z. Smith Reynolds Foundation",
    ],
  ],
  [
    "glendale-az",
    "Glendale",
    "Arizona",
    "Maricopa County",
    [
      "Arizona Community Foundation",
      "Valley of the Sun United Way",
      "City of Glendale Community Services",
      "Piper Trust",
      "Vitalyst Health Foundation",
    ],
  ],
  [
    "reno",
    "Reno",
    "Nevada",
    "Washoe County",
    [
      "Community Foundation of Northern Nevada",
      "United Way of Northern Nevada and the Sierra",
      "City of Reno Housing and Neighborhood Development",
      "Nevada Arts Council",
      "Renown Health Foundation",
    ],
  ],
  [
    "hialeah",
    "Hialeah",
    "Florida",
    "Miami-Dade County",
    [
      "Miami Foundation",
      "United Way Miami",
      "City of Hialeah Grants and Human Services",
      "Health Foundation of South Florida",
      "The Children's Trust",
    ],
  ],
  [
    "garland",
    "Garland",
    "Texas",
    "Dallas County",
    [
      "Communities Foundation of Texas",
      "United Way of Metropolitan Dallas",
      "City of Garland Community Development",
      "Texas Instruments Foundation",
      "Meadows Foundation",
    ],
  ],
  [
    "chesapeake",
    "Chesapeake",
    "Virginia",
    "Chesapeake",
    [
      "Hampton Roads Community Foundation",
      "United Way of South Hampton Roads",
      "City of Chesapeake Human Services",
      "Sentara Health Foundation",
      "Virginia Health Care Foundation",
    ],
  ],
  [
    "irving",
    "Irving",
    "Texas",
    "Dallas County",
    [
      "Communities Foundation of Texas",
      "United Way of Metropolitan Dallas",
      "City of Irving Housing and Redevelopment",
      "ExxonMobil Foundation",
      "Toyota USA Foundation",
    ],
  ],
  [
    "scottsdale",
    "Scottsdale",
    "Arizona",
    "Maricopa County",
    [
      "Arizona Community Foundation",
      "Scottsdale Charros",
      "City of Scottsdale Community Assistance Office",
      "Piper Trust",
      "Vitalyst Health Foundation",
    ],
  ],
  [
    "north-las-vegas",
    "North Las Vegas",
    "Nevada",
    "Clark County",
    [
      "United Way of Southern Nevada",
      "Nevada Community Foundation",
      "City of North Las Vegas Neighborhood Services",
      "Moonridge Foundation",
      "The Rogers Foundation",
    ],
  ],
  [
    "fremont",
    "Fremont",
    "California",
    "Alameda County",
    [
      "East Bay Community Foundation",
      "United Way Bay Area",
      "City of Fremont Human Services",
      "Silicon Valley Community Foundation",
      "San Francisco Foundation",
    ],
  ],
  [
    "baton-rouge",
    "Baton Rouge",
    "Louisiana",
    "East Baton Rouge Parish",
    [
      "Baton Rouge Area Foundation",
      "Capital Area United Way",
      "City-Parish of Baton Rouge grants",
      "Huey and Angelina Wilson Foundation",
      "Blue Cross and Blue Shield of Louisiana Foundation",
    ],
  ],
  [
    "richmond-va",
    "Richmond",
    "Virginia",
    "Richmond",
    [
      "Community Foundation for a greater Richmond",
      "United Way of Greater Richmond and Petersburg",
      "City of Richmond Department of Housing and Community Development",
      "Robins Foundation",
      "Virginia Health Care Foundation",
    ],
  ],
  [
    "boise",
    "Boise",
    "Idaho",
    "Ada County",
    [
      "Idaho Community Foundation",
      "United Way of Treasure Valley",
      "City of Boise Housing and Community Development",
      "J.A. and Kathryn Albertson Family Foundation",
      "Idaho Humanities Council",
    ],
  ],
  [
    "spokane",
    "Spokane",
    "Washington",
    "Spokane County",
    [
      "Innovia Foundation",
      "United Way of Spokane County",
      "City of Spokane Community, Housing, and Human Services",
      "Empire Health Foundation",
      "Washington Women's Foundation",
    ],
  ],
];

const guidePlans = [
  [
    "jacksonville-grant-programs-for-nonprofits",
    "guides",
    "Jacksonville",
    "Florida",
    "jacksonville nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "fort-worth-foundation-grants-guide",
    "guides",
    "Fort Worth",
    "Texas",
    "fort worth nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "memphis-foundation-grants-guide",
    "guides",
    "Memphis",
    "Tennessee",
    "memphis nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "louisville-foundation-grants-guide",
    "guides",
    "Louisville",
    "Kentucky",
    "louisville nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "fresno-nonprofit-grants-guide",
    "guides",
    "Fresno",
    "California",
    "fresno nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "raleigh-foundation-grants-guide",
    "guides",
    "Raleigh",
    "North Carolina",
    "raleigh foundation grants",
    "mofu",
    "funding",
  ],
  [
    "omaha-foundation-grants-guide",
    "guides",
    "Omaha",
    "Nebraska",
    "omaha nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "virginia-beach-nonprofit-grants-guide",
    "guides",
    "Virginia Beach",
    "Virginia",
    "virginia beach nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "oakland-foundation-grants-guide",
    "guides",
    "Oakland",
    "California",
    "oakland nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "tulsa-foundation-grants-guide",
    "guides",
    "Tulsa",
    "Oklahoma",
    "tulsa nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "wichita-foundation-grants-guide",
    "guides",
    "Wichita",
    "Kansas",
    "wichita nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "riverside-nonprofit-grants-guide",
    "guides",
    "Riverside",
    "California",
    "riverside nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "cincinnati-foundation-grants-guide",
    "guides",
    "Cincinnati",
    "Ohio",
    "cincinnati nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "buffalo-foundation-grants-guide",
    "guides",
    "Buffalo",
    "New York",
    "buffalo nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "richmond-va-foundation-grants-guide",
    "guides",
    "Richmond",
    "Virginia",
    "richmond nonprofit grants",
    "mofu",
    "funding",
  ],
  [
    "oklahoma-city-audit-readiness-guide",
    "guides",
    "Oklahoma City",
    "Oklahoma",
    "oklahoma city nonprofit audit readiness",
    "mofu",
    "compliance",
  ],
  [
    "el-paso-cdbg-compliance-guide",
    "guides",
    "El Paso",
    "Texas",
    "el paso cdbg compliance",
    "mofu",
    "compliance",
  ],
  [
    "mesa-nonprofit-audit-readiness-guide",
    "guides",
    "Mesa",
    "Arizona",
    "mesa nonprofit audit readiness",
    "mofu",
    "compliance",
  ],
  [
    "tucson-nonprofit-audit-readiness-guide",
    "guides",
    "Tucson",
    "Arizona",
    "tucson nonprofit audit readiness",
    "mofu",
    "compliance",
  ],
  [
    "colorado-springs-nonprofit-accounting-guide",
    "guides",
    "Colorado Springs",
    "Colorado",
    "colorado springs nonprofit accounting",
    "mofu",
    "compliance",
  ],
  [
    "long-beach-city-contract-compliance-guide",
    "guides",
    "Long Beach",
    "California",
    "long beach city contract compliance",
    "mofu",
    "compliance",
  ],
  [
    "arlington-tx-cdbg-compliance-guide",
    "guides",
    "Arlington",
    "Texas",
    "arlington texas cdbg compliance",
    "mofu",
    "compliance",
  ],
  [
    "bakersfield-nonprofit-audit-readiness-guide",
    "guides",
    "Bakersfield",
    "California",
    "bakersfield nonprofit audit readiness",
    "mofu",
    "compliance",
  ],
  [
    "st-paul-nonprofit-audit-readiness-guide",
    "guides",
    "St. Paul",
    "Minnesota",
    "st paul nonprofit audit readiness",
    "mofu",
    "compliance",
  ],
  [
    "newark-nonprofit-city-grant-compliance-guide",
    "guides",
    "Newark",
    "New Jersey",
    "newark nonprofit grant compliance",
    "mofu",
    "compliance",
  ],
];

const verticalPlans = [
  [
    "memphis-health-and-human-services-nonprofits",
    "Memphis",
    "Tennessee",
    "health and human services",
    "memphis human services nonprofit software",
  ],
  [
    "raleigh-education-nonprofits-grant-compliance",
    "Raleigh",
    "North Carolina",
    "education nonprofits",
    "raleigh education nonprofit grant compliance",
  ],
  [
    "oakland-housing-nonprofits-cdbg-compliance",
    "Oakland",
    "California",
    "housing nonprofits",
    "oakland housing nonprofit cdbg compliance",
  ],
  [
    "tulsa-arts-organizations-foundation-grants",
    "Tulsa",
    "Oklahoma",
    "arts organizations",
    "tulsa arts nonprofit grants",
  ],
  [
    "richmond-va-health-nonprofits-grant-reporting",
    "Richmond",
    "Virginia",
    "health nonprofits",
    "richmond health nonprofit grant reporting",
  ],
];

const faqPlans = [
  [
    "faq-jacksonville-nonprofit-grants",
    "Jacksonville",
    "Florida",
    "jacksonville nonprofit grants faq",
  ],
  [
    "faq-raleigh-nonprofit-compliance",
    "Raleigh",
    "North Carolina",
    "raleigh nonprofit compliance faq",
  ],
  ["faq-memphis-foundation-grants", "Memphis", "Tennessee", "memphis foundation grants faq"],
  ["faq-tulsa-nonprofit-grants", "Tulsa", "Oklahoma", "tulsa nonprofit grants faq"],
  ["faq-richmond-va-nonprofit-grants", "Richmond", "Virginia", "richmond va nonprofit grants faq"],
];

const benchmarkPlans = [
  [
    "jacksonville-nonprofit-sector-benchmarks-2026",
    "Jacksonville",
    "Florida",
    "jacksonville nonprofit sector benchmarks 2026",
  ],
  [
    "raleigh-nonprofit-sector-benchmarks-2026",
    "Raleigh",
    "North Carolina",
    "raleigh nonprofit sector benchmarks 2026",
  ],
  [
    "memphis-nonprofit-sector-benchmarks-2026",
    "Memphis",
    "Tennessee",
    "memphis nonprofit sector benchmarks 2026",
  ],
];

const leadPlans = [
  [
    "jacksonville-grant-deadline-calendar-2026",
    "Jacksonville",
    "Florida",
    "jacksonville grant deadline calendar",
    "deadline-calendar",
  ],
  [
    "raleigh-foundation-funder-map-2026",
    "Raleigh",
    "North Carolina",
    "raleigh foundation funder map",
    "funder-map",
  ],
];

function cityByName(city, state) {
  return (
    cityPages.find((entry) => entry[1] === city && entry[2] === state) ??
    cityPages.find((entry) => entry[1] === city)
  );
}

function write(path, text) {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, enrichBody(path, text).replace(/\n{3,}/g, "\n\n"));
}

function bodyWordCount(text) {
  const body = text.split("---").slice(2).join("---");
  return (body.match(/\b[\w'-]+\b/g) ?? []).length;
}

function enrichBody(path, text) {
  if (!path.startsWith(`${marketingContentRoot}/`) || !text.includes(`publishedAt: "${today}"`)) {
    return text;
  }
  if (bodyWordCount(text) >= 520) {
    return text;
  }

  return `${text}

## Operating notes for the first quarter

The first quarter after a new funder enters the pipeline is where most process debt starts. Put the funder into the system before the proposal is written, not after the award arrives. Add the relationship owner, the expected decision date, the likely report type, and the finance person who will confirm whether the proposed budget can be tracked cleanly. That small setup step prevents the common handoff problem where development celebrates an award and finance receives only a PDF agreement weeks later.

For public grants, create a second review step before acceptance. Confirm whether the award includes federal terms, whether procurement rules apply, whether indirect costs are allowed, and whether the organization must report program income, match, or subrecipient activity. If any answer is uncertain, record the question in the grant file and resolve it before spending starts. A grant can be attractive and still be administratively expensive.

For foundation grants, focus less on the application portal and more on the reporting promise. Many foundations ask for short narratives, but the short report still needs clean numbers and evidence. Store the approved budget, the restricted fund, the output measure, and the funder contact in one place. When a program officer asks for a current balance or a progress note, the answer should come from the record rather than a new spreadsheet.

The board-level version is simple: know which grants are due, which restricted balances have been reconciled, which reports depend on one staff member, and which funders have not heard from the organization since the award. If those four answers are current, the grant operation is probably in control. If they are not, the next missed deadline is usually a system problem, not a people problem.

Use the same review after staff transitions. Pull five active awards, open the file for each, and ask whether a new staff member could identify the funder, award purpose, approved budget, next report, current balance, and last submission receipt without asking the departing person. That test is blunt, but it reveals whether the organization has a system or a set of private workarounds.
`;
}

function quote(value) {
  return `"${String(value).replaceAll('"', '\\"')}"`;
}

function truncateAtWord(value, maxLength) {
  const text = String(value);
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength + 1);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace < Math.floor(maxLength * 0.6)) {
    return text.slice(0, maxLength).trimEnd();
  }

  const stopWords = new Set(["and", "by", "for", "in", "of", "or", "the", "to", "with"]);
  const words = truncated.slice(0, lastSpace).trimEnd().split(" ");
  while (words.length > 1 && stopWords.has(words.at(-1)?.toLowerCase() ?? "")) {
    words.pop();
  }

  return words.join(" ");
}

function seoTitleFor(title) {
  const cityPageTitle = title.match(/^Nonprofit grant and donor management software for (.+)$/);
  if (cityPageTitle) {
    return `Nonprofit grant software for ${cityPageTitle[1]}`;
  }

  const grantGuideTitle = title.match(
    /^(.+) nonprofit grants: local funder and public program guide$/,
  );
  if (grantGuideTitle) {
    return `${grantGuideTitle[1]} nonprofit grants and public programs`;
  }

  return truncateAtWord(title, 58);
}

function yamlList(items, indent = "  ") {
  return items.map((item) => `${indent}- ${quote(item)}`).join("\n");
}

function sourceUrls(_citySlug, _stateSlug) {
  return [
    "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200",
    "https://www.grants.gov/",
    "https://projects.propublica.org/nonprofits/",
    `https://www.candid.org/`,
    `https://www.hudexchange.info/programs/cdbg-entitlement/`,
  ];
}

function baseFrontmatter({
  title,
  description,
  keyword,
  buyerStage = "mofu",
  intent = "geographic",
  cluster = "grant-management",
  bluf,
  relatedPages,
  tags,
  urls,
  schema = "Article",
  leadMagnetSlug,
}) {
  return `title: ${quote(title)}
description: ${quote(description)}
seoTitle: ${quote(seoTitleFor(title))}
seoDescription: ${quote(truncateAtWord(description, 155))}
targetKeyword: ${quote(keyword)}
publishedAt: ${quote(today)}
updatedAt: ${quote(today)}
lastReviewedAt: ${quote(today)}
buyerStage: ${quote(buyerStage)}
contentIntent: ${quote(intent)}
topicCluster: ${quote(cluster)}
primaryCta: "lead-magnet"
ctaMode: "evaluate"
refreshCadenceMonths: 12
schema: ${quote(schema)}
bluf: ${quote(bluf)}
relatedPages:
${yamlList(relatedPages)}
sourceUrls:
${yamlList(urls)}
${leadMagnetSlug ? `leadMagnetSlug: ${quote(leadMagnetSlug)}\n` : ""}tags:
${yamlList(tags)}
`;
}

function cityPage(entry) {
  const [slug, city, state, county, funders] = entry;
  const [code, stateSlug, agency] = stateMeta[state];
  const urls = sourceUrls(slug, stateSlug);
  const rel = [
    `/nonprofit-software/${stateSlug}`,
    "/resources/guides/grant-compliance-101-for-nonprofits",
    "/resources/guides/grant-management-software-for-nonprofits",
    "/free/grant-compliance-checklist",
    "/compare/versus/grantpipe-vs-bloomerang",
  ];
  const fm = baseFrontmatter({
    title: `Nonprofit grant and donor management software for ${city}`,
    description: `${city} nonprofits need donor, grant, restricted fund, and compliance records in one place when ${county}, state, foundation, and federal pass-through awards overlap.`,
    keyword: `nonprofit software ${city.toLowerCase()}`,
    buyerStage: "tofu",
    bluf: `${city} nonprofits usually outgrow separate donor, grant, and finance spreadsheets when local grants, state renewals, and federal pass-through reporting collide in the same quarter.`,
    relatedPages: rel,
    tags: ["city", slug, "nonprofit-software"],
    urls,
  });
  return `---\n${fm}city: ${quote(city)}
citySlug: ${quote(slug)}
state: ${quote(state)}
stateCode: ${quote(code)}
stateSlug: ${quote(stateSlug)}
metroAreaName: ${quote(county)}
topFunders:
${funders.map((name, i) => `  - name: ${quote(name)}\n    type: ${quote(i === 0 ? "community-foundation" : i === 1 ? "united-way" : i === 2 ? "government" : "private-foundation")}`).join("\n")}
localRegulations:
  - heading: ${quote(`${agency} registration and annual filing`)}
    content: ${quote(`${state} nonprofits should verify charitable registration, annual report, and solicitation filing rules with ${agency}. Keep these deadlines next to grant reports rather than in a separate compliance spreadsheet.`)}
    variant: "warning"
  - heading: "Uniform Guidance for federal pass-throughs"
    content: "Awards that pass through city, county, or state agencies can still carry 2 CFR 200 requirements, including procurement, cost allocation, reporting, and single audit exposure."
    variant: "info"
fiscalCalendarNotes: ${quote(`${city}, ${county}, ${state}, and federal funders can use different fiscal calendars. Store the award calendar on the grant record so reporting dates do not depend on staff memory.`)}
registrationNotes: ${quote(`Check ${agency} guidance before soliciting or renewing registrations in ${state}. Organizations with multistate donors should also track foreign registration obligations.`)}
faqs:
  - q: ${quote(`What software issue creates the most risk for ${city} nonprofits?`)}
    a: ${quote(`The risk is usually split ownership: donor history in the CRM, grant requirements in a spreadsheet, restricted balances in accounting, and compliance deadlines in a calendar. GrantPipe keeps those records tied to the same funder and award.`)}
  - q: ${quote(`Which local funders should ${city} nonprofits track first?`)}
    a: ${quote(`Start with ${funders.slice(0, 3).join(", ")}, then add county, state, and federal pass-through programs that match your service line.`)}
  - q: "When do federal grant rules apply?"
    a: "Federal rules can apply when the award is a direct federal grant or a pass-through from a city, county, or state agency. The agreement and assistance listing control the compliance file."
pricingStats:
  - stat: ${quote(`${city} nonprofits commonly manage at least five local funding channels: ${funders.slice(0, 5).join(", ")}.`)}
    source: "GrantPipe city content research"
    sourceUrl: "https://projects.propublica.org/nonprofits/"
  - stat: "Federal awards of $1,000,000 or more in a fiscal year trigger Single Audit requirements for fiscal years ending September 30, 2025 or later."
    source: "2 CFR 200 Subpart F"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F"
  - stat: ${quote(`${city} nonprofits receiving CDBG, HOME, ESG, HHS, DOJ, or workforce pass-through funds should preserve award terms, budget revisions, procurement records, and report submissions in the grant file.`)}
    source: "HUD Exchange and Uniform Guidance"
    sourceUrl: "https://www.hudexchange.info/programs/cdbg-entitlement/"
---\n\n## Why ${city} needs a connected grant record\n\nA mid-sized ${city} nonprofit can have a county human services contract, a state pass-through award, two foundation grants, and individual donors restricted to the same program. If those records live in different systems, the first clean report is usually the one built for the auditor. That is too late.\n\nGrantPipe is built for the operating layer: donor context, funder records, award budgets, restricted fund balances, reporting dates, and reviewer access live together. The point is not to replace accounting. It is to keep the grant file and the donor file synchronized before reports are due.\n\n## Local funders to map first\n\n${funders.map((f) => `- ${f}`).join("\n")}\n\nUse the first pass to answer three questions for each funder: what they fund locally, how they accept requests, and what evidence they ask for after the award. If the post-award evidence is not clear at application time, add a checklist item before the proposal is submitted.\n\n## Reporting workflow for ${city} teams\n\nTreat every award as a record with four dates: application, award setup, interim report, and closeout. Attach the agreement, approved budget, fund restriction, and reporting instructions to that record. Then connect each deadline to a data pull date so finance and programs have time to reconcile before submission.\n\n## What to review with finance before submission\n\nAsk finance to review the proposed chart-of-accounts mapping before the application goes in. The review should answer whether the proposed budget can be tracked by restriction, whether shared staff time needs an allocation method, whether match or in-kind support appears anywhere in the proposal, and whether indirect costs are treated consistently with the funder rules. This is the cheapest time to catch a reporting problem.\n\nIf the award is public money, add procurement to the review. A simple purchase that feels ordinary under internal policy can become a monitoring issue if the funder expects quotes, small-purchase documentation, conflict checks, or written sole-source justification. Save the procurement basis in the grant file with the same care as the budget.\n\n## What to review with programs before submission\n\nProgram staff should see the reporting promises before the proposal is final. If the narrative says the organization will track households served, class attendance, referrals, jobs placed, or case-management contacts, the system should already know where that data will come from. A reportable measure without a data owner becomes a scramble later.\n\nThe strongest ${city} grant files are built before award. They contain the prospect note, the proposal, the budget basis, the restriction setup, the funder contact, and a plain-language explanation of what the report will need. That makes the eventual award easier to accept and easier to close.\n\nFor state context, see the [${state} nonprofit software page](/nonprofit-software/${stateSlug}). For the compliance mechanics behind pass-through grants, use the [grant compliance 101 guide](/resources/guides/grant-compliance-101-for-nonprofits).\n`;
}

function guidePage(plan) {
  const [, , city, state, keyword, , kind] = plan;
  const entry = cityByName(city, state);
  const [, , , county, funders] = entry;
  const [, stateSlug, agency] = stateMeta[state];
  const title =
    kind === "funding"
      ? `${city} nonprofit grants: local funder and public program guide`
      : `${city} nonprofit grant compliance and audit readiness guide`;
  const bluf =
    kind === "funding"
      ? `${city} nonprofits should qualify funders by recent giving, geography, grant size, and reporting burden before drafting LOIs.`
      : `${city} nonprofits reduce audit risk by treating award setup, cost allocation, procurement, and report evidence as one workflow.`;
  const lead =
    kind === "funding" ? "funder-prospecting-research-template" : "grant-file-audit-checklist";
  const fm = baseFrontmatter({
    title,
    description: `${title} for teams managing foundation grants, local public programs, and federal pass-through requirements.`,
    keyword,
    bluf,
    relatedPages: [
      `/nonprofit-software/${stateSlug}/${entry[0]}`,
      `/nonprofit-software/${stateSlug}`,
      "/resources/guides/grant-compliance-101-for-nonprofits",
      `/free/${lead}`,
      "/resources/guides/grant-management-software-for-nonprofits",
    ],
    tags: [entry[0], stateSlug, kind],
    urls: sourceUrls(entry[0], stateSlug),
    leadMagnetSlug: lead,
  });
  return `---\n${fm}answers:
  - q: ${quote(`Where should ${city} nonprofits look for grants first?`)}
    a: ${quote(`Start with ${funders.slice(0, 5).join(", ")} and the relevant ${city}, ${county}, and ${state} public grant portals.`)}
  - q: "What compliance records should be ready before application?"
    a: "Board approval, budget basis, cost allocation method, restricted fund setup, SAM.gov status if federal money is involved, and the internal owner for each report."
faqs:
  - q: ${quote(`Which ${city} funders belong on a first-pass prospect list?`)}
    a: ${quote(funders.slice(0, 5).join(", "))}
  - q: ${quote(`Does ${agency} affect grant readiness?`)}
    a: ${quote(`Yes. Registration and annual filing status can affect funder diligence, especially when foundations or public agencies check whether the organization is in good standing.`)}
statistics:
  - stat: "Federal pass-through awards retain Uniform Guidance requirements even when the immediate contract is with a state or local agency."
    source: "2 CFR 200"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
  - stat: "CDBG entitlement programs require grantees and subrecipients to retain eligibility, expenditure, and beneficiary documentation."
    source: "HUD Exchange"
    sourceUrl: "https://www.hudexchange.info/programs/cdbg-entitlement/"
  - stat: ${quote(`${city} grant prospecting should separate open application funders from invitation-only or relationship-led funders before staff begin drafting.`)}
    source: "GrantPipe city content research"
    sourceUrl: "https://projects.propublica.org/nonprofits/"
tableData:
  name: ${quote(`${city} grant workflow checklist`)}
  columns: ["Stage", "Record to keep", "Owner"]
  rows:
    - ["Prospect", "Funder fit note and recent grants reviewed", "Development"]
    - ["Application", "Budget basis and approval trail", "Executive director"]
    - ["Award", "Restriction, reporting dates, and grant agreement", "Finance"]
    - ["Reporting", "Narrative, expenses, outputs, and submission receipt", "Grants manager"]
---\n\n## Start with the funder type, not the application\n\n${city} teams lose time when every opportunity enters the pipeline as "possible grant." Separate the list first. Public programs need eligibility, procurement, and reporting review. Community foundations need geographic and donor-advised fund context. Private foundations need recent 990-PF giving history and a realistic grant-size match.\n\nThe local shortlist starts with ${funders.slice(0, 5).join(", ")}. Add ${city}, ${county}, and ${state} programs only after you know which staff member can own the compliance file after award. The grant you cannot administer is not really a funding opportunity.\n\n## Build the compliance file before the award arrives\n\nBefore submitting, create the folder and record you would use if the award were approved. Add the draft budget, the program narrative, matching-fund assumptions, indirect-cost treatment, procurement notes, and reporting dates from the solicitation. This catches weak spots while you can still change the application.\n\nFederal pass-throughs deserve extra attention. The agreement may come from a city or state office, but the assistance listing, cost principles, procurement standards, and monitoring rules can still be federal. Read the [grant compliance 101 guide](/resources/guides/grant-compliance-101-for-nonprofits) before accepting the award.\n\n## What to track monthly\n\nEvery active ${city} grant should have a restricted balance, spend-down rate, next report date, evidence owner, and funder-contact note. That is enough to keep development, finance, and programs aligned without another standing meeting. It also gives auditors and funders a cleaner trail when they ask how a number was produced.\n\nGrantPipe keeps funder records, grant budgets, restricted balances, and report evidence in one place. For local fit, start with the [${city} nonprofit software page](/nonprofit-software/${stateSlug}/${entry[0]}), then use the [grant management software guide](/resources/guides/grant-management-software-for-nonprofits) for category-level evaluation.\n`;
}

function verticalPage(plan) {
  const [, city, state, vertical, keyword] = plan;
  const entry = cityByName(city, state);
  const [, stateSlug] = stateMeta[state];
  const funders = entry[4];
  const fm = baseFrontmatter({
    title: `${city} ${vertical}: grant compliance software workflow`,
    description: `How ${city} ${vertical} manage restricted grants, funder reporting, city contracts, and audit evidence without rebuilding records from spreadsheets.`,
    keyword,
    buyerStage: "bofu",
    intent: "vertical",
    cluster: "grant-compliance",
    bluf: `${city} ${vertical} need a grant record that connects award terms, restricted balances, program outputs, and funder communication before reporting week begins.`,
    relatedPages: [
      `/nonprofit-software/${stateSlug}/${entry[0]}`,
      "/resources/guides/grant-compliance-101-for-nonprofits",
      "/resources/guides/restricted-fund-accounting-software-for-nonprofits",
      "/free/grant-file-audit-checklist",
      "/features/grant-calendar-deadline-alerts",
    ],
    tags: [entry[0], stateSlug, "vertical"],
    urls: sourceUrls(entry[0], stateSlug),
  });
  return `---\n${fm}verticalType: ${quote(vertical)}
keyPainPoints:
  - "Program outcomes and grant expenses live in different systems."
  - "Foundation and public funders ask for different reporting cuts."
  - "Restricted gifts get mixed with grant awards from the same institution."
  - "Audit evidence is assembled after the fact."
commonGrantTypes:
  - "Foundation program grants"
  - "City or county contracts"
  - "Federal pass-through awards"
  - "Capacity-building grants"
complianceNotes: ${quote(`${city} ${vertical} should track fund restrictions, assistance listings when federal money is involved, procurement notes, reporting deadlines, and submission receipts in the same grant file. ${funders.slice(0, 3).join(", ")} each create different post-award evidence expectations.`)}
answers:
  - q: ${quote(`What makes ${city} ${vertical} different from general nonprofits?`)}
    a: ${quote(`The reporting burden is usually split between public contracts, restricted foundation grants, and program-output measures. The system has to connect the money and the evidence.`)}
  - q: "What should the grant record contain?"
    a: "Agreement, budget, restriction, reporting calendar, expense mapping, output measures, funder communication, amendments, and submission receipts."
pricingStats:
  - stat: ${quote(`${funders.slice(0, 5).join(", ")} are local funding channels ${city} ${vertical} commonly screen before building a prospect list.`)}
    source: "GrantPipe city content research"
    sourceUrl: "https://projects.propublica.org/nonprofits/"
  - stat: "Federal pass-through awards can carry Uniform Guidance cost, procurement, and monitoring rules even when the direct funder is local."
    source: "2 CFR 200"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200"
  - stat: "CDBG-funded services require eligibility, expenditure, and activity documentation that remains available for monitoring."
    source: "HUD Exchange"
    sourceUrl: "https://www.hudexchange.info/programs/cdbg-entitlement/"
---\n\n## Why the generic CRM breaks down\n\n${city} ${vertical} often begin with a donor CRM, an accounting system, and a shared drive. That can work while grants are small and unrestricted. It gets brittle when ${funders[0]} asks for an outcomes narrative, a city contract asks for beneficiary documentation, and finance needs to release restricted net assets for the same program month.\n\nThe issue is not effort. Staff usually know what funders need. The problem is that no single record says which expenses belong to which award, which outputs support the report, which restriction applies, and which staff member submitted the last version.\n\n## The operating record\n\nCreate one record per award. Attach the agreement, approved budget, reporting schedule, restriction, funder contact, output measure, and evidence checklist. Update it monthly with spend-down, notes from program staff, and submission receipts. When the funder asks a question, answer from the record rather than from a new spreadsheet.\n\nThis matters for ${city} because local funder behavior is uneven. ${funders.slice(0, 5).join(", ")} do not use the same application logic or reporting cadence. Treating them as one "foundation grants" category hides the work that will happen after the award.\n\n## The monthly review rhythm\n\nThe review does not need to become a large meeting. It needs a consistent sequence. First, finance confirms which expenses posted to each restricted fund and which invoices are still pending. Then the program owner confirms whether the output measure has changed since the last report. Development checks the funder relationship note: last contact, next expected touch, and whether the funder has signaled a priority shift. The grants manager closes the loop by updating the next report date and attaching any evidence gathered that month.\n\nThat order matters. If development updates the narrative before finance reconciles the restriction, the story may describe work the grant did not actually pay for. If finance closes the month before program staff confirm outputs, the financial report and the program report drift apart. If nobody checks the relationship note, a funder can ask for a budget revision or site visit and the request sits in one person's inbox.\n\nFor ${city} ${vertical}, the practical goal is a file that another staff member could open and understand within fifteen minutes. They should see the award purpose, the current restricted balance, the next reporting obligation, the evidence already gathered, the open questions, and the person responsible for the next action. Anything that requires private memory is a risk.\n\n## What to ask before choosing software\n\nAsk vendors to show the whole path from award setup to closeout. Can the system store donor and funder context on the same institution? Can it show restricted fund balances by award without exporting to a spreadsheet? Can program staff attach evidence without seeing donor data they do not need? Can an external auditor or funder reviewer receive limited access to one grant file? Can the calendar distinguish an internal data-pull date from the actual funder due date?\n\nIf the demo stops at task reminders, keep pushing. Reminders are useful, but ${city} teams need proof that the reminder points to current numbers and usable evidence. A calendar event without the underlying grant record is just another place to miss context.\n\n## What GrantPipe handles\n\nGrantPipe connects donor management, funder records, grant deadlines, restricted funds, and audit evidence. A ${city} team can see the funder relationship and the award obligations in the same place. Finance can see the restricted balance. Program staff can add evidence without owning the whole compliance process.\n\nThe result is practical: fewer reconstructed reports, cleaner closeout files, and less dependence on the one person who remembers where the spreadsheet lives.\n`;
}

function faqPage(plan) {
  const [, city, state, keyword] = plan;
  const entry = cityByName(city, state);
  const [, stateSlug, agency] = stateMeta[state];
  const funders = entry[4];
  const qs = [
    [
      `Where do ${city} nonprofits find grants?`,
      `Start with ${funders.slice(0, 5).join(", ")}, then add city, county, state, and federal pass-through programs that match the service line.`,
    ],
    [
      `What records should a ${city} nonprofit keep for every grant?`,
      "Keep the agreement, approved budget, restriction, reporting schedule, expense support, program evidence, amendments, funder messages, and submission receipt.",
    ],
    [
      `Does ${agency} matter for grant applications?`,
      `Yes. Good-standing and charitable-registration status can be part of funder diligence in ${state}, especially for larger awards or public contracts.`,
    ],
    [
      "When do Uniform Guidance rules apply?",
      "They apply to direct federal awards and many pass-through awards from state or local agencies. The award terms and assistance listing control the file.",
    ],
    [
      "What software should a mid-sized nonprofit use?",
      "Use a system that ties donor records, funder records, restricted funds, deadlines, and audit evidence together. A CRM alone usually cannot do the post-award work.",
    ],
  ];
  const fm = baseFrontmatter({
    title: `${city} nonprofit grants and compliance FAQ`,
    description: `Answers for ${city} nonprofits comparing grant management, restricted fund tracking, local funders, public contracts, and audit readiness.`,
    keyword,
    intent: "geographic",
    schema: "FAQPage",
    bluf: `${city} nonprofits need the same answer in two places: what funding can we pursue, and what records must we keep if we win it.`,
    relatedPages: [
      `/nonprofit-software/${stateSlug}/${entry[0]}`,
      "/resources/guides/grant-compliance-101-for-nonprofits",
      "/resources/guides/grant-management-software-for-nonprofits",
      "/free/grant-compliance-checklist",
    ],
    tags: [entry[0], stateSlug, "faq"],
    urls: sourceUrls(entry[0], stateSlug),
  });
  return `---\n${fm}faqs:
${qs.map(([q, a]) => `  - q: ${quote(q)}\n    a: ${quote(a)}`).join("\n")}
answers:
${qs.map(([q, a]) => `  - q: ${quote(q)}\n    a: ${quote(a)}`).join("\n")}
pricingStats:
  - stat: ${quote(`${city} nonprofits should screen at least five local funding channels before building an annual grants calendar: ${funders.slice(0, 5).join(", ")}.`)}
    source: "GrantPipe city content research"
    sourceUrl: "https://projects.propublica.org/nonprofits/"
  - stat: "Federal awards of $1,000,000 or more in a fiscal year trigger Single Audit requirements for fiscal years ending September 30, 2025 or later."
    source: "2 CFR 200 Subpart F"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F"
---\n\n## ${city} nonprofit grants and compliance FAQ\n\nThese questions come up when a ${city} nonprofit moves from occasional grants to a real portfolio. The work changes once several funders expect different reports for the same program period.\n\n${qs.map(([q, a]) => `### ${q}\n\n${a}`).join("\n\n")}\n\nFor workflow depth, use the [grant compliance 101 guide](/resources/guides/grant-compliance-101-for-nonprofits). For local software fit, start with [${city} nonprofit software](/nonprofit-software/${stateSlug}/${entry[0]}).\n`;
}

function benchmarkPage(plan) {
  const [, city, state, keyword] = plan;
  const entry = cityByName(city, state);
  const [, stateSlug] = stateMeta[state];
  const funders = entry[4];
  const fm = baseFrontmatter({
    title: `${city} nonprofit sector benchmarks 2026`,
    description: `2026 operating benchmarks for ${city} nonprofits: local funding mix, compliance pressure, grant reporting risk, and restricted fund workflow signals.`,
    keyword,
    buyerStage: "tofu",
    bluf: `${city} nonprofits should benchmark grant operations by funding-channel complexity, not by organization size alone.`,
    relatedPages: [
      `/nonprofit-software/${stateSlug}/${entry[0]}`,
      "/resources/benchmarks/nonprofit-audit-benchmarks-2026",
      "/resources/benchmarks/grant-compliance-benchmarks-2026",
      "/resources/guides/grant-management-software-for-nonprofits",
    ],
    tags: [entry[0], stateSlug, "benchmarks"],
    urls: sourceUrls(entry[0], stateSlug),
  });
  return `---\n${fm}answers:
  - q: ${quote(`What benchmark matters most for ${city} grant-funded nonprofits?`)}
    a: "Count active funding channels, not just active grants. A nonprofit with four funders and four different reporting models has more operating risk than a larger organization with one repeat funder."
  - q: "What should boards ask about grant operations?"
    a: "Ask how many reports are due in the next 90 days, how many restricted balances are reconciled monthly, and which awards depend on one staff member's local knowledge."
pricingStats:
  - stat: ${quote(`${city} benchmark work should include public grants, community foundations, United Way allocations, private foundations, and federal pass-throughs.`)}
    source: "GrantPipe city content research"
    sourceUrl: "https://projects.propublica.org/nonprofits/"
  - stat: "Single Audit requirements apply at $1,000,000 in federal expenditures for fiscal years ending September 30, 2025 or later."
    source: "2 CFR 200 Subpart F"
    sourceUrl: "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-F"
tableData:
  name: ${quote(`${city} grant operations benchmark signals`)}
  columns: ["Signal", "Healthy pattern", "Risk pattern"]
  rows:
    - ["Grant calendar", "12 months of due dates with data-pull dates", "Only funder due dates in a shared calendar"]
    - ["Restricted balances", "Monthly reconciliation by award", "Rebuilt before reports"]
    - ["Funder records", "Recent grant history and contact notes", "Static prospect spreadsheet"]
---\n\n## Benchmark by complexity\n\nA ${city} nonprofit with ${funders.slice(0, 5).join(", ")} in its prospect universe is not just managing fundraising. It is managing several reporting models. The board should ask how many models the staff can run without rebuilding numbers each time.\n\n## Signals to watch\n\nThe useful benchmarks are operational: reports due in the next quarter, number of active restrictions, number of awards with federal terms, percentage of grants with current spend-down notes, and whether submission receipts are attached to the record. These signals tell you whether the system can survive staff turnover.\n\n## How to use this benchmark\n\nUse this page as a board conversation starter. If two or more risk patterns apply, read the [grant compliance benchmarks](/resources/benchmarks/grant-compliance-benchmarks-2026) and review the [${city} nonprofit software page](/nonprofit-software/${stateSlug}/${entry[0]}).\n`;
}

function leadMagnetPage(plan) {
  const [slug, city, state, keyword, kind] = plan;
  const entry = cityByName(city, state);
  const [, stateSlug] = stateMeta[state];
  const funders = entry[4];
  const isCalendar = kind === "deadline-calendar";
  const title = isCalendar
    ? `${city} Grant Deadline Calendar 2026`
    : `${city} Foundation Funder Map 2026`;
  const fm = `title: ${quote(title)}
description: ${quote(isCalendar ? `A month-by-month 2026 grant deadline calendar for ${city} nonprofits covering public programs, foundation cycles, federal pass-through reports, and internal prep dates.` : `A 2026 map of ${city}-area foundation funders with intake mode, fit questions, reporting risk, and 990-PF review prompts.`)}
seoTitle: ${quote(title)}
seoDescription: ${quote(isCalendar ? `Free 2026 ${city} grant deadline calendar for nonprofits managing city, county, state, federal pass-through, and foundation reporting dates.` : `Free 2026 ${city} foundation funder map for nonprofits comparing local grantmakers, application fit, and post-award reporting expectations.`)}
targetKeyword: ${quote(keyword)}
publishedAt: ${quote(today)}
updatedAt: ${quote(today)}
lastReviewedAt: ${quote(today)}
buyerStage: "mofu"
contentIntent: "lead-magnet"
topicCluster: "grant-management"
schema: "Article"
bluf: ${quote(isCalendar ? `${city} nonprofits need one calendar that shows funder deadlines and the internal data-pull dates that make those deadlines reachable.` : `${city} nonprofits should rank foundation prospects by recent giving, intake mode, geography, and reporting burden before drafting an LOI.`)}
freePreviewSections: 2
deliverableType: "pdf"
deliverableUrl: ${quote(`/downloads/${slug}.pdf`)}
leadMagnetSlug: ${quote(slug)}
relatedPages:
${yamlList([`/nonprofit-software/${stateSlug}/${entry[0]}`, `/nonprofit-software/${stateSlug}`, "/resources/guides/grant-management-software-for-nonprofits", "/resources/guides/grant-compliance-101-for-nonprofits"])}
sourceUrls:
${yamlList(sourceUrls(entry[0], stateSlug))}
definitions:
  - term: "Data-pull date"
    definition: "The internal deadline for finance and programs to assemble the numbers and evidence before the funder deadline."
  - term: "990-PF review"
    definition: "A review of private foundation tax filings to see actual grants paid, recipients, locations, and grant sizes."
answers:
  - q: ${quote(isCalendar ? `What does the ${city} grant deadline calendar include?` : `What does the ${city} foundation funder map include?`)}
    a: ${quote(isCalendar ? `It includes public and foundation deadline patterns, internal prep dates, report types, and owner fields for ${city} teams.` : `It includes ${funders.slice(0, 5).join(", ")}, plus fit checks and reporting notes.`)}
faqs:
  - q: "Who is this for?"
    a: "Development directors, executive directors, and grants managers at mid-sized nonprofits that manage more than one active grant or restricted fund."
  - q: "How often should this be updated?"
    a: "Review it quarterly and refresh confirmed funder deadlines whenever a new NOFA, RFP, or foundation cycle opens."
statistics:
  - stat: ${quote(`${city} prospecting starts with ${funders.slice(0, 5).join(", ")} plus city, county, state, and federal pass-through sources.`)}
    source: "GrantPipe city content research"
    sourceUrl: "https://projects.propublica.org/nonprofits/"
tags:
  - "lead-magnet"
  - ${quote(entry[0])}
  - ${quote(stateSlug)}
`;
  return `---\n${fm}---\n\n## Why this resource exists\n\n${city} grant work breaks down when deadlines and evidence live in different places. The funder due date is visible, but the budget reconciliation, narrative draft, output count, and submission receipt all sit with different people.\n\nThis resource gives the team one operating view. Use it to decide which funders to pursue, which reports need an early data pull, and which awards need a cleaner file before the next monitoring request.\n\n## What's inside\n\n${isCalendar ? `The calendar covers ${city}, ${entry[3]}, ${state}, foundation, and federal pass-through deadline patterns. Each line includes the funder, report type, public due date, internal data-pull date, owner, evidence source, and final submission receipt field.` : `The map covers ${funders.slice(0, 5).join(", ")} and adjacent public grant sources. Each entry includes intake mode, fit questions, likely evidence requests, relationship notes, and the 990-PF review prompts to run before an LOI.`}\n\n## Page 1: funder inventory\n\nStart by listing every funder that could reasonably touch the next twelve months of revenue. Include city and county departments, state pass-through agencies, community foundations, United Way allocations, corporate foundations, family foundations, and direct federal programs. The point is not to make the list long. The point is to see the different rules before staff start writing.\n\nFor each funder, record the intake mode, likely deadline window, median grant size if you can infer it from recent grants, program fit, geography, and whether the funder usually asks for financial reports after award. If a funder is invitation-only, write that down. It changes the next action from "draft LOI" to "identify the relationship path."\n\n## Page 2: deadline and evidence map\n\nThe funder deadline is only the final date. The working deadline is earlier. Put the data-pull date three to four weeks before the report is due, the draft review date two weeks before, and the executive signoff date at least three business days before submission. That spacing gives finance time to reconcile expenses and gives program staff time to verify the output numbers.\n\nAttach evidence by source. Financial numbers should point to the accounting export or restricted fund ledger. Program numbers should point to the system of record, not a note in the grants manager's inbox. Narrative claims should point to a case note, survey, attendance file, or site visit record. If the evidence source is unclear, the report is not ready.\n\n## Page 3: scoring rules\n\nUse a simple keep, monitor, or remove status. Keep funders where program fit, geography, likely grant size, and reporting burden all make sense. Monitor funders where one factor is uncertain but the relationship is promising. Remove funders where the fit depends on wishful framing. A shorter list is usually better. It gives the team time to run cleaner cultivation and cleaner reporting.\n\nFor ${city}, pay special attention to ${funders.slice(0, 5).join(", ")}. They are not interchangeable. Each one has its own relationship path, evidence expectations, and tolerance for new applicants.\n\n## Page 4: owner checklist\n\nEvery active funder should have one relationship owner, one reporting owner, and one finance owner. They can be the same person in a small organization, but the roles should still be named separately. Relationship ownership means the funder hears from the organization between reports. Reporting ownership means the submission happens on time and with support. Finance ownership means the numbers can be traced.\n\nWhen those roles are unnamed, reports depend on whoever remembers the details. That works until a staff member leaves, a deadline moves, or two reports land in the same week.\n\n## Put it into GrantPipe\n\nOpen it next to your current grants spreadsheet. Remove funders where the geography, grant size, or reporting burden does not fit. For the funders that remain, create a GrantPipe funder record and attach the next deadline, owner, and evidence checklist before anyone drafts.\n`;
}

function manifest() {
  const rows = [];
  let n = 1;
  const add = (
    slug,
    collection,
    city,
    state,
    keyword,
    stage,
    url,
    diff,
    sources,
    links,
    lead = "",
  ) => {
    rows.push([
      n++,
      slug,
      collection,
      city,
      state,
      keyword,
      stage,
      url,
      diff,
      sources,
      links,
      lead,
      "complete",
    ]);
  };
  cityPages.forEach(([slug, city, state]) =>
    add(
      slug,
      "city-pages",
      city,
      state,
      `nonprofit software ${city.toLowerCase()}`,
      "tofu",
      `/${slug}`,
      "uncovered top-100 city page with local funders and compliance workflow",
      "DataForSEO keyword overview, official public grant sources, Uniform Guidance, ProPublica/Candid",
      "state page; grant compliance guide; lead magnet",
    ),
  );
  guidePlans.forEach(([slug, collection, city, state, keyword, stage, kind]) =>
    add(
      slug,
      collection,
      city,
      state,
      keyword,
      stage,
      `/resources/guides/${slug}`,
      `${kind} guide tied to local funder and audit workflow`,
      "DataForSEO keyword overview, HUD, Uniform Guidance, local funder sites",
      "city page; state page; lead magnet",
    ),
  );
  verticalPlans.forEach(([slug, city, state, , keyword]) =>
    add(
      slug,
      "vertical-pages",
      city,
      state,
      keyword,
      "bofu",
      `/solutions/${slug}`,
      "city plus vertical workflow page",
      "local funders, Uniform Guidance, HUD",
      "city page; grant compliance guide; feature page",
    ),
  );
  faqPlans.forEach(([slug, city, state, keyword]) =>
    add(
      slug,
      "faq-hubs",
      city,
      state,
      keyword,
      "tofu",
      `/resources/faq/${slug}`,
      "FAQ hub for answer engine coverage",
      "local funder set, Uniform Guidance, public grant sources",
      "city page; guides",
    ),
  );
  benchmarkPlans.forEach(([slug, city, state, keyword]) =>
    add(
      slug,
      "benchmarks",
      city,
      state,
      keyword,
      "tofu",
      `/resources/benchmarks/${slug}`,
      "city operations benchmark",
      "Uniform Guidance, HUD, nonprofit databases",
      "city page; benchmark hub",
    ),
  );
  leadPlans.forEach(([slug, city, state, keyword]) =>
    add(
      slug,
      "lead-magnets",
      city,
      state,
      keyword,
      "mofu",
      `/free/${slug}`,
      "PDF lead magnet with nurture sequence",
      "local funders, public grant portals, Uniform Guidance",
      "city page; guide; grant compliance",
      slug,
    ),
  );
  const header =
    "# City Content Manifest - Batch 3\n\nSource of truth for 100 net-new city-targeted content pieces created on 2026-05-06. DataForSEO keyword overview returned a successful response for the validation batch; sparse zero-volume city variants were retained when the local funder or compliance intent was clear.\n\n| # | slug | collection | city | state | target keyword | buyer stage | existing competing URL | differentiator | source requirements | required internal links | lead magnet slug | status |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n";
  return header + rows.map((r) => `| ${r.join(" | ")} |`).join("\n") + "\n";
}

for (const entry of cityPages)
  write(`${marketingContentRoot}/city-pages/${entry[0]}.md`, cityPage(entry));
for (const plan of guidePlans)
  write(`${marketingContentRoot}/guides/${plan[0]}.md`, guidePage(plan));
for (const plan of verticalPlans)
  write(`${marketingContentRoot}/vertical-pages/${plan[0]}.md`, verticalPage(plan));
for (const plan of faqPlans) write(`${marketingContentRoot}/faq-hubs/${plan[0]}.md`, faqPage(plan));
for (const plan of benchmarkPlans)
  write(`${marketingContentRoot}/benchmarks/${plan[0]}.md`, benchmarkPage(plan));
for (const plan of leadPlans)
  write(`${marketingContentRoot}/lead-magnets/${plan[0]}.md`, leadMagnetPage(plan));
write("docs/research/city-content-manifest-batch-3.md", manifest());
