import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

interface ManifestItem {
  id: string;
  date: string;
  time: string;
  kind: "post" | "article";
  text: string;
  status: "pending" | "scheduled" | "manual_follow_up";
  scheduledAt?: string;
  linkedinEditedAt?: string;
}

const MANIFEST_PATH = path.resolve("linkedin-output/schedule-manifest.json");
const PAGE_POSTS_URL =
  "https://www.linkedin.com/company/113210122/admin/page-posts/published/?share=true";

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

function readManifest(): ManifestItem[] {
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8")) as ManifestItem[];
}

function writeManifest(manifest: ManifestItem[]): void {
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
}

function actionMenuLabel(item: ManifestItem): string {
  const [year, month, day] = item.date.split("-").map(Number);
  const [hour, minute] = item.time.split(":").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "short",
  }).format(date);
  const monthName = new Intl.DateTimeFormat("en-US", {
    month: "long",
  }).format(date);
  const suffix = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;

  return `Actions menu for scheduled post on ${weekday} ${monthName} ${day}, ${year} at ${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

const editScheduledPostAppleScript = String.raw`
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

on findUiByDescription(rootElement, targetDescription)
  tell application "System Events"
    try
      if (description of rootElement as text) is targetDescription then return rootElement
    end try
    try
      set childElements to UI elements of rootElement
      repeat with childElement in childElements
        set foundElement to my findUiByDescription(childElement, targetDescription)
        if foundElement is not missing value then return foundElement
      end repeat
    end try
  end tell
  return missing value
end findUiByDescription

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

on waitForScheduledPostsHeading(timeoutSeconds)
  set endTime to (current date) + timeoutSeconds
  tell application "System Events"
    tell process "Google Chrome"
      repeat while (current date) is less than endTime
        set pageHeading to my findUiByName(front window, "Grantpipe’s scheduled posts")
        if pageHeading is not missing value then return pageHeading
        set genericHeading to my findUiByName(front window, "Scheduled posts")
        if genericHeading is not missing value then return genericHeading
        delay 0.25
      end repeat
    end tell
  end tell
  error "Timed out waiting for scheduled posts heading"
end waitForScheduledPostsHeading

on waitForDescription(targetDescription, timeoutSeconds)
  set endTime to (current date) + timeoutSeconds
  tell application "System Events"
    tell process "Google Chrome"
      repeat while (current date) is less than endTime
        set foundElement to my findUiByDescription(front window, targetDescription)
        if foundElement is not missing value then return foundElement
        delay 0.25
      end repeat
    end tell
  end tell
  error "Timed out waiting for description " & targetDescription
end waitForDescription

on waitForScheduleSave(timeoutSeconds)
  set endTime to (current date) + timeoutSeconds
  tell application "System Events"
    tell process "Google Chrome"
      repeat while (current date) is less than endTime
        set confirmationText to my findUiByName(front window, "Post scheduled.")
        if confirmationText is not missing value then return
        delay 0.25
      end repeat
    end tell
  end tell
  error "Timed out waiting for Post scheduled confirmation"
end waitForScheduleSave

on openScheduledPostsList(targetUrl)
  tell application "Google Chrome"
    activate
    set URL of active tab of front window to targetUrl
    reload active tab of front window
  end tell
  delay 12

  tell application "System Events"
    tell process "Google Chrome"
      key code 53
      delay 1
      set existingScheduledHeading to my findUiByName(front window, "Grantpipe’s scheduled posts")
      if existingScheduledHeading is not missing value then return
      set existingGenericHeading to my findUiByName(front window, "Scheduled posts")
      if existingGenericHeading is not missing value then return

      set existingViewAllButton to my findUiByName(front window, "View all scheduled posts")
      if existingViewAllButton is not missing value then
        click existingViewAllButton
        my waitForScheduledPostsHeading(20)
        return
      end if

      set existingSchedulePostButton to my findUiByName(front window, "Schedule post")
      if existingSchedulePostButton is missing value then
        set startPostButton to my waitForName("Start a post", 20)
        click startPostButton
        delay 2
      end if

      set schedulePostButton to my waitForName("Schedule post", 20)
      click schedulePostButton
      set viewAllButton to my waitForName("View all scheduled posts", 20)
      click viewAllButton
      my waitForScheduledPostsHeading(20)
    end tell
  end tell
