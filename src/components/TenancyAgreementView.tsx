import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../context/AppContext';
import { SEOHead } from './SEOHead';
import { api } from '../services/apiService';
import { TenancyAgreement, RentReceipt } from '../types';
import { 
  FileText, 
  Receipt, 
  CheckCircle2, 
  Printer, 
  Download, 
  Share2, 
  ShieldCheck, 
  Building2, 
  User, 
  Phone, 
  Calendar, 
  CreditCard, 
  Sparkles, 
  Search, 
  FileCheck, 
  Edit3, 
  Lock, 
  Mail, 
  Plus, 
  Award,
  ChevronRight,
  Stamp,
  Copy,
  ExternalLink
} from 'lucide-react';

// Helper function to convert numbers to words (GHS)
function numberToWordsGhs(amount: number): string {
  if (isNaN(amount) || amount <= 0) return 'Zero Ghana Cedis';
  
  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  
  function convertGroup(num: number): string {
    let groupStr = '';
    if (num >= 100) {
      groupStr += units[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num >= 20) {
      groupStr += tens[Math.floor(num / 10)] + ' ';
      num %= 10;
    }
    if (num > 0) {
      groupStr += units[num] + ' ';
    }
    return groupStr;
  }

  const integerPart = Math.floor(amount);
  let words = '';

  if (integerPart >= 1000000) {
    words += convertGroup(Math.floor(integerPart / 1000000)) + 'Million ';
  }
  const thousands = Math.floor((integerPart % 1000000) / 1000);
  if (thousands > 0) {
    words += convertGroup(thousands) + 'Thousand ';
  }
  const remainder = integerPart % 1000;
  if (remainder > 0) {
    words += convertGroup(remainder);
  }

  return words.trim() + ' Ghana Cedis Only';
}

export const TenancyAgreementView: React.FC = () => {
  const { 
    currentUser, 
    properties, 
    agreements, 
    receipts, 
    createAgreement, 
    signAgreement, 
    createReceipt,
    showSuccessToast,
    showErrorToast,
    showInfoToast
  } = useApp();

  const [activeTab, setActiveTab] = useState<'agreement' | 'receipt' | 'vault'>('agreement');

  // --- AGREEMENT FORM STATE ---
  const [selectedPropId, setSelectedPropId] = useState<string>(properties[0]?.id || '');
  const [propTitle, setPropTitle] = useState(properties[0]?.title || 'The Pearl Executive 3-Bedroom Apartment');
  const [propAddress, setPropAddress] = useState(properties[0]?.location || 'Cantonments, Accra');
  const [propCity, setPropCity] = useState(properties[0]?.city || 'Accra');
  
  const [landlordName, setLandlordName] = useState('Abena Osei');
  const [landlordPhone, setLandlordPhone] = useState('+233 20 899 7711');
  const [landlordGhanaCard, setLandlordGhanaCard] = useState('GHA-720199281-9');

  const [tenantName, setTenantName] = useState(currentUser?.name || 'Kofi Mensah');
  const [tenantPhone, setTenantPhone] = useState(currentUser?.phone || '+233 24 412 3456');
  const [tenantGhanaCard, setTenantGhanaCard] = useState('GHA-908123412-3');

  const [monthlyRentGhs, setMonthlyRentGhs] = useState<number>(properties[0]?.rentGhs || 6500);
  const [durationMonths, setDurationMonths] = useState<number>(12);
  const [securityDepositGhs, setSecurityDepositGhs] = useState<number>(properties[0]?.rentGhs || 6500);
  const [startDate, setStartDate] = useState('2026-09-01');
  const [noticePeriodMonths, setNoticePeriodMonths] = useState<number>(3);
  const [utilitiesResponsibility, setUtilitiesResponsibility] = useState(
    'Tenant covers ECG prepaid electricity and water usage. Landlord covers service charge and compound maintenance.'
  );
  const [witnessName, setWitnessName] = useState('Ebenezer Mensah (Goodlucks Homes Intermediary)');

  const totalRentGhs = monthlyRentGhs * durationMonths;

  // Compute end date based on start date & duration
  const calculateEndDate = (startStr: string, months: number) => {
    try {
      const d = new Date(startStr);
      d.setMonth(d.getMonth() + months);
      d.setDate(d.getDate() - 1);
      return d.toISOString().split('T')[0];
    } catch (e) {
      return '2027-08-31';
    }
  };

  const endDate = calculateEndDate(startDate, durationMonths);

  // When a user selects a property from dropdown
  const handlePropertySelect = (pId: string) => {
    setSelectedPropId(pId);
    const p = properties.find(item => item.id === pId);
    if (p) {
      setPropTitle(p.title);
      setPropAddress(p.location);
      setPropCity(p.city);
      setMonthlyRentGhs(p.rentGhs);
      setSecurityDepositGhs(p.rentGhs);
    }
  };

  // Saved Active Agreement for preview/actions
  const [previewAgreement, setPreviewAgreement] = useState<TenancyAgreement | null>(agreements[0] || null);

  // List responses withhold identity numbers from staff. When a staff member
  // opens such a document, fetch the single-agreement detail so the printed
  // contract is complete (the server records that read in the audit trail).
  const hydratedAgreementIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const target = previewAgreement || agreements[0];
    if (!target || !target.idsMasked || hydratedAgreementIds.current.has(target.id)) return;
    hydratedAgreementIds.current.add(target.id);

    let cancelled = false;
    api.getAgreement(target.id)
      .then(({ agreement }) => {
        if (!cancelled && agreement) setPreviewAgreement(agreement);
      })
      .catch(() => {
        // Detail read is best-effort: the masked document stays on screen.
      });

    return () => {
      cancelled = true;
    };
  }, [previewAgreement, agreements]);

  // --- RECEIPT FORM STATE ---
  const [recTenantName, setRecTenantName] = useState(currentUser?.name || 'Kofi Mensah');
  const [recTenantPhone, setRecTenantPhone] = useState(currentUser?.phone || '+233 24 412 3456');
  const [recLandlordName, setRecLandlordName] = useState('Abena Osei');
  const [recPropertyTitle, setRecPropertyTitle] = useState(properties[0]?.title || 'The Pearl Executive 3-Bedroom Apartment');
  const [recPropertyAddress, setRecPropertyAddress] = useState(properties[0]?.location || 'Cantonments, Accra');
  const [recAmountGhs, setRecAmountGhs] = useState<number>(78000);
  const [recPaymentPurpose, setRecPaymentPurpose] = useState('1 Year Rent Advance (Sept 2026 - Aug 2027)');
  const [recPaymentMethod, setRecPaymentMethod] = useState<'MTN MoMo' | 'Telecel Cash' | 'Bank Transfer' | 'Card' | 'Cash'>('Bank Transfer');
  const [recTransactionRef, setRecTransactionRef] = useState('GCB-TRX-20260801-9988');
  const [recPaymentDate, setRecPaymentDate] = useState('2026-08-10');
  const [recIssuedBy, setRecIssuedBy] = useState('Goodlucks Homes Intermediary');

  // Preview receipt
  const [previewReceipt, setPreviewReceipt] = useState<RentReceipt | null>(receipts[0] || null);

  // Search vault
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');

  const [isSavingAgreement, setIsSavingAgreement] = useState(false);
  const [isSavingReceipt, setIsSavingReceipt] = useState(false);

  // Handle Save Agreement
  const handleGenerateAgreement = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAgreement(true);
    try {
      const created = await createAgreement({
        propertyId: selectedPropId,
        propertyTitle: propTitle,
        propertyAddress: propAddress,
        city: propCity,
        landlordName,
        landlordPhone,
        landlordGhanaCard,
        tenantName,
        tenantPhone,
        tenantGhanaCard,
        monthlyRentGhs,
        durationMonths,
        securityDepositGhs,
        startDate,
        endDate,
        noticePeriodMonths,
        utilitiesResponsibility,
        witnessName,
      });

      // Record the signature of the party who generated the document.
      let saved = created;
      if (currentUser?.role === 'landlord' || currentUser?.role === 'tenant') {
        await signAgreement(created.id, currentUser.role);
        saved = { ...created, [`${currentUser.role}Signed`]: true } as typeof created;
      }

      setPreviewAgreement(saved);
      showSuccessToast('Tenancy Agreement Generated!', 'Available now for printing, download, and e-signing.');
    } catch (err) {
      showErrorToast('Could not save the agreement', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsSavingAgreement(false);
    }
  };

  // Handle Save Receipt
  const handleGenerateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingReceipt(true);
    const words = numberToWordsGhs(recAmountGhs);
    try {
      const newRec = await createReceipt({
        propertyTitle: recPropertyTitle,
        propertyAddress: recPropertyAddress,
        tenantName: recTenantName,
        tenantPhone: recTenantPhone,
        landlordName: recLandlordName,
        amountGhs: recAmountGhs,
        amountInWords: words,
        paymentPurpose: recPaymentPurpose,
        paymentMethod: recPaymentMethod,
        transactionRef: recTransactionRef,
        paymentDate: recPaymentDate,
        issuedBy: recIssuedBy,
      });
      setPreviewReceipt(newRec);
      showSuccessToast('Official Receipt Generated!', 'Formatted for printing and digital download.');
    } catch (err) {
      showErrorToast('Could not issue the receipt', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsSavingReceipt(false);
    }
  };

  // Print Document Function
  const handlePrintDocument = () => {
    window.print();
  };

  // Email Document Function
  const handleEmailAgreement = async (agreement: TenancyAgreement) => {
    try {
      await api.emailAgreement(agreement.id);
      showSuccessToast('Email Dispatched', `A copy was sent for ${agreement.propertyTitle} (Ref: ${agreement.verificationCode}).`);
    } catch (err) {
      showErrorToast('Could not send the email', err instanceof Error ? err.message : 'Please try again.');
    }
  };

  const handleCopyLink = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(`https://rent.goodlucks.co/?doc=${code}`);
      showSuccessToast('Verification Link Copied', `https://rent.goodlucks.co/?doc=${code}`);
    } else {
      showInfoToast('Verification Code', code);
    }
  };

  const currentAgreementForPreview = previewAgreement || agreements[0];
  const currentReceiptForPreview = previewReceipt || receipts[0];

  const filteredAgreements = agreements.filter(a => 
    a.propertyTitle.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    a.tenantName.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    a.landlordName.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    a.verificationCode.toLowerCase().includes(vaultSearchQuery.toLowerCase())
  );

  const filteredReceipts = receipts.filter(r => 
    r.propertyTitle.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    r.tenantName.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    r.receiptNo.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    r.transactionRef.toLowerCase().includes(vaultSearchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#252A34] text-white py-10 px-4 sm:px-6 lg:px-8">
      <SEOHead
        title="Digital Tenancy Agreement & Rent Receipt Generator - Goodlucks Homes Accra"
        description="Generate, e-sign, and download official Ghanaian residential tenancy agreements and rent advance payment receipts compliant with Ghana Rent Act 1963."
      />

      {/* Embedded Print CSS for pristine document printing */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
            background: #ffffff !important;
            color: #000000 !important;
          }
          #printable-document, #printable-document * {
            visibility: visible;
          }
          #printable-document {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            padding: 20px;
            background: #ffffff !important;
            color: #111827 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="max-w-7xl mx-auto space-y-8 animate-fadeIn">
        
        {/* Header Title */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-6 no-print">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#08D9D6]/10 text-[#08D9D6] text-xs font-bold border border-[#08D9D6]/20 mb-2">
              <ShieldCheck className="w-4 h-4 text-[#08D9D6]" />
              Ghana Rent Act 1963 (Act 220) Compliant
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
              <FileCheck className="w-8 h-8 text-[#08D9D6]" />
              Tenancy Agreements & Receipts Vault
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">
              Draft, e-sign, issue, and print verified digital tenancy agreements & official Ghana rent receipts with tamper-proof Goodlucks verification seals.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintDocument}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs flex items-center gap-2 transition-all"
            >
              <Printer className="w-4 h-4 text-[#08D9D6]" />
              Print / Export PDF
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-white/10 pb-3 overflow-x-auto no-print">
          <button
            onClick={() => setActiveTab('agreement')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'agreement'
                ? 'bg-[#08D9D6] text-[#252A34] shadow-lg shadow-[#08D9D6]/20 font-extrabold'
                : 'bg-white/5 text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <FileText className="w-4 h-4" />
            Tenancy Agreement Generator
          </button>

          <button
            onClick={() => setActiveTab('receipt')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'receipt'
                ? 'bg-[#08D9D6] text-[#252A34] shadow-lg shadow-[#08D9D6]/20 font-extrabold'
                : 'bg-white/5 text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Rent Receipt Generator
          </button>

          <button
            onClick={() => setActiveTab('vault')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'vault'
                ? 'bg-[#08D9D6] text-[#252A34] shadow-lg shadow-[#08D9D6]/20 font-extrabold'
                : 'bg-white/5 text-slate-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Award className="w-4 h-4" />
            Saved Documents Vault ({agreements.length + receipts.length})
          </button>
        </div>

        {/* TAB 1: TENANCY AGREEMENT GENERATOR */}
        {activeTab === 'agreement' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Agreement Form Controls */}
            <div className="lg:col-span-5 bg-[#1F242D] p-6 rounded-2xl border border-white/10 space-y-6 no-print shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Edit3 className="w-5 h-5 text-[#08D9D6]" />
                  Agreement Parameters
                </h2>
                <span className="text-[10px] uppercase tracking-wider text-[#08D9D6] font-bold px-2 py-0.5 rounded bg-[#08D9D6]/10">
                  Step 1 of 2
                </span>
              </div>

              <form onSubmit={handleGenerateAgreement} className="space-y-4">
                {/* Select Property Preset */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Select Property Preset
                  </label>
                  <select
                    value={selectedPropId}
                    onChange={(e) => handlePropertySelect(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs font-medium focus:border-[#08D9D6] focus:outline-none"
                  >
                    {properties.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.location}) - GH₵ {p.rentGhs.toLocaleString()}/mo
                      </option>
                    ))}
                  </select>
                </div>

                {/* Property Details */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Property Title
                    </label>
                    <input
                      type="text"
                      value={propTitle}
                      onChange={(e) => setPropTitle(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      City / Suburb
                    </label>
                    <input
                      type="text"
                      value={propCity}
                      onChange={(e) => setPropCity(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                    />
                  </div>
                </div>

                {/* Landlord Info */}
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <span className="text-xs font-bold text-[#08D9D6] uppercase tracking-wider block">
                    Landlord / Property Owner
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-0.5">Full Name</label>
                      <input
                        type="text"
                        value={landlordName}
                        onChange={(e) => setLandlordName(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#252A34] border border-white/10 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-0.5">Phone Number</label>
                      <input
                        type="text"
                        value={landlordPhone}
                        onChange={(e) => setLandlordPhone(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#252A34] border border-white/10 text-white text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Ghana Card ID Number</label>
                    <input
                      type="text"
                      value={landlordGhanaCard}
                      onChange={(e) => setLandlordGhanaCard(e.target.value)}
                      placeholder="GHA-000000000-0"
                      required
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#252A34] border border-white/10 text-white text-xs"
                    />
                  </div>
                </div>

                {/* Tenant Info */}
                <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <span className="text-xs font-bold text-[#08D9D6] uppercase tracking-wider block">
                    Tenant Information
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-0.5">Full Name</label>
                      <input
                        type="text"
                        value={tenantName}
                        onChange={(e) => setTenantName(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#252A34] border border-white/10 text-white text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-0.5">Phone Number</label>
                      <input
                        type="text"
                        value={tenantPhone}
                        onChange={(e) => setTenantPhone(e.target.value)}
                        required
                        className="w-full px-2.5 py-1.5 rounded-lg bg-[#252A34] border border-white/10 text-white text-xs"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-0.5">Ghana Card ID Number</label>
                    <input
                      type="text"
                      value={tenantGhanaCard}
                      onChange={(e) => setTenantGhanaCard(e.target.value)}
                      placeholder="GHA-000000000-0"
                      required
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#252A34] border border-white/10 text-white text-xs"
                    />
                  </div>
                </div>

                {/* Financials & Duration */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Monthly Rent (GH₵)
                    </label>
                    <input
                      type="number"
                      value={monthlyRentGhs}
                      onChange={(e) => setMonthlyRentGhs(Number(e.target.value))}
                      required
                      min={100}
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Duration (Months)
                    </label>
                    <select
                      value={durationMonths}
                      onChange={(e) => setDurationMonths(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                    >
                      <option value={6}>6 Months Advance</option>
                      <option value={12}>12 Months (1 Year)</option>
                      <option value={24}>24 Months (2 Years)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Security Deposit (GH₵)
                    </label>
                    <input
                      type="number"
                      value={securityDepositGhs}
                      onChange={(e) => setSecurityDepositGhs(Number(e.target.value))}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Tenancy Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs text-slate-200"
                    />
                  </div>
                </div>

                {/* Calculated Advance Highlight */}
                <div className="p-3 rounded-xl bg-[#08D9D6]/10 border border-[#08D9D6]/30 flex items-center justify-between">
                  <span className="text-xs text-slate-300 font-medium">Total Rent Advance Payable:</span>
                  <span className="text-sm font-extrabold text-[#08D9D6]">
                    GH₵ {totalRentGhs.toLocaleString()}
                  </span>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs hover:bg-[#08D9D6]/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#08D9D6]/20"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate / Update Legal Agreement
                </button>
              </form>
            </div>

            {/* Live Interactive Agreement Preview (Print Target) */}
            <div className="lg:col-span-7 space-y-4">
              
              <div className="flex items-center justify-between no-print px-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[#08D9D6]" />
                  Official Document Preview
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleCopyLink(currentAgreementForPreview.verificationCode)}
                    className="text-xs text-[#08D9D6] hover:underline flex items-center gap-1 font-semibold"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Copy Verification Code
                  </button>
                </div>
              </div>

              {/* Printable Legal Agreement Document */}
              <div 
                id="printable-document" 
                className="bg-white text-slate-900 p-8 sm:p-12 rounded-2xl shadow-2xl border border-slate-200 space-y-6 relative overflow-hidden font-serif"
              >
                {/* Official Stamp / Watermark Badge */}
                <div className="absolute top-6 right-6 opacity-15 pointer-events-none text-right">
                  <div className="border-4 border-emerald-700 p-3 rounded-full inline-block rotate-[-12deg]">
                    <div className="text-center font-sans font-black tracking-widest text-emerald-800 text-xs">
                      GOODLUCKS HOMES<br/>
                      VERIFIED TENANCY<br/>
                      {currentAgreementForPreview.verificationCode}
                    </div>
                  </div>
                </div>

                {/* Header Document Brand */}
                <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-black font-sans uppercase tracking-tight text-slate-900">
                      RESIDENTIAL TENANCY AGREEMENT
                    </h2>
                    <p className="text-xs font-sans text-slate-600 mt-0.5">
                      Executed under the Rent Act 1963 (Act 220) & Rent Regulations of Republic of Ghana
                    </p>
                  </div>
                  <div className="text-right font-sans">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Ref Code</span>
                    <span className="text-xs font-extrabold font-mono text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {currentAgreementForPreview.verificationCode}
                    </span>
                  </div>
                </div>

                {/* Document Preamble */}
                <div className="text-xs leading-relaxed text-slate-800 space-y-3 font-sans">
                  <p>
                    THIS RESIDENTIAL TENANCY AGREEMENT is made this <strong>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>, by and between:
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div>
                      <span className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                        1. THE LANDLORD (LESSOR)
                      </span>
                      <div className="font-bold text-slate-900">{currentAgreementForPreview.landlordName}</div>
                      <div className="text-slate-600 text-[11px]">Ghana Card: {currentAgreementForPreview.landlordGhanaCard}</div>
                      <div className="text-slate-600 text-[11px]">Tel: {currentAgreementForPreview.landlordPhone}</div>
                    </div>
                    <div>
                      <span className="text-[11px] font-extrabold uppercase text-slate-500 block mb-1">
                        2. THE TENANT (LESSEE)
                      </span>
                      <div className="font-bold text-slate-900">{currentAgreementForPreview.tenantName}</div>
                      <div className="text-slate-600 text-[11px]">Ghana Card: {currentAgreementForPreview.tenantGhanaCard}</div>
                      <div className="text-slate-600 text-[11px]">Tel: {currentAgreementForPreview.tenantPhone}</div>
                    </div>
                  </div>
                </div>

                {/* Demised Premises & Financial Summary */}
                <div className="space-y-3 font-sans">
                  <h3 className="text-xs font-black uppercase text-slate-900 border-b border-slate-300 pb-1">
                    CLAUSE 1: PREMISES & FINANCIAL CONSIDERATION
                  </h3>
                  <div className="text-xs text-slate-800 space-y-2">
                    <p>
                      <strong>1.1 Demised Premises:</strong> The Landlord agrees to demise and let unto the Tenant the premises described as <strong>"{currentAgreementForPreview.propertyTitle}"</strong>, located at {currentAgreementForPreview.propertyAddress}, {currentAgreementForPreview.city}, Republic of Ghana.
                    </p>
                    <p>
                      <strong>1.2 Tenancy Term:</strong> The tenancy shall be for a fixed term of <strong>{currentAgreementForPreview.durationMonths} Months</strong> commencing on <strong>{currentAgreementForPreview.startDate}</strong> and ending on <strong>{currentAgreementForPreview.endDate}</strong>.
                    </p>
                    <p>
                      <strong>1.3 Rent Amount & Payment:</strong> The agreed monthly rent is <strong>GH₵ {currentAgreementForPreview.monthlyRentGhs.toLocaleString()}</strong>. The total advance rent payable for the duration is <strong>GH₵ {currentAgreementForPreview.totalRentGhs.toLocaleString()}</strong> ({numberToWordsGhs(currentAgreementForPreview.totalRentGhs)}), payable in full prior to key handover.
                    </p>
                    <p>
                      <strong>1.4 Refundable Caution Deposit:</strong> The Tenant pays a security deposit of <strong>GH₵ {currentAgreementForPreview.securityDepositGhs.toLocaleString()}</strong> to cover accidental damage or outstanding utility arrears, refundable upon vacant possession.
                    </p>
                  </div>
                </div>

                {/* Obligations & Rules */}
                <div className="space-y-3 font-sans">
                  <h3 className="text-xs font-black uppercase text-slate-900 border-b border-slate-300 pb-1">
                    CLAUSE 2: TENANT & LANDLORD COVENANTS
                  </h3>
                  <div className="text-[11px] text-slate-700 space-y-1.5 leading-normal">
                    <p>• <strong>Utilities:</strong> {currentAgreementForPreview.utilitiesResponsibility}</p>
                    <p>• <strong>Maintenance:</strong> Tenant shall keep the interior in good condition. Landlord shall repair structural defects.</p>
                    <p>• <strong>Subletting:</strong> Unapproved subletting, assignment, or commercial conversion is strictly prohibited.</p>
                    <p>• <strong>Quiet Enjoyment:</strong> Upon full payment of rent advance, the Tenant shall peacefully possess the premises without unlawful disturbance.</p>
                    <p>• <strong>Termination Notice:</strong> Either party may provide <strong>{currentAgreementForPreview.noticePeriodMonths} Months</strong> written notice prior to expiration.</p>
                  </div>
                </div>

                {/* Intermediary Verification Seal */}
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl flex items-center justify-between font-sans text-xs">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                    <div>
                      <div className="font-extrabold text-emerald-950">Verified Intermediary Goodlucks Homes</div>
                      <div className="text-[10px] text-emerald-700">Digital Smart Escrow & Legal Verification Ledger</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-emerald-800 bg-white px-2 py-1 rounded border border-emerald-300">
                    STATUS: {currentAgreementForPreview.status.toUpperCase()}
                  </span>
                </div>

                {/* Signatures Block */}
                <div className="pt-6 border-t-2 border-slate-900 font-sans space-y-6">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    IN WITNESS WHEREOF THE PARTIES HAVE HEREUNTO SET THEIR HANDS AND SIGNATURES:
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    {/* Landlord Signature */}
                    <div className="space-y-2">
                      <div className="text-xs font-extrabold text-slate-900">
                        LANDLORD SIGNATURE
                      </div>
                      <div className="h-16 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center p-2 text-center">
                        {currentAgreementForPreview.landlordSigned ? (
                          <div className="text-emerald-800 font-bold text-xs flex items-center gap-1 font-mono">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            [E-SIGNED BY {currentAgreementForPreview.landlordName.toUpperCase()}]
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">Awaiting Landlord Signature</span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 flex justify-between">
                        <span>Date: {currentAgreementForPreview.landlordSignatureDate ? new Date(currentAgreementForPreview.landlordSignatureDate).toLocaleDateString() : 'Pending'}</span>
                        <span>Card: {currentAgreementForPreview.landlordGhanaCard}</span>
                      </div>
                    </div>

                    {/* Tenant Signature */}
                    <div className="space-y-2">
                      <div className="text-xs font-extrabold text-slate-900">
                        TENANT SIGNATURE
                      </div>
                      <div className="h-16 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 flex flex-col items-center justify-center p-2 text-center">
                        {currentAgreementForPreview.tenantSigned ? (
                          <div className="text-emerald-800 font-bold text-xs flex items-center gap-1 font-mono">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            [E-SIGNED BY {currentAgreementForPreview.tenantName.toUpperCase()}]
                          </div>
                        ) : (
                          <button
                            onClick={() => signAgreement(currentAgreementForPreview.id, 'tenant')}
                            className="no-print px-3 py-1.5 rounded-lg bg-[#08D9D6] text-[#252A34] text-xs font-extrabold hover:bg-[#08D9D6]/90 transition-all flex items-center gap-1 shadow"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            Click to E-Sign as Tenant
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 flex justify-between">
                        <span>Date: {currentAgreementForPreview.tenantSignatureDate ? new Date(currentAgreementForPreview.tenantSignatureDate).toLocaleDateString() : 'Pending'}</span>
                        <span>Card: {currentAgreementForPreview.tenantGhanaCard}</span>
                      </div>
                    </div>
                  </div>

                  {/* Witness Footer */}
                  <div className="pt-2 text-center text-[10px] text-slate-500 border-t border-slate-200">
                    Witnessed by: <strong>{currentAgreementForPreview.witnessName || 'Goodlucks Homes Officer'}</strong> | Official Goodlucks Copy Serial #{currentAgreementForPreview.verificationCode}
                  </div>
                </div>
              </div>

              {/* Action Toolbar for Agreement */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#1F242D] p-4 rounded-xl border border-white/10 no-print">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrintDocument}
                    className="px-4 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs flex items-center gap-1.5 hover:bg-[#08D9D6]/90 transition-all shadow"
                  >
                    <Printer className="w-4 h-4" />
                    Print Agreement PDF
                  </button>
                  <button
                    onClick={() => handleEmailAgreement(currentAgreementForPreview)}
                    className="px-4 py-2 rounded-xl bg-white/10 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-white/20 transition-all"
                  >
                    <Mail className="w-4 h-4 text-[#08D9D6]" />
                    Email to Parties
                  </button>
                </div>

                <div className="text-xs text-slate-400 flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-[#08D9D6]" />
                  SSL Encrypted & Ghana Cyber Security Auth
                </div>
              </div>

            </div>

          </div>
        )}

        {/* TAB 2: RENT RECEIPT GENERATOR */}
        {activeTab === 'receipt' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Receipt Form Controls */}
            <div className="lg:col-span-5 bg-[#1F242D] p-6 rounded-2xl border border-white/10 space-y-5 no-print shadow-xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Receipt className="w-5 h-5 text-[#08D9D6]" />
                  Issue Rent Receipt
                </h2>
                <span className="text-[10px] uppercase tracking-wider text-[#08D9D6] font-bold px-2 py-0.5 rounded bg-[#08D9D6]/10">
                  Official Record
                </span>
              </div>

              <form onSubmit={handleGenerateReceipt} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Property Title & Location
                  </label>
                  <input
                    type="text"
                    value={recPropertyTitle}
                    onChange={(e) => setRecPropertyTitle(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Tenant (Received From)
                    </label>
                    <input
                      type="text"
                      value={recTenantName}
                      onChange={(e) => setRecTenantName(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Landlord / Recipient
                    </label>
                    <input
                      type="text"
                      value={recLandlordName}
                      onChange={(e) => setRecLandlordName(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Amount Paid (GH₵)
                    </label>
                    <input
                      type="number"
                      value={recAmountGhs}
                      onChange={(e) => setRecAmountGhs(Number(e.target.value))}
                      required
                      min={10}
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={recPaymentMethod}
                      onChange={(e) => setRecPaymentMethod(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                    >
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="MTN MoMo">MTN Mobile Money</option>
                      <option value="Telecel Cash">Telecel Cash</option>
                      <option value="Card">Visa / Mastercard</option>
                      <option value="Cash">Cash (Physical Staff Handover)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Payment Purpose / Description
                  </label>
                  <input
                    type="text"
                    value={recPaymentPurpose}
                    onChange={(e) => setRecPaymentPurpose(e.target.value)}
                    required
                    placeholder="e.g. 1 Year Rent Advance Sept 2026 - Aug 2027"
                    className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Transaction Reference
                    </label>
                    <input
                      type="text"
                      value={recTransactionRef}
                      onChange={(e) => setRecTransactionRef(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Payment Date
                    </label>
                    <input
                      type="date"
                      value={recPaymentDate}
                      onChange={(e) => setRecPaymentDate(e.target.value)}
                      required
                      className="w-full px-3 py-2 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs text-slate-200"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs hover:bg-[#08D9D6]/90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-[#08D9D6]/20"
                >
                  <Receipt className="w-4 h-4" />
                  Generate Official Rent Receipt
                </button>
              </form>
            </div>

            {/* Printable Receipt Preview Card */}
            <div className="lg:col-span-7 space-y-4">
              
              <div className="flex items-center justify-between no-print px-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[#08D9D6]" />
                  Official Rent Payment Receipt
                </span>
                <button
                  onClick={handlePrintDocument}
                  className="text-xs text-[#08D9D6] hover:underline flex items-center gap-1 font-semibold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt PDF
                </button>
              </div>

              {/* Printable Receipt Container */}
              <div 
                id="printable-document" 
                className="bg-white text-slate-900 p-8 rounded-2xl shadow-2xl border-4 border-[#08D9D6]/40 space-y-6 relative overflow-hidden font-sans"
              >
                {/* Paid Verification Stamp */}
                <div className="absolute top-6 right-6 opacity-20 pointer-events-none text-right">
                  <div className="border-4 border-emerald-600 px-4 py-2 rounded-2xl rotate-[-8deg] text-center">
                    <span className="text-2xl font-black text-emerald-800 tracking-widest block">PAID</span>
                    <span className="text-[10px] font-bold text-emerald-800 tracking-tight">GOODLUCKS VERIFIED</span>
                  </div>
                </div>

                {/* Receipt Header */}
                <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 rounded-lg bg-[#08D9D6] flex items-center justify-center text-[#252A34] font-black">
                        GH
                      </div>
                      <span className="font-extrabold text-lg tracking-tight text-slate-900">
                        Goodlucks <span className="text-teal-600">Homes</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Intermediary Real Estate & Rental Property Management Ltd.<br/>
                      Ridge, Accra, Ghana | +233 23 769 0080 | rent.goodlucks.co
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">RECEIPT NO</span>
                    <span className="text-sm font-black font-mono text-teal-700 bg-teal-50 px-2.5 py-1 rounded border border-teal-200 block mb-1">
                      {currentReceiptForPreview.receiptNo}
                    </span>
                    <span className="text-[11px] text-slate-500 font-medium">
                      Date: {currentReceiptForPreview.paymentDate}
                    </span>
                  </div>
                </div>

                {/* Receipt Main Details Grid */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block">RECEIVED FROM (TENANT)</span>
                      <span className="font-bold text-slate-900 block text-sm">{currentReceiptForPreview.tenantName}</span>
                      <span className="text-slate-600 text-[11px]">{currentReceiptForPreview.tenantPhone}</span>
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 block">ISSUED ON BEHALF OF (LANDLORD)</span>
                      <span className="font-bold text-slate-900 block text-sm">{currentReceiptForPreview.landlordName}</span>
                      <span className="text-slate-600 text-[11px]">Property Owner</span>
                    </div>
                  </div>

                  <div className="border-t border-slate-200 pt-3">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 block">DEMISED PROPERTY ADDRESS</span>
                    <span className="font-semibold text-slate-800 text-xs">{currentReceiptForPreview.propertyTitle}</span>
                  </div>
                </div>

                {/* Financial Table Breakdown */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-900 text-white text-[11px] uppercase font-bold">
                      <tr>
                        <th className="p-3">Payment Purpose / Description</th>
                        <th className="p-3">Method</th>
                        <th className="p-3">Transaction Ref</th>
                        <th className="p-3 text-right">Amount (GH₵)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-slate-800 font-medium">
                      <tr>
                        <td className="p-3 font-semibold">{currentReceiptForPreview.paymentPurpose}</td>
                        <td className="p-3">{currentReceiptForPreview.paymentMethod}</td>
                        <td className="p-3 font-mono text-[11px]">{currentReceiptForPreview.transactionRef}</td>
                        <td className="p-3 text-right font-bold text-slate-900">
                          GH₵ {currentReceiptForPreview.amountGhs.toLocaleString()}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Amount in Words Highlight */}
                <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-teal-800 block">AMOUNT IN WORDS:</span>
                    <span className="font-bold text-teal-950 italic">
                      "{currentReceiptForPreview.amountInWords || numberToWordsGhs(currentReceiptForPreview.amountGhs)}"
                    </span>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <span className="text-[10px] text-teal-800 font-bold block">TOTAL PAID</span>
                    <span className="text-base font-black text-teal-900">
                      GH₵ {currentReceiptForPreview.amountGhs.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Receipt Sign-Off & Stamp */}
                <div className="pt-4 border-t border-slate-200 flex items-end justify-between text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Verified Goodlucks Homes Intermediary Stamp
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Security Verification Hash: {currentReceiptForPreview.verificationCode}
                    </div>
                  </div>

                  <div className="text-right space-y-1">
                    <div className="font-extrabold text-slate-900 border-b border-slate-300 pb-0.5">
                      {currentReceiptForPreview.issuedBy}
                    </div>
                    <div className="text-[10px] text-slate-400">Authorized Finance Officer</div>
                  </div>
                </div>

              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between bg-[#1F242D] p-4 rounded-xl border border-white/10 no-print">
                <button
                  onClick={handlePrintDocument}
                  className="px-4 py-2 rounded-xl bg-[#08D9D6] text-[#252A34] font-extrabold text-xs flex items-center gap-1.5 hover:bg-[#08D9D6]/90 transition-all shadow"
                >
                  <Printer className="w-4 h-4" />
                  Print Official Receipt PDF
                </button>

                <button
                  onClick={() => handleCopyLink(currentReceiptForPreview.verificationCode)}
                  className="px-4 py-2 rounded-xl bg-white/10 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-white/20 transition-all"
                >
                  <Share2 className="w-4 h-4 text-[#08D9D6]" />
                  Copy Verification Code
                </button>
              </div>

            </div>

          </div>
        )}

        {/* TAB 3: SAVED DOCUMENTS VAULT */}
        {activeTab === 'vault' && (
          <div className="space-y-6 no-print">
            
            {/* Search Vault */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#1F242D] p-4 rounded-2xl border border-white/10">
              <div className="relative w-full sm:w-96">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search agreements or receipts by name, property, or code..."
                  value={vaultSearchQuery}
                  onChange={(e) => setVaultSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#252A34] border border-white/10 text-white text-xs placeholder-slate-400 focus:outline-none focus:border-[#08D9D6]"
                />
              </div>

              <div className="text-xs text-slate-300 font-medium flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#08D9D6]" />
                All documents are encrypted & saved to local storage
              </div>
            </div>

            {/* Saved Agreements Grid */}
            <div className="space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-white/10 pb-2">
                <FileText className="w-5 h-5 text-[#08D9D6]" />
                Tenancy Agreements ({filteredAgreements.length})
              </h2>

              {filteredAgreements.length === 0 ? (
                <div className="p-8 text-center bg-[#1F242D] rounded-2xl border border-white/10 text-slate-400 text-xs">
                  No tenancy agreements match your search.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredAgreements.map(agr => (
                    <div 
                      key={agr.id}
                      className="bg-[#1F242D] p-5 rounded-2xl border border-white/10 space-y-4 hover:border-[#08D9D6]/40 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono text-[#08D9D6] bg-[#08D9D6]/10 px-2 py-0.5 rounded font-bold">
                            {agr.verificationCode}
                          </span>
                          <h3 className="font-extrabold text-sm text-white mt-1.5">{agr.propertyTitle}</h3>
                          <p className="text-xs text-slate-400">{agr.propertyAddress}, {agr.city}</p>
                        </div>
                        <span className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                          agr.status === 'active' 
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}>
                          {agr.status}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-white/5 p-3 rounded-xl border border-white/5">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Tenant</span>
                          <span className="font-bold text-slate-200">{agr.tenantName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Total Rent</span>
                          <span className="font-extrabold text-[#08D9D6]">GH₵ {agr.totalRentGhs.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Landlord</span>
                          <span className="font-bold text-slate-200">{agr.landlordName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Term</span>
                          <span className="font-bold text-slate-200">{agr.durationMonths} Months ({agr.startDate})</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => {
                            setPreviewAgreement(agr);
                            setActiveTab('agreement');
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-[#08D9D6] text-[#252A34] text-xs font-extrabold hover:bg-[#08D9D6]/90 transition-all"
                        >
                          View & Print Document
                        </button>

                        <button
                          onClick={() => handleCopyLink(agr.verificationCode)}
                          className="text-xs text-slate-300 hover:text-[#08D9D6] flex items-center gap-1 font-semibold"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy Ref
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Saved Rent Receipts Grid */}
            <div className="space-y-4 pt-6">
              <h2 className="text-base font-bold text-white flex items-center gap-2 border-b border-white/10 pb-2">
                <Receipt className="w-5 h-5 text-[#08D9D6]" />
                Issued Rent Receipts ({filteredReceipts.length})
              </h2>

              {filteredReceipts.length === 0 ? (
                <div className="p-8 text-center bg-[#1F242D] rounded-2xl border border-white/10 text-slate-400 text-xs">
                  No rent receipts match your search.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredReceipts.map(rec => (
                    <div 
                      key={rec.id}
                      className="bg-[#1F242D] p-5 rounded-2xl border border-white/10 space-y-4 hover:border-[#08D9D6]/40 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono text-[#08D9D6] bg-[#08D9D6]/10 px-2 py-0.5 rounded font-bold">
                            {rec.receiptNo}
                          </span>
                          <h3 className="font-extrabold text-sm text-white mt-1.5">{rec.propertyTitle}</h3>
                          <p className="text-xs text-slate-400">{rec.paymentPurpose}</p>
                        </div>
                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                          PAID & VERIFIED
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-white/5 p-3 rounded-xl border border-white/5">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Received From</span>
                          <span className="font-bold text-slate-200">{rec.tenantName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Amount Paid</span>
                          <span className="font-extrabold text-[#08D9D6]">GH₵ {rec.amountGhs.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Method</span>
                          <span className="font-bold text-slate-200">{rec.paymentMethod}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">Transaction Ref</span>
                          <span className="font-mono text-slate-300 text-[11px]">{rec.transactionRef}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => {
                            setPreviewReceipt(rec);
                            setActiveTab('receipt');
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-[#08D9D6] text-[#252A34] text-xs font-extrabold hover:bg-[#08D9D6]/90 transition-all"
                        >
                          View & Print Receipt
                        </button>

                        <button
                          onClick={() => handleCopyLink(rec.verificationCode)}
                          className="text-xs text-slate-300 hover:text-[#08D9D6] flex items-center gap-1 font-semibold"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy Code
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        )}

      </div>
    </div>
  );
};
