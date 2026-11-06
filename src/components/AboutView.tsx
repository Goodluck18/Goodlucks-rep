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
    question: 'What does Goodlucks Homes do?',
    answer: 'Goodlucks Homes is a property discovery and rental intermediary. Landlords and agents submit listings, our team reviews each one before it is published, and tenants use the platform to find homes, request viewings and keep track of the arrangements. We do not draft, sign or store tenancy agreements - tenants and landlords complete their agreement directly with each other - and we do not provide legal or licensed professional services.'
  },
  {
    id: 'faq-2',
    category: 'Tenants',
    question: 'How does property matching work for tenants?',
    answer: 'Submit your preferred areas, number of bedrooms and budget in GH₵ through the "Find a Home" page. We score the live listings against your request and show the closest matches on your dashboard with the reason each one was suggested. A match is a suggestion, not a reservation: the property still has to be available and you still agree the viewing with the landlord or agent.'
  },
  {
    id: 'faq-3',
    category: 'General',
    question: 'What is the physical viewing fee and what does it cover?',
    answer: 'The viewing fee that applies is always shown on the listing before you request a viewing, and it is never paid online. For a listing submitted by an agent, the agent sets that property\'s fee and viewing terms and it is paid on site after the viewing. For a listing submitted by a landlord, Goodlucks Homes sets one general landlord viewing fee, the tenant pays it to Goodlucks Homes after the viewing, and the landlord does not receive it.'
  },
  {
    id: 'faq-4',
    category: 'Landlords',
    question: 'How do landlords list properties on Goodlucks Homes?',
    answer: 'Property owners, or agents acting with the owner\'s agreement, can create an account and submit the property\'s details, photos, location and rent in GH₵. A member of our team reviews the listing before it is published. That review covers the listing itself - it is not a physical inspection of the property, and it is not proof of ownership or of the rent.'
  },
  {
    id: 'faq-5',
    category: 'General',
    question: 'Why are enquiries and viewings arranged through Goodlucks Homes?',
    answer: 'Listings do not publish the landlord\'s or agent\'s phone number. Enquiries and viewing requests are sent through the platform, which keeps a record of what was asked and when, and the landlord or agent then contacts you to agree a time. If something goes wrong with an arrangement you can reach our team, and we can see the same record you can.'
  },
  {
    id: 'faq-6',
    category: 'Tenants',
    question: 'Are properties available outside Accra?',
    answer: 'Most listings are in Greater Accra, where demand is highest: Cantonments, East Legon, Airport Residential, Labone, Osu and Ridge. The catalogue can also include properties in other regions, such as Kumasi. Search by area to see what is currently listed.'
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
        title="About Goodlucks Homes - Rental Intermediary in Ghana"
        description="How Goodlucks Homes works in Accra, Ghana: listings from registered landlords and agents, reviewed before publishing, with viewings arranged through the platform."
        keywords="About Goodlucks Homes, rentals Ghana, property intermediary Accra, viewing arrangements Ghana"
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
            A rental platform that connects people looking for a home with the landlords and agents who list them, with every listing reviewed before it is published.
          </p>
        </div>

        {/* Mission Statement Box */}
        <div className="bg-gradient-to-r from-slate-800 to-[#1A1E26] p-8 rounded-3xl border border-white/10 space-y-4 shadow-xl">
          <h2 className="text-xl font-bold text-[#08D9D6]">Our Intermediary Model</h2>
          <p className="text-sm text-slate-200 leading-relaxed">
            Goodlucks Homes is the <strong>intermediary</strong> between the people who list properties and the people looking for them. Landlords and agents submit the listings; we review them, publish them, and take the enquiries and viewing requests that follow.
          </p>
          <p className="text-sm text-slate-300 leading-relaxed">
            We pass each enquiry and viewing request to the landlord or agent responsible for the property, and both sides keep the same record of what was asked and agreed. Goodlucks Homes is not a law firm and does not manage the properties: tenants and landlords meet and complete their tenancy agreement between themselves, outside the platform.
          </p>
        </div>

        {/* Core Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div className="bg-slate-800/80 p-6 rounded-2xl border border-white/10 space-y-2">
            <ShieldCheck className="w-8 h-8 text-[#08D9D6]" />
            <h3 className="font-bold text-base text-white">Listings reviewed</h3>
            <p className="text-xs text-slate-300">Every listing is reviewed by our team before it goes live. That review covers the listing details and photos. It is not an ownership check and not a physical inspection of the property.</p>
          </div>

          <div className="bg-slate-800/80 p-6 rounded-2xl border border-white/10 space-y-2">
            <Users className="w-8 h-8 text-[#08D9D6]" />
            <h3 className="font-bold text-base text-white">Viewings arranged</h3>
            <p className="text-xs text-slate-300">You request a viewing here and agree the time with the landlord or agent. Your request, the agreed time and any fee are recorded on the platform.</p>
          </div>

          <div className="bg-slate-800/80 p-6 rounded-2xl border border-white/10 space-y-2">
            <Award className="w-8 h-8 text-[#08D9D6]" />
            <h3 className="font-bold text-base text-white">Where we operate</h3>
            <p className="text-xs text-slate-300">Our team is based in Accra and most listings are in Greater Accra - Cantonments, East Legon, Airport Residential, Osu, Ridge - with some in other regions such as Kumasi.</p>
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
              href="tel:+233237690080"
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

