<?php
/**
 * Goodlucks Homes — the FIRST PUBLISHED VERSION of each legal document.
 *
 * These strings are not what the website serves. They are the seed used once,
 * when a database has no published legal document yet (a fresh installation, or
 * an existing installation that has just run `php-backend/migrate.php`). After
 * that, `legal_documents` / `legal_document_versions` are the single source of
 * truth and an administrator edits the text in the console — no code change and
 * no deployment.
 *
 * Therefore:
 *   * nothing in the React site contains this text, and
 *   * the seed writes exactly one published version per document, so the pages
 *     are never empty and registration is never blocked by a missing document.
 *
 * The text deliberately describes what the platform actually does. It must not
 * promise encryption, automatic deletion, refunds, guarantees or services that
 * have not been implemented. Before launch these documents are to be reviewed by
 * a qualified Ghanaian legal professional (see the phase report, section 10).
 *
 * Placeholders replaced at seed time: {{email}}, {{phone}}, {{site}}.
 */

declare(strict_types=1);

/** The document types this build ships with. A future document adds a type. */
const LEGAL_DOCUMENT_TYPES = ['terms', 'privacy'];

/** Human labels, used by the API, the console and the public page. */
function legal_document_labels(): array
{
    return [
        'terms'   => [
            'title'   => 'Terms and Conditions',
            'slug'    => 'terms-and-conditions',
            'summary' => 'The rules that apply when you use Goodlucks Homes: accounts, listings, viewings, verification and disputes.',
        ],
        'privacy' => [
            'title'   => 'Privacy Policy',
            'slug'    => 'privacy-policy',
            'summary' => 'What personal information Goodlucks Homes collects, why, who it is shared with, and the rights you have under the Data Protection Act, 2012 (Act 843).',
        ],
    ];
}

/** Replace the seed placeholders with the configured contact details. */
function legal_seed_render(string $html): string
{
    return strtr($html, [
        '{{email}}' => e(OFFICIAL_EMAIL),
        '{{phone}}' => e(OFFICIAL_PHONE),
        '{{site}}'  => e(rtrim(SITE_URL, '/')),
    ]);
}

/** The seed body for a document type, placeholders unresolved. */
function legal_seed_body(string $type): string
{
    if ($type === 'terms') {
        return legal_seed_terms();
    }
    if ($type === 'privacy') {
        return legal_seed_privacy();
    }

    return '';
}