end openScheduledPostsList

on clickActionMenu(targetMenuName)
  tell application "System Events"
    tell process "Google Chrome"
      repeat with loadAttempt from 1 to 30
        set showMoreButton to my findUiByName(front window, "Show more Scheduled posts")
        if showMoreButton is missing value then exit repeat

        try
          set targetMenu to my findUiByDescription(front window, targetMenuName)
          if targetMenu is not missing value then
            click targetMenu
            return
          end if
        end try

        try
          set targetMenu to my findUiByName(front window, targetMenuName)
          if targetMenu is not missing value then
            click targetMenu
            return
          end if
        end try

        try
          set targetMenu to first button of front window whose description is targetMenuName
          click targetMenu
          return
        end try

        click showMoreButton
        delay 0.75
      end repeat

      try
        set targetMenu to my findUiByDescription(front window, targetMenuName)
        if targetMenu is not missing value then
          click targetMenu
          return
        end if
      end try

      try
        set targetMenu to my findUiByName(front window, targetMenuName)
        if targetMenu is not missing value then
          click targetMenu
          return
        end if
      end try

      try
        set targetMenu to first button of front window whose description is targetMenuName
        click targetMenu
        return
      end try
    end tell
  end tell
  error "Could not find " & targetMenuName
end clickActionMenu

on preloadScheduledPosts(clickCount)
  tell application "System Events"
    tell process "Google Chrome"
      repeat with clickAttempt from 1 to clickCount
        set showMoreButton to my findUiByName(front window, "Show more Scheduled posts")
        if showMoreButton is missing value then return
        click showMoreButton
        delay 0.9
      end repeat
    end tell
  end tell
end preloadScheduledPosts

on run argv
  set targetUrl to item 1 of argv
  set targetMenuName to item 2 of argv
  set replacementText to item 3 of argv
  set preloadClicks to item 4 of argv as integer
  set shouldOpenList to item 5 of argv

  if shouldOpenList is "true" then my openScheduledPostsList(targetUrl)
  my preloadScheduledPosts(preloadClicks)
  my clickActionMenu(targetMenuName)

  tell application "System Events"
    tell process "Google Chrome"
      set editButton to my waitForName("Edit post", 10)
      click editButton
      set editor to my waitForDescription("Text editor for creating content", 20)
      set value of editor to replacementText
      delay 0.75
      set scheduleButton to my waitForName("Schedule", 10)
      click scheduleButton
      my waitForScheduleSave(20)
    end tell
  end tell

  return "edited"
end run
`;

function editScheduledPost(item: ManifestItem): void {
  copyToClipboard(item.text);
  const scheduledPosts = readManifest().filter(
    (manifestItem) => manifestItem.status === "scheduled" && manifestItem.kind === "post",
  );
  const scheduledIndex = scheduledPosts.findIndex((manifestItem) => manifestItem.id === item.id);
  const preloadClicks = Math.max(0, Math.ceil((scheduledIndex - 20) / 10) + 8);
  run(
    "osascript",
    [
      "-",
      PAGE_POSTS_URL,
      actionMenuLabel(item),
      item.text,
      String(preloadClicks),
      String(!skipOpen),
    ],
    editScheduledPostAppleScript,
  );
}

const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.split("=")[1]) : Number.POSITIVE_INFINITY;
const fromArg = process.argv.find((arg) => arg.startsWith("--from="));
const fromId = fromArg?.split("=")[1];
const skipOpen = process.argv.includes("--skip-open");

const manifest = readManifest();
let editedCount = 0;
let hasReachedStart = fromId === undefined;

for (const item of manifest) {
  if (editedCount >= limit) {
    break;
  }

  if (item.id === fromId) {
    hasReachedStart = true;
  }

  if (
    !hasReachedStart ||
    item.status !== "scheduled" ||
    item.kind !== "post" ||
    item.linkedinEditedAt
  ) {
    continue;
  }

  try {
    console.log(`Editing ${item.id} at ${item.date} ${item.time}`);
    editScheduledPost(item);
    item.linkedinEditedAt = new Date().toISOString();
    writeManifest(manifest);
    editedCount += 1;
  } catch (error) {
    item.linkedinEditedAt = undefined;
    writeManifest(manifest);
    throw error;
  }
}

console.log(`Edited ${editedCount} scheduled post(s).`);
