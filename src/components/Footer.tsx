import React from 'react';
import { useApp } from '../context/AppContext';
import { Building2, Mail, Phone, Instagram, Linkedin, Twitter, Facebook, Music2, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  const { setCurrentView, navigate } = useApp();

  return (
    <footer className="w-full bg-surface text-ink border-t border-line pt-10 pb-28 md:pb-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto flex flex-col items-center text-center space-y-6">
        
        {/* Logo & Brand */}
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

        {/* Short Company Description */}
        <p className="text-sm text-ink/70 max-w-xl leading-relaxed">
          Goodlucks Homes is a property discovery and rental intermediary in Ghana. We connect people looking for a home with the landlords and agents who list them, arrange viewings, and keep the enquiries and records in one place. We do not own or manage the properties listed here.
        </p>

        {/* Task 07: one footer entry to the Learning Centre, so a reader can
            reach the guides from every page without a second navigation menu. */}
        <nav aria-label="Learning Centre" className="text-sm font-semibold">
          <button
            type="button"
            onClick={() => navigate('/blog')}
            className="gl-link text-sm"
          >
            Renting guides and how Goodlucks Homes works
          </button>
        </nav>

        {/* Direct Contact Info */}
        <div className="flex flex-wrap justify-center items-center gap-6 text-sm font-medium text-ink pt-2">
          <a 
            href="mailto:rentals@goodlucks.co" 
            className="gl-link flex items-center gap-2 text-ink"
          >
            <Mail className="w-4 h-4 text-interactive-text" />
            rentals@goodlucks.co
          </a>
          <a 
            href="tel:+233237690080" 
            className="gl-link flex items-center gap-2 text-ink"
          >
            <Phone className="w-4 h-4 text-interactive-text" />
            +233 23 769 0080
          </a>
        </div>

        {/* Social Media Icons & Handle */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <span className="text-xs font-semibold text-ink">
            @GoodlucksHomes
          </span>
          <div className="flex items-center gap-3 text-ink/70">
            <a 
              href="https://www.instagram.com/GoodlucksHomes" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="p-2 rounded-lg border border-line bg-surface text-ink hover:border-interactive hover:bg-interactive/15 transition-colors" 
              title="Instagram @GoodlucksHomes"
            >
              <Instagram className="w-5 h-5" />
            </a>
            <a
              href="https://www.tiktok.com/@GoodlucksHomes"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg border border-line bg-surface text-ink hover:border-interactive hover:bg-interactive/15 transition-colors"
              title="TikTok @GoodlucksHomes"
            >
              <Music2 className="w-5 h-5" />
            </a>
            <a 
              href="https://www.linkedin.com/company/GoodlucksHomes" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="p-2 rounded-lg border border-line bg-surface text-ink hover:border-interactive hover:bg-interactive/15 transition-colors" 
              title="LinkedIn @GoodlucksHomes"
            >
              <Linkedin className="w-5 h-5" />
            </a>
            <a 
              href="https://x.com/GoodlucksHomes" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="p-2 rounded-lg border border-line bg-surface text-ink hover:border-interactive hover:bg-interactive/15 transition-colors" 
              title="X / Twitter @GoodlucksHomes"
            >
              <Twitter className="w-5 h-5" />
            </a>
            <a 
              href="https://www.facebook.com/GoodlucksHomes" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="p-2 rounded-lg border border-line bg-surface text-ink hover:border-interactive hover:bg-interactive/15 transition-colors" 
              title="Facebook @GoodlucksHomes"
            >
              <Facebook className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-4 border-t border-line w-full text-xs text-ink/70">
          © {new Date().getFullYear()} Goodlucks Homes. A Goodlucks Platforms Subsidiary. All rights reserved.
        </div>

      </div>
    </footer>
  );
};
