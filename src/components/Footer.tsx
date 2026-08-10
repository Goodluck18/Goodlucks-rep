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
            href="mailto:enquiries@goodluckshomes.com" 
            className="flex items-center gap-2 hover:text-[#08D9D6] transition-colors"
          >
            <Mail className="w-4 h-4 text-[#08D9D6]" />
            enquiries@goodluckshomes.com
          </a>
          <a 
            href="tel:+233302998800" 
            className="flex items-center gap-2 hover:text-[#08D9D6] transition-colors"
          >
            <Phone className="w-4 h-4 text-[#08D9D6]" />
            +233 30 299 8800
          </a>
        </div>

        {/* Social Media Icons */}
        <div className="flex items-center gap-4 text-slate-400 pt-2">
          <a href="#" className="p-2 rounded-lg bg-white/5 hover:text-[#08D9D6] hover:bg-white/10 transition-colors" title="Instagram">
            <Instagram className="w-5 h-5" />
          </a>
          <a href="#" className="p-2 rounded-lg bg-white/5 hover:text-[#08D9D6] hover:bg-white/10 transition-colors" title="LinkedIn">
            <Linkedin className="w-5 h-5" />
          </a>
          <a href="#" className="p-2 rounded-lg bg-white/5 hover:text-[#08D9D6] hover:bg-white/10 transition-colors" title="Twitter">
            <Twitter className="w-5 h-5" />
          </a>
          <a href="#" className="p-2 rounded-lg bg-white/5 hover:text-[#08D9D6] hover:bg-white/10 transition-colors" title="Facebook">
            <Facebook className="w-5 h-5" />
          </a>
        </div>

        {/* Copyright */}
        <div className="pt-4 border-t border-white/10 w-full text-xs text-slate-500">
          © {new Date().getFullYear()} Goodlucks Homes. A Goodlucks Platforms Subsidiary. All rights reserved.
        </div>

      </div>
    </footer>
  );
};
