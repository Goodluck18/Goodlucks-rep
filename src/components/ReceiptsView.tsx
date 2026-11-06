import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { SEOHead } from './SEOHead';
import { RentReceipt } from '../types';
import {
  Receipt,
  CheckCircle2,
  Printer,
  Search,
  ShieldCheck,
  Award,
  Copy,
  Info,
  Calendar,
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

/**
 * Rent payment records.
 *
 * Goodlucks Home is a property intermediary: it does not draft, sign or store
 * tenancy agreements, and it does not receive rent. This screen only records
 * payments made between a tenant and a landlord, and it states plainly that the
 * landlord — not Goodlucks — received the money.
 *
 * Issuing new records is switched off server-side until the truthful payment
 * and commission model lands; `receiptIssuingEnabled` mirrors that flag so the
 * form cannot be submitted while it is off.
 */
/**
 * Payment records and receipts.
 *
 * `embedded` drops the full-page chrome so the same component can render inside
 * the landlord account shell. It is still the one and only receipt view: no
 * second receipt screen exists.
 */
export const ReceiptsView: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const {
    currentUser,
    properties,
    receipts,
    receiptIssuingEnabled,
    createReceipt,
    showSuccessToast,
    showErrorToast,
    showInfoToast,
  } = useApp();

  const [activeTab, setActiveTab] = useState<'record' | 'vault'>('record');

  // --- RECORD FORM STATE ---
  const [recTenantName, setRecTenantName] = useState(currentUser?.name || 'Kofi Mensah');
  const [recTenantPhone, setRecTenantPhone] = useState(currentUser?.phone || '+233 24 412 3456');
  const [recLandlordName, setRecLandlordName] = useState('Abena Osei');
  const [recPropertyTitle, setRecPropertyTitle] = useState(properties[0]?.title || 'The Pearl Executive 3-Bedroom Apartment');
  const [recPropertyAddress, setRecPropertyAddress] = useState(properties[0]?.location || 'Cantonments, Accra');
  const [recAmountGhs, setRecAmountGhs] = useState<number>(78000);
  const [recPaymentPurpose, setRecPaymentPurpose] = useState('1 Year Rent Advance');
  const [recPaymentMethod, setRecPaymentMethod] = useState<'MTN MoMo' | 'Telecel Cash' | 'Bank Transfer' | 'Card' | 'Cash'>('Bank Transfer');
  const [recTransactionRef, setRecTransactionRef] = useState('');
  const [recPaymentDate, setRecPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));

  const [previewReceipt, setPreviewReceipt] = useState<RentReceipt | null>(receipts[0] || null);
  const [vaultSearchQuery, setVaultSearchQuery] = useState('');
  const [isSavingReceipt, setIsSavingReceipt] = useState(false);

  // Handle Save Record
  const handleGenerateReceipt = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!receiptIssuingEnabled) {
      showInfoToast(
        'Recording disabled',
        'New payment records are switched off while the payment model is corrected.'
      );
      return;
    }

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
      });
      setPreviewReceipt(newRec);
      showSuccessToast('Payment record saved', 'You can print it or find it in the saved records list.');
    } catch (err) {
      showErrorToast('Could not save the record', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setIsSavingReceipt(false);
    }
  };

  const currentReceiptForPreview = previewReceipt || receipts[0];

  /**
   * Print the payment record.
   *
   * The document lives in the "Record a rent payment" tab, so printing from the
   * saved-records tab used to hide every element and produce a blank page. We
   * switch tabs first, wait one frame for React to paint the printable node, and
   * only then open the print dialog. With no record to print we say so instead
   * of printing an empty sheet.
   */
  const handlePrintDocument = () => {
    if (!currentReceiptForPreview) {
      showInfoToast('Nothing to print', 'There is no payment record to print yet.');
      return;
    }
    if (activeTab !== 'record') {
      setActiveTab('record');
      window.setTimeout(() => window.print(), 120);
      return;
    }
    window.print();
  };

  const handleCopyCode = (code: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(code);
      showSuccessToast('Reference copied', code);
    } else {
      showInfoToast('Reference', code);
    }
  };


  const filteredReceipts = receipts.filter(r =>
    r.propertyTitle.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    r.tenantName.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    r.landlordName.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    r.receiptNo.toLowerCase().includes(vaultSearchQuery.toLowerCase()) ||
    (r.transactionRef || '').toLowerCase().includes(vaultSearchQuery.toLowerCase())
  );

  return (
    <div
      className={
        embedded
          ? 'text-ink'
          : 'min-h-screen bg-page text-ink py-10 px-4 sm:px-6 lg:px-8'
      }
    >
      <SEOHead
        title="Rent Payment Records - Goodlucks Homes Accra"
        description="Records of rent paid directly between tenants and landlords. Goodlucks Homes is a property intermediary and does not receive rent payments."
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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-line pb-6 no-print">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-interactive/10 text-ink text-xs font-bold border border-interactive/20 mb-2">
              <ShieldCheck className="w-4 h-4 text-ink" />
              Intermediary payment record
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-ink flex items-center gap-3">
              <Receipt className="w-8 h-8 text-ink" />
              Rent Payment Records
            </h1>
            <p className="text-xs sm:text-sm text-ink/70 mt-1 max-w-2xl">
              Records of rent paid directly between a tenant and a landlord. Goodlucks Homes does not draft
              or sign tenancy agreements and does not receive rent on a landlord&apos;s behalf.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintDocument}
              disabled={!currentReceiptForPreview}
              title={currentReceiptForPreview ? 'Print the record shown below' : 'No record to print yet'}
              className="px-4 py-2.5 rounded-xl bg-page hover:bg-line text-ink font-bold text-xs flex items-center gap-2 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Printer className="w-4 h-4 text-ink" />
              Print / Export PDF
            </button>
          </div>
        </div>

        {/* Issuing status notice */}
        {!receiptIssuingEnabled && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 no-print">
            <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-amber-800 space-y-1">
              <p className="font-bold">Recording new payments is temporarily switched off.</p>
              <p className="text-amber-800/90">
                The old receipt template could imply that Goodlucks received money that was paid straight to a
                landlord. Recording reopens with the corrected payment and commission model. Records already
                saved can still be viewed and printed below.
              </p>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-2 border-b border-line pb-3 overflow-x-auto no-print">
          <button
            onClick={() => setActiveTab('record')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'record'
                ? 'bg-interactive text-ink shadow-lg shadow-ink/10 font-extrabold'
                : 'bg-page text-ink/70 hover:text-ink hover:bg-page'
            }`}
          >
            <Receipt className="w-4 h-4" />
            Record a Rent Payment
          </button>

          <button
            onClick={() => setActiveTab('vault')}
            className={`px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm flex items-center gap-2 transition-all whitespace-nowrap ${
              activeTab === 'vault'
                ? 'bg-interactive text-ink shadow-lg shadow-ink/10 font-extrabold'
                : 'bg-page text-ink/70 hover:text-ink hover:bg-page'
            }`}
          >
            <Award className="w-4 h-4" />
            Saved Records ({receipts.length})
          </button>
        </div>

        {/* TAB 1: RECORD A RENT PAYMENT */}
        {activeTab === 'record' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* Record Form Controls */}
            <div className="lg:col-span-5 bg-page p-6 rounded-2xl border border-line space-y-5">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <Receipt className="w-5 h-5 text-ink" />
                <h2 className="font-extrabold text-sm text-ink">Payment details</h2>
              </div>

              <form onSubmit={handleGenerateReceipt} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">
                    Property
                  </label>
                  <input
                    type="text"
                    value={recPropertyTitle}
                    onChange={(e) => setRecPropertyTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-page border border-line text-ink text-xs focus:outline-none focus:border-interactive"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">
                    Property address
                  </label>
                  <input
                    type="text"
                    value={recPropertyAddress}
                    onChange={(e) => setRecPropertyAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-page border border-line text-ink text-xs focus:outline-none focus:border-interactive"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 mb-1">
                      Tenant name
                    </label>
                    <input
                      type="text"
                      value={recTenantName}
                      onChange={(e) => setRecTenantName(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-page border border-line text-ink text-xs focus:outline-none focus:border-interactive"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 mb-1">
                      Tenant phone
                    </label>
                    <input
                      type="tel"
                      value={recTenantPhone}
                      onChange={(e) => setRecTenantPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-page border border-line text-ink text-xs focus:outline-none focus:border-interactive"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">
                    Landlord who received the money
                  </label>
                  <input
                    type="text"
                    value={recLandlordName}
                    onChange={(e) => setRecLandlordName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-page border border-line text-ink text-xs focus:outline-none focus:border-interactive"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 mb-1">
                      Amount (GH₵)
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={recAmountGhs}
                      onChange={(e) => setRecAmountGhs(parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-page border border-line text-ink text-xs focus:outline-none focus:border-interactive"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 mb-1">
                      Payment method
                    </label>
                    <select
                      value={recPaymentMethod}
                      onChange={(e) => setRecPaymentMethod(e.target.value as typeof recPaymentMethod)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-page border border-line text-ink text-xs focus:outline-none focus:border-interactive"
                    >
                      <option value="Bank Transfer">Bank Transfer</option>
                      <option value="MTN MoMo">MTN Mobile Money</option>
                      <option value="Telecel Cash">Telecel Cash</option>
                      <option value="Card">Visa / Mastercard</option>
                      <option value="Cash">Cash</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink/70 mb-1">
                    Purpose
                  </label>
                  <input
                    type="text"
                    value={recPaymentPurpose}
                    onChange={(e) => setRecPaymentPurpose(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-page border border-line text-ink text-xs focus:outline-none focus:border-interactive"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 mb-1">
                      Transaction reference
                    </label>
                    <input
                      type="text"
                      value={recTransactionRef}
                      onChange={(e) => setRecTransactionRef(e.target.value)}
                      placeholder="Bank / MoMo reference"
                      className="w-full px-3.5 py-2.5 rounded-xl bg-page border border-line text-ink text-xs placeholder-ink/50 focus:outline-none focus:border-interactive"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-ink/70 mb-1">
                      Payment date
                    </label>
                    <input
                      type="date"
                      value={recPaymentDate}
                      onChange={(e) => setRecPaymentDate(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-page border border-line text-ink text-xs focus:outline-none focus:border-interactive"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!receiptIssuingEnabled || isSavingReceipt}
                  className={`w-full py-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all ${
                    receiptIssuingEnabled
                      ? 'bg-interactive text-ink hover:bg-interactive/90 shadow-lg shadow-ink/10'
                      : 'bg-page text-ink/70 cursor-not-allowed'
                  }`}
                >
                  <Receipt className="w-4 h-4" />
                  {receiptIssuingEnabled
                    ? (isSavingReceipt ? 'Saving record...' : 'Save Payment Record')
                    : 'Recording temporarily disabled'}
                </button>

                {!receiptIssuingEnabled && (
                  <p className="text-[11px] text-amber-800/80 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    Goodlucks does not receive rent, so no new record can be created until the corrected
                    payment and commission model is in place.
                  </p>
                )}
              </form>
            </div>

            {/* Printable Record Preview */}
            <div className="lg:col-span-7 space-y-4">

              <div className="flex items-center justify-between no-print px-2">
                <span className="text-xs font-bold text-ink/70 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-ink" />
                  Payment record preview
                </span>
                <button
                  onClick={handlePrintDocument}
                  className="text-xs text-ink hover:underline flex items-center gap-1 font-semibold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
              </div>

              {currentReceiptForPreview ? (
                <div
                  id="printable-document"
                  className="bg-white text-ink p-8 rounded-2xl shadow-lg border-4 border-interactive/40 space-y-6 relative overflow-hidden font-sans"
                >
                  {/* Record header */}
                  <div className="flex items-start justify-between border-b-2 border-line pb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-8 h-8 rounded-lg bg-interactive flex items-center justify-center text-ink font-black">
                          GH
                        </div>
                        <span className="font-extrabold text-lg tracking-tight text-ink">
                          Goodlucks <span className="text-teal-600">Homes</span>
                        </span>
                      </div>
                      <p className="text-[11px] text-ink/70">
                        Property intermediary &amp; viewing coordination<br />
                        Ridge, Accra, Ghana | +233 23 769 0080 | rent.goodlucks.co
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] font-bold uppercase text-ink/70 block">RECORD NO</span>
                      <span className="text-sm font-black font-mono text-teal-700 bg-teal-50 px-2.5 py-1 rounded border border-teal-200 block mb-1">
                        {currentReceiptForPreview.receiptNo}
                      </span>
                      <span className="text-[11px] text-ink/70 font-medium">
                        Date: {currentReceiptForPreview.paymentDate}
                      </span>
                    </div>
                  </div>

                  <div className="text-center space-y-1.5">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-ink/70">
                      Rent payment record
                    </span>
                    <div className="inline-block px-2 py-0.5 rounded border border-amber-300 bg-amber-50 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                      Reported record — not verified
                    </div>
                  </div>

                  {/* Parties */}
                  <div className="bg-page p-4 rounded-xl border border-line space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-[10px] font-extrabold uppercase text-ink/70 block">PAID BY (TENANT)</span>
                        <span className="font-bold text-ink block text-sm">{currentReceiptForPreview.tenantName}</span>
                        <span className="text-ink/70 text-[11px]">{currentReceiptForPreview.tenantPhone}</span>
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase text-ink/70 block">PAID TO (LANDLORD)</span>
                        <span className="font-bold text-ink block text-sm">{currentReceiptForPreview.landlordName}</span>
                        <span className="text-ink/70 text-[11px]">Property owner</span>
                      </div>
                    </div>

                    <div className="border-t border-line pt-3">
                      <span className="text-[10px] font-extrabold uppercase text-ink/70 block">PROPERTY ADDRESS</span>
                      <span className="font-semibold text-ink text-xs">
                        {currentReceiptForPreview.propertyTitle}
                      </span>
                      <span className="text-ink/70 text-[11px] block">{currentReceiptForPreview.propertyAddress}</span>
                    </div>
                  </div>

                  {/* Amount table */}
                  <div className="border border-line rounded-xl overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-page text-ink text-[11px] uppercase font-bold">
                        <tr>
                          <th className="p-3">Payment purpose</th>
                          <th className="p-3">Method</th>
                          <th className="p-3">Transaction ref</th>
                          <th className="p-3 text-right">Amount (GH₵)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line text-ink font-medium">
                        <tr>
                          <td className="p-3 font-semibold">{currentReceiptForPreview.paymentPurpose}</td>
                          <td className="p-3">{currentReceiptForPreview.paymentMethod}</td>
                          <td className="p-3 font-mono text-[11px]">{currentReceiptForPreview.transactionRef || '—'}</td>
                          <td className="p-3 text-right font-bold text-ink">
                            GH₵ {currentReceiptForPreview.amountGhs.toLocaleString()}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Amount in words */}
                  <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-teal-800 block">AMOUNT IN WORDS:</span>
                      <span className="font-bold text-teal-950 italic">
                        &quot;{currentReceiptForPreview.amountInWords || numberToWordsGhs(currentReceiptForPreview.amountGhs)}&quot;
                      </span>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-[10px] text-teal-800 font-bold block">AMOUNT RECORDED</span>
                      <span className="text-base font-black text-teal-900">
                        GH₵ {currentReceiptForPreview.amountGhs.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Record status — reported, not verified; Goodlucks is not the recipient */}
                  <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl text-[11px] text-amber-900 leading-relaxed space-y-1.5">
                    <p>
                      <strong>Record status: reported, not verified.</strong> This entry was typed into the
                      platform by {currentReceiptForPreview.issuedBy || 'Goodlucks staff'} from information
                      supplied to Goodlucks. Neither the tenant nor the landlord has confirmed it here, and
                      Goodlucks has not verified that any money changed hands.
                    </p>
                    <p>
                      <strong>Who the money was for:</strong> the payer reported paying the landlord named
                      above. Goodlucks Homes did <strong>not</strong> receive this payment, so this document is
                      not a receipt issued by Goodlucks Homes for money it received.
                    </p>
                  </div>

                  {/* Sign-off */}
                  <div className="pt-4 border-t border-line flex items-end justify-between text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-ink/70 font-bold">
                        <CheckCircle2 className="w-4 h-4 text-ink/70" />
                        Recorded by Goodlucks Homes (intermediary record)
                      </div>
                      <div className="text-[10px] text-ink/70 font-mono">
                        Record reference: {currentReceiptForPreview.verificationCode}
                      </div>
                      {currentReceiptForPreview.legacyReference && (
                        <div className="text-[10px] text-amber-700">
                          Legacy reference from an earlier template. The &quot;VERIFIED&quot; wording in it
                          never meant the payment was checked.
                        </div>
                      )}
                    </div>

                    <div className="text-right space-y-1">
                      <div className="font-extrabold text-ink border-b border-slate-300 pb-0.5">
                        {currentReceiptForPreview.issuedBy}
                      </div>
                      <div className="text-[10px] text-ink/70">Recorded by</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-10 text-center bg-page rounded-2xl border border-line text-ink/70 text-xs">
                  No payment records yet. Fill the form to preview the layout.
                </div>
              )}

              {/* Action toolbar */}
              {currentReceiptForPreview && (
                <div className="flex items-center justify-between bg-page p-4 rounded-xl border border-line no-print">
                  <button
                    onClick={handlePrintDocument}
                    className="gl-btn gl-btn-primary px-4 py-2 text-xs flex"
                  >
                    <Printer className="w-4 h-4" />
                    Print record
                  </button>

                  <button
                    onClick={() => handleCopyCode(currentReceiptForPreview.verificationCode)}
                    className="px-4 py-2 rounded-xl bg-page text-ink font-bold text-xs flex items-center gap-1.5 hover:bg-line transition-all"
                  >
                    <Copy className="w-4 h-4 text-ink" />
                    Copy reference
                  </button>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 2: SAVED RECORDS */}
        {activeTab === 'vault' && (
          <div className="space-y-6 no-print">

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-page p-4 rounded-2xl border border-line">
              <div className="relative w-full sm:w-96">
                <Search className="w-4 h-4 text-ink/70 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder="Search records by property, tenant, landlord, or reference..."
                  value={vaultSearchQuery}
                  onChange={(e) => setVaultSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-page border border-line text-ink text-xs placeholder-ink/50 focus:outline-none focus:border-interactive"
                />
              </div>

              <div className="text-xs text-ink/70 font-medium flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-ink" />
                Only you and authorised staff can see these records
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-line pb-2">
                <Receipt className="w-5 h-5 text-ink" />
                Rent Payment Records ({filteredReceipts.length})
              </h2>

              {filteredReceipts.length === 0 ? (
                <div className="p-8 text-center bg-page rounded-2xl border border-line text-ink/70 text-xs">
                  No payment records match your search.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredReceipts.map(rec => (
                    <div
                      key={rec.id}
                      className="bg-page p-5 rounded-2xl border border-line space-y-4 hover:border-interactive/40 transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-mono text-ink bg-interactive/10 px-2 py-0.5 rounded font-bold">
                            {rec.receiptNo}
                          </span>
                          <h3 className="font-extrabold text-sm text-ink mt-1.5">{rec.propertyTitle}</h3>
                          <p className="text-xs text-ink/70">{rec.paymentPurpose}</p>
                        </div>
                        <span className="text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider bg-line/20 text-ink/70 border border-line">
                          Recorded
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-page p-3 rounded-xl border border-line">
                        <div>
                          <span className="text-[10px] text-ink/70 block">Paid by</span>
                          <span className="font-bold text-ink">{rec.tenantName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-ink/70 block">Amount</span>
                          <span className="font-extrabold text-ink">GH₵ {rec.amountGhs.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-ink/70 block">Paid to</span>
                          <span className="font-bold text-ink">{rec.landlordName}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-ink/70 block">Date</span>
                          <span className="font-bold text-ink flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-ink/70" /> {rec.paymentDate}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <button
                          onClick={() => {
                            setPreviewReceipt(rec);
                            setActiveTab('record');
                          }}
                          className="px-3.5 py-1.5 rounded-lg bg-interactive text-ink text-xs font-extrabold hover:bg-interactive/90 transition-all"
                        >
                          View &amp; Print
                        </button>

                        <button
                          onClick={() => handleCopyCode(rec.verificationCode)}
                          className="text-xs text-ink/70 hover:text-ink flex items-center gap-1 font-semibold"
                        >
                          <Copy className="w-3.5 h-3.5" />
                          Copy reference
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
