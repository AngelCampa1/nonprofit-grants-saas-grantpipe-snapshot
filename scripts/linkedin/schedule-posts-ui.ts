import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditScheduleManifestItems } from "./audit-schedule-manifest";

interface ManifestItem {
  id: string;
  date: string;
  time: string;
  kind: "post" | "article";
  text: string;
  status: "pending" | "scheduled" | "manual_follow_up";
  scheduledAt?: string;
  notes?: string;
}

const MANIFEST_PATH = path.resolve("linkedin-output/schedule-manifest.json");
const PAGE_POSTS_URL = "https://www.linkedin.com/company/113210122/admin/page-posts/published/";

function formatDate(date: string): string {
  const [year, month, day] = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)?.slice(1) ?? [];
  if (!year || !month || !day) {
    throw new Error(`Invalid date: ${date}`);
  }
  return `${Number(month)}/${Number(day)}/${year}`;
}

function formatTime(time: string): string {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    throw new Error(`Invalid time: ${time}`);
  }

  const hour24 = Number(match[1]);
  const minute = match[2];
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${minute} ${suffix}`;
}

function run(command: string, args: string[], input?: string): string {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    input,
    maxBuffer: 1024 * 1024 * 10,
  });

  if (result.status !== 0) {
    throw new Error(`${command} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  return result.stdout.trim();
}

function copyToClipboard(text: string): void {
  run("pbcopy", [], text);
}

export function assertLocalSchedulingPlatform(platform: NodeJS.Platform = process.platform): void {
  if (platform !== "darwin") {
    throw new Error(
      "LinkedIn UI scheduling is only supported on macOS because it uses pbcopy and AppleScript to drive Google Chrome.",
    );
  }
}

const schedulePostAppleScript = String.raw`
on findUiByName(rootElement, targetName)
  tell application "System Events"
    try
      if (name of rootElement as text) is targetName then return rootElement
    end try
    try
      if (description of rootElement as text) is targetName then return rootElement
    end try
    try
      set childElements to UI elements of rootElement
      repeat with childElement in childElements
        set foundElement to my findUiByName(childElement, targetName)
        if foundElement is not missing value then return foundElement
      end repeat
    end try
  end tell
  return missing value
end findUiByName

on findUiByDescriptionAndRole(rootElement, targetDescription, targetRole)
  tell application "System Events"
    try
      if ((description of rootElement as text) is targetDescription) and ((role description of rootElement as text) is targetRole) then return rootElement
    end try
    try
      set childElements to UI elements of rootElement
      repeat with childElement in childElements
        set foundElement to my findUiByDescriptionAndRole(childElement, targetDescription, targetRole)
        if foundElement is not missing value then return foundElement
      end repeat
    end try
  end tell
  return missing value
end findUiByDescriptionAndRole

on findUiTextContaining(rootElement, targetText)
  tell application "System Events"
    try
      set elementName to name of rootElement as text
      if elementName contains targetText then return rootElement
    end try
    try
      set elementValue to value of rootElement as text
      if elementValue contains targetText then return rootElement
    end try
    try
      set childElements to UI elements of rootElement
      repeat with childElement in childElements
        set foundElement to my findUiTextContaining(childElement, targetText)
        if foundElement is not missing value then return foundElement
      end repeat
    end try
  end tell
  return missing value
end findUiTextContaining

on waitForName(targetName, timeoutSeconds)
  set endTime to (current date) + timeoutSeconds
  tell application "System Events"
    tell process "Google Chrome"
      repeat while (current date) is less than endTime
        set foundElement to my findUiByName(front window, targetName)
        if foundElement is not missing value then return foundElement
        delay 0.25
      end repeat
    end tell
  end tell
  error "Timed out waiting for " & targetName
end waitForName

on waitForDescriptionAndRole(targetDescription, targetRole, timeoutSeconds)
  set endTime to (current date) + timeoutSeconds
  tell application "System Events"
    tell process "Google Chrome"
      repeat while (current date) is less than endTime
        set foundElement to my findUiByDescriptionAndRole(front window, targetDescription, targetRole)
        if foundElement is not missing value then return foundElement
        delay 0.25
      end repeat
    end tell
  end tell
  error "Timed out waiting for " & targetRole & " " & targetDescription
end waitForDescriptionAndRole

on waitForText(targetText, timeoutSeconds)
  set endTime to (current date) + timeoutSeconds
  tell application "System Events"
    tell process "Google Chrome"
      repeat while (current date) is less than endTime
        set foundElement to my findUiTextContaining(front window, targetText)
        if foundElement is not missing value then return foundElement
        delay 0.25
      end repeat
    end tell
  end tell
  error "Timed out waiting for text " & targetText
end waitForText

on waitForFieldValue(targetElement, targetValue, timeoutSeconds)
  set endTime to (current date) + timeoutSeconds
  tell application "System Events"
    repeat while (current date) is less than endTime
      try
        if (value of targetElement as text) is targetValue then return
      end try
      delay 0.25
    end repeat
  end tell
  error "Timed out waiting for field value " & targetValue
end waitForFieldValue

on replaceFocusedText(targetText)
  tell application "System Events"
    keystroke "a" using command down
    delay 0.15
    key code 51
    delay 0.15
    keystroke targetText
    delay 0.3
  end tell
end replaceFocusedText

on setFieldValue(targetElement, targetValue)
  tell application "System Events"
    try
      set value of targetElement to targetValue
      delay 0.5
      if (value of targetElement as text) is targetValue then return
    end try

    click targetElement
    delay 0.2
    my replaceFocusedText(targetValue)
  end tell
end setFieldValue

on run argv
  set targetUrl to item 1 of argv
  set targetDate to item 2 of argv
  set targetTime to item 3 of argv
  set previewText to item 4 of argv

  tell application "Google Chrome"
    activate
    set URL of active tab of front window to targetUrl
    reload active tab of front window
  end tell
  delay 5

  tell application "System Events"
    tell process "Google Chrome"
      set startButton to my waitForName("Start a post", 30)
      click startButton
      set editor to my waitForName("Text editor for creating content", 10)
      click editor
      keystroke "v" using command down
      delay 0.5

      set scheduleButton to my waitForName("Schedule post", 10)
      click scheduleButton
      set dateField to my waitForDescriptionAndRole("Date", "text field", 10)
      my setFieldValue(dateField, targetDate)
      my waitForFieldValue(dateField, targetDate, 5)
      keystroke tab

      set timeField to my waitForDescriptionAndRole("Time", "combo box", 10)
      my setFieldValue(timeField, targetTime)
      my waitForFieldValue(timeField, targetTime, 5)
      keystroke tab

      my waitForText(previewText, 10)
      set nextButton to my waitForName("Next", 10)
      click nextButton

      my waitForText(previewText, 10)
      set finalScheduleButton to my waitForName("Schedule", 10)
      click finalScheduleButton

      my waitForText("Post scheduled.", 20)
    end tell
  end tell

  return "scheduled"
end run
`;

