import React, { useState } from 'react';
import { Building2, ShieldCheck, Users, Award, HelpCircle, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { SEOHead } from './SEOHead';

interface FAQItem {
  id: string;
  question: string;
  answer: string;
  category: 'General' | 'Tenants' | 'Landlords';
}

const FAQ_DATA: FAQItem[] = [
  {
    id: 'faq-1',
    category: 'General',
    question: 'How does Goodlucks Homes work as a trusted intermediary?',
    answer: 'Unlike standard classified listing sites where buyers and renters communicate directly with unverified contacts, Goodlucks Homes acts as a licensed, trusted intermediary desk. We screen property listings, conduct physical verification, manage all viewing logistics with certified Goodlucks field agents, and facilitate secure tenancy documentation.'
  },
  {
    id: 'faq-2',
    category: 'Tenants',
    question: 'How does the AI Property Matching service work for tenants?',
    answer: 'Tenants can submit their exact location preferences, bedroom requirements, and budget parameters in GH₵ via the "Find a Home" portal. Our automated matching system cross-references active verified listings and routes your request to dedicated agents who source and verify matching properties within 24–48 hours.'
  },
  {
    id: 'faq-3',
    category: 'General',
    question: 'What is the physical viewing fee and what does it cover?',
    answer: 'A nominal viewing fee (typically GH₵ 100) covers physical transport, property access setup, and on-site guidance with a certified Goodlucks agent. This protects tenants from fake listing scams and ensures landlords receive serious, pre-screened prospective tenants.'
  },
  {
    id: 'faq-4',
    category: 'Landlords',
    question: 'How do landlords list properties on Goodlucks Homes?',
    answer: 'Property owners or authorized property managers can create a Landlord account and submit property details, high-resolution photos, location pins, and rental prices in GH₵. Our approval team reviews and physically inspects the premises before publishing the property onto our public showcase.'
  },
  {
    id: 'faq-5',
    category: 'General',
    question: 'Why are landlord and tenant contact numbers managed through Goodlucks?',
    answer: 'To eliminate middleman fraud, duplicate listing spam, and off-platform listing poaching, all initial enquiries and viewing appointments are handled through Goodlucks Homes official communications. Once a tenancy agreement is finalized, direct contact details are released for long-term landlord-tenant relations.'
  },
  {
    id: 'faq-6',
    category: 'Tenants',
    question: 'Are properties available outside Accra?',
    answer: 'Yes! While our primary coverage focuses on high-demand residential hubs in Greater Accra (Cantonments, East Legon, Airport Residential, Labone, Osu, Ridge), we also manage verified luxury units in Kumasi, Takoradi, and Tema.'
  }
];

export const AboutView: React.FC = () => {
  const [openFaqId, setOpenFaqId] = useState<string | null>('faq-1');

  const toggleFaq = (id: string) => {
    setOpenFaqId(prev => (prev === id ? null : id));
  };

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": FAQ_DATA.map(item => ({
      "@type": "Question",
      "name": item.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": item.answer
      }
    }))
  };

  return (
    <div className="min-h-screen bg-[#252A34] text-white py-12 px-4 sm:px-6 lg:px-8">
      <SEOHead
        title="About Goodlucks Homes - Verified Rentals Intermediary in Ghana"
        description="Learn how Goodlucks Homes eliminates rental fraud in Accra, Ghana through verified property listings, professional viewing coordination, and AI matching."
        keywords="About Goodlucks Homes, real estate Ghana, rental verification Accra, trusted real estate agent Ghana"
        jsonLd={faqJsonLd}
      />
      <div className="max-w-4xl mx-auto space-y-12 animate-fadeIn">
        
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/20">
            <Building2 className="w-4 h-4" />
            Under Goodlucks Platforms
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white">About Goodlucks Homes</h1>
          <p className="text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
            Redefining residential property leasing in West Africa through trusted intermediary management, verified property listings, and AI-powered tenant matching.
          </p>
        </div>

        {/* Mission Statement Box */}
        <div className="bg-gradient-to-r from-slate-800 to-[#1A1E26] p-8 rounded-3xl border border-white/10 space-y-4 shadow-xl">
          <h2 className="text-xl font-bold text-[#08D9D6]">Our Intermediary Model</h2>
          <p className="text-sm text-slate-200 leading-relaxed">
            Unlike standard peer-to-peer property marketplaces where unverified direct contacts often lead to disputes, Goodlucks Homes acts as the <strong>sole trusted intermediary</strong> between property owners and tenants.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            We manage all property enquiries, schedule physical viewings with trained field staff, verify tenant background credentials, and execute secure tenancy contracts. This guarantees peace of mind for landlords and maximum safety for tenants.
          </p>
        </div>

        {/* Core Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-slate-800/80 p-6 rounded-2xl border border-white/10 space-y-2">
            <ShieldCheck className="w-8 h-8 text-[#08D9D6]" />
            <h3 className="font-bold text-base text-white">100% Verified</h3>
            <p className="text-xs text-slate-300">Every home undergoes document verification and physical inspection before approval.</p>
          </div>

          <div className="bg-slate-800/80 p-6 rounded-2xl border border-white/10 space-y-2">
            <Users className="w-8 h-8 text-[#08D9D6]" />
            <h3 className="font-bold text-base text-white">Dedicated Agents</h3>
            <p className="text-xs text-slate-300">Professional Goodlucks staff accompany every viewing and handle all physical fee collections.</p>
          </div>

          <div className="bg-slate-800/80 p-6 rounded-2xl border border-white/10 space-y-2">
            <Award className="w-8 h-8 text-[#08D9D6]" />
            <h3 className="font-bold text-base text-white">Ghana Tech Leader</h3>
            <p className="text-xs text-slate-300">Operating across Cantonments, East Legon, Airport Residential, Osu, Ridge, and Kumasi.</p>
          </div>
        </div>

        {/* FAQ Accordion Section */}
        <div className="space-y-6 pt-4">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 text-[#08D9D6] text-xs font-bold border border-white/10">
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Frequently Asked Questions</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white">
              Intermediary Services FAQ
            </h2>
            <p className="text-xs sm:text-sm text-slate-300 max-w-lg mx-auto">
              Everything you need to know about renting, listing, and property viewings with Goodlucks Homes in Ghana.
            </p>
          </div>

          <div className="space-y-3">
            {FAQ_DATA.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div
                  key={faq.id}
                  className={`rounded-2xl transition-all duration-200 border ${
                    isOpen
                      ? 'bg-slate-800/90 border-[#08D9D6]/40 shadow-lg'
                      : 'bg-slate-800/50 border-white/10 hover:border-white/20'
                  }`}
                >
                  <button
                    onClick={() => toggleFaq(faq.id)}
                    className="w-full px-6 py-4 flex items-center justify-between text-left focus:outline-none focus:ring-2 focus:ring-[#08D9D6]/50 rounded-2xl"
                    aria-expanded={isOpen}
                  >
                    <div className="flex items-center gap-3 pr-4">
                      <span className="px-2.5 py-0.5 rounded-md text-[10px] font-extrabold bg-[#08D9D6]/10 text-[#08D9D6] border border-[#08D9D6]/20 uppercase shrink-0">
                        {faq.category}
                      </span>
                      <span className="text-sm sm:text-base font-bold text-white leading-snug">
                        {faq.question}
                      </span>
                    </div>
                    <div className={`p-1.5 rounded-xl transition-colors shrink-0 ${isOpen ? 'bg-[#08D9D6] text-[#252A34]' : 'bg-white/10 text-slate-300'}`}>
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-6 pb-5 pt-1 text-xs sm:text-sm text-slate-300 leading-relaxed border-t border-white/5 mt-1 animate-fadeIn">
                      <p className="pt-2">{faq.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Need More Assistance Banner */}
          <div className="bg-slate-900/90 p-6 rounded-2xl border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-white flex items-center gap-1.5 justify-center sm:justify-start">
                <Sparkles className="w-4 h-4 text-[#08D9D6]" />
                Still have questions?
              </h4>
              <p className="text-xs text-slate-400">
                Our Accra desk is available Monday through Saturday to assist with tailored property matches and enquiries.
              </p>
            </div>
            <a
              href="tel:+233302998800"
              className="px-5 py-2.5 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs hover:bg-[#08D9D6]/90 transition-all shrink-0"
            >
              Contact Support
            </a>
          </div>
        </div>

      </div>
    </div>
  );
};

