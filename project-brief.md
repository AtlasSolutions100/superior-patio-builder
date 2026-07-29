**How to add this file in Replit:**
1. Open the Replit project
2. On the left file list, click the three dots or + icon
3. Choose “New file”
4. Name it exactly: `project-brief.md`
5. Paste everything below this line into the file
---

# Project Brief

## Client / Goal
Superior Patio Covers (Justin Eyring, Twin Falls, ID) needs a clean internal job-tracking dashboard that replaces their current Google Sheets process. Once a contract is signed, the job should live in a shared Kanban + list view so the owner, project manager, and installation techs can see status, estimated install date, and next actions without hunting through spreadsheets.

## Who will use it
- Justin Eyring (Owner – Sales, Ordering, Project Management)
- Blair Rhodehouse (Project Management)
- Ryan Bos (Sales + Installation Tech)
- Denzil Lloyd (Installation Tech)
- Bill Conant (Sales)
- Janelle Eyring (Office support / Appointment Scheduler)

Primary daily users: Justin and Blair. Techs need a simple view of jobs that are ready for their work.

## Main features needed (Phase 1 only)
- Manual creation of a new job (customer name, phone, address, city, type of cover, contract amount, source, estimated install date, notes)
- Kanban board with the exact stages Justin defined:
  - New Lead → Scheduled → Bid Given → Sold → Invoiced with Quickbooks → Deposit Paid → Pre Order Site Visit → Material Ordered → Non Standard Material Ordered
  - Permit Applied → Footings Needed → Other Prep Work → Material Received → Ready to Install → Installed → Post Install Follow up → Google Review or referral Asked for
- Drag-and-drop movement between stages
- Within each column, jobs sorted by estimated install date (soonest at the top)
- Simple list/table view of all open jobs with the same columns as the current tracking sheet
- Basic filters (by stage, by city, by type of cover, by assigned person)
- CSV export that closely matches the layout and columns of the current “Copy of Job Tracking” Google Sheet
- Simple role-based visibility (everyone can see jobs; only Justin/Blair can edit stages and key fields)

## What success looks like
Justin or Blair can open the dashboard, immediately see every sold job in the correct stage ordered by soonest install date, drag a job to the next stage when work progresses, and export a clean spreadsheet that looks familiar. The team no longer needs the Google Sheet as the single source of truth for open jobs.

## Things we are NOT doing in Phase 1
- Automatic import of leads from Deepwater Marketing or website forms
- Any integration with OneClick Contractor (no public API)
- Automatic creation of customers or invoices in QuickBooks
- Payment tracking, commission calculations, or advanced reporting
- Mobile-native app or complex notifications
- AI suggestions or automated next-step recommendations
- Customer-facing portal

## Special notes
- Tone: clean, practical, spreadsheet-friendly. Avoid flashy SaaS design language.
- Keep the UI calm and dense (Justin likes seeing a lot of information at once).
- Estimated install date is critical for column ordering.
- Preserve the ability to export data in a format that feels like the existing Google Sheet.
- Start with a simple, reliable core. Future phases can add lead automation and QuickBooks once the core workflow is loved.