function schedulePost(item: ManifestItem): void {
  copyToClipboard(item.text);
  const date = formatDate(item.date);
  const time = formatTime(item.time);

  run("osascript", ["-", PAGE_POSTS_URL, date, time, time], schedulePostAppleScript);
}

function readManifest(): ManifestItem[] {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as ManifestItem[];
}

function writeManifest(manifest: ManifestItem[]): void {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function hasBannedCommentsCta(text: string): boolean {
  return /link\s+(is\s+)?in\s+the\s+comments/i.test(text);
}

function hasLeadingParagraphSpace(text: string): boolean {
  return /(^|\n) +\S/.test(text);
}

function hasSingleNewlineParagraphJoin(text: string): boolean {
  return /[^\n]\n[^\n]/.test(text);
}

function auditManifestBeforeScheduling(manifest: ManifestItem[]): void {
  const failures = manifest
    .filter((item) => item.kind === "post")
    .flatMap((item) => {
      const itemFailures: string[] = [];

      if (hasBannedCommentsCta(item.text)) {
        itemFailures.push(`${item.id}: contains comments CTA`);
      }
      if (hasLeadingParagraphSpace(item.text)) {
        itemFailures.push(`${item.id}: contains leading paragraph space`);
      }
      if (hasSingleNewlineParagraphJoin(item.text)) {
        itemFailures.push(`${item.id}: contains single-newline paragraph join`);
      }

      return itemFailures;
    });

  if (failures.length > 0) {
    throw new Error(`Manifest preflight failed:\n${failures.join("\n")}`);
  }
}

export function main(): void {
  assertLocalSchedulingPlatform();

  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.split("=")[1]) : Number.POSITIVE_INFINITY;

  const manifest = readManifest();
  auditScheduleManifestItems(manifest);
  auditManifestBeforeScheduling(manifest);
  let scheduledCount = 0;

  for (const item of manifest) {
    if (scheduledCount >= limit) {
      break;
    }

    if (item.status !== "pending" || item.kind !== "post") {
      continue;
    }

    try {
      console.log(`Scheduling ${item.id} at ${item.date} ${item.time}`);
      schedulePost(item);
      item.status = "scheduled";
      item.scheduledAt = new Date().toISOString();
      delete item.notes;
      writeManifest(manifest);
      scheduledCount += 1;
    } catch (error) {
      item.notes = error instanceof Error ? error.message : String(error);
      writeManifest(manifest);
      throw error;
    }
  }

  console.log(`Scheduled ${scheduledCount} post(s).`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
