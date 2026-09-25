import { BrandMark } from "@/components/brand-mark";
import { Link } from "wouter";

/**
 * Public Privacy Policy and Terms pages.
 *
 * These exist because Intuit (and Google, if the OAuth route is ever taken)
 * require a publicly reachable privacy policy and end-user licence agreement
 * before granting production keys. They must stay OUTSIDE the auth gate — a
 * reviewer who hits a sign-in wall will reject the app.
 *
 * The wording describes what this app genuinely does with data. It is written
 * to be accurate, not to be legal advice: have it reviewed before submitting.
 */

const UPDATED = "September 25, 2026";
const CONTACT = "support@atlas-solutions.dev";

function LegalShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-5 py-4">
          <BrandMark className="h-8 w-8 shrink-0 text-primary" />
          <div className="flex flex-col">
            <span className="text-sm font-bold leading-none">Superior Patio Covers</span>
            <span className="mt-1 font-mono text-xs text-muted-foreground">Job Board</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">Last updated {UPDATED}</p>
        <div className="mt-8 flex flex-col gap-6 text-sm leading-relaxed text-foreground/90">
          {children}
        </div>

        <nav className="mt-12 flex gap-4 border-t border-border pt-5 text-xs text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms of Service</Link>
          <Link href="/sign-in" className="hover:text-foreground">Sign in</Link>
        </nav>
      </main>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold text-foreground">{children}</h2>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <H2>{title}</H2>
      {children}
    </section>
  );
}

export function PrivacyPage() {
  return (
    <LegalShell title="Privacy Policy">
      <p>
        This app is a private job-tracking tool built for Superior Patio Covers.
        It is not a public service: access is by invitation from an
        administrator only. This policy explains what the app stores, why, and
        who can see it.
      </p>

      <Section title="What the app stores">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Team accounts</strong> — name, email address, and role for
            each invited team member. Sign-in itself is handled by Clerk; this
            app never sees or stores passwords.
          </li>
          <li>
            <strong>Customer and job records</strong> — the customer's name,
            phone number, address, the type of cover, contract amount,
            estimated install date, the job's current stage, and notes added by
            the team.
          </li>
          <li>
            <strong>Leads</strong> imported from spreadsheets the administrator
            connects, containing the contact details those sheets hold.
          </li>
          <li>
            <strong>Activity</strong> — notes are stored with the name of the
            person who wrote them and the time they were written.
          </li>
        </ul>
      </Section>

      <Section title="Where the data comes from">
        <p>
          Records are either entered by the team, or imported from Google
          Sheets that an administrator explicitly connects in Settings. The app
          reads those sheets; it does not change them.
        </p>
      </Section>

      <Section title="Connected services">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Clerk</strong> handles sign-in and stores the account
            credentials.
          </li>
          <li>
            <strong>Google Sheets</strong> — when an administrator connects a
            sheet, the app reads new rows from it to create leads. If a sheet
            is connected for write-back, the app also records sold jobs into
            the sheet the administrator chose.
          </li>
          <li>
            <strong>QuickBooks Online</strong> — if an administrator connects a
            QuickBooks company, the app creates and updates customer records
            there for jobs that have been sold. The app requests only
            accounting access, stores only the tokens needed to maintain the
            connection, and never handles payments or card details.
          </li>
        </ul>
        <p>
          A connection stays in place until an administrator disconnects it in
          Settings, or revokes it from the service's own side.
        </p>
      </Section>

      <Section title="Who can see the data">
        <p>
          Only signed-in members of Superior Patio Covers. Roles limit this
          further: install technicians see the job board and their assigned
          work, and only administrators see the sales pipeline, team
          management, and settings. The data is not sold, rented, or shared
          with advertisers, and it is not used to train any model.
        </p>
      </Section>

      <Section title="Keeping and deleting data">
        <p>
          Records are kept for as long as the business uses the app. Finished
          and unwanted records are archived rather than deleted so history
          stays intact, and an administrator can permanently delete a record at
          any time. To have an account or its data removed, contact an
          administrator or write to {CONTACT}.
        </p>
      </Section>

      <Section title="Security">
        <p>
          Access requires an invitation and a verified sign-in. Data is sent
          over encrypted connections and held in a private database that is not
          publicly reachable. Credentials for connected services are stored as
          secrets on the server and are never shown in the app.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          If this policy changes, the date above will change with it. Questions
          about data in this app: {CONTACT}.
        </p>
      </Section>
    </LegalShell>
  );
}

export function TermsPage() {
  return (
    <LegalShell title="Terms of Service">
      <p>
        These terms cover use of the Superior Patio Covers Job Board. By
        signing in, the user agrees to them.
      </p>

      <Section title="Who may use it">
        <p>
          The app is private software provided to Superior Patio Covers and its
          staff. Accounts are created by invitation from an administrator.
          Accounts are personal: sign-in details should not be shared, and an
          administrator may remove access at any time.
        </p>
      </Section>

      <Section title="Acceptable use">
        <p>
          The app holds customer contact details and job information. Users
          agree to use it only for the company's work, to keep what they see
          confidential, and not to attempt to access data outside their role or
          to disrupt the service.
        </p>
      </Section>

      <Section title="The customer's data is theirs">
        <p>
          Superior Patio Covers owns the records entered into the app. On
          request, an administrator can export the data as a spreadsheet, and
          can ask for it to be deleted.
        </p>
      </Section>

      <Section title="Connected services">
        <p>
          Connecting Google Sheets or QuickBooks is optional and is initiated by
          an administrator. Those services have their own terms, and this app
          is not responsible for their availability. A connection can be
          removed at any time from Settings.
        </p>
      </Section>

      <Section title="Availability and warranty">
        <p>
          The app is provided as-is. Reasonable effort goes into keeping it
          available and correct, but it is not guaranteed to be uninterrupted
          or error-free, and it is not a system of record for accounting or
          tax. Figures it produces, including commission amounts, are a
          convenience and should be checked against the company's own books.
        </p>
      </Section>

      <Section title="Limitation of liability">
        <p>
          To the extent the law allows, liability arising from use of the app is
          limited to the fees paid for it in the twelve months before the claim.
        </p>
      </Section>

      <Section title="Changes and contact">
        <p>
          These terms may be updated; the date above will change when they are.
          Questions: {CONTACT}.
        </p>
      </Section>
    </LegalShell>
  );
}
