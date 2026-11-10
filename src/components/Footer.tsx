import React from 'react';
import { useApp } from '../context/AppContext';
import {
  Building2,
  Mail,
  Phone,
  MapPin,
  Instagram,
  Linkedin,
  Twitter,
  Facebook,
  Music2,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import { BRAND_CONTACT, BRAND_HANDLE, BRAND_SOCIALS } from '../config/brand';

/**
 * The platform icons, keyed by the account name in `BRAND_SOCIALS`.
 *
 * The handle and the URLs live in `src/config/brand.ts` because the property
 * poster draws the same account on a canvas; one source keeps the footer and the
 * poster from ever advertising different accounts.
 */
const SOCIAL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Instagram,
  TikTok: Music2,
  LinkedIn: Linkedin,
  X: Twitter,
  Facebook,
};

/**
 * Footer links, and where each one goes.
 *
 * Every target is an existing route: the guides live in the Learning Centre,
 * About and Contact are their own pages, and the two legal documents are public
 * pages whose text is served from the database. Nothing here is a placeholder
 * and nothing here opens a dead end.
 */
const PLATFORM_LINKS: Array<{ id: string; label: string; path: string }> = [
  { id: 'guides', label: 'Renting Guides & How Goodlucks Homes Works', path: '/blog' },
  { id: 'about', label: 'About Goodlucks Homes', path: '/about' },
  { id: 'contact', label: 'Contact Us', path: '/contact' },
];

const LEGAL_LINKS: Array<{ id: string; label: string; path: string }> = [
  { id: 'terms', label: 'Terms and Conditions', path: '/terms-and-conditions' },
  { id: 'privacy', label: 'Privacy Policy', path: '/privacy-policy' },
];

/**
 * Site footer.
 *
 * Styling is intentionally footer-scoped (`.gl-footer-*` in `src/index.css`): the
 * rest of the site keeps its link treatment, while footer links are plain dark
 * charcoal text with a soft grey hover — no bright teal link text, no heavy teal
 * underline, and pink only as a small accent.
 */
export const Footer: React.FC = () => {
  const { navigate } = useApp();
  const go = (path: string) => () => navigate(path);

  return (
    <footer className="gl-footer w-full bg-surface text-ink border-t border-line pt-10 pb-28 md:pb-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <div className="grid gap-10 md:gap-8 md:grid-cols-12">
          {/* Brand & role of the platform */}
          <div className="md:col-span-5 flex flex-col items-start gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-interactive flex items-center justify-center text-ink font-bold">
                <Building2 className="w-6 h-6" />
              </div>
              <div className="flex flex-col text-left">
                <span className="font-extrabold text-xl tracking-tight text-ink">
                  Goodlucks <span className="text-accent">Homes</span>
                </span>
                <span className="text-[10px] uppercase tracking-widest text-ink/70 font-semibold">
                  Find. View. Rent.
                </span>
              </div>
            </div>

            <p className="text-sm text-ink/70 leading-relaxed max-w-md">
              Goodlucks Homes is a property discovery and rental intermediary in Ghana. We connect people looking
              for a home with the agents and landlords who list them, arrange viewings, and keep the enquiries and
              records in one place. We do not own or manage the properties listed here.
            </p>

            <div className="flex flex-col gap-1.5 text-sm text-ink/80">
              <a href={`mailto:${BRAND_CONTACT.email}`} className="gl-footer-contact">
                <Mail className="w-4 h-4 text-ink/50 shrink-0" />
                {BRAND_CONTACT.email}
              </a>
              <a href={BRAND_CONTACT.phoneHref} className="gl-footer-contact">
                <Phone className="w-4 h-4 text-ink/50 shrink-0" />
                {BRAND_CONTACT.phone}
              </a>
              <span className="gl-footer-contact cursor-default">
                <MapPin className="w-4 h-4 text-ink/50 shrink-0" />
                Accra, Ghana
              </span>
            </div>
          </div>

          {/* Navigation */}
          <nav aria-label="Goodlucks Homes" className="md:col-span-4">
            <h2 className="gl-footer-heading">Goodlucks Homes</h2>
            <ul className="mt-3 flex flex-col items-start gap-1">
              {PLATFORM_LINKS.map((link) => (
                <li key={link.id} className="w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={go(link.path)}
                    data-footer-link={link.id}
                    className="gl-footer-link text-left"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>

            <h2 className="gl-footer-heading mt-7">Legal</h2>
            <ul className="mt-3 flex flex-col items-start gap-1">
              {LEGAL_LINKS.map((link) => (
                <li key={link.id} className="w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={go(link.path)}
                    data-footer-link={link.id}
                    className="gl-footer-link text-left"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* Social accounts */}
          <div className="md:col-span-3">
            <h2 className="gl-footer-heading">Follow</h2>
            <p className="mt-3 text-sm text-ink/70">{BRAND_HANDLE}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {BRAND_SOCIALS.map((social) => {
                const Icon = SOCIAL_ICONS[social.name] ?? ShieldCheck;
                return (
                  <a
                    key={social.name}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="gl-footer-social"
                    title={`${social.name} ${social.handle}`}
                    aria-label={`${social.name} ${social.handle}`}
                  >
                    <Icon className="w-5 h-5" />
                  </a>
                );
              })}
            </div>
            <p className="mt-4 text-[11px] text-ink/55 leading-relaxed">
              Listings are submitted by independent agents and landlords. Verification confirms an identity — it is
              not a physical inspection of a property.
            </p>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-9 pt-5 border-t border-line flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs text-ink/60">
          <span>© {new Date().getFullYear()} Goodlucks Homes. A Goodlucks Platforms Subsidiary. All rights reserved.</span>
          <button type="button" onClick={go('/register')} className="gl-footer-link !px-0 inline-flex items-center gap-1">
            Create an account
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </footer>
  );
};
