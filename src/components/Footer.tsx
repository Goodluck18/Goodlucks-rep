import React from 'react';
import { useApp } from '../context/AppContext';
import { Building2, Mail, Phone, Instagram, Linkedin, Twitter, Facebook, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  const { setCurrentView } = useApp();

  return (
    <footer className="w-full bg-[#1A1E26] text-[#EAEAEA] border-t border-white/10 pt-10 pb-28 md:pb-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto flex flex-col items-center text-center space-y-6">
        
        {/* Logo & Brand */}
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#08D9D6] p-0.5 flex items-center justify-center text-[#252A34] font-bold shadow-md shadow-[#08D9D6]/20">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="flex flex-col text-left">
            <span className="font-bold text-xl tracking-tight text-white">
              Goodlucks <span className="text-[#08D9D6]">Homes</span>
            </span>
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-medium">
              Find. View. Rent.
            </span>
          </div>
        </div>

        {/* Short Company Description */}
        <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
          Goodlucks Homes is Ghana’s premier trusted intermediary rental platform. We manage all enquiries, viewings, and property matches to provide tenants and property owners with a seamless, high-security rental experience.
        </p>

        {/* Direct Contact Info */}
        <div className="flex flex-wrap justify-center items-center gap-6 text-sm font-medium text-slate-200 pt-2">
          <a 
            href="mailto:rentals@goodlucks.co" 
            className="flex items-center gap-2 hover:text-[#08D9D6] transition-colors"
          >
            <Mail className="w-4 h-4 text-[#08D9D6]" />
            rentals@goodlucks.co
          </a>
          <a 
            href="tel:+233237690080" 
            className="flex items-center gap-2 hover:text-[#08D9D6] transition-colors"
          >
            <Phone className="w-4 h-4 text-[#08D9D6]" />
            +233 23 769 0080
          </a>
        </div>

        {/* Social Media Icons & Handle */}
        <div className="flex flex-col items-center gap-2 pt-2">
          <span className="text-xs font-semibold text-[#08D9D6]">
            @GoodlucksHomes
          </span>
          <div className="flex items-center gap-3 text-slate-400">
            <a 
              href="https://instagram.com/GoodlucksHomes" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="p-2 rounded-lg bg-white/5 hover:text-[#08D9D6] hover:bg-white/10 transition-colors" 
              title="Instagram @GoodlucksHomes"
            >
              <Instagram className="w-5 h-5" />
            </a>
            <a 
              href="https://linkedin.com/company/GoodlucksHomes" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="p-2 rounded-lg bg-white/5 hover:text-[#08D9D6] hover:bg-white/10 transition-colors" 
              title="LinkedIn @GoodlucksHomes"
            >
              <Linkedin className="w-5 h-5" />
            </a>
            <a 
              href="https://x.com/GoodlucksHomes" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="p-2 rounded-lg bg-white/5 hover:text-[#08D9D6] hover:bg-white/10 transition-colors" 
              title="X / Twitter @GoodlucksHomes"
            >
              <Twitter className="w-5 h-5" />
            </a>
            <a 
              href="https://facebook.com/GoodlucksHomes" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="p-2 rounded-lg bg-white/5 hover:text-[#08D9D6] hover:bg-white/10 transition-colors" 
              title="Facebook @GoodlucksHomes"
            >
              <Facebook className="w-5 h-5" />
            </a>
          </div>
        </div>

        {/* Copyright */}
        <div className="pt-4 border-t border-white/10 w-full text-xs text-slate-500">
          © {new Date().getFullYear()} Goodlucks Homes. A Goodlucks Platforms Subsidiary. All rights reserved.
        </div>

      </div>
    </footer>
  );
};