/** The Terms and Conditions seed. 18 sections. */
function legal_seed_terms(): string
{
    return <<<'HTML'
<p><strong>These Terms and Conditions ("Terms") govern your use of Goodlucks Homes</strong>, a rental listing and enquiry platform for residential property in Ghana. Please read them before you create an account, request a viewing or submit a listing.</p>

<h2>1. Introduction and acceptance</h2>
<p>Goodlucks Homes is operated from Accra, Ghana. By creating an account, browsing the site, saving a property, submitting an enquiry, requesting a viewing, or submitting a listing, you agree to these Terms. If you do not agree, please do not use the platform.</p>
<p>These Terms apply to everyone who uses the platform, whether or not you hold an account. Where a separate written agreement applies to a specific service, that agreement prevails over these Terms to the extent of any conflict.</p>

<h2>2. Eligibility and registration</h2>
<ul>
<li>You must be at least 18 years old and able to enter into a binding contract under Ghanaian law.</li>
<li>You must give accurate, current information when you register, and keep it accurate.</li>
<li>There are two account types: <strong>Tenant</strong> and <strong>Agent/Landlord</strong>. An Agent and a Landlord share one account type; the account chooses which it is during verification and cannot hold both.</li>
<li>One account per person and per email address. You are responsible for keeping your password confidential and for everything done through your account.</li>
<li>An Agent/Landlord account must complete identity verification before it may submit a listing. Verification is described in section 6.</li>
</ul>

<h2>3. Tenant responsibilities</h2>
<ul>
<li>Provide accurate information about what you are looking for, and use enquiries and viewing requests honestly.</li>
<li><strong>View a property before you commit to it.</strong> Verify the address, the condition of the property, the rent and any other charges with the agent or landlord directly.</li>
<li>Attend viewings you have requested, or tell the agent or landlord promptly if you cannot.</li>
<li>Do not send money to anyone who is not the verified agent or landlord for the property, and pay only the amounts and charges that are displayed to you on the platform or in the tenancy terms you are given.</li>
<li>Use other people's contact details only for the purpose for which they were shared with you.</li>
<li>Report suspicious listings, requests for undisclosed payments, or impersonation to us at {{email}}.</li>
</ul>

<h2>4. Agent and landlord responsibilities</h2>
<ul>
<li>List only property that you own or are authorised to let, and be able to show that authority on request.</li>
<li>Keep every listing accurate: rent, location, size, condition, amenities, availability and any viewing fee or other charge.</li>
<li><strong>Reconfirm the availability of every published listing every seven days.</strong> A listing that is not reconfirmed is automatically unpublished (see section 13).</li>
<li>Respond to enquiries and viewing requests honestly and within a reasonable time, and honour the viewing terms shown on the listing.</li>
<li>Do not ask a tenant for any payment that is not disclosed on the listing or in the tenancy terms, and do not demand payment before a viewing unless a viewing fee is properly displayed for that property.</li>
<li>Keep tenant information confidential, use it only in connection with the enquiry or viewing concerned, and never publish it.</li>
<li>Comply with Ghanaian law, including the law on renting, discrimination, taxation and data protection.</li>
<li>Maintain an approved identity verification. Verification may be reviewed, suspended or withdrawn; a suspended account keeps sign-in and a read-only view of its own dashboard.</li>
</ul>

<h2>5. Listing accuracy and availability</h2>
<p>Listings are submitted and maintained by agents and landlords, not written by Goodlucks Homes. We review accounts, apply moderation rules and may remove or unpublish a listing that appears inaccurate, duplicated, misleading or unlawful. We do not inspect premises, confirm title to property, or measure a property, and we cannot guarantee that a property is still available at the moment you enquire. Always confirm the details with the agent or landlord.</p>

<h2>6. Identity verification and its limits</h2>
<p>Goodlucks Homes verifies the identity of agents and landlords before they may list. Depending on the account, this involves a Ghana Card and, for an Agent, professional evidence reviewed and approved by our staff.</p>
<ul>
<li>Verification tells you that <strong>the identity documents presented were reviewed and approved</strong> as belonging to the account holder on the date shown.</li>
<li>Verification is <strong>not</strong> a physical inspection of any property. It is <strong>not</strong> a search of land title or ownership records. It does <strong>not</strong> prove that the account holder owns, or has the legal right to let, any particular property.</li>
<li>A verified badge does not guarantee the condition of a property, the accuracy of a listing, or the quality of anyone's service.</li>
<li>Verification may lapse, be reviewed or be withdrawn. If it is withdrawn, the account's listings are not automatically republished.</li>
</ul>

<h2>7. Viewing arrangements</h2>
<ul>
<li>A viewing request is an introduction between you and the agent or landlord. The time, place and any conditions are agreed directly between you.</li>
<li>Goodlucks Homes does not attend viewings and does not supervise them.</li>
<li>Meet at the property, view the inside of the property and the surrounding area, and take someone with you if you prefer. Ask to see the identity of the person showing you the property.</li>
<li>Do not pay a deposit <em>before</em> a viewing unless you have decided to proceed and the terms are clear to you in writing.</li>
<li>If a viewing does not go ahead, the viewing terms recorded for that property apply.</li>
</ul>

<h2>8. Viewing fees and payment</h2>
<p>Some properties carry a viewing fee. Where they do, the amount and the terms that apply are shown on the property page before you request the viewing.</p>
<ul>
<li>Pay only the amount displayed, only by the channel stated in those terms, and ask for a receipt.</li>
<li>We do not hold rent, deposits or viewing fees on behalf of either party.</li>
<li>Whether a viewing fee is refundable, and in what circumstances, is set out in the terms displayed for that property. Goodlucks Homes is not a party to that payment.</li>
<li>We record viewing terms and may review a complaint about them, but we do not adjudicate the payment as a court or arbitrator would.</li>
</ul>

<h2>9. Our role as an intermediary</h2>
<p>Goodlucks Homes connects tenants with agents and landlords. We provide the listing platform, the enquiry and viewing tools, and the verification and moderation processes described on this site.</p>
<ul>
<li>We do not own, manage, inspect or let properties.</li>
<li>We do not act as the agent of either party in a tenancy, and we do not negotiate or conclude tenancy agreements.</li>
<li>We are not a party to any agreement between a tenant and a landlord.</li>
<li>Where a provider has a separate written commission arrangement with Goodlucks Homes, that arrangement does not change the rent or charges shown to a tenant.</li>
</ul>

<h2>10. Rental agreements between tenants and landlords</h2>
<p>A tenancy agreement is made directly between the tenant and the landlord, off this platform. Its terms — rent, advance payment, deposit, duration, notice, repairs, utilities and handover — are for those two parties to agree and record in writing. Goodlucks Homes is not a party to that agreement, does not guarantee performance of it, and does not hold money under it.</p>
<p>Before you pay rent or a deposit, satisfy yourself that the person you are dealing with is entitled to let the property, and keep a signed written agreement and receipts.</p>

<h2>11. Prohibited conduct, fraud and misleading listings</h2>
<p>The following are prohibited and may lead to immediate suspension and, where appropriate, referral to the Ghana Police Service:</p>
<ul>
<li>Fraud, impersonation, or pretending to be an agent or landlord you are not.</li>
<li>Fake, duplicated, bait or misleading listings, including a rent or fee that is not the rent or fee actually charged.</li>
<li>Listing a property you are not authorised to let, or listing the same property to induce multiple payments.</li>
<li>Asking for money outside the amounts displayed, or demanding payment before a viewing where no viewing fee is displayed.</li>
<li>Harassment, threats or abusive conduct towards another user.</li>
<li>Attempting to access another person's account, scraping the platform, uploading malware, or interfering with the service.</li>
<li>Misusing identity documents or another person's personal information.</li>
<li>Any unlawful discrimination against a tenant or landlord.</li>
</ul>

<h2>12. Suspension, restriction and termination</h2>
<p>We may suspend, restrict or close an account, remove a listing, or limit access to a feature where we believe these Terms have been breached, where verification has failed or been withdrawn, where a listing is unsafe or misleading, or where the law requires it. Where we can, we tell the account holder why.</p>
<ul>
<li>A suspended Agent/Landlord can still sign in and view its own dashboard, but cannot publish or operate listings, and can still withdraw.</li>
<li>We keep records of suspended, withdrawn and expired accounts and listings. Nothing is deleted to make a decision easier to defend.</li>
<li>You may stop using the platform at any time and ask us to close your account at {{email}}. Closure does not remove records we must keep by law, or records needed to resolve a dispute.</li>
</ul>

<h2>13. Availability confirmation and listing expiry</h2>
<p>Every published listing must be reconfirmed as available by its agent or landlord <strong>every seven days</strong>. If it is not reconfirmed, the listing is automatically unpublished. Unpublishing is not deletion: the listing, its photographs and its history are kept, and an expired listing is distinguishable from one the provider deliberately withdrew.</p>
<p>A reconfirmation is the provider's statement that the property is still available. It is not a new verification and it does not re-issue a verification that has been suspended or withdrawn. A listing that was unpublished while an account was suspended is not republished automatically when the account is reinstated: it needs a fresh availability confirmation.</p>

<h2>14. Intellectual property</h2>
<p>The Goodlucks Homes name, logo, design, software and the text and layout of this site belong to Goodlucks Homes or its licensors. You may use the site for its intended purpose. You may not copy, republish, resell or systematically extract listings, photographs or other content without our written permission.</p>
<p>When you submit a listing, you confirm that you hold the rights to the photographs and text you upload, and you grant Goodlucks Homes a licence to display them on the platform and in related promotion of that listing. That licence ends when the listing is removed, except for copies already published or kept in our records.</p>

<h2>15. Platform availability and limitation of liability</h2>
<p>The platform is provided on an "as available" basis. We work to keep it running and accurate, but we do not warrant that it will be uninterrupted or error-free, and we may suspend it for maintenance. The site may contain links to other websites we do not control.</p>
<p>To the extent permitted by Ghanaian law, Goodlucks Homes is not liable for indirect or consequential loss, loss of profit or opportunity, or loss arising from: your dealings with another user; a listing that turns out to be inaccurate; a viewing that does not take place; money paid to another person outside the platform; or a tenancy agreement between a tenant and a landlord.</p>
<p>Nothing in these Terms excludes or limits liability that cannot lawfully be excluded or limited, including liability for fraud or for death or personal injury caused by negligence. Where liability cannot be excluded, our total liability to you in connection with the platform is limited to the amount, if any, that you paid to Goodlucks Homes for the use of the platform in the three months before the event giving rise to the claim.</p>

<h2>16. Disputes and Ghanaian law</h2>
<p>If you have a complaint about the platform or another user, contact us first at {{email}} so we can try to resolve it. These Terms are governed by the laws of the Republic of Ghana, and the courts of Ghana have jurisdiction over any dispute arising from them.</p>
<p>Nothing in this section prevents you from reporting a suspected crime to the Ghana Police Service, or from complaining to the Data Protection Commission about the handling of your personal information.</p>

<h2>17. Changes to these Terms</h2>
<p>We may update these Terms. When we do, we publish a new version, show its effective date on this page, and keep the earlier versions in our records. Where a change is material, we may also notify account holders by email and may ask you to accept the new version before you continue to use the relevant features.</p>
<p>Continuing to use the platform after the effective date of a new version means you accept it. If you do not accept a new version, you should stop using the platform and may ask us to close your account.</p>

<h2>18. Contact us</h2>
<p>Questions about these Terms, a listing, or a decision we have made:</p>
<ul>
<li>Email: <a href="mailto:{{email}}">{{email}}</a></li>
<li>Telephone: {{phone}}</li>
<li>Or use the <a href="/contact">contact page</a>.</li>
</ul>
HTML;
}

