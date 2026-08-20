---
title: "Clean Client Counts Before Reporting"
description: "A workflow for cleaning nonprofit client counts before grant reports, with duplicate, date range, source, and approval checks."
seoTitle: "Clean Client Counts Before Reporting"
seoDescription: "Clean client counts before grant reporting. Check unique people, households, visits, duplicates, source records, privacy, and approvals."
targetKeyword: "clean client counts before reporting"
publishedAt: "2026-06-29"
updatedAt: "2026-06-29"
lastReviewedAt: "2026-06-29"
verifiedAt: "2026-06-29"
buyerStage: "tofu"
primaryCta: "lead-magnet"
ctaMode: "educate"
contentIntent: "workflow"
topicCluster: "grant-compliance"
refreshCadenceMonths: 12
targetPersona:
  - "program-director"
  - "grants-manager"
  - "operations-manager"
schema: "HowTo"
leadMagnetSlug: "grant-compliance-checklist"
bluf: "Client counts should be cleaned against the funder definition, report period, duplicate rule, source system, and privacy limits before submission."
sourceUrls:
  - "https://www.grants.gov/learn-grants/grant-reporting"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/section-200.301"
  - "https://www.ecfr.gov/current/title-2/subtitle-A/chapter-II/part-200/subpart-D/section-200.329"
  - "https://www.cdc.gov/evaluation/php/about/index.html"
faqs:
  - q: "What is a clean client count?"
    a: "It is a count that follows the report definition and can be traced to a source record."
  - q: "Should repeat visits be removed?"
    a: "Remove them only when the report asks for unique people or households."
  - q: "Can staff estimate client counts?"
    a: "Use estimates only when the report allows them and label the method clearly."
answers:
  - q: "What should the count file include?"
    a: "Include the source, date range, count rule, duplicate method, exclusions, reviewer, and final number."
  - q: "Who approves final counts?"
    a: "Program staff approve meaning, and grants staff approve fit with the funder requirement."
relatedPages:
  - "/resources/guides/nonprofit-client-counting-rules-guide"
  - "/resources/guides/unduplicated-client-count-grant-reporting-guide"
  - "/resources/guides/program-attendance-records-grant-evidence-guide"
  - "/resources/guides/data-quality-review-before-grant-report-guide"
  - "/free/grant-compliance-checklist"
estimatedTime: "30-75 minutes per report"
timeEstimate: "30-75 minutes per report"
difficulty: "intermediate"
roles:
  - "Program owner"
  - "Grants manager"
  - "Data owner"
  - "Privacy reviewer when counts use sensitive data"
prerequisites:
  - "Funder count definition"
  - "Report date range"
  - "Client source system or spreadsheet"
  - "Duplicate matching rule"
  - "Privacy rules for participant data"
steps:
  - title: "Confirm the count unit"
    content: "Decide whether the report asks for people, households, visits, cases, or completions."
  - title: "Clean the source"
    content: "Apply the date range, remove or keep repeats based on the rule, and document exclusions."
  - title: "Approve the final count"
    content: "Save the final number with the source note and reviewer approval."
outputs:
  - "Clean count worksheet"
  - "Duplicate review notes"
  - "Exclusion list"
  - "Approved final count"
  - "Report evidence packet"
auditEvidence:
  - "Report instructions"
  - "Source export"
  - "Date filter note"
  - "Duplicate check"
  - "Program approval"
commonFailures:
  - "Visits are reported as unique people"
  - "Households and people are mixed"
  - "The date range is wrong"
  - "The count cannot be traced to a source"
automationOpportunities:
  - "Save count definitions by funder"
  - "Flag duplicate participant records"
  - "Warn when records lack service dates"
  - "Attach approved counts to report tasks"
tags:
  - "client counts"
  - "unduplicated counts"
  - "grant reporting"
---

# Clean client counts before reporting

Client counts look simple until the report asks a specific question. One funder may ask for total visits. Another may ask for unique people. Another may ask for households that completed intake.

Cleaning the count before reporting prevents weak numbers and rushed corrections.

## Step 1: confirm the count unit

Read the report form and write down the unit. Do not assume "clients served" means unique people.

Common count units include:

- People
- Households
- Visits
- Cases
- Referrals
- Completions
- Enrollments

If the report does not define the unit, choose a rule and save it. Use the same rule for the full report period.

## Step 2: set the report period

Apply the exact date range from the funder. Confirm which date field matters.

A service date is not the same as an intake date. A registration date is not the same as an attendance date. If the wrong field is used, the count may include people who do not belong in the report.

Save the start date, end date, and date field used.

## Step 3: pull the source

Pull the count from the approved source system. That may be a case system, attendance tool, program database, or spreadsheet.

Save the export date and filters. If the system report can be rerun, save the report name. If the count comes from a spreadsheet, save the owner and file path.

Do not build the count from memory.

If two systems show different counts, pause before choosing one. Find out which system is the source for the report. The answer may depend on the grant, program, or period. Save the reason so the same question does not return next quarter.

When a partner sends the count, ask for the same support you would keep for your own file. At minimum, save the period, count rule, sender, date received, and any limits they named.

## Step 4: handle duplicates

Duplicate rules depend on the count unit. If the report asks for visits, repeat rows may be correct. If it asks for unique people, repeats must be removed.

Use stable identifiers when possible. A participant ID or case ID is safer than a name. If staff must match by name and birth date, document the method and limit access to private data.

Keep a note for records merged or excluded.

## Step 5: check exclusions

Some records may not belong in the report.

Review:

- No shows
- Staff or volunteers
- Test records
- People served by a different grant
- Records outside the geography
- Records missing required intake data
- People served after the report period

Do not delete source records to make the count cleaner. Mark the exclusion and save the reason.

If exclusions are frequent, the intake or attendance process may need a fix. The report worksheet should not become the only place where bad records are cleaned. Fixing the source helps the next report and lowers review time.

## Step 6: compare with prior reports

Compare the new count to the prior period. A large change may be real, but it should be understood before submission.

Ask:

- Did service volume change?
- Did the definition change?
- Did the source system change?
- Were late records added?
- Was a duplicate problem fixed?

If the change is real, the narrative may need a short explanation.

## Step 7: protect private data

Client count files can expose names, contact details, or service needs. Save only what the report needs. Use a summary file when possible.

If the evidence file must include personal data, store it in the approved system and limit access.

Before final approval, create a clean summary that can sit in the grant packet. The summary should show the final count and rule without exposing names or private service details.

GrantPipe can help connect count rules, source notes, report tasks, and final approved numbers to the grant record. That helps the next report use the same method.

## Step 8: approve the count

Program staff should approve the meaning of the count. The grants manager should approve that it answers the funder question.

Save:

- Source export
- Count rule
- Duplicate method
- Exclusions
- Final number
- Reviewer
- Approval date

A clean client count is not just a number. It is a number with a rule, a source, and a review trail.