/** The Privacy Policy seed. 17 sections, aligned to the Data Protection Act, 2012 (Act 843). */
function legal_seed_privacy(): string
{
    return <<<'HTML'
<p>This Privacy Policy explains what personal information <strong>Goodlucks Homes</strong> collects when you use this platform, why we collect it, who we share it with, how long we keep it, and the rights you have. It is written to align with the <strong>Data Protection Act, 2012 (Act 843)</strong> of Ghana.</p>

<h2>1. Introduction and who we are</h2>
<p>Goodlucks Homes ("we", "us") operates this rental listing and enquiry platform in Ghana. For the purposes of Act 843 we are the data controller for the information described here. Our contact point for privacy questions is <a href="mailto:{{email}}">{{email}}</a>.</p>
<p>We collect the information needed to run an account, publish and find rental listings, arrange viewings, verify agents and landlords, and keep the platform safe. We do not sell personal information.</p>

<h2>2. Information we collect when you register</h2>
<ul>
<li>Your name, email address and telephone number.</li>
<li>A password, which we store only as a one-way hash — never in readable form.</li>
<li>Your account type (Tenant, or Agent/Landlord), and the city or general location you give us.</li>
<li>For an Agent/Landlord, the agency or business name you give us, and the official name on your Ghana Card if you provide it.</li>
<li>The record that you accepted the Terms and Conditions and acknowledged this Privacy Policy: the document version, the date and time, and your account identifier. We do not record the wording of your acceptance beyond those facts.</li>
</ul>

<h2>3. Information we collect from tenants</h2>
<ul>
<li>Your property preferences: preferred locations, budget range and number of bedrooms.</li>
<li>Rental and property-matching requests you submit, including the message you write.</li>
<li>Viewing requests: the property, the date and time, and any note you add.</li>
<li>Saved properties and search alerts you set up.</li>
<li>Notifications you receive about your requests, viewings and saved properties.</li>
</ul>

<h2>4. Information we collect from agents and landlords</h2>
<ul>
<li>Your professional classification (Agent or Landlord), chosen once during verification.</li>
<li>Your operating city and agency profile.</li>
<li>The listings you submit: property details, photographs, rent, charges and availability answers.</li>
<li>Your verification status and decisions, and the notes staff record when they review an application.</li>
<li>Your money records with us, where a commission arrangement exists: remittances you claim and commissions recorded against your listings.</li>
</ul>

<h2>5. Ghana Card and identity verification data</h2>
<p>An Agent/Landlord must complete identity verification before listing. This involves uploading a Ghana Card and, for an Agent, professional evidence such as a licence or authorisation.</p>
<ul>
<li>These documents are stored in a private storage area that is <strong>not</strong> part of the public website and is not served to visitors.</li>
<li>Only staff authorised to review verification can open them, and every opening is recorded in an audit trail. Tenants and other providers cannot see them.</li>
<li>We keep the review decision, the reviewer, the date and the reasons. We keep the documents for as long as the verification is relied on and for as long as we need them to answer a dispute or a legal requirement.</li>
<li><strong>We do not publish identity documents, card numbers or photographs of documents anywhere on the platform.</strong></li>
<li>We cannot return an uploaded document once your account is closed if we are required to keep it; you may ask us what we hold.</li>
</ul>

<h2>6. Listing and viewing request data</h2>
<p>When you enquire about a property or request a viewing, we record the property, the agent or landlord responsible, the date and time, and the status of the request. The agent or landlord sees the request and the note you wrote. <strong>Your phone number and email address are not included in that request:</strong> a provider may ask us to reveal them for a specific viewing, with a written reason, and an administrator decides. If that is approved, you are notified and told who received your details and when the approval expires. You can ask us to revoke an approval.</p>

<h2>7. Saved properties, notifications and activity</h2>
<ul>
<li>We store the properties you save so they appear on your dashboard on any device. If you are not signed in, a guest's saved properties are kept in your own browser's local storage and are not sent to us.</li>
<li>We store the notifications we send you and whether you have read them.</li>
<li>We keep a record of the actions that matter for safety and accountability — registrations, verifications, listings, viewings, decisions — in an audit log. This is what lets us answer "who did what, and when".</li>
<li>We count page views on our own servers to understand which listings and pages are used. We do not use third-party advertising or tracking cookies.</li>
</ul>

<h2>8. How we use your information</h2>
<ul>
<li>To create and secure your account, and to sign you in.</li>
<li>To publish and find listings, match tenants with properties, and pass your requests to the right agent or landlord.</li>
<li>To verify agents and landlords before they list, and to review verification when it changes.</li>
<li>To arrange viewings, record viewing terms and handle a complaint about one.</li>
<li>To send you service email: account, enquiry, viewing and availability messages, and — where you have asked for them — search alerts.</li>
<li>To keep the platform safe: detect fraud, duplicate or misleading listings, and misuse of accounts.</li>
<li>To keep the financial and audit records we are required to keep, and to comply with the law or a lawful request.</li>
</ul>

<h2>9. When we share information</h2>
<ul>
<li><strong>With the agent or landlord concerned:</strong> the enquiry or viewing request, and the message you wrote. Your phone number and email address are shared only through the approval process described in section 6.</li>
<li><strong>With our service providers</strong> who help us run the platform — for example the provider that delivers our email. They receive only what the task needs.</li>
<li><strong>With authorities</strong> where the law requires it, or where we believe disclosure is necessary to investigate fraud or protect someone's safety.</li>
<li><strong>Within a reorganisation:</strong> if the business is transferred, records may transfer with it on the same terms.</li>
</ul>
<p>We do not sell personal information, and we do not share it for third-party advertising.</p>

<h2>10. Email communications</h2>
<p>We send service email that is part of running your account: welcome and verification messages, enquiry and viewing notices, availability reminders, and notices about a decision affecting your account. These are not marketing and cannot be switched off while you hold an account.</p>
<p>Where you have asked for search alerts, you can turn them off in your account settings or from the alert itself. Any future marketing email would be sent only with your consent and would include a way to stop it.</p>

<h2>11. How we protect your information</h2>
<ul>
<li>Access to the platform's data is limited by role and by staff capability. Most staff powers — verification review, finance, identity documents — are switched off by default and granted only from the server console.</li>
<li>Identity documents sit in private storage outside the public website; they are not reachable by a URL from the internet.</li>
<li>Passwords are stored as one-way hashes. Sessions are carried in an HTTP-only cookie.</li>
<li>Sensitive actions are written to an audit log with the account, the time and the reason.</li>
</ul>
<p>No system is perfectly secure. If we become aware of a breach that affects your personal information, we will notify you and the Data Protection Commission as Act 843 requires.</p>

<h2>12. Retention and deletion</h2>
<p>We keep account information while your account is open. After closure we keep what we still need: records of verification decisions, listings and their history, viewings, money records and audit entries, for as long as a dispute, a legal obligation or an accounting rule requires. We do not promise automatic deletion on a fixed schedule, because the retention period depends on the record.</p>
<p>When you ask us to close your account, we remove or anonymise what we no longer need. We will tell you what we must keep and why.</p>

<h2>13. Your rights of access and correction</h2>
<p>Under Act 843 you may ask us:</p>
<ul>
<li>what personal information we hold about you, and to see it;</li>
<li>to correct information that is wrong or out of date;</li>
<li>to stop processing information where the law allows, or to delete information we do not need to keep;</li>
<li>to explain how we use your information.</li>
</ul>
<p>Write to <a href="mailto:{{email}}">{{email}}</a> from the email address on your account. We will respond within the period Act 843 allows. We may ask you to confirm your identity first, because we will not hand one person's information to another.</p>

<h2>14. Complaints and contact</h2>
<p>If you are unhappy with how we have handled your information, tell us first at <a href="mailto:{{email}}">{{email}}</a> or on {{phone}} so we can put it right. You also have the right to complain to the <strong>Data Protection Commission of Ghana</strong>, which regulates the handling of personal data under Act 843.</p>

<h2>15. Cookies and local storage</h2>
<ul>
<li><strong>Session cookie:</strong> keeps you signed in. It is HTTP-only and is removed when you sign out or it expires.</li>
<li><strong>Local storage in your browser:</strong> remembers the properties a guest has saved, so they are still there on the next visit. It stays on your device and is not a tracking cookie.</li>
<li>We do not use third-party advertising or analytics cookies.</li>
</ul>
<p>You can clear cookies and local storage in your browser at any time; you will be signed out and a guest's saved list will be forgotten.</p>

<h2>16. Changes to this policy</h2>
<p>We may update this policy. A new version is published with an effective date, and earlier versions are kept in our records. Where a change materially affects what we collect or who we share it with, we will tell account holders by email. Publishing a new version does not, by itself, count as your acknowledgement of it: where we need a fresh acknowledgement we ask for it explicitly and record it separately.</p>

<h2>17. Contact us</h2>
<ul>
<li>Privacy questions and requests: <a href="mailto:{{email}}">{{email}}</a></li>
<li>Telephone: {{phone}}</li>
<li>Or use the <a href="/contact">contact page</a>.</li>
</ul>
HTML;
}

/**
 * The first version of a document, ready to store.
 *
 * @return array{type:string,slug:string,title:string,summary:string,content:string,change_note:string}
 */
function legal_seed_document(string $type): array
{
    $labels = legal_document_labels()[$type] ?? null;
    if ($labels === null) {
        throw new RuntimeException('Unknown legal document type: ' . $type);
    }

    return [
        'type'        => $type,
        'slug'        => $labels['slug'],
        'title'       => $labels['title'],
        'summary'     => $labels['summary'],
        'content'     => legal_seed_render(legal_seed_body($type)),
        'change_note' => 'First published version.',
    ];
}